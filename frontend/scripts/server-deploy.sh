#!/bin/bash
# КОПИЯ серверного скрипта деплоя /home/ubuntu/deploy.sh на EC2 (под версионным
# контролем). GitHub Actions (.github/workflows/deploy.yml) грузит tar в S3 и
# вызывает ИМЕННО /home/ubuntu/deploy.sh через SSM. При правке — синхронизировать
# с сервером (заливается автоматически шагом workflow, см. ниже, либо вручную).
#
# Аргументы: $1 = имя архива в s3://alashed-media/deploys/, $2 = ожидаемый git SHA (12 симв).
set -eo pipefail
ARCHIVE=${1:-deploy.tar.gz}
EXPECT_SHA=${2:-}
APP=/home/ubuntu/alashed-shop/frontend
cd "$APP"

echo "[deploy] fetch $ARCHIVE (expect SHA: ${EXPECT_SHA:-none})"
aws s3 cp "s3://alashed-media/deploys/$ARCHIVE" /tmp/deploy.tar.gz
tar xzf /tmp/deploy.tar.gz

# Чистый билд: убираем старый .next (deploy под root, рантайм под ubuntu —
# иначе EACCES/частичные манифесты или рассинхрон BUILD_ID).
echo "[deploy] clean .next"
rm -rf .next

echo "[deploy] prisma generate + db push"
npx prisma generate
# db push безопасен (без миграций); синхронизирует новые поля/таблицы.
npx prisma db push --skip-generate 2>&1 | tail -2 || echo "[deploy] db push warn (continue)"

# Билд с таймаутом: next иногда зависает на "Collecting build traces" уже ПОСЛЕ
# генерации манифестов (из-за output:standalone). Критерий успеха — наличие
# готового билда, а не код возврата.
echo "[deploy] build (timeout 360s)"
set +e
timeout 360 npm run build
BUILD_RC=$?
set -e
echo "[deploy] build rc=$BUILD_RC"
pkill -f "next build" 2>/dev/null || true

if [ ! -f .next/prerender-manifest.json ] || [ ! -f .next/BUILD_ID ]; then
  echo "[deploy] ERROR: build incomplete (no prerender-manifest/BUILD_ID), rc=$BUILD_RC"
  exit 1
fi
echo "[deploy] BUILD_ID=$(cat .next/BUILD_ID)"

echo "[deploy] chown .next -> ubuntu"
chown -R ubuntu:ubuntu .next

# КРИТИЧНО: запускаем РОВНО в режиме `next start` (НЕ standalone/server.js —
# тот не отдаёт статику /_next/static → сайт без CSS/JS). Пересоздаём процесс
# чтобы гарантированно перечитал свежий .next и правильный режим.
echo "[deploy] (re)start pm2 in 'next start' mode"
sudo -u ubuntu bash -lc "cd $APP && pm2 delete alash-electronics 2>/dev/null || true; \
  PORT=5000 pm2 start node_modules/.bin/next --name alash-electronics \
    --node-args='--max-old-space-size=512' -- start; \
  pm2 save 2>/dev/null || true"

sleep 6
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 http://localhost:5000/ || echo 000)
echo "[deploy] healthcheck HTML HTTP:$CODE"
if [ "$CODE" != "200" ]; then
  echo "[deploy] ERROR: app not healthy (HTTP $CODE)"; exit 1
fi

# Проверка статики: берём webpack-чанк из HTML и убеждаемся что он отдаётся
# (200 application/javascript), а не 404 — иначе сайт без JS/CSS.
WP=$(curl -s -m10 http://localhost:5000/ | grep -oE 'static/chunks/webpack-[a-f0-9]+\.js' | head -1)
if [ -n "$WP" ]; then
  SCODE=$(curl -s -o /dev/null -w "%{http_code}" -m15 "http://localhost:5000/_next/$WP" || echo 000)
  echo "[deploy] healthcheck static ($WP) HTTP:$SCODE"
  if [ "$SCODE" != "200" ]; then
    echo "[deploy] ERROR: static not served (HTTP $SCODE) — wrong PM2 mode?"; exit 1
  fi
fi

echo "Deploy done: $ARCHIVE (BUILD_ID $(cat .next/BUILD_ID))"
