# Единый склад: Alash + Ba3ar + Kaspi

> Документ для нового чата в репо `alash-electronics`. Описывает архитектуру общего склада, модель данных, интеграцию с Kaspi и план реализации фазами.

## Контекст

Три канала продаж:
- **croon.kz** — мастер каталога, Next.js 14 + Prisma + Postgres (Neon).
- **kaspi.kz/shop/...** — маркетплейс. Сейчас заказы подтверждаются вручную в Merchant Cabinet. Особенность: один наш товар может иметь 3-4 разных карточки на Kaspi с разными `kaspi sku`.
- **ba3ar.kz** — выкупленный конкурент, делается с нуля. Отдельный Next.js репозиторий, **общая БД с Alash**. Контент (фото/название/цена) свой, `sku` совпадает с Alash.

Цель: один остаток на товар, синхронный во всех трёх каналах. Двойные продажи невозможны.

## Архитектура

```
                   ┌──────────────────────────────────┐
                   │  PostgreSQL (Neon, общая БД)     │
                   │  Product · ChannelListing ·      │
                   │  Reservation · StockMovement     │
                   │  Ba3arContent                    │
                   └──────────────┬───────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
  croon.kz       ba3ar.kz                  Kaspi
  (этот репо, Next.js)       (отдельный репо)          XML feed + REST API
  ├── витрина                ├── витрина               ├── /api/kaspi/feed.xml
  ├── админка склада         └── чекаут                │    (Kaspi забирает)
  ├── /api/inventory/*           ↓ HTTP                ├── /api/kaspi/orders-poll
  └── /api/kaspi/*               вызывает              │    (cron, проверяет заказы)
                                 inventory API         └── /api/kaspi/webhook
                                 alash-electronics          (резерв на заказ)
```

**Inventory API живёт внутри alash-electronics.** Ba3ar дёргает его по HTTP, не через Prisma напрямую — чтобы вся логика резервирования была в одном месте.

## Модель данных (Prisma)

Расширяем существующий `schema.prisma`. Текущий `Product` сохраняем как мастер.

```prisma
// === существующая модель Product, дополняется ===
model Product {
  id              String  @id              // наш мастер-SKU (числовой строкой, как сейчас)
  // ... все текущие поля ...
  qtyOnHand       Int     @default(0)      // физически на складе (мигрируем из totalStock)
  qtyReserved     Int     @default(0)      // зарезервировано под активные заказы
  barcode         String?                  // штрихкод — якорь для авто-маппинга Kaspi
  supplierCode    String?                  // код поставщика — второй якорь

  listings        ChannelListing[]
  ba3arContent    Ba3arContent?
  reservations    Reservation[]
  stockMovements  StockMovement[]

  @@index([barcode])
}

// === новые модели ===

model ChannelListing {
  id            String   @id @default(cuid())
  productId     String                            // FK на Product.id (наш sku)
  channel       Channel                           // KASPI | ALASH | BA3AR
  externalId    String                            // Kaspi SKU/код карточки. Для ALASH/BA3AR не нужен (одна запись на канал)
  externalName  String?                           // как канал называет товар сейчас
  price         Int                               // цена в тиынах
  active        Boolean  @default(true)
  lastSyncedAt  DateTime?

  product       Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([channel, externalId])
  @@index([productId])
}

enum Channel { KASPI ALASH BA3AR }

// контент витрины ba3ar.kz: свои фото/название/описание/цена
model Ba3arContent {
  productId   String   @id
  title       String
  slug        String   @unique
  description String?  @db.Text
  images      String[]                            // S3 keys, отдельный bucket для ba3ar
  metaTitle       String?
  metaDescription String?  @db.Text
  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model Reservation {
  id          String   @id @default(cuid())
  productId   String
  qty         Int
  channel     Channel
  orderRef    String                              // ID заказа в канале (Kaspi orderId, alash orderId, ...)
  status      ReservationStatus
  expiresAt   DateTime                            // автоматический release через N минут если не committed
  createdAt   DateTime @default(now())
  product     Product  @relation(fields: [productId], references: [id])

  @@index([orderRef])
  @@index([status, expiresAt])
}

enum ReservationStatus { ACTIVE COMMITTED RELEASED EXPIRED }

model StockMovement {
  id          String   @id @default(cuid())
  productId   String
  delta       Int                                 // +приход / -расход
  reason      MovementReason
  channel     Channel?
  orderRef    String?
  note        String?
  actorId     String?                             // кто сделал (User.id)
  createdAt   DateTime @default(now())
  product     Product  @relation(fields: [productId], references: [id])

  @@index([productId, createdAt])
}

enum MovementReason {
  SALE
  RETURN
  RECEIPT
  ADJUSTMENT
  RESERVATION_EXPIRED
  INVENTORY_COUNT
}
```

