# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ИП КРУН — Next.js 14 e-commerce platform for an electronics store in Kazakhstan (croon.kz). Russian-language UI. Migrated from InSales, now fully self-hosted.

## Development Commands

All commands run from `frontend/`:

```bash
npm run dev              # Dev server on localhost:3000
npm run build            # Production build
npm run lint             # ESLint
npx prisma db push       # Sync schema to database (no migrations)
npx prisma generate      # Regenerate Prisma client after schema changes
npm run seed             # Seed database (scripts/seed.js)
npm run seed:kaspi       # Seed Kaspi offers from CSV
npm run seed:kaspi:dry   # Dry-run seed Kaspi offers
npm run export:kaspi     # Export XML feed for Kaspi
npm run kaspi:sync-orders # Sync orders from Kaspi Merchant API
npm run indexing:google:daily  # Google Indexing API — daily batch
npm run indexing:google:stats  # Google Indexing progress
npm run indexnow         # Submit URLs to IndexNow (Bing/Yandex)
npm run indexnow:dry     # Dry-run IndexNow submission
```

No test suite exists. Validate changes with `npm run build`.

## Architecture

**Stack**: Next.js 14 (App Router), React 18, TypeScript, PostgreSQL (Supabase) + Prisma, NextAuth.js (JWT + Credentials), Tailwind CSS, AWS S3 (`alashed-media` bucket, `eu-north-1`), web-push for PWA notifications.

### Key Directories (`frontend/src/`)

- `app/` — Pages and API routes (App Router). Public pages are server components.
- `app/admin/` — Admin dashboard (light sidebar layout, requires ADMIN role via `lib/admin.ts`)
- `app/api/admin/` — Admin API routes (all use `checkAdmin()` from inline session check)
- `lib/data.ts` — Centralized DB queries: search, pagination, category traversal (~20 functions)
- `lib/constants.ts` — Shared status/delivery/payment labels and Tailwind color classes
- `lib/cart.ts` — Client-side cart/favorites/viewed via localStorage
- `lib/push.ts` — Web-push + Telegram + Biz notification utility (`notifyAdmins()`)
- `lib/telegram.ts` — Telegram bot notifications for admins
- `lib/email.ts` — SMTP email notifications (order confirmation, status changes, password reset)
- `lib/rate-limit.ts` — In-memory IP-based rate limiter (auth, order, search, API)
- `lib/sanitize.ts` — Regex-based HTML sanitizer (replaced isomorphic-dompurify for serverless)
- `lib/kaspi-sync.ts` — Kaspi order sync + stock management
- `lib/kaspi-dumping.ts` — Auto price management (competitor monitoring + price adjustment)
- `lib/kaspi-analytics.ts` — Kaspi sales analytics (revenue, profit, margin, ABC)
- `lib/kaspi-autolink.ts` — Auto-link Kaspi catalog entries to products by SKU
- `lib/channel-comparison.ts` — Channel sales comparison (Kaspi vs Site)
- `lib/app-settings.ts` — Runtime toggles (AppSetting key-value model)
- `lib/variant-stock.ts` — Mirror stock between Product and tech-variant
- `lib/indexnow.ts` — IndexNow API submission (Bing, Yandex)
- `lib/seo.ts` — SEO helpers (markdown strip, truncation)
- `components/` — Shared UI (Header, Footer, ProductCard, Sidebar, SubcategoryFilter, RichTextEditor, SafeHtml, Toast, KaspiBuyBlock)
- `prisma/schema.prisma` — 20 models
- `middleware.ts` — InSales URL redirects + canonical deduplication
- `utils/supabase/` — Supabase client helpers (client.ts, server.ts, middleware.ts)

### Product Data Model (Critical)

**Model: 1 карточка = 1 товар.** Multi-variant products were split into separate cards in 2026-05 (script `scripts/split-variants-to-products.js`). Every product still keeps **one technical `ProductVariant`** because SKU lives on the variant (channel integrations bind by SKU). The admin form exposes price/stock/SKU/cost/weight as direct product fields and writes them into that single tech-variant on save.

