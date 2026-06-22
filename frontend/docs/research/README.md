# Research-материалы (из репо ~/SheetsAlashBa3arKaspi)

Перенесено 2026-05-22 из отдельного research-репо `SheetsAlashBa3arKaspi`
(который будет удалён). Здесь — исходное ТЗ и архитектура единого склада на
3 канала: **Alash + Kaspi + Ba3ar**.

## Файлы
- `inventory-architecture.md` — долгосрочная архитектура единого склада
  (модели ChannelListing / Reservation / StockMovement / Ba3arContent, 5 фаз).
- `TZ-kaspi-integration.md` — ТЗ первой фазы (Kaspi feed на динамике).
- `kaspi-mapping.csv` — исходный маппинг 14 Kaspi-SKU → артикул Alash с
  заметками (напр. «BME280 название вводит в заблуждение», «дубль карточки 826»).
- `kaspi-active-original.xml` — оригинальный ACTIVE.xml от Kaspi.

## ⚠️ Статус относительно текущей реализации (важно)

Этот research писался ДО реализации. По факту мы построили проще, но цель
(единый остаток, без двойных продаж) достигнута. Соответствие:

| Из research | Что реально сделано |
|---|---|
| `Product.qtyOnHand` / `qtyReserved` | `Product.totalStock` / `reservedStock` |
| `ChannelListing` (KASPI/ALASH/BA3AR) | `KaspiOffer` + `SatuProduct` (по каналу отдельно) |
| `Reservation` / `StockMovement` модели | бронь напрямую в `reservedStock` + `stockApplied` на заказе (KaspiOrder/SatuOrder) |
| Фаза 1-2: Kaspi feed + админка | ✅ сделано — см. `../KASPI_INTEGRATION.md` |
| Фаза 3: Kaspi orders polling | ✅ сделано (бронь/списание) |
| (не было в плане) Satu.kz | ✅ сделано — см. `../SATU_INTEGRATION.md` |

## ❗ Что из плана НЕ сделано — Ba3ar.kz (Фаза 4)

**Ba3ar.kz** — выкупленный конкурент, отдельный Next.js репозиторий с **общей
БД** (тот же `DATABASE_URL`, что у Alash). НЕ реализован. Ключевые решения из
research для будущей реализации:

- Контент Ba3ar (свои фото/название/цена/описание) — модель `Ba3arContent`
  (productId → Product, отдельный bucket `ba3ar-media`).
- SKU совпадает с Alash → связь по артикулу автоматическая.
- **Inventory API живёт в alash-electronics**, Ba3ar дёргает его по HTTP
  (не через Prisma напрямую) — вся логика резервирования в одном месте.
  Защита `INVENTORY_API_KEY`.
- Остаток у Ba3ar = `totalStock − reservedStock` (как везде). Заказ на Ba3ar
  бронирует/списывает через тот же механизм.

Когда дойдём до Ba3ar — переиспользовать уже готовую инфраструктуру брони
(reservedStock, markSatuDirty-подобную очередь) и не плодить ChannelListing,
если KaspiOffer/SatuProduct-подход устраивает.
