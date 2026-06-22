#!/bin/bash
# Добавляет/обновляет BA3AR_SYNC_URL и BA3AR_SYNC_SECRET в .env на Alash-сервере,
# чтобы смена статуса заказа сразу пушила остатки на витрину ba3ar.
# Идемпотентно: если ключ уже есть — заменяет строку.
set -eo pipefail
ENV=/home/ubuntu/alashed-shop/frontend/.env
URL='https://ba3ar.alashed.kz/api/admin/sync-alash-stock'
SECRET="$1"
[ -z "$SECRET" ] && { echo "secret arg required"; exit 1; }

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV"; then
    sudo sed -i "s|^${k}=.*|${k}=${v}|" "$ENV"
  else
    echo "${k}=${v}" | sudo tee -a "$ENV" >/dev/null
  fi
}
set_kv BA3AR_SYNC_URL "$URL"
set_kv BA3AR_SYNC_SECRET "$SECRET"
echo "set BA3AR_SYNC_URL + BA3AR_SYNC_SECRET"
grep -E '^BA3AR_SYNC_(URL|SECRET)=' "$ENV" | sed 's/SECRET=.*/SECRET=<set>/'