Products have **dual category membership** — always query both:
- `product.categoryId` — primary category (one-to-one)
- `product.categories[]` — secondary categories (many-to-many via `_ProductCategories`)
- **Correct filter pattern**: `{ OR: [{ categoryId: { in: ids } }, { categories: { some: { id: { in: ids } } } }] }`

Stock fields:
- `inStock` (Boolean) — visibility on storefront AND order routing gate: `true` → normal purchase, `false` → pre-order (`Order.isPreorder=true`), no stock decrement. **Auto-managed**: admin form and channel syncs recompute `inStock = (totalStock − reservedStock) > 0` on every stock change. Manual toggle still works but is overridden by the next stock change/sync.
- `totalStock` (Int) — source of truth for inventory. Decremented atomically via raw SQL `UPDATE ... WHERE (totalStock − reservedStock) >= quantity` to prevent overselling. `0` = out of stock (not "unlimited").
- `reservedStock` (Int) — quantity reserved by APPROVED Kaspi orders (released on COMPLETED/CANCELLED). Available stock = `totalStock − reservedStock`.
- `costPrice` (Float?) — purchase cost, admin-only. Now stored both on `Product` and `ProductVariant`; admin form writes per-variant value into the single tech-variant.
- `weight` (Float?) — same dual storage as `costPrice`.
- `sku` (String?) — on Product level. Anchor for channel integrations (Kaspi/Satu/Ba3ar bind by SKU). Nullable: products without SKU are allowed.
- `archived` (Boolean) — soft-delete flag. Archived products are hidden from site/Google/channels/admin list but preserved in DB (sales history preserved). Auto-archived when trying to delete a product with sales.
- `badgeText` (String?) — product card badge (e.g. "С НДС · растаможен").

**ProductVariant** keeps: `sku` (channels bind here), `price`, `oldPrice`, `costPrice`, `weight`, `stock`, `available`. For single-variant products `variant.stock` is mirrored from `Product.totalStock` via `lib/variant-stock.ts` → `mirrorSingleVariantStock()` after every channel/order stock change. The admin form loads `variant.stock` from `Product.totalStock` (source of truth), not from the variant column directly.

### Category Hierarchy

Self-referential tree via `parentId`. Root is invisible "Каталог". `isHidden` hides from public site but shows in admin.

When filtering products by category, **always collect all descendants recursively** using `getAllDescendantCategoryIds()` from `lib/data.ts` — it queries the DB at any depth, including hidden categories.

For UI display, `getCategoryBySlug()` loads only 3 levels of visible children (enough for sidebar/filters).

### Search (`lib/data.ts` — `searchProducts`)

Raw SQL with relevance scoring:
1. Normalizes separators ("esp32" matches "ESP-WROOM-32")
2. Searches name, description, SKU (via ProductVariant subquery)
3. Auto-detects wrong keyboard layout (ЙЦУКЕН ↔ QWERTY) and transliterates (Ардуино ↔ Arduino)
4. pg_trgm GIN indexes on Product.name, Product.description, ProductVariant.sku
5. "Did you mean?" suggestions via pg_trgm similarity when few results

### Client-Side State

No server-side cart. localStorage keys: `alash_cart`, `alash_favorites`, `alash_viewed`, `alash_search_history`. Cross-component sync via custom DOM events (`cart-updated`, `favorites-updated`).

### Auth

NextAuth with Credentials provider, JWT strategy. Role (`USER`/`ADMIN`) baked into JWT at login — DB role changes require re-login. Admin layout protected by `requireAdmin()` in `lib/admin.ts`. API routes use inline `checkAdmin()`.

Password reset flow: `POST /api/auth/forgot-password` (sends email with token), `POST /api/auth/reset-password` (verifies token + updates password). Token stored in `PasswordResetToken` model with expiry.

### Order Flow

`POST /api/orders` — standard checkout (full form). Wrapped in `$transaction` with atomic SQL decrement on `Product.totalStock` (`UPDATE WHERE (totalStock − reservedStock) >= qty`) to prevent overselling. Cart items carry optional `variantId`; the order also decrements the specific `ProductVariant.stock` atomically with its own guard, otherwise mirrors the single tech-variant. Item price = `variant.price` when `variantId` present, else `Product.price`. If any item `inStock=false` → `Order.isPreorder=true`, no decrement. Sends push/Telegram/Biz notification to admin subscribers. Tracks search queries and traffic sources (referrer, UTM params) per order.

