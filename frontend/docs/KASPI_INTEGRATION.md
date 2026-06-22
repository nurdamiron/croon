# Kaspi.kz интеграция — документация для разработчиков

> Обновлено: 2026-05-21. Описывает всё, что сделано по интеграции с Kaspi.kz:
> фид остатков, импорт заказов с бронью/списанием, блок «Купить на Kaspi» на
> сайте, админка `/admin/kaspi` и `/admin/kaspi-orders`, инфраструктура деплоя.

---

## 1. Общая картина

Два независимых потока:

1. **Остатки → Kaspi (исходящий).** Динамический XML-фид
   `https://alash-electronics.kz/api/kaspi/feed.xml`. Kaspi тянет его раз в час
   и обновляет наличие/цены наших товаров на маркетплейсе.
2. **Заказы Kaspi → мы (входящий).** Cron раз в 15 мин дёргает
   `/api/cron/kaspi-sync` → тянет заказы из Kaspi Merchant API, кладёт в БД,
   автоматически бронирует/списывает остатки по статусу заказа.

Плюс **блок «Купить на Kaspi.kz»** на публичной странице товара (ведёт на
карточку Kaspi), показывается по правилам ниже.

---

## 2. Модель данных (Prisma)

### Product (добавлено)
- `reservedStock Int @default(0)` — зарезервировано под незавершённые
  Kaspi-заказы. **Доступный остаток = `totalStock − reservedStock`** — это
  значение уходит в фид, на страницу товара, в корзину, в проверку заказа.
  Ручные правки склада меняют только `totalStock`.

### KaspiCatalogEntry — справочник карточек Kaspi (из ACTIVE.xml)
Импортируется загрузкой XML на `/admin/kaspi`. Поля: `kaspiSku` (unique,
merchant SKU из ACTIVE.xml, напр. `113363255_469963102`), `kaspiProductId`
(kaspi product id из URL, напр. `113363255`), `kaspiUrl`, `name`, `brand`,
`priceTenge`, `cityId`, `storeId`, `available`. **Не хранит привязку к товару
Alash** — это справочник.

### KaspiOffer — привязка карточки Kaspi к товару Alash
- `kaspiSku` (unique) — merchant SKU
- `productId` → Product
- `priceTenge`, `kaspiStoreId`, `cityId`, `kaspiName`, `kaspiBrand`, `kaspiUrl`
- `active` — оффер уходит в фид (в наличии на Kaspi)
- `stockOverride Int?` — переопределить кол-во (null = брать из Product)
- `availableOverride Boolean?` — переопределить доступность (null = авто)
- `preOrder Int @default(0)` — дни предзаказа 0–30 (по доке Kaspi)
- `showOnSite Boolean?` — показ блока на сайте: **null = авто, true = всегда,
  false = скрыть** (см. §5)

### KaspiOrder / KaspiOrderItem — импортированные заказы
- `KaspiOrder`: `kaspiOrderId` (unique), `code`, `state`, `status`,
  `stockApplied` (null|reserved|completed|released — для идемпотентности),
  `totalPrice`, `customerName/Phone`, `deliveryMode`, `isPreorder`,
  `isKaspiDelivery`, `creationDate`, `raw` (json), `syncedAt`
- `KaspiOrderItem`: `kaspiSku`, `kaspiName`, `productId?`, `quantity`, `price`

> ⚠️ После изменений схемы нужен `prisma db push` на проде (workflow
> `prisma-db-push.yml` или вручную через SSM). Миграций в проекте нет.

---

## 3. Фид остатков — `/api/kaspi/feed.xml`

Файл: `src/app/api/kaspi/feed.xml/route.ts`. `force-dynamic`, `no-store`.

- Basic Auth: env `KASPI_FEED_USER` / `KASPI_FEED_PASS` (если заданы).
- Берёт активные `KaspiOffer` с заполненным `kaspiName`.
- `<offer sku>` = **merchant SKU** (не kaspi product id!). Маппинг
  product-id → merchant SKU через `KaspiCatalogEntry.kaspiProductId`.
- Дедуп по merchant SKU: при конфликте предпочитается оффер, чей kaspiSku ==
  merchant SKU (а не голый product-id).
- `stockCount` = `stockOverride ?? (totalStock − reservedStock)`.
- `available` = `availableOverride ?? (stock>0 && inStock)`.
- `<cityprice>` по списку городов из `DEFAULT_CITY_IDS` (коды по офиц. таблице
  Kaspi), переопределяется env `KASPI_FEED_CITY_IDS`.

---

## 4. Импорт заказов + бронь/списание

### Клиент API — `src/lib/kaspi-api.ts`
- База `https://kaspi.kz/shop/api/v2`, заголовки `vnd.api+json`, токен из
  env `KASPI_API_TOKEN`. Retry с backoff на 429/5xx. Чанки дат ≤14 дней,
  page[size]≤100.
- `getAllOrders({state, fromMs, toMs})`, `getOrderEntries(orderId)`,
  `getEntryProduct(entryId)` → merchant SKU позиции (`ProductAttributes.code`).

### Синхронизация — `src/lib/kaspi-sync.ts`
`syncKaspiOrders(daysBack=30)` тянет заказы по всем `state` за период,
upsert `KaspiOrder`/`KaspiOrderItem`, маппит позиции на Product
(`resolveProductId`: оффер по SKU → по product-id → через каталог).

**Жизненный цикл остатков** (идемпотентно через `stockApplied`):

| Статус Kaspi | Эффект | Действие с остатком |
|---|---|---|
| APPROVED_BY_BANK, ACCEPTED_BY_MERCHANT | reserved | `reservedStock += qty` |
| COMPLETED | completed | `totalStock -= qty`, `reservedStock -= qty` |
| CANCELLED, CANCELLING, RETURNED, RETURN_ACCEPTED_BY_MERCHANT, KASPI_DELIVERY_RETURN_REQUESTED | released | `reservedStock -= qty` |
| NEW | none | ничего |

