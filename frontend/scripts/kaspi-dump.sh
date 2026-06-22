#!/bin/bash
# Управление автоматическим Каспи-демпингом на этом Mac (резидентный KZ IP).
#
# Сервер Kaspi блокирует запросы с нашего EC2 (датацентр → 405), поэтому цены
# конкурентов снимаются ОТСЮДА — с твоего мака. Этот скрипт держит демпинг-воркер
# в фоне: он по кругу опрашивает Kaspi (offer-view), сервер считает цену на 2₸
# дешевле конкурента (стратегия FIRST_MIN_GAP: поднимает где дёшево, опускает где
# не первые), и применяет через фид. Работает, пока Mac включён и не спит.
#
# КОМАНДЫ:
#   ./scripts/kaspi-dump.sh start    — запустить авто-цикл в фоне
#   ./scripts/kaspi-dump.sh stop     — остановить
#   ./scripts/kaspi-dump.sh status   — работает ли, последние строки лога
#   ./scripts/kaspi-dump.sh log      — следить за логом вживую (Ctrl+C выход)
#   ./scripts/kaspi-dump.sh once     — один прогон (применить цены разово)
#   ./scripts/kaspi-dump.sh scan     — только снять позиции (колонка «Поз.»), цены не трогать
#   ./scripts/kaspi-dump.sh dry      — один прогон-разведка (план без смены цен)
#
# Интервал цикла — переменная LOOP_MIN (по умолчанию 15 мин; фид Kaspi всё равно
# перечитывается ~раз в час, чаще нет смысла). Глобально демпинг включается/
# выключается в админке (/admin/kaspi, тумблер) — если выключен, воркер просто спит.

set -eo pipefail
cd "$(dirname "$0")/.."   # → frontend/

PIDFILE="/tmp/croon-kaspi-dump.pid"
LOGFILE="/tmp/croon-kaspi-dump.log"
# Кабинетный воркер (гибрид): offer-view для позиции + кабинет для МГНОВЕННОЙ смены
# цены (не ждём часовой фид). Требует разовый вход: node scripts/kaspi-cabinet-worker.mjs --login
WORKER="scripts/kaspi-cabinet-worker.mjs"
LOOP_MIN="${LOOP_MIN:-2}"   # кабинет применяет цену за 1-2 мин — частый цикл осмыслен
MERCHANT_UID="${MERCHANT_UID:-8719005}"

