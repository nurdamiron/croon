#!/usr/bin/env bash
# Выполняется на EC2 через SSM (root). На сервере нет .git — код фронта приезжает tar из S3;
# сам скрипт кладём из S3: deploys/google-index-daily.js (см. README в комментарии ниже).
set -eu

sudo -u ubuntu bash <<'EOS'
set -eu
mkdir -p "$HOME/.secrets" "$HOME/.local" "$HOME/logs" "$HOME/alashed-shop/frontend/scripts"
chmod 700 "$HOME/.secrets"
chmod 755 "$HOME/logs"

if command -v aws >/dev/null 2>&1; then
  aws s3 cp s3://alashed-media/deploys/google-index-daily.js \
    "$HOME/alashed-shop/frontend/scripts/google-index-daily.js" --region eu-north-1
  chmod 644 "$HOME/alashed-shop/frontend/scripts/google-index-daily.js"
fi

CRON_LINE='0 9 * * * . /home/ubuntu/.profile; cd /home/ubuntu/alashed-shop/frontend && GOOGLE_INDEXING_KEY_PATH=/home/ubuntu/.secrets/google-indexing.json GOOGLE_INDEXING_STATE_PATH=/home/ubuntu/.local/google-indexing-state.json SITE_URL=https://alash-electronics.kz /usr/bin/node scripts/google-index-daily.js >> /home/ubuntu/logs/google-indexing.log 2>&1'

( crontab -l 2>/dev/null | grep -v 'google-index-daily.js' || true
  echo "$CRON_LINE"
) | crontab -

echo "=== crontab ==="
crontab -l
echo "=== key ==="
test -f "$HOME/.secrets/google-indexing.json" && echo OK || echo "Нужен файл: $HOME/.secrets/google-indexing.json"
EOS

echo "ec2-google-indexing-setup.sh finished OK"
