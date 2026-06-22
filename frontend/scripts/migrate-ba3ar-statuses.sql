-- Разовая миграция статусов Ba3arOrder со старой схемы на новую (как у Alash).
-- Старые: pending|confirmed|shipped|completed|canceled
-- Новые:  new|confirmed|processing|shipped|delivered|picked_up|canceled|returned
--
-- stockApplied НЕ трогаем — эффект на складе у пары совпадает:
--   pending/confirmed → reserved; shipped/completed → completed (списано); canceled → released.
-- Маппинг: pending→new (бронь), completed→delivered (списано, как и было).

BEGIN;

UPDATE "Ba3arOrder" SET status = 'new'       WHERE status = 'pending';
UPDATE "Ba3arOrder" SET status = 'delivered' WHERE status = 'completed';
-- confirmed / shipped / canceled остаются без изменений.

COMMIT;