`POST /api/preorder` — quick pre-order form (name + phone only). Creates `Order(isPreorder=true)` for a single out-of-stock product directly from the product page modal.

`PATCH /api/admin/orders/:id` — admin edits order line items (when status is not final); recalculates total and adjusts `Product.totalStock` and mirrors variant stock for touched products in a `$transaction`.

Statuses: `NEW → CONFIRMED → PROCESSING → SHIPPED → DELIVERED | PICKED_UP | CANCELLED`
- "Open" filter: NEW, CONFIRMED, PROCESSING
- "Closed" filter: SHIPPED, DELIVERED, PICKED_UP, CANCELLED

### Channel Integrations (Kaspi / Satu / Ba3ar)

All three marketplaces bind to products **by SKU on `ProductVariant`** but operate on `Product.totalStock` / `Product.reservedStock`. The stock-effect logic in `lib/kaspi-sync.ts`, `lib/satu-sync.ts`, `lib/ba3ar-orders.ts` is uniform:
- Reserved/completed/released states drive `reservedStock` and `totalStock` deltas via raw SQL.
- Each `UPDATE` also recomputes `inStock = (totalStock − reservedStock) > 0` — sync drives visibility automatically (overrides manual hide).
- After a `totalStock` change call `mirrorSingleVariantStock(productId)` from `lib/variant-stock.ts` to keep the single tech-variant in lockstep.
- `markSatuDirty([productId])` flags Alash→Satu push when local stock changes.

If you add a new stock mutation site, mirror this pattern (recompute `inStock` in the same `UPDATE`, then call the mirror helper).

#### Kaspi Integration

**Architecture**: `lib/kaspi-api.ts` — Kaspi Merchant API v2 client (orders). `lib/kaspi-sync.ts` — order sync + stock management. `lib/kaspi-ui-status.ts` — virtual UI status mapping. `lib/kaspi-url.ts` — PID/link builder. `lib/kaspi-resolve.ts` — short link resolver (SSRF-safe). `lib/kaspi-relink.ts` — relink orphaned order items. `lib/kaspi-autolink.ts` — auto-link catalog entries to products by SKU. `lib/kaspi-dumping.ts` — auto price management engine. `lib/kaspi-analytics.ts` — sales analytics.

**Kaspi API modes**: `KASPI_MODE=prod|test` switches between `KASPI_API_TOKEN_PROD` and `KASPI_API_TOKEN_TEST`. Fallback to legacy `KASPI_API_TOKEN`.

**Kaspi Offer**: `KaspiOffer` model links Product ↔ Kaspi. Fields: `kaspiSku`, `priceTenge`, `active`, `showOnSite`, `stockOverride`, `availableOverride`, `preOrder`. Dumping fields: `autoDownscale`, `autoUpscale`, `minPriceTenge`, `maxPriceTenge`, `dumpingStep`, `strategy`, `ignoreMerchants`, `dumpPriority`. Metrics: `firstPlacePrice`, `rivalPrice`, `rivalName`, `ourPosition`, `competitorCount`.

**Kaspi XML Feed**: `GET /api/kaspi/feed.xml` — product feed for Kaspi Merchant. Returns active offers with stock/price. Basic Auth optional (`KASPI_FEED_USER`/`KASPI_FEED_PASS`). Supports multi-city pricing via `KASPI_FEED_CITY_IDS`. Global toggle: `AppSetting.kaspi_feed_enabled`.

**Kaspi Dumping Engine** (`lib/kaspi-dumping.ts`): Auto price management based on competitor prices from Kaspi public API (`POST https://kaspi.kz/yml/offer-view/offers/{PID}`). Strategies: `BECOME_FIRST` (become cheapest), `MATCH_FIRST` (match cheapest), `HOLD_SECOND` (stay second, undercut by step). Price changes applied to `KaspiOffer.priceTenge` (isolated from site prices). Global toggle: `AppSetting.kaspi_dumping_enabled`. Cron: `GET /api/cron/kaspi-dumping` (EC2, `CRON_SECRET`). Manual run: `POST /api/admin/kaspi-dumping/run`. Ingest: `POST /api/admin/kaspi-dumping/ingest` (browser/worker pushes offer-view data). Task queue: `POST /api/admin/kaspi-dumping/tasks` (priority rotation).

