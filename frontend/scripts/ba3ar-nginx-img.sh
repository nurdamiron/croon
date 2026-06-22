#!/bin/bash
# Добавляет в nginx ba3ar.alashed.kz отдачу /img/products/ напрямую с диска,
# чтобы загруженные через админку фото отдавались СРАЗУ (next start не видит
# файлы, добавленные в public/ после старта → 404). Идемпотентно.
set -eo pipefail
CONF=/etc/nginx/sites-available/ba3ar.alashed.kz
IMGROOT=/home/ubuntu/apps/ba3ar.kz/apps/storefront/public

if grep -q "location /img/products/" "$CONF"; then
  echo "[nginx] блок /img/products/ уже есть — пропускаю"
else
  echo "[nginx] бэкап + вставка блока /img/products/"
  sudo cp "$CONF" "${CONF}.bak.$(date +%s)"
  # вставляем перед первым 'location / {' в ssl-сервере
  sudo awk -v root="$IMGROOT" '
    !done && /location \/ \{/ {
      print "    location /img/products/ {";
      print "        root " root ";";
      print "        try_files $uri @next;";
      print "        expires 30d;";
      print "        access_log off;";
      print "    }";
      print "    location @next { proxy_pass http://localhost:3003; proxy_set_header Host $host; }";
      print "";
      done=1
    }
    { print }
  ' "$CONF" | sudo tee "${CONF}.new" >/dev/null
  sudo mv "${CONF}.new" "$CONF"
fi

echo "[nginx] test config"
sudo nginx -t
echo "[nginx] reload"
sudo systemctl reload nginx
echo "[nginx] done"