**Почему так:**

- `qtyOnHand`/`qtyReserved` денормализованы для скорости чтения витриной. `qtyAvailable = qtyOnHand - qtyReserved` — то, что идёт во все каналы. Источник истины при сверке — сумма `StockMovement.delta` + сумма активных `Reservation.qty`. Ежедневный cron сверяет, расходится — алерт.
- `ChannelListing` решает проблему "3-4 карточки на Kaspi для одного товара": **N записей `(channel=KASPI, externalId=X)` указывают на один `productId`**. Все они отдают/получают один остаток.
- `Ba3arContent` отделяет витринный контент Ba3ar от мастера Alash. Меняем фото на Ba3ar — мастер Alash не трогается.
- `Reservation.expiresAt` защищает от зависших корзин: если заказ Kaspi не подтверждён за 30 минут — резерв возвращается.

## Inventory API (внутри alash-electronics)

Маршруты под `/api/inventory/*`. Авторизация — by-API-key для внешних (Ba3ar), session для админки.

```
POST /api/inventory/reserve
     { productId, qty, channel, orderRef, ttlMinutes? }
     → 200 { reservationId }    | 409 OUT_OF_STOCK

POST /api/inventory/commit
     { orderRef }              → списывает резерв в продажу (создаёт StockMovement SALE)

POST /api/inventory/release
     { orderRef }              → возвращает резерв на склад

POST /api/inventory/adjust
     { productId, delta, reason, note? }    → приход/инвентаризация/коррекция

GET  /api/inventory/stock/:productId
     → { qtyAvailable, qtyOnHand, qtyReserved, updatedAt }

GET  /api/inventory/stock?ids=a,b,c
     → batch для каталога

GET  /api/inventory/movements/:productId
     → журнал движений
```

### Транзакция резервирования

Защита от гонок при одновременной продаже на двух каналах — `SELECT ... FOR UPDATE`:

```ts
await prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw<Product[]>`
    SELECT id, "qtyOnHand", "qtyReserved"
      FROM "Product" WHERE id = ${productId} FOR UPDATE
  `;
  const p = rows[0];
  const available = p.qtyOnHand - p.qtyReserved;
  if (available < qty) throw new OutOfStockError(productId, qty, available);

  await tx.product.update({
    where: { id: productId },
    data:  { qtyReserved: { increment: qty } },
  });
  await tx.reservation.create({
    data: {
      productId, qty, channel, orderRef,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + (ttlMinutes ?? 30) * 60_000),
    },
  });
}, { isolationLevel: 'Serializable' });
```

### Авто-релиз протухших резервов

Cron каждые 5 минут (`/api/cron/release-expired`):
```sql
UPDATE "Reservation"
  SET status = 'EXPIRED'
  WHERE status = 'ACTIVE' AND "expiresAt" < now()
  RETURNING *;
```
Для каждого вернувшегося: `Product.qtyReserved -= qty`, запись `StockMovement(RESERVATION_EXPIRED)`.

## Kaspi: интеграция

### Что мы знаем по итогам зондирования API

База API: `https://kaspi.kz/shop/api/`
Авторизация: заголовок `X-Auth-Token: <KASPI_API_TOKEN>`, `Content-Type: application/vnd.api+json`.

| Эндпоинт | Метод | Назначение | Замечания |
|---|---|---|---|
| `/products/classification/categories` | GET | 4293 категории Kaspi | `Accept: application/json` |
| `/products/classification/attributes?c=<code>` | GET | Атрибуты для категории | |
| `/v2/cities` | GET | 453 города (cityId для cityprices) | |
| `/v2/orders` | GET | Список заказов | **Обязателен** `filter[orders][creationDate][$ge]=<unix-ms>`, окно ≤ 14 дней |
| `/v2/orders/{id}/entries` | GET | Позиции конкретного заказа | поддерживает `include[order.entries]=product,merchantProduct` |
| `/products/import` | POST | Загрузка наших карточек | возвращает import-id для проверки статуса |
| `/products/import?i=<id>` | GET | Статус импорта | |

