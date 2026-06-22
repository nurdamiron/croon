# Satu.kz — что ещё можно сделать (TODO)

> Разведка API 2026-05-22. Уже реализовано (см. SATU_INTEGRATION.md): push
> остатков (near-realtime), импорт заказов с бронью/списанием. Ниже — что ещё
> даёт Satu API и что отложено.

## Полная карта Satu API (33 эндпоинта)

**products:** list, {id} (GET одного — на проде вернул HTML/404, путь иной),
by_external_id/{id}, edit, edit_by_external_id, **import_url**, import_file,
import/status/{id}, translation.
**orders:** list, {id}, **set_status**, refund, {id}/attach_receipt.
**clients:** list, {id}.  **messages:** list, {id}, set_status, reply.
**chat:** rooms, messages_history, send_message, send_file… — **ОТКЛЮЧЁН**
(на проде `chat/rooms` → "Chat is disabled"; включается в кабинете Satu/тариф).
**groups:** list, translation.  **payment_options/list, delivery_options/list,
order_status_options/list** — работают.  delivery/save_declaration_id.

## Что используем сейчас
products/list, products/edit (остатки), orders/list (заказы). + проверены
order_status_options, clients/list, delivery_options, payment_options, messages/list.

---

## TODO (по приоритету)

### 1. Смена статуса заказа Satu — `POST /orders/set_status` 🟡
Кнопки Принять/Выполнить/Отменить в /admin/satu-orders → управление заказами в
одном месте.
- **Справочник статусов (order_status_options/list):**
  `pending`(0) Новый · `received`(1) Принят · `paid`(6) Оплачен ·
  `delivered`(3) Выполнен · `canceled`(4) Отменён.
- ⚠️ `received` (Принят) сейчас НЕ учтён в маппинге бронь/списание в
  `syncSatuOrders` — добавить как **reserved** (наравне с pending/paid).
- Формат тела set_status — проверить запросом перед реализацией.

### 2. Сообщения покупателей — `messages/list` + `messages/reply` 🟡
Вопросы покупателей по товарам. messages/list работает (сейчас пусто).
Импорт в админку + Telegram/push-уведомление о новом вопросе, ответ через reply.
(Чат `chat/*` НЕ делать — отключён в кабинете Satu.)

### 3. Авто-выгрузка каталога — `products/import_url` 🔴 ОТЛОЖЕНО (есть риск)
Идея: отдать Satu URL YML-фида всех товаров Alash → новые товары появляются на
Satu сами (цена/фото/описание/наличие) + external_id для надёжной связи.
**Блокеры/риски:**
- `external_id` НЕЛЬЗЯ проставить через `products/edit` — Satu отвечает
  `"external_id": ["Unknown field."]`. external_id задаётся ТОЛЬКО при импорте
  (в самом фиде).
- У существующих 1341 товаров Satu external_id пустой → import_url рискует
  СОЗДАТЬ ДУБЛИ (не свяжет с уже заведёнными вручную).
- Безопасный путь: сделать YML-фид всех товаров (с external_id=Product.id в
  фиде) и настроить импорт В КАБИНЕТЕ Satu вручную на малом объёме, проверив
  маппинг/дубли. Только потом автоматизировать через import_url.
- Нужен новый эндпоинт `/api/satu/feed.yml` (EVO YML: offers с external_id,
  name, price, picture, description, categoryId, available, quantity_in_stock =
  totalStock−reservedStock).

### 4. clients/list → аналитика 🟢
Клиентская база Satu (имя/телефон) в нашу статистику клиентов.

### 5. delivery/save_declaration_id 🟢
Сохранять номер накладной доставки в Satu (узкий кейс, если используете их
доставку с декларациями).

## Известные грабли Satu API
- `orders/list` `date_from` НЕ принимает миллисекунды/Z → `.slice(0,19)` (уже учтено).
- `price` в товарах/позициях — строка "650 ₸" → парсить (уже учтено).
- `products/edit` тело = голый массив, external_id не принимает.
- `products/{id}` GET — путь не сработал (вернул HTML), детали товара брать из list.