Переход применяется только если `stockApplied` сменился (не задваивает).

> Обратная запись статуса в Kaspi (подтвердить/выдать) **не нужна** — Kaspi сам
> переводит заказ в «Выдан» через Замлер/доставку.

### Запуск синхронизации
- Cron на EC2 (`ubuntu`): `*/15 * * * *` → `node scripts/kaspi-sync-orders.js`
  (обёртка дёргает `/api/cron/kaspi-sync?days=14`), лог `~/logs/kaspi-sync.log`.
- Эндпоинты: `POST /api/admin/kaspi-orders/sync` (кнопка в админке),
  `GET|POST /api/cron/kaspi-sync` (защита env `CRON_SECRET`, `Authorization: Bearer`).
- Защита от оверселла на сайте: `/api/orders` валидация и atomic decrement
  считают доступный остаток с учётом `reservedStock`.

---

## 5. Блок «Купить на Kaspi.kz» на странице товара

- Компонент: `src/components/KaspiBuyBlock.tsx` (полный блок с дисклеймером).
- Данные: `getKaspiBuyData(productId)` в `src/lib/data.ts`.
- **Показывается, только если** одновременно:
  1. `showOnSite ?? (active && available)` === true
     (`available` = `availableOverride ?? (stock>0 && inStock)`),
  2. заполнен `kaspiName`,
  3. есть `kaspiUrl` (в оффере или в `KaspiCatalogEntry` по merchant SKU).
- Поле `showOnSite`: **auto** = как доступность на Kaspi (avl=no → блока нет),
  **да** = принудительно показать, **нет** = скрыть. Управляется в `/admin/kaspi`
  колонка «сайт» + массовые `site-yes/no/auto`.

---

## 6. Админка

### `/admin/kaspi` (`page.tsx` + `KaspiClient.tsx`)
Каталог Kaspi + привязка к товарам. Колонки: Kaspi(sku/name/brand),
Kaspi URL, Товар Alash, Цена, **avl** (auto/yes/no), **pre** (0–30),
**stock**, **act** (в фиде), **сайт** (auto/да/нет).
- Привязка товара Alash: по URL или поиском.
- Загрузка ACTIVE.xml (кнопка).
- **Выделение** для массовых операций: «Выбрать все» / «все активные»
  (это НЕ фильтр списка, а выделение чекбоксов; фильтр списка —
  вкладки Все/Привязанные/Без привязки).
- **Массовые операции:** активировать/деактивировать, available yes/no/auto,
  site yes/no/auto, preOrder, stock=0/stock…, цена…, наценка %…, удалить.
  После действия — тост «Применено к N» + перемонтирование строк.

### `/admin/kaspi-orders` (`page.tsx` + `KaspiOrdersClient.tsx`)
Импортированные Kaspi-заказы: статус (бейджи), клиент, сумма, дата
(таймзона Asia/Almaty — иначе hydration mismatch), эффект на остатки
(забронировано/списано), позиции с привязкой к товарам. Кнопка
«Синхронизировать». Фильтры по статусу.

### Прочее в админке
- Редактор товара: ссылка **«на сайте»** (открыть `/product/{slug}`).
- Публичная страница товара: плавающая кнопка **«Редактировать»** —
  видна ТОЛЬКО при `role===ADMIN` (клиентский `useSession`); реальная защита
  `/admin` на сервере (`requireAdmin` в layout).

### Защита от дублей
Одну Kaspi-карточку (kaspi product-id) **нельзя** привязать к разным товарам
Alash (вызывало «зависшие» офферы). Проверка в `POST /api/admin/kaspi-offers`
и `PUT /api/admin/products/[id]/kaspi-offers`. Несколько РАЗНЫХ карточек на
один товар — разрешено (до 10).

---

## 7. Инфраструктура / деплой

- **EC2** `i-06e2d5837c24c75f3` (eu-north-1), приложение
  `/home/ubuntu/alashed-shop/frontend`, PM2 `alash-electronics`
  (`next start`, порт 5000, пользователь **ubuntu**).
- **Деплой:** push в `main` → GitHub Actions `deploy.yml` → tar в
  `s3://alashed-media/deploys/` → SSM вызывает `/home/ubuntu/deploy.sh`
  (копия в репо: `frontend/scripts/server-deploy.sh`).
- **deploy.sh** делает: `rm -rf .next` → `prisma generate` →
  `timeout 360 npm run build` → проверка `prerender-manifest.json`+`BUILD_ID`
  (а не rc, т.к. `next build` иногда зависает на «Collecting build traces»
  из-за `output:'standalone'`) → `chown -R ubuntu:ubuntu .next` →
  `pm2 restart` → healthcheck `curl :5000 == 200`.
  > ⚠️ Если правишь deploy.sh — синхронизируй и репо-копию, и серверный файл.

### Серверные env (.env на EC2, НЕ в git)
`DATABASE_URL`, `NEXTAUTH_SECRET`, **`NEXTAUTH_URL=https://alash-electronics.kz`**
(без него signOut редиректит на localhost!), `AWS_*`, `KASPI_API_TOKEN`,
`KASPI_FEED_USER/PASS`, `CRON_SECRET`, VAPID-ключи. См. `.env.example`.

---

## 8. Известные нерешённые дыры

См. `frontend/docs/KASPI_TODO.md` — логические дыры (двойная продажа последней
штуки, задвоение брони при сбое, окно синка, дубль карточки на уровне БД,
непривязанные позиции при ошибке API). Отложены — низкая вероятность при
текущих объёмах.