**Kaspi Analytics** (`lib/kaspi-analytics.ts`): Revenue, profit, margin per product. Full economics: `Profit = Revenue − CostPrice − KaspiCommission − KaspiPay − Delivery − Tax`. ABC analysis. Channel comparison (`lib/channel-comparison.ts`): Kaspi vs Site side-by-side.

**Kaspi Catalog**: `KaspiCatalogEntry` — imported from ACTIVE/ARCHIVE XML. Auto-link to products by SKU. Manual link via admin UI. Lookup: `POST /api/admin/kaspi-catalog/lookup`. Bulk import: `POST /api/admin/kaspi-catalog/import`.

#### Kaspi UI statuses (Упаковка vs Передача)

Raw `KaspiOrder.status` is the Kaspi API value (`APPROVED_BY_BANK`, `ACCEPTED_BY_MERCHANT`, `COMPLETED`, …). The admin UI shows a **virtual UI status** derived from `(status, raw.assembled)` to match the Kaspi cabinet:
- `ACCEPTED_BY_MERCHANT` + `raw.assembled=false` → **Упаковка** (UPAKOVKA)
- `ACCEPTED_BY_MERCHANT` + `raw.assembled=true`  → **Передача** (PEREDACHA)
- `APPROVED_BY_BANK` → **Оплачен**, `COMPLETED` → **Выдан**, `CANCELLED*` → **Отменён**, `RETURN*/RETURNED` → **Возврат**

Logic lives in `lib/kaspi-ui-status.ts` (`kaspiUiStatus()` for labels, `kaspiUiStatusToWhere()` for Prisma filter — UPAKOVKA/PEREDACHA filter by `raw->'assembled'` jsonb path). `reservedStock` is NOT affected by the UI split — it still tracks the raw `ACCEPTED_BY_MERCHANT` status (covers both Упаковка+Передача), so hold-release semantics are unchanged.

### Cart (client-side)

`CartItem` (in `lib/cart.ts`) carries an optional `variantId`. Storefront `ProductActions` selector writes it on add-to-cart. Checkout (`app/checkout/page.tsx`) forwards `variantId` to `/api/orders`. Cart validation in `app/cart/page.tsx` fetches `/api/products?ids=…` which returns each product's variants and uses `effectiveInfo(item, info)` to pick price/stock/available from the chosen variant — needed so that "Цена изменилась" doesn't false-trigger when a variant's price differs from the product's.

### Reviews

Users can submit reviews (`POST /api/reviews`) with rating + text. Requires authentication. `isApproved` flag — admin approves via `/admin/reviews`. Approved reviews shown on product page via `ReviewList`/`ReviewForm` components.

### User Accounts

- `User` model: email, passwordHash, name, phone, role, emailNotifications
- `Address` model: saved delivery addresses (label, address, city, isDefault)
- Account pages: `/account` (profile), `/account/orders` (order history), `/account/orders/[id]/invoice` (invoice PDF)
- Account API: `/api/account/profile`, `/api/account/password`, `/api/account/addresses`, `/api/account/orders`, `/api/account/favorites`, `/api/account/viewed`, `/api/account/reviews`

### Notifications

