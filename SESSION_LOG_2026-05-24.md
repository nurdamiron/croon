# Журнал работ — 2026-05-24 (Alash)

Сводка для других чатов: что сделано в эту сессию по Alash (админка заказов
Ba3ar/Satu, единая модель склада, деплой через SSM). Парный лог — в репо
ba3ar.kz (`SESSION_LOG_2026-05-24.md`).

---

## 1. Админка заказов Ba3ar и Satu — на уровне Alash

Цель: чтобы `/admin/ba3ar-orders` и `/admin/satu-orders` были такими же удобными,
как `/admin/orders` (карточка заказа, история, быстрый контакт), но в отдельных
окнах. Цветовая навигация каналов: **Ba3ar = зелёный, Satu = фиолетовый,
Kaspi = красный** — чтобы админ визуально понимал, где он.

### Ba3ar (`/admin/ba3ar-orders`)
- Статусы как у Alash: `new|confirmed|processing|shipped|delivered|picked_up|canceled|returned`.
- **Гибкая смена статуса** — любой в любом направлении (как Alash), без NEXT-ограничений.
  Остатки пересчитываются по эффекту целевого статуса, любой переход безопасен.
- Карточка `/admin/ba3ar-orders/[id]`: прогресс-бар, **5-й шаг — развилка
  «Доставлен / Забрали заказ»**, история статусов, инфо, **редактируемые Оплата/
  Доставка** (для бухгалтерии/аналитики), быстрый звонок + WhatsApp, блок
  «Смотрел перед заказом».
- **Человекочитаемые номера** заказов с **10000** (поле `Ba3arOrder.orderNumber`,
  autoincrement; sequence сдвинут на проде). UUID `ba3arOrderId` остался ключом
  идемпотентности (клиенту не виден).
- **Бейдж «Предзаказ»** — если в заказе есть товар не в наличии.
- Табы Открытые/Закрытые, инлайн-смена статуса в списке, быстрый контакт из строки.
- Модели Prisma: `Ba3arOrderStatusLog`, `Ba3arOrderViewedProduct`, поля
  `paymentName`, `isPreorder`, `orderNumber` в `Ba3arOrder`.

### Satu (`/admin/satu-orders`)
- Фиолетовая тема, карточка `/admin/satu-orders/[id]` с историей (`SatuOrderStatusLog`),
  быстрым звонком/WhatsApp, прогресс-баром.
- **Уважает модель Satu**: статусы pending/paid/delivered/received/canceled,
  смена статуса пушится в Satu API, отмена — по коду причины
  (`not_available`/`duplicate`, свободный текст Satu отвергает).
- **ВАЖНО (фикс):** «Выполнен» (`delivered`) — это **закрытый** статус (в кабинете
  Satu бакет «Выполненные» = завершённые). Открытые = `pending|paid`; закрытые =
  `delivered|received|canceled`. Раньше delivered ошибочно висел в «Открытые».
- **«Запрос на отзыв про компанию»** — для завершённых заказов кнопка копирует
  ссылку `satu.kz/opinions/create/814752?order_id=<satuOrderId>` (companyId Alash
  = `814752`), чтобы дать клиенту отзыв-ссылку не заходя в Satu.

Файлы: `src/lib/ba3ar-constants.ts`, `src/lib/satu-constants.ts`,
`src/app/admin/{ba3ar,satu}-orders/**`, `src/app/api/admin/{ba3ar,satu}-orders/[id]/route.ts`.

---

## 2. Единая модель склада всех каналов (КЛЮЧЕВОЕ)

**Решение: при заказе `totalStock` списывается СРАЗУ (как Alash), не бронь.**

Раньше Ba3ar/Satu бронировали (`reservedStock += qty`, `totalStock` не падал) и
списывали `totalStock` только при доставке. Из-за этого физический остаток в
админке «Остаток» не уменьшался при заказе и расходился между каналами.

