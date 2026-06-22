#!/bin/bash
# Деплой витрины ba3ar на её сервере (i-08eb56616ddb569bc).
# Распаковывает исходник из S3 поверх /home/ubuntu/apps/ba3ar.kz, СОХРАНЯЯ
# products.json и public/img (их нет в архиве). Сборка + рестарт PM2.
# Аргумент $1 = имя архива в s3://alashed-media/deploys/.
set -eo pipefail
ARCHIVE="$1"
APP=/home/ubuntu/apps/ba3ar.kz
SF=$APP/apps/storefront
[ -z "$ARCHIVE" ] && { echo "archive arg required"; exit 1; }

echo "[deploy] fetch $ARCHIVE"
aws s3 cp "s3://alashed-media/deploys/$ARCHIVE" /tmp/ba3ar-deploy.tar.gz

# страховка: бэкап products.json (живой остаток) на случай если архив его затронет
if [ -f "$APP/scripts/scraper/output/products.json" ]; then
  cp "$APP/scripts/scraper/output/products.json" /tmp/products.json.bak
fi

echo "[deploy] unpack (источник, без products.json/img)"
tar xzf /tmp/ba3ar-deploy.tar.gz -C "$APP"

# вернуть бэкап, если вдруг затёрся
if [ -f /tmp/products.json.bak ] && [ ! -s "$APP/scripts/scraper/output/products.json" ]; then
  cp /tmp/products.json.bak "$APP/scripts/scraper/output/products.json"
fi

chown -R ubuntu:ubuntu "$APP" 2>/dev/null || true

echo "[deploy] pnpm install (frozen, CI=true чтобы не падал на no-TTY)"
cd "$APP"
sudo -u ubuntu bash -lc "cd $APP && CI=true pnpm install --frozen-lockfile 2>&1 | tail -5" || \
  sudo -u ubuntu bash -lc "cd $APP && CI=true pnpm install 2>&1 | tail -5"

echo "[deploy] build storefront (clean .next)"
sudo -u ubuntu bash -lc "cd $SF && rm -rf .next && set -a; [ -f .env ] && source .env; set +a; pnpm --filter storefront build 2>&1 | tail -8"

if [ ! -f "$SF/.next/BUILD_ID" ]; then
  echo "[deploy] ERROR: build incomplete (no BUILD_ID)"; exit 1
fi
echo "[deploy] BUILD_ID=$(cat $SF/.next/BUILD_ID)"
chown -R ubuntu:ubuntu "$SF/.next"

# КРИТИЧНО: pm2 restart НЕ перечитывает новый билд (держит старый манифест
# в памяти → HTML ссылается на CSS/chunks, которых нет на диске → 400). Поэтому
# delete + start (полное пересоздание процесса), чтобы Next прочитал свежий .next.
echo "[deploy] recreate PM2 ba3ar.ecosystem (delete + start)"
ECO=/tmp/ba3ar.ecosystem.cjs
[ ! -f "$ECO" ] && ECO=/home/ubuntu/apps/ba3ar.kz/ecosystem.config.cjs
sudo PM2_HOME=/etc/.pm2 pm2 delete ba3ar.ecosystem 2>/dev/null || true
sudo PM2_HOME=/etc/.pm2 pm2 delete ba3ar-storefront 2>/dev/null || true
# КРИТИЧНО: добить осиротевший next-server, который держит порт 3003. Иначе
# новый процесс не забиндит порт, а старый orphan продолжит отдавать старый
# билд (CSS/chunks 400). Видели: pid от прошлого деплоя висел на 3003.
sleep 2
sudo fuser -k 3003/tcp 2>/dev/null || true
sleep 2
sudo PM2_HOME=/etc/.pm2 pm2 start "$ECO" 2>&1 | tail -5
sudo PM2_HOME=/etc/.pm2 pm2 save 2>&1 | tail -1

sleep 7
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 http://localhost:3003/ || echo 000)
echo "[deploy] healthcheck HTML HTTP:$CODE"
[ "$CODE" != "200" ] && { echo "[deploy] ERROR not healthy"; exit 1; }
# Проверка статики: webpack-чанк из HTML должен отдаваться 200, а не 400.
WP=$(curl -s -m10 http://localhost:3003/ | grep -oE 'static/chunks/webpack-[a-f0-9]+\.js' | head -1)
if [ -n "$WP" ]; then
  SCODE=$(curl -s -o /dev/null -w "%{http_code}" -m15 "http://localhost:3003/_next/$WP" || echo 000)
  echo "[deploy] healthcheck static ($WP) HTTP:$SCODE"
  [ "$SCODE" != "200" ] && { echo "[deploy] ERROR static not served (HTTP $SCODE)"; exit 1; }
fi
echo "[deploy] DONE ba3ar storefront ($ARCHIVE)"