**Чего НЕТ:**
- ❌ Эндпоинта "получить все наши карточки на Kaspi" (`/offers`, `/merchant-products` — 404).
- ❌ `/v2/merchants` (404).
- ❌ Отдельных эндпоинтов для остатков/цен — только через XML-фид.
- ❌ Webhook'ов от Kaspi о новых заказах — нужно polling'ом.

### Механизм 1: XML price feed (остатки + цены)

Мы публикуем на нашем хостинге XML по фиксированному URL, Kaspi приходит за ним **каждые 60 минут** и подхватывает изменения. Это основной способ обновлять остатки и цены.

```
GET https://croon.kz/api/kaspi/feed.xml
```

Формат:

```xml
<?xml version="1.0" encoding="utf-8"?>
<kaspi_catalog date="2026-05-18T12:00:00"
               xmlns="kaspiShopping"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">
  <company>ИП КРУН</company>
  <merchantid>ALASH_MERCHANT_ID</merchantid>
  <offers>
    <offer sku="635">
      <model>10 см 40-контактный перемычка линия провод П-М</model>
      <brand>Alash</brand>
      <availabilities>
        <availability available="yes" storeId="PP1" stockCount="49"/>
      </availabilities>
      <cityprices>
        <cityprice cityId="750000000">500</cityprice>  <!-- Костанай -->
        <cityprice cityId="710000000">500</cityprice>  <!-- Астана -->
      </cityprices>
    </offer>
    <!-- ... 1895 товаров ... -->
  </offers>
</kaspi_catalog>
```

Требования и ограничения:
- `sku` — до 20 символов, латиница+цифры, уникальный. Наши id (типа `635`, `892`, `2085`) подходят.
- Цена — целое число, без пробелов и десятичных, включая НДС.
- `storeId` — id наших пунктов выдачи (заводится в Merchant Cabinet).
- `stockCount` — целое, общий остаток в этом пункте.
- Цены могут варьироваться по городам через `cityprices`. Если по всем городам цена одна — достаточно `<price>500</price>` вместо `cityprices`.
- Файл генерируется **на лету** из БД при каждом запросе (1895 SKU — это меньше 1 МБ XML, генерация ~100мс).

**Эндпоинт `/api/kaspi/feed.xml` — Next.js Route Handler:**

```ts
// src/app/api/kaspi/feed.xml/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const products = await prisma.product.findMany({
    where: {
      listings: { some: { channel: 'KASPI', active: true } },
    },
    select: { id: true, name: true, qtyOnHand: true, qtyReserved: true,
              listings: { where: { channel: 'KASPI' }, select: { price: true } } },
  });

  const xml = buildKaspiCatalogXml(products);
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
```

URL прайс-листа задаётся в Kaspi Merchant Cabinet → раздел "Прайс-лист" → "Автоматическая загрузка".

### Механизм 2: Polling заказов

Поскольку webhook'ов нет, заводим cron каждые 60 секунд:

```
GET /api/cron/kaspi-poll-orders
```

Логика:
1. Берём `creationDate[$ge]` = max(`last_poll_at`, now - 10мин).
2. Тянем `GET /v2/orders?state=NEW&...` с пагинацией.
3. Для каждого нового заказа:
   - Тянем `/v2/orders/{id}/entries` — там Kaspi SKU позиций.
   - Для каждой позиции: `ChannelListing.findUnique({ channel: 'KASPI', externalId: kaspiSku })`.
     - Если есть — резервируем `(productId, qty)`.
     - Если нет — заказ помечается `needs_mapping`, в админке всплывает алерт "Новая Kaspi-карточка X, привязать к нашему товару?".
4. Сохраняем `last_poll_at`.

После того как сотрудник подтвердит заказ в Kaspi Merchant Cabinet и заказ перейдёт в `COMPLETED` (или мы переведём его автоматически через API подтверждения), вызываем `commit` на резерве.