# Секрет демпинга = CRON_SECRET из .env (в репозиторий не попадает).
SECRET=$(grep -E '^CRON_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
SITE="${SITE:-https://croon.kz}"

if [ -z "$SECRET" ]; then
  echo "❌ CRON_SECRET не найден в frontend/.env — без него воркер не авторизуется."
  exit 1
fi

running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

case "${1:-status}" in
  login)
    # Разовый вход в кабинет Kaspi (откроется браузер). Сессия → .kaspi-session.json
    MERCHANT_UID="$MERCHANT_UID" node "$WORKER" --login
    ;;
  start)
    if running; then echo "✅ уже работает (PID $(cat "$PIDFILE"))"; exit 0; fi
    # AlgaTop-модель: воркер сам логинится логином/паролем. Сессия не обязательна,
    # но нужны креды (файл .kaspi-credentials.json или KASPI_LOGIN_USER/PASS в .env).
    if [ ! -f .kaspi-credentials.json ] && ! grep -q '^KASPI_LOGIN_USER=' .env 2>/dev/null && [ ! -f .kaspi-session.json ]; then
      echo "❌ нет ни кредов, ни сессии. Введи логин/пароль на дашборде (🔑 Логин/пароль) или ./scripts/kaspi-dump.sh login"
      exit 1
    fi
    echo "▶️  запускаю авто-демпинг через КАБИНЕТ (мгновенно, цикл каждые ${LOOP_MIN} мин)…"
    # caffeinate -ism держит Mac неспящим, пока воркер жив (-i idle, -s при питании,
    # -m диск). Иначе сон замораживает setTimeout цикла и демпинг встаёт на часы.
    # caffeinate -w <pid> завершится сам, когда воркер остановится.
    SITE="$SITE" DUMPING_SECRET="$SECRET" LOOP_MIN="$LOOP_MIN" MERCHANT_UID="$MERCHANT_UID" \
      nohup node "$WORKER" >> "$LOGFILE" 2>&1 &
    WPID=$!
    echo "$WPID" > "$PIDFILE"
    # не даём системе засыпать пока воркер работает (привязано к его PID)
    caffeinate -ism -w "$WPID" >/dev/null 2>&1 &
    sleep 1
    echo "   PID $WPID (+ caffeinate держит Mac неспящим), лог: $LOGFILE"
    echo "   следить:  ./scripts/kaspi-dump.sh log"
    echo "   стоп:     ./scripts/kaspi-dump.sh stop"
    ;;
  stop)
    if running; then kill "$(cat "$PIDFILE")" && echo "⏹  остановлен (PID $(cat "$PIDFILE"))"; else echo "не запущен"; fi
    rm -f "$PIDFILE"
    ;;
  status)
    if running; then
      echo "✅ работает (PID $(cat "$PIDFILE"), цикл ${LOOP_MIN}м, канал: кабинет)"
      echo "--- последние строки лога ---"
      tail -n 8 "$LOGFILE" 2>/dev/null || echo "(лог пуст)"
    else
      echo "⏹  не запущен. старт: ./scripts/kaspi-dump.sh start"
    fi
    ;;
  log)
    tail -f "$LOGFILE"
    ;;
  once)
    SITE="$SITE" DUMPING_SECRET="$SECRET" MERCHANT_UID="$MERCHANT_UID" node "$WORKER" --once
    ;;
  dry)
    SITE="$SITE" DUMPING_SECRET="$SECRET" MERCHANT_UID="$MERCHANT_UID" node "$WORKER" --once --dry
    ;;
  install)
    # Поставить launchd-агент: воркер сам поднимается при входе в систему и
    # перезапускается если упал (KeepAlive). Решает «воркер молчит после сна/ребута».
    # Секреты берём из .env и подставляем в plist (готовый plist НЕ коммитим).
    if [ ! -f .kaspi-credentials.json ] && ! grep -q '^KASPI_LOGIN_USER=' .env 2>/dev/null && [ ! -f .kaspi-session.json ]; then
      echo "⚠️  нет ни кредов, ни сессии — воркер залогинится сам, если введёшь логин/пароль на дашборде (🔑 Логин/пароль)."
    fi
    NODE_BIN="$(command -v node)"
    [ -z "$NODE_BIN" ] && { echo "❌ node не найден в PATH"; exit 1; }
    LU=$(grep -E '^KASPI_LOGIN_USER=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    LP=$(grep -E '^KASPI_LOGIN_PASS=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    WORKDIR="$(pwd)"
    PLIST_SRC="scripts/kaspi-dump.launchd.plist"
    PLIST_DST="$HOME/Library/LaunchAgents/kz.croon.kaspi-dump.plist"
    [ -f "$PLIST_SRC" ] || { echo "❌ нет шаблона $PLIST_SRC"; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents"
    # Подстановка плейсхолдеров (| как разделитель sed — в значениях нет |).
    sed -e "s|__NODE__|$NODE_BIN|g" \
        -e "s|__WORKDIR__|$WORKDIR|g" \
        -e "s|__SITE__|$SITE|g" \
        -e "s|__SECRET__|$SECRET|g" \
        -e "s|__LOGINUSER__|$LU|g" \
        -e "s|__LOGINPASS__|$LP|g" \
        -e "s|__MERCHANT__|$MERCHANT_UID|g" \
        "$PLIST_SRC" > "$PLIST_DST"
    chmod 600 "$PLIST_DST"   # содержит секреты
    # Останавливаем ручной воркер, чтобы не было двух копий
    running && { kill "$(cat "$PIDFILE")" 2>/dev/null; rm -f "$PIDFILE"; echo "   (остановил ручной воркер)"; }
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load "$PLIST_DST"
    echo "✅ launchd-агент установлен и запущен (kz.croon.kaspi-dump)."
    echo "   plist: $PLIST_DST (0600, секреты внутри — не в репо)"
    echo "   лог:   $LOGFILE  ·  следить: ./scripts/kaspi-dump.sh log"
    echo "   снять автозапуск: ./scripts/kaspi-dump.sh uninstall"
    ;;
  uninstall)
    PLIST_DST="$HOME/Library/LaunchAgents/kz.croon.kaspi-dump.plist"
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    rm -f "$PLIST_DST"
    echo "🗑  launchd-агент удалён (автозапуск выключен)."
    ;;
  *)
    echo "Использование: $0 {login|start|stop|status|log|once|dry|install|uninstall}"
    echo "  login      — разовый вход в кабинет Kaspi (нужен перед start/install)"
    echo "  start      — запустить авто-демпинг разово в фоне (до перезагрузки)"
    echo "  install    — автозапуск через launchd (поднимается сам, переживает сон/ребут)"
    echo "  uninstall  — снять автозапуск launchd"
    exit 1
    ;;
esac