`notifyAdmins()` in `lib/push.ts` sends to three channels:
1. **Web-push** — PWA notifications to subscribed admin browsers
2. **Telegram** — via `lib/telegram.ts` (requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
3. **Biz** — forwards to operational brain via `POST /api/internal/activity` (requires `BIZ_INTERNAL_URL` + `BIZ_INTERNAL_KEY`)

Per-channel toggles in admin settings (`AppSetting` model).

### Tailwind Theme

Brand colors defined in `tailwind.config.ts`:
- `brand` / `brand-hover` — public site (`#006EBE` / `#0055a0`)
- `admin` / `admin-hover` — admin dashboard (`#5c6ac4` / `#4c5ab4`)

Use these instead of hardcoded hex values.

### URL Structure (matches InSales URLs for SEO)

- `/product/{slug}`, `/collection/{slug}`, `/page/{slug}`, `/blogs/{blog}/{slug}`
- `/client_account/login`, `/account`, `/cart`, `/checkout`, `/favorites`
- `/admin/*` — Admin dashboard
- `/dlya-shkol` — Schools landing page (B2B)
- `/arduino-nabory` — Arduino kits landing page
- `/karta-sayta` — HTML sitemap
- `/llms.txt` — LLM-friendly site description
- `/sitemap.xml` — Dynamic sitemap (Next.js `sitemap.ts`)
- 301 redirect: `/collection/{cat}/product/{slug}` → `/product/{slug}`

### PWA

Dual manifests: `manifest.json` (public) and `manifest-admin.json` (admin, `start_url: /admin`). Dynamic `<link rel="manifest">` via `ManifestLink` component. Service worker at `public/sw.js` handles push notifications.

### Analytics

GTM (GTM-KL4548TT), GA4 (G-ZF2FTFY91R), Yandex.Metrika (99289068) — all in `app/layout.tsx`.

### SEO

- `next.config.js`: 301 redirects for old InSales URLs, www→non-www, slug changes, PDF manuals→product pages
- `middleware.ts`: Single-hop InSales URL redirects, canonical deduplication (strip `?page=1`, `?sort=default`, `?lang=`)
- `sitemap.ts`: Dynamic sitemap with products, categories, pages, blog posts
- `lib/seo.ts`: `stripMarkdown()`, `truncate()`, `cleanDescription()` helpers
- `lib/indexnow.ts`: IndexNow API submission to Bing/Yandex
- `llms.txt` route: AI-friendly site description

### Email

`lib/email.ts` — SMTP-based email notifications via Nodemailer. Templates: order confirmation, status update, password reset. Uses Gmail SMTP by default (`SMTP_USER`/`SMTP_PASS` App Password).

## Admin Dashboard Pages

| Page | Description |
|------|-------------|
| `/admin` | Dashboard with revenue chart, order summary |
| `/admin/orders` | Orders list with status filters |
| `/admin/orders/[id]` | Order detail/edit |
| `/admin/products` | Products list with search, category filter, SKU sort |
| `/admin/products/[id]` | Product edit form |
| `/admin/products/acceptance` | Product acceptance workflow |
| `/admin/categories` | Category tree management |
| `/admin/categories/[id]` | Category edit |
| `/admin/kaspi` | Kaspi settings, dumping config, offer management |
| `/admin/kaspi-orders` | Kaspi orders (Упаковка/Передача/Выдан filters) |
| `/admin/kaspi-offers` | Kaspi offer management |
| `/admin/kaspi-catalog` | Kaspi catalog import + autolink |
| `/admin/kaspi-missing` | Products not on Kaspi (manual link) |
| `/admin/kaspi-analytics` | Kaspi sales analytics + channel comparison |
| `/admin/clients` | Client list (from Orders, grouped by phone) |
| `/admin/reviews` | Review moderation |
| `/admin/pages` | CMS pages |
| `/admin/settings` | Runtime toggles (AppSetting) |
| `/admin/cost-fix` | Tinder-style cost/stock entry |

## Non-Obvious Things

- Homepage tabs pull from category slugs: `popular`, `new`, `gotovye-nabory-dlya-robototehniki`
- Deleting a category moves its products to the hidden "Без категории" and re-parents children
- Admin clients page queries from Orders grouped by phone (not User table) — shows ALL customers
- Product descriptions rendered via `SafeHtml` using `lib/sanitize.ts` (regex-based, no jsdom — `isomorphic-dompurify` was removed for serverless compatibility)
- Rich text editor uses Tiptap — check for null editor before rendering MenuBar
- Serverless: must `await` async operations (push notifications) before response ends
- Admin nav badge polls `/api/admin/orders/count` every 30s for open order count
- Subcategory filters use `?sub=slug1,slug2` query param — preserved in pagination/sort links
- **Auto-visibility by stock**: admin form toggles `inStock` automatically on `totalStock` change (>0 show / =0 hide); channel syncs also recompute `inStock` strictly by available stock — manual hides are overridden by next stock update. Intentional.
- **236 split products from 2026-05** named like "Имя (SKU)" (e.g. "Латунные стойки М2 (папа-мама) (1508.3)"). Most have `totalStock=0`. Rename/restock as needed; SKUs are intentionally unchanged (channel bindings).
- **`prisma db push` in deploy is skipped** by a pre-existing `--accept-data-loss` warning. For new schema columns, apply via `ALTER TABLE ADD COLUMN IF NOT EXISTS` over SSM. The unresolved drift causing the warning should eventually be cleaned up.
- **Related products vs similar products on `/product/[slug]`**: «Аналогичные товары» = same category (`getRelatedProducts` in `lib/data.ts`), «Сопутствующие товары» = sibling categories (`getSimilarProducts`). Labels look interchangeable — don't swap them.
- **All product description images are in our S3** (`alashed-media/products/desc/{sha1-of-url}.{ext}`). 172 images were migrated from external hosts (ampermarket.kz, radiomart.kz, ae01.alicdn.com, etc.) via `scripts/migrate-description-images-to-s3.js` — script is idempotent (sha1-keyed) and supports both `![alt](url)` and `![alt](url "title")` Markdown forms. Re-run with `--apply` whenever new external links appear in admin descriptions.
- **`productChangeLog.createMany` rejects `NaN`** — when admin form posts empty price/oldPrice, `parseFloat('')` yields NaN and Prisma fails the whole PUT with "Argument newValue is missing". Always guard parses with `|| 0` (see `api/admin/products/route.ts:257-259`). The product write higher in the same handler already had the guard; the log block did not.
- **Kaspi dumping is isolated from site prices** — dumping engine only changes `KaspiOffer.priceTenge`, never touches `ProductVariant.price`. Site/Satu/Ba3ar prices are unaffected.
- **Kaspi commission multiplier** (`kaspi_commission_mult` AppSetting, default 1.41) — used for margin/floor calculations in dumping and analytics. Real Kaspi commission + Kaspi Pay + tax.
- **AppSetting model** — runtime key-value toggles in `prisma/schema.prisma`. Change via admin `/admin/settings` or directly in DB. Used for: `kaspi_feed_enabled`, `kaspi_site_blocks_enabled`, `kaspi_dumping_enabled`, `kaspi_commission_mult`, notification channel toggles.
- **Product archiving** — `archived` flag on Product. Auto-archived on delete attempt if sales exist. Hidden from site/Google/channels/admin main list. Visible via admin archive filter. Preserves sales history.
- **Supabase** — database hosted on Supabase (connection pooler on port 6543, direct connection on port 5432 for migrations). `DIRECT_URL` env var for Prisma migrations.
- **Lead model** — CRM for B2B leads. Fields: name, category, city, phone, whatsapp, score, status (NEW/SENT/REPLIED/CONVERTED/REJECTED).
- **Cost Fix page** (`/admin/cost-fix`) — Tinder-style UI for bulk entry of cost prices and stock. Two modes: fill missing costPrice, fill missing stock for products with cost.

## Infrastructure

### Hosting
- **EC2 `alash-electronics`** (13.51.198.130): PM2 process **`alash-shop`** on port **5000** (frontend). Project at `/home/ubuntu/alashed-shop/frontend/`.
  - Nginx: port 80/443 → localhost:5000
  - **Prod deploy (фактический):** архив в `s3://alashed-media/deploys/*.tar.gz` → на сервере `/home/ubuntu/deploy.sh` (распаковка в `frontend/`, `npm run build`, `pm2 restart alash-electronics`). На инстансе часто **нет** каталога `.git` в `alashed-shop` — обновление через **tar**, не через `git pull`.
  - **GitHub Actions:** workflow **Deploy to EC2** (`.github/workflows/deploy-ec2.yml`, `workflow_dispatch`) → SSM на **`i-06e2d5837c24c75f3`** выполняет `git pull` — имеет смысл только если в `/home/ubuntu/alashed-shop` восстановлен git-clone; иначе используй tar/S3 или поправь workflow под свой процесс.
  - **Диагностика:** workflow **Diagnose & Recover EC2** (`.github/workflows/diagnose-ec2.yml`).
  - **Google Indexing (cron на EC2):** пользователь `ubuntu`, ежедневно **9:00** (время сервера UTC), команда с `GOOGLE_INDEXING_KEY_PATH=/home/ubuntu/.secrets/google-indexing.json`, `GOOGLE_INDEXING_STATE_PATH=/home/ubuntu/.local/google-indexing-state.json`, лог `~/logs/google-indexing.log`. Ключ: workflow **Upload Google Indexing key to EC2** (секрет `GOOGLE_INDEXING_JSON`) или ручная кладка файла. Каталог `.secrets` должен быть **`ubuntu:ubuntu`**, `chmod 700`. Скрипт при необходимости копируют из `s3://alashed-media/deploys/google-index-daily.js` в `frontend/scripts/` (не затирается обычным tar, если не включён в архив).
  - **Kaspi Dumping Cron:** EC2 cron hits `/api/cron/kaspi-dumping` every 15-30 min with `Authorization: Bearer <CRON_SECRET>`. Kaspi re-reads feed every ~60 min, so more frequent runs are wasteful.
  - **Kaspi Sync Cron:** EC2 cron hits `/api/cron/kaspi-sync` for order synchronization.
  - GitHub deploy key (SSH) at `~/.ssh/deploy_key` — **добавить в репо вручную**, если нужен `git pull` на сервере (см. `STATUS.md`).
- **EC2 `alashed-services`** (13.62.193.249): Biz API, Edu API, other services (no longer hosts alash-electronics)
- **EC2 `CodeStudio`** (16.170.207.59): t3.micro dev environment
- **S3**: `alashed-media` bucket (eu-north-1) — all product images (3363+ files)
- **Supabase**: PostgreSQL hosting (connection pooler + direct connection)

### DNS
- Registrar: **ps.kz**
- Current NS: InSales (`ns3.insales.com` / `ns4.insales.com`)
- Current IP: `185.65.148.57` (InSales)
- Plan: AWS Route 53 hosted zone → change NS at ps.kz → A records for InSales IP + EC2 subdomains
- SSL: certbot after DNS resolves

### AWS IAM
- User `alashed-media`: S3 access only. Account ID: `323044913393`. No Route 53 permissions yet.

## Environment Variables

See `frontend/.env.example` for full reference. Required vars:

```
DATABASE_URL                  # Supabase connection pooler (port 6543)
DIRECT_URL                    # Supabase direct connection (port 5432) for migrations
NEXTAUTH_SECRET               # JWT signing (random 32-char string)
NEXTAUTH_URL                  # https://croon.kz (prod) / http://localhost:3000 (dev)
AWS_ACCESS_KEY_ID             # IAM user alashed-media (S3 only)
AWS_SECRET_ACCESS_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY  # Web-push (NEXT_PUBLIC_ prefix required — baked into build)
VAPID_PRIVATE_KEY             # Web-push private
PORT=5000                     # prod (nginx → 5000); local dev: PORT=3000
```

Optional vars:
```
KASPI_API_TOKEN_PROD          # Kaspi Merchant API token (prod)
KASPI_API_TOKEN_TEST          # Kaspi Merchant API token (test/sandbox)
KASPI_MERCHANT_ID             # Kaspi store ID (default: 30233309)
KASPI_FEED_USER/PASS          # Basic Auth for Kaspi XML feed
KASPI_MODE                    # prod | test (default: prod)
CRON_SECRET                   # Auth for cron endpoints
TELEGRAM_BOT_TOKEN            # Telegram bot for admin notifications
TELEGRAM_CHAT_ID              # Telegram chat ID
SMTP_USER/SMTP_PASS           # Gmail SMTP for email notifications
INTERNAL_API_KEY              # Internal API key for server-to-server calls
BIZ_INTERNAL_URL/KEY          # Biz platform integration
```

Generate VAPID keys: `node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"`