### Маппинг Kaspi-карточек (главная боль)

У вас 1895 SKU в `Product` + N карточек на Kaspi (потенциально 3-4× = ~6000-8000 карточек, причём Kaspi сам ставит им свои SKU и может менять названия).

**В каталоге Alash сейчас нет ни штрихкодов, ни кодов поставщика** (проверено по `exports/alash-stock-2026-05-18.csv`) — значит автоматический матч только по названию (`pg_trgm` GIN, который у вас уже стоит, как раз для этого).

Шаги:

1. **Загрузка наших карточек на Kaspi через `POST /products/import`** — для **новых** товаров. Тогда Kaspi product code совпадает с нашим `id`, проблема дубликатов на новых товарах исчезает.

2. **Существующие карточки на Kaspi** — выгружать через приходящие заказы (по мере поступления Kaspi SKU). Параллельно — однократная ручная выгрузка из Merchant Cabinet в Excel → CSV → импорт в `ChannelListing` через скрипт.

3. **Админка маппинга** `/admin/inventory/kaspi-mapping`:
   - Слева: список `ChannelListing` где `channel=KASPI` и `productId IS NULL` (несопоставленные).
   - Справа: поиск по `Product.name` с триграммами + топ-5 кандидатов.
   - Кнопка "Привязать" → сохраняет `productId`.
   - Bulk-операции: "привязать всё с подсказкой confidence > 0.9".

4. **Daily reconciliation** cron:
   - Если в новом заказе Kaspi SKU не сматчен → создаём пустой `ChannelListing` со status=`needs_mapping`.
   - Если знакомое название всплыло под новым `externalId` → авто-перепривязка с audit log.

### Тестовый Kaspi-аккаунт

У нас есть тестовый Kaspi merchant с тестовыми товарами **специально для отработки изменения цен и остатков**. План использования:

- На нём отлаживаем генератор `feed.xml` — публикуем URL, ждём 60 минут, проверяем что Kaspi подхватил.
- Меняем цены/остатки в БД — проверяем что Kaspi видит новые значения.
- Когда схема стабилизируется — переключаем production Kaspi merchant ID на наш feed.

## Ba3ar.kz

Отдельный Next.js репо (`ba3ar.kz`), но **тот же `DATABASE_URL`**. Контент берёт из `Ba3arContent`, остатки — через HTTP к Inventory API:

```ts
// ba3ar.kz/src/lib/inventory.ts
export async function getStock(productId: string) {
  const r = await fetch(
    `${process.env.INVENTORY_API_URL}/stock/${productId}`,
    { headers: { 'X-Api-Key': process.env.INVENTORY_API_KEY! } }
  );
  return r.json();
}
```

Чекаут Ba3ar:
1. Перед созданием заказа → `POST /reserve`.
2. После оплаты/подтверждения → `POST /commit`.
3. На отмене → `POST /release`.

Картинки лежат в **отдельном S3 bucket** `ba3ar-media` (не `alashed-media`), чтобы случайно не пересеклись.

## План реализации (по фазам)

### Фаза 1 — фундамент склада (1 неделя)
- [ ] Миграция Prisma: `qtyOnHand`/`qtyReserved`/`barcode`/`supplierCode` на `Product`.
- [ ] Перенос `totalStock` → `qtyOnHand` в одном запросе.
- [ ] Новые модели: `ChannelListing`, `Reservation`, `StockMovement`, `Ba3arContent`.
- [ ] Сервис `src/lib/inventory.ts`: `reserve`, `commit`, `release`, `adjust`, `getStock` с `FOR UPDATE`.
- [ ] API роуты `/api/inventory/*`.
- [ ] Cron `release-expired` (5 мин).
- [ ] Cron `reconcile` (1 день) — сверка `qtyOnHand` с суммой `StockMovement`.

### Фаза 2 — Kaspi feed + админка (1 неделя)
- [ ] `/api/kaspi/feed.xml` — генератор XML.
- [ ] `/admin/inventory` — таблица товаров, текущий остаток, ручной adjust с reason.
- [ ] `/admin/inventory/movements` — журнал движений.
- [ ] Bulk-импорт `ChannelListing` из CSV (выгрузка Kaspi-карточек).
- [ ] Регистрация URL feed в Kaspi Merchant Cabinet (тестовый аккаунт сначала).
- [ ] Проверка: меняем цену → через час видим в Kaspi.

