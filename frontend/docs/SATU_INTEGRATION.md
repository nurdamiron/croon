# Satu.kz интеграция — документация для разработчиков

> Обновлено: 2026-05-22. Интеграция с маркетплейсом Satu.kz: push остатков
> Alash → Satu (near-realtime через очередь) и импорт заказов Satu с
> бронью/списанием. Цикл замкнут: заказ в любом канале (сайт/Kaspi/Satu)
> меняет единый склад.

---

## 1. Общая картина

Satu работает на платформе **EVO** (как Prom.ua / Tiu.ru). Два потока:

1. **Остатки Alash → Satu (исходящий, push).** В отличие от Kaspi (который сам
   тянет наш XML-фид), в Satu **мы отправляем** остатки в их API
   (`POST /products/edit`). Near-realtime: при изменении остатка товар
   помечается «грязным», воркер раз в минуту шлёт только изменённое.
2. **Заказы Satu → мы (входящий, pull).** Cron раз в 15 мин тянет `orders/list`,
   кладёт в БД, бронирует/списывает остатки по статусу заказа.

**Единый склад:** доступный остаток = `totalStock − reservedStock`. Заказ на
сайте / Kaspi / Satu меняет эти поля → синхронизируется во все каналы.

---

## 2. Satu API (важные факты)

- **База:** `https://my.satu.kz/api/v1` (env `SATU_API_URL` для переопределения)
- **Авторизация:** `Authorization: Bearer <SATU_API_TOKEN>` (env)
- Токен в кабинете Satu: Настройки → Управление API-токенами. Нужны права
  «Продукты R/W» и «Заказы R/W».
- **Эндпоинты:**
  - `GET /products/list?limit=100&last_id=<cursor>` → `{products:[...]}`.
    Пагинация курсором last_id.
  - `POST /products/edit` — обновление товаров. **Тело = ГОЛЫЙ JSON-МАССИВ**
    `[{"id":N,"presence":"available|order","quantity_in_stock":N}]`
    (НЕ `{products:[]}` — даст «Ожидается список товаров»). Ответ
    `{processed_ids:[...], errors:{}}`.
  - `GET /orders/list?limit=100&last_id=&date_from=` → `{orders:[...]}`.
- **⚠️ Гранёные грабли:**
  - `date_from` НЕ принимает ISO с миллисекундами/`Z` (`2026-...459Z` вернёт
    **0 заказов**). Слать `.slice(0,19)` = `YYYY-MM-DDTHH:MM:SS`.
  - `price` в товарах и позициях заказа — **строка** `"650 ₸"` / `"1 950 ₸"`,
    нужно парсить (см. `parseSatuPrice`).
  - Поле наличия — `presence`: `available` | `order` (под заказ) |
    `not_available`. Количество — `quantity_in_stock`.
  - У части товаров не заполнено `minimum_order_quantity` — Satu не даст их
    обновить (вернёт ошибку в `errors`). Заполнить в карточке Satu.

---

## 3. Модель данных (Prisma)

- **Product.satuDirty** `Boolean @default(false)` (+ индекс) — очередь push:
  ставится `true` при любом изменении остатка, воркер снимает после отправки.
- **SatuProduct** — зеркало товара Satu + связь с Alash:
  `satuId` (unique, Satu product id), `sku` («Код» = артикул Alash),
  `name`, `presence`, `price`, `productId?` (→ Product), `active`,
  `lastPushedAt`, `raw`.
- **SatuOrder** — заказ Satu: `satuOrderId` (unique), `status`,
  `stockApplied` (null|reserved|completed|released — идемпотентность),
  `totalPrice`, `customerName/Phone`, `email`, `deliveryName`, `creationDate`,
  `raw`.
- **SatuOrderItem**: `satuItemId`, `sku`, `name`, `productId?`, `quantity`, `price`.

> Изменения схемы → `prisma db push` на проде (миграций в проекте нет).

---

## 4. Связь товаров Satu ↔ Alash

По **артикулу**: Satu `sku` («Код» товара) совпадает с артикулом Alash, который
хранится в `ProductVariant.sku`.

- **Авто-связь** при импорте: `importSatuProducts` матчит `SatuProduct.sku` →
  `ProductVariant.sku` → `productId`. На проде: из 1496 товаров 1341 (90%)
  связались автоматически.
- **Ручная связь** для остального — в админке `/admin/satu` (поиск по
  названию/SKU/id).
