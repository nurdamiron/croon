-- Миграция: поля демпинга в KaspiOffer.
-- Применять на ПРОДЕ через SSM (prisma db push в деплое пропущен из-за дрифта,
-- см. CLAUDE.md). Идемпотентно — IF NOT EXISTS, ничего не сносит, безопасно
-- повторно. Типы строго соответствуют schema.prisma.

ALTER TABLE "KaspiOffer"
  ADD COLUMN IF NOT EXISTS "autoDownscale"   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoUpscale"     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "minPriceTenge"   INTEGER,
  ADD COLUMN IF NOT EXISTS "maxPriceTenge"   INTEGER,
  ADD COLUMN IF NOT EXISTS "dumpingStep"     INTEGER   NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "strategy"        TEXT      NOT NULL DEFAULT 'BECOME_FIRST',
  ADD COLUMN IF NOT EXISTS "ignoreMerchants" TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "firstPlacePrice" INTEGER,
  ADD COLUMN IF NOT EXISTS "ourPosition"     INTEGER,
  ADD COLUMN IF NOT EXISTS "competitorCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastDumpCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastDumpError"   TEXT;

-- Индексы (Prisma @@index). IF NOT EXISTS — безопасно повторно.
CREATE INDEX IF NOT EXISTS "KaspiOffer_autoDownscale_idx" ON "KaspiOffer"("autoDownscale");
CREATE INDEX IF NOT EXISTS "KaspiOffer_autoUpscale_idx"   ON "KaspiOffer"("autoUpscale");