Теперь все каналы одинаково:
- Заказ (любой активный статус) → `totalStock -= qty` (эффект `completed`).
- Отмена/возврат → `totalStock += qty` (эффект `released`).
- Предзаказ (нет в наличии) — склад не трогает.
- `applyTransition`: выход из `completed` в ЛЮБОЙ статус возвращает `totalStock`
  (гибкая смена в любом направлении).

Где: `ba3arDesiredEffect` (src/lib/ba3ar-orders.ts), `satuDesiredEffect`
(src/lib/satu-sync.ts). Миграции старых заказов reserved→completed прогнаны на
проде (`reservedStock=0`). Источник остатка для каналов:
`/api/admin/catalog-export`, `available = totalStock − reservedStock`.

**Near-realtime синк витрины ba3ar:** витрина читает остаток из своего
`products.json`. Обновляется: (1) cron `*/15` на ba3ar-сервере, (2) сама после
оформления заказа (in-process, см. ba3ar repo), (3) триггер с Alash при заказах
Satu/Alash, отменах (клиент/админ), правке состава, смене статуса —
`triggerBa3arStockSync()` (src/lib/ba3ar-sync-trigger.ts; env на Alash:
`BA3AR_SYNC_URL` = https://ba3ar.alashed.kz/api/admin/sync-alash-stock,
`BA3AR_SYNC_SECRET` = `12cab6cac52b17b502998347663de756` = ALASH_SYNC_SECRET витрины).

**НЕ возвращать кольцевой синк** «витрина→Alash→витрина при заказе с витрины» —
он подвисал (процесс витрины ждал сам себя). Поэтому `createBa3arOrder` НЕ
дёргает синк (заказ приходит С витрины — она синкает себя сама).

**Диагностика рассинхрона:** если витрина показывает не то — это ВСЕГДА
отставание products.json, в БД Alash всегда верно. Форс-фикс:
`curl -X POST "https://ba3ar.alashed.kz/api/admin/sync-alash-stock?secret=12cab6cac52b17b502998347663de756"`.

---

## 3. Деплой напрямую через SSM (минуя GitHub Actions)

**ВАЖНО: GitHub Actions заблокирован биллингом GitHub** («recent account payments
have failed or your spending limit needs to be increased» → Settings → Billing &
plans). Пока не починен — авто-деплой по push НЕ работает.

**Деплой Alash напрямую (одна команда, из каталога `frontend/`):**
```bash
bash scripts/deploy-alash-ssm.sh
```
Делает: tar исходника → S3 → `/home/ubuntu/deploy.sh` на EC2 через SSM (build +
рестарт PM2 + healthcheck) → ждёт → чистит S3. AWS-ключи берёт из `frontend/.env`.

- **Alash EC2:** `i-06e2d5837c24c75f3`, путь `/home/ubuntu/alashed-shop/frontend`,
  PM2 `alash-electronics` порт 5000, PM2_HOME=`/home/ubuntu/.pm2`. Серверный
  скрипт = `scripts/server-deploy.sh` (= `/home/ubuntu/deploy.sh`).
- **Грабли:** `prisma db push` в деплое НЕ ставит unique-колонку на таблицу с
  данными без `--accept-data-loss` (добавление колонки — не реальная потеря; при
  таком — применять вручную через SSM с флагом). Регион eu-north-1.

---

## 4. Прочее
- 5-й шаг прогресс-бара карточки Alash `/admin/orders/[id]` тоже разделён на
  «Доставлен / Забрали заказ».
- Витрина ba3ar (отдельный репо, деплой через SSM): история поиска в шапке,
  Instagram→ba3ar.kz, Telegram→WhatsApp, номер заказа клиенту, трекинг просмотров,
  self-sync остатка после заказа. См. ba3ar.kz/SESSION_LOG_2026-05-24.md.

## Состояние на конец сессии
Склад консистентен по всем каналам (БД = карточка = админки = витрина). Логика
единая: заказ → списание сразу, отмена/возврат → возврат на склад. Двойные
заказы исключены. Всё задеплоено на прод через SSM.