- В позициях заказа связь по `products[].id` (Satu product id) →
  `SatuProduct.satuId` → `productId`, fallback по sku.

---

## 5. Push остатков (lib/satu-sync.ts)

- `importSatuProducts()` — тянет `products/list` в `SatuProduct` (upsert по
  satuId) + авто-связь. НЕ перетирает ручную привязку.
- `pushSatuStock(dryRun)` — полный push всех связанных активных:
  `quantity_in_stock = max(0, totalStock − reservedStock)`,
  `presence = qty>0 ? 'available' : 'order'`. Батчи по 100. `dryRun` — только
  считает.
- `markSatuDirty(productIds)` — помечает товары (со связанным активным
  SatuProduct) для синхронизации. Вызывается при изменении остатка.
- `pushSatuDirty()` — **воркер очереди**: пушит только `satuDirty=true`, снимает
  флаг при успехе.

**Где ставится satuDirty** (все источники изменения остатка):
`/api/orders` (заказ сайта), `kaspi-sync` (бронь/списание Kaspi),
`/api/account/orders/[id]/cancel`, `/api/admin/products` (ручная правка стока),
`/api/admin/orders/[id]` (правка состава), и сам `syncSatuOrders`.

---

## 6. Импорт заказов Satu (lib/satu-sync.ts)

`syncSatuOrders(daysBack=30)` — тянет `orders/list` за период, upsert
SatuOrder/Item, маппит позиции, применяет эффект остатков.

**Статус Satu → эффект** (идемпотентно через `stockApplied`):

| Статус | Лейбл | Эффект |
|---|---|---|
| `pending` | Новый | reserved (бронь) |
| `paid` | Оплачен | reserved |
| `delivered` | Выполнен | completed (списание) |
| `canceled` | Отменён | released (снять бронь) |

Бронь начинается с `pending` (как только заказ создан). При смене статуса —
переход эффекта (та же логика, что у Kaspi: `applySatuItemTransition`).

---

## 7. API-эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/admin/satu/import` | импорт товаров + авто-связь (admin) |
| POST | `/api/admin/satu/push?dry=1` | push остатков, dry=1 — пробный (admin) |
| PATCH | `/api/admin/satu/[id]` | привязка к Alash / active (admin) |
| POST | `/api/admin/satu-orders/sync?days=30` | импорт заказов (admin) |
| GET/POST | `/api/cron/satu-push` | воркер очереди остатков (CRON_SECRET) |
| GET/POST | `/api/cron/satu-sync-orders?days=30` | импорт заказов (CRON_SECRET) |

---

## 8. Админка

- **`/admin/satu`** — товары Satu: список, поиск, фильтр Все/Привязанные/Без
  привязки, привязка к Alash, тумблер active, кнопки **Импорт товаров /
  Проверить (dry-run) / Отправить остатки**.
- **`/admin/satu-orders`** — заказы Satu: статусы (бейджи), клиент, сумма, дата
  (Asia/Almaty), эффект на остатки, позиции с привязкой. Кнопка
  «Синхронизировать», фильтры.
- Nav: «Satu» (Каталог) и «Satu заказы» (Продажи).

---

## 9. Cron на EC2 (пользователь ubuntu)

```
* * * * *      node scripts/satu-push-stock.js   >> ~/logs/satu-push.log   2>&1  # остатки, каждую минуту
*/15 * * * *   node scripts/satu-sync-orders.js  >> ~/logs/satu-orders.log 2>&1  # заказы, каждые 15 мин
```
Обе обёртки дёргают cron-эндпоинты с `CRON_SECRET` (как у Kaspi/Google
Indexing). Серверный `.env`: `SATU_API_TOKEN`, `CRON_SECRET`.

---

## 10. Первичная настройка (если разворачивать заново)

1. `SATU_API_TOKEN` в серверный `.env`, `prisma db push`.
2. `/admin/satu` → «Импорт товаров» (зеркало + авто-связь по SKU).
3. Привязать вручную товары без артикула.
4. «Проверить» (dry-run) → «Отправить остатки» (первый полный синхрон).
5. Cron'ы (см. §9) — дальше всё автоматически.

> Формат `products/edit` подтверждён на проде. Первый синхрон 2026-05-21:
> 1341 отправлено, 421 стали «в наличии». Заказы: fetched 8, reserved 1,
> released 7.
