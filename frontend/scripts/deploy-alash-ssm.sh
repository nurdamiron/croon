#!/bin/bash
# Локальный деплой Alash на EC2 НАПРЯМУЮ через SSM (минуя GitHub Actions).
# Зачем: Actions заблокирован биллингом GitHub. Тот же результат, что workflow:
# tar исходника → S3 → /home/ubuntu/deploy.sh на сервере (build + рестарт PM2).
#
# Запуск из каталога frontend/:  bash scripts/deploy-alash-ssm.sh
# Требует: AWS-ключи в frontend/.env (AWS_ACCESS_KEY_ID/SECRET), регион eu-north-1.
set -eo pipefail
cd "$(dirname "$0")/.."   # → frontend/
ROOT="$(cd .. && pwd)"

# AWS-ключи из .env
set -a; source .env; set +a
export AWS_DEFAULT_REGION=eu-north-1
ALASH=i-06e2d5837c24c75f3
BUCKET=s3://alashed-media/deploys

SHA=$(git -C "$ROOT" rev-parse --short=12 HEAD)
ARCHIVE="deploy-${SHA}.tar.gz"

echo "[local] tar frontend → $ARCHIVE (sha $SHA)"
tar czf "/tmp/$ARCHIVE" \
  --exclude=node_modules --exclude=.next --exclude=.env --exclude=.env.local \
  --exclude='**/*.tar.gz' . 2>/dev/null
aws s3 cp "/tmp/$ARCHIVE" "$BUCKET/$ARCHIVE" >/dev/null
aws s3 cp scripts/server-deploy.sh "$BUCKET/server-deploy.sh" >/dev/null
echo "[local] uploaded, запускаю деплой на $ALASH через SSM…"

CMD_ID=$(aws ssm send-command --instance-ids "$ALASH" \
  --document-name AWS-RunShellScript --comment "Alash deploy via SSM (manual)" \
  --timeout-seconds 600 \
  --parameters "commands=[\"aws s3 cp $BUCKET/server-deploy.sh /home/ubuntu/deploy.sh\",\"chmod +x /home/ubuntu/deploy.sh\",\"bash /home/ubuntu/deploy.sh $ARCHIVE $SHA\"],executionTimeout=[\"600\"]" \
  --query "Command.CommandId" --output text)
echo "[local] command: $CMD_ID — жду…"

until S=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$ALASH" --query Status --output text 2>/dev/null); \
  [ "$S" != InProgress ] && [ "$S" != Pending ] && [ -n "$S" ]; do sleep 8; done
echo "[local] STATUS: $S"
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$ALASH" --query "StandardOutputContent" --output text \
  | grep -iE "BUILD_ID|healthcheck|Deploy done|ERROR" || true
aws s3 rm "$BUCKET/$ARCHIVE" 2>/dev/null || true
[ "$S" = "Success" ] && echo "[local] ✅ Alash задеплоен" || { echo "[local] ❌ см. логи SSM $CMD_ID"; exit 1; }