### Фаза 3 — Kaspi orders polling (1 неделя)
- [ ] Cron `/api/cron/kaspi-poll-orders` (60 сек) — тянет новые заказы.
- [ ] Алерт-таблица `needs_mapping` для несопоставленных Kaspi SKU.
- [ ] `/admin/inventory/kaspi-mapping` — UI ручного маппинга с `pg_trgm` подсказками.
- [ ] Тест на тестовом Kaspi-аккаунте (можем создать заказ сами).

### Фаза 4 — Ba3ar.kz (1 неделя)
- [ ] Отдельный репо `ba3ar.kz` с тем же `DATABASE_URL`.
- [ ] Витрина читает `Ba3arContent` + остатки через HTTP к Alash Inventory API.
- [ ] Чекаут вызывает `reserve` → `commit`/`release`.
- [ ] Bulk-загрузка `Ba3arContent` для существующих 1895 SKU (свои фото, цены, названия).

### Фаза 5 — production rollout (1 неделя)
- [ ] Подключение production Kaspi merchant к нашему feed.
- [ ] Замена ручного процесса (подтверждение в Merchant Cabinet → adjust в админке) на автоматический polling.
- [ ] Мониторинг: алерты в Telegram при расхождении остатков, при провале синка с Kaspi, при OUT_OF_STOCK.

## Безопасность и операции

- **Секреты**: `KASPI_API_TOKEN`, `INVENTORY_API_KEY` (для Ba3ar) — только в `.env` и GitHub Secrets. Никогда в коде, никогда в чатах.
- **Бэкапы Postgres**: Neon делает автоматически, но добавить ежедневный логический дамп в S3 на случай отката неудачной миграции.
- **Логирование**: каждое движение склада в `StockMovement`. Каждый запрос к Kaspi API — в отдельную таблицу `KaspiApiLog` (status, ms, error) на 30 дней.
- **Rate limit Kaspi**: документация лимиты не указывает, но polling раз в 60 сек — это ~1440 запросов в день, должно укладываться.

## Открытые вопросы

1. **Storage points (PP)**: сколько у вас пунктов выдачи на Kaspi? От этого зависит `<availability storeId="...">`. Если один — всё просто.
2. **Цены по городам**: разные ли цены в Костанай и Астане, или одна цена на всю страну? Если одна — используем `<price>` вместо `<cityprices>`.
3. **Production Kaspi merchant ID** — другой от тестового? Когда планируется подключение?
4. **Заказы с Kaspi: нужно ли автоматическое подтверждение** (через API) или сотрудник всё равно будет это делать в Merchant Cabinet? От этого зависит логика `commit`.
5. **Бренд** в `<brand>`: у вас в `Product` нет поля `brand`. Добавлять или заполнять одним значением "Alash"/"Без бренда"?

## Артефакты после зондирования (где смотреть)

- `exports/kaspi-dump-2026-05-18T12-00-15-411Z/categories.json` — 4293 категории Kaspi для маппинга.
- `exports/kaspi-dump-2026-05-18T12-00-15-411Z/cities.json` — 453 города (cityId).
- `exports/kaspi-dump-2026-05-18T12-00-15-411Z/extra-probes.json` — что работает, что нет.
- `exports/alash-stock-2026-05-18.csv` — текущий каталог Alash (1895 SKU).
- `scripts/kaspi-probe.js` — пробник одного эндпоинта.
- `scripts/kaspi-dump.js` — полный дамп API.

## Источники документации Kaspi

- [Описание API для продавцов](https://guide.kaspi.kz/partner/ru/shop)
- [Получение списка заказов](https://guide.kaspi.kz/partner/ru/shop/api/orders/q3201)
- [Получение позиций заказа](https://guide.kaspi.kz/partner/ru/shop/api/orders/q3203)
- [Автоматическая загрузка прайс-листа](https://guide.kaspi.kz/partner/ru/shop/goods/price_list/q3251)
- [Загрузка прайс-листа](https://guide.kaspi.kz/partner/ru/shop/goods/price_list/q2962)
