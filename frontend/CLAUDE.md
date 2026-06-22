# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See the root `../CLAUDE.md` for full project documentation. This file covers frontend-specific patterns.

## Commands

```bash
npm run dev              # Dev server (port 3000)
npm run build            # Production build
npm run lint             # Next.js linter
npx prisma db push       # Sync schema to DB
npx prisma generate      # Regenerate Prisma client
# Google Indexing API (нужен JSON ключ, см. ../CLAUDE.md и .env.example)
npm run indexing:google:daily
npm run indexing:google:stats
```

## File Upload

`POST /api/admin/products/upload` → S3. Path: `products/{timestamp}-{random}.{ext}`. Allowed: jpg, jpeg, png, webp, gif.

## Admin Product API (`api/admin/products`)

Uses raw SQL for SKU-based sorting (numeric cast). Search queries both `name` and `variants.sku`. Category filtering includes many-to-many via `_ProductCategories` join table. Combines search + category with `AND`. PUT always rewrites variants from the request body (`deleteMany` + `createMany`); the admin form sends one tech-variant constructed from form fields and preserves its id so SKU/Kaspi/Satu/Ba3ar bindings survive.

## Stock invariants (`lib/variant-stock.ts`)

After any change to `Product.totalStock` call `mirrorSingleVariantStock(productId, tx?)` so the single tech-variant's `stock`/`available` stays in lockstep. Used by `api/orders/route.ts`, `api/admin/orders/[id]/route.ts`, `api/account/orders/[id]/cancel/route.ts`, and channel syncs (`lib/kaspi-sync.ts`, `lib/satu-sync.ts`, `lib/ba3ar-orders.ts`). The same `UPDATE` that changes stock should also recompute `inStock = (totalStock − reservedStock) > 0` — see existing call sites for the exact SQL.

## Kaspi UI statuses (`lib/kaspi-ui-status.ts`)

Admin page `/admin/kaspi-orders` shows Упаковка/Передача as separate filters and counts even though both share raw status `ACCEPTED_BY_MERCHANT` — disambiguated by `raw.assembled` (jsonb path). Filter URL uses UI keys (`OPLACHEN`/`UPAKOVKA`/`PEREDACHA`/`VYDAN`/`OTMENEN`/`VOZVRAT`). `kaspiUiStatusToWhere(key)` returns the Prisma `where` fragment that mixes `status` with a `raw.path=['assembled']` predicate where needed. Reserved stock stays bound to raw `ACCEPTED_BY_MERCHANT` (covers both Упаковка+Передача).

## Migration scripts

One-off DB/data migration scripts live in `scripts/` and run on prod via SSM (`scripts/deploy-alash-ssm.sh` pattern: upload to S3, SSM-execute on EC2 from the app dir so `@prisma/client` resolves). All are idempotent and support a `--apply` flag — without it they print a dry-run plan. Examples: `migrate-description-images-to-s3.js` (sha1-keyed external→S3), `split-variants-to-products.js` (multi-variant split). When writing a new migration, follow this pattern (dry-run default + `--apply`).

## Delivery Options

Three methods in checkout: Самовывоз (pickup with 2GIS link), Яндекс Курьер (Алматы only), inDrive (all Kazakhstan). Free delivery threshold: 150,000 tg. Labels in `lib/constants.ts`.

## Rate Limiting (`lib/rate-limit.ts`)

In-memory IP-based rate limiter. Pre-configured: `authLimiter` (30/min), `orderLimiter` (15/min), `searchLimiter` (100/min). Usage: `const blocked = orderLimiter(request); if (blocked) return blocked;`

## HTML Sanitization (`lib/sanitize.ts`)

Regex-based sanitizer (replaced `isomorphic-dompurify` for serverless compatibility). Whitelist of allowed tags and attributes. Used by `SafeHtml` component for product descriptions.
