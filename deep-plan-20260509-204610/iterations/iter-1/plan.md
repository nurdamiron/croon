# Implementation Plan: Личный кабинет клиента — полная реализация

**Date:** 2026-05-09  
**Iteration:** 1  
**Mode:** deliberate

---

## Codebase State Summary

Before planning: a close read of the schema and existing code reveals:

1. **`OrderStatusLog` already exists** in `schema.prisma` (lines 167–178) — has `id, orderId, status, prevStatus, note, createdAt`. Admin PATCH already writes to it on status change. **No schema change needed for Phase 5.**
2. **`Favorite` model already exists** (lines 180–189) — has `id, userId, productId, createdAt` with `@@unique([userId, productId])`. User already has `favorites Favorite[]`. **No schema change needed for Phase 7.**
3. **`PasswordResetToken` does not exist** — must add.
4. **`Review` does not exist** — must add.
5. Stock restore in admin PATCH uses raw SQL `UPDATE ... SET totalStock = totalStock + qty, inStock = true` — the cancel route must mirror this.
6. Auth uses bcryptjs (not bcrypt) — use same in password change route.
7. Rate limiters are pre-configured in `lib/rate-limit.ts` — use `authLimiter` for password/forgot-password endpoints.

---

## RALPLAN-DR Summary

### Principles

1. **Surgical additions only** — every new file/change traces directly to a requirement. Do not refactor existing working code as part of this plan.
2. **Mirror existing patterns** — auth check via `getServerSession(authOptions)`, stock restore via raw SQL matching `/api/admin/orders/[id]/route.ts`, rate limiting via pre-built limiters.
3. **Progressive enhancement** — guests fall back to localStorage for favorites; authenticated users get DB sync. No regressions for anonymous users.
4. **Email is fire-and-forget** — send after responding to client, wrapped in `.catch()`, never block order creation on email failure.
5. **One-time tokens, short TTL** — `PasswordResetToken.usedAt` and `expiresAt` enforced at read time, not just delete-after-use.

### Decision Drivers

1. **Email provider choice** — Resend vs Nodemailer+SMTP. Resend wins on simplicity (single `npm i resend`, no SMTP server management) and free tier (100 emails/day) — sufficient for this store's volume.
2. **Schema change risk** — `npx prisma db push` is non-reversible destructive if fields are dropped; plan adds only new models/fields, never drops existing ones.
3. **Review moderation latency** — reviews go live only after admin approval to prevent spam; `isApproved = false` default makes this safe.

### Viable Options

**Option A (Selected): Resend SDK**  
Pros: 4-line integration, managed deliverability, Russian-friendly (any from address), free tier 100/day.  
Cons: external SaaS dependency, requires RESEND_API_KEY secret.

**Option B: Nodemailer + SMTP (Gmail/Yandex)**  
Pros: no third-party, works with existing Google Workspace if available.  
Cons: SMTP auth setup complexity, Gmail rate limits, harder to template HTML emails server-side.

**Option C: Skip email, log only**  
Pros: zero new dependencies.  
Cons: fails the stated requirement; not viable.

---

## Delta Thinking

### What I'd Cut vs Baseline

- **Cut: Custom email queue/retry system** — fire-and-forget with `.catch(console.error)` is the established pattern in this codebase (see `notifyAdmins`, `sendTelegram`). An in-process queue adds complexity with no observable benefit at this traffic level.
- **Cut: Review rich-text input** — plain textarea is sufficient for product reviews; Tiptap adds bundle weight unnecessarily.
- **Cut: Server-side favorite count badge in header** — localStorage sync on login is sufficient; real-time badge update via DOM event (`favorites-updated`) already exists in `lib/cart.ts`.

### What I'd Add vs Baseline

- **Add: `sendEmailOrders` wrapper** — centralized email call in `lib/email.ts`, so future templates are one function call away.
- **Add: `cancelledBy` field to OrderStatusLog** — distinguishes customer-initiated cancellation from admin cancellation in the admin dashboard without a UI change to Phase 5.
- **Add: Rate limit on `/api/auth/forgot-password`** — using `authLimiter` (30/min) to prevent email bombing.

---

## Pre-mortem: Concrete Failure Scenarios

**Scenario 1: Token race condition in forgot-password**  
User clicks "Отправить ссылку" twice rapidly — two tokens generated, first email arrives with stale token (second invalidated it). Fix: in `POST /api/auth/reset-password`, `deleteMany` all tokens for user before creating new one, not just upsert.

**Scenario 2: Favorites sync on login overwrites DB state**  
If user has product A in DB favorites (added on mobile), and localStorage has product B only, a naive "wipe + insert from localStorage" loses product A. Fix: merge with `createMany({ skipDuplicates: true })` — only insert missing, never delete existing.

**Scenario 3: Review "has purchased" check is bypassable via old/cancelled order**  
If check is `order.status !== 'CANCELLED'` but the query fetches any order, a user who ordered and then cancelled can still review. Business decision: allow review if user ever had any non-cancelled completed order for the product. Check against statuses `DELIVERED | PICKED_UP` only for strictness, or `any order item` for leniency. Plan specifies the strict version.

---

## Phase 1 — DB Schema Changes (Prisma)

**File:** `frontend/prisma/schema.prisma`

### Changes required

**Note:** `OrderStatusLog` (equivalent to task's `OrderStatusHistory`) already exists. `Favorite` already exists. Only two new models needed.

#### Add `PasswordResetToken` model

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  token     String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([token])
  @@index([userId])
}
```

Add relation to `User` model:
```prisma
passwordResetTokens PasswordResetToken[]
```

#### Add `Review` model

```prisma
model Review {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId  String
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  rating     Int      // 1–5
  text       String   @db.Text
  isApproved Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@unique([userId, productId])  // one review per user per product
  @@index([productId])
  @@index([isApproved])
}
```

Add relations to `User` and `Product`:
```prisma
// in User:
reviews  Review[]
// in Product:
reviews  Review[]
```

#### Add `cancelledBy` field to `OrderStatusLog`

```prisma
cancelledBy String?  // "admin" | "customer" — populated when status=CANCELLED
```

**After editing schema:**
```bash
cd frontend && npx prisma db push && npx prisma generate
```

---

## Phase 2 — Email Service

### Decision: Resend

**Dependency:**
```bash
cd frontend && npm install resend
```

**Env vars to add:**
- `RESEND_API_KEY` — get from resend.com
- `EMAIL_FROM` — e.g. `noreply@alash-electronics.kz` (must be verified domain in Resend)

**File:** `frontend/src/lib/email.ts` (new)

```typescript
// Key exports:
export async function sendOrderConfirmation(params: {
  to: string
  name: string
  orderNumber: number
  items: { name: string; quantity: number; price: number }[]
  total: number
  deliveryMethod: string | null
}): Promise<void>

export async function sendOrderStatusUpdate(params: {
  to: string
  name: string
  orderNumber: number
  status: string  // 'CONFIRMED' | 'SHIPPED' | 'DELIVERED'
}): Promise<void>

export async function sendPasswordReset(params: {
  to: string
  resetUrl: string
}): Promise<void>
```

Implementation pattern per function:
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendOrderConfirmation(params) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@alash-electronics.kz',
    to: params.to,
    subject: `Ваш заказ #${params.orderNumber} принят — Alash Electronics`,
    html: orderConfirmationHtml(params),
  })
}
```

**Templates (inline HTML strings in `lib/email.ts` or `lib/email-templates.ts`):**

- `orderConfirmationHtml`: lists items in a table, total, delivery method, link to `/account`
- `orderStatusHtml`: single status message with Russian label, link to order in `/account`
- `passwordResetHtml`: reset link valid 1 hour

**Russian status labels for email:** use `statusLabels` from `lib/constants.ts` — import directly.

**Statuses that trigger email:** `CONFIRMED`, `SHIPPED`, `DELIVERED` (not `PROCESSING`, `PICKED_UP`, `CANCELLED` — can add later).

---

## Phase 3 — Forgot Password Flow

### New DB records: `PasswordResetToken` (Phase 1)

### New API routes

**File:** `frontend/src/app/api/auth/forgot-password/route.ts` (new)

```typescript
export async function POST(request: NextRequest) {
  // Rate limit with authLimiter
  // Parse { email } from body
  // Find user by email — if not found, return 200 (don't leak existence)
  // Delete all existing tokens for this user (prevent accumulation)
  // Generate: crypto.randomBytes(32).toString('hex')
  // Create PasswordResetToken { token, userId, expiresAt: now + 1h }
  // Send email via sendPasswordReset({ to: user.email, resetUrl })
  //   resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
  // Return 200 always (even if user not found)
}
```

**File:** `frontend/src/app/api/auth/reset-password/route.ts` (new)

```typescript
export async function POST(request: NextRequest) {
  // Rate limit with authLimiter
  // Parse { token, password } from body
  // Validate: token present, password >= 8 chars
  // Find PasswordResetToken where token = token AND usedAt IS NULL AND expiresAt > now()
  //   → 400 if not found/expired
  // Hash new password with bcrypt.hash(password, 10)
  // $transaction:
  //   Update User.passwordHash
  //   Update PasswordResetToken.usedAt = now()
  // Return 200
}
```

### New pages

**File:** `frontend/src/app/forgot-password/page.tsx` (new, `'use client'`)

- Form: email input + submit button
- On submit: POST `/api/auth/forgot-password`
- On success: show "Ссылка для сброса пароля отправлена на ваш email"
- Link from login page: add "Забыли пароль?" below the login form

**File:** `frontend/src/app/reset-password/page.tsx` (new, `'use client'`)

- Reads `?token=` from `useSearchParams()`
- Form: new password + confirm password
- On submit: POST `/api/auth/reset-password`
- On success: redirect to `/client_account/login` with success message

**Modify:** `frontend/src/app/client_account/login/page.tsx`

Add below the submit button, inside the login tab view:
```tsx
{!isRegister && (
  <div className="text-center">
    <Link href="/forgot-password" className="text-sm text-brand hover:text-brand-hover">
      Забыли пароль?
    </Link>
  </div>
)}
```

---

## Phase 4 — Change Password

**File:** `frontend/src/app/api/account/password/route.ts` (new)

```typescript
export async function PATCH(request: NextRequest) {
  // authLimiter
  // getServerSession → 401 if not auth
  // Parse { currentPassword, newPassword } from body
  // Validate: newPassword >= 8 chars, currentPassword present
  // Fetch user with passwordHash from DB
  // bcrypt.compare(currentPassword, user.passwordHash) → 400 if wrong
  // bcrypt.hash(newPassword, 10)
  // prisma.user.update({ data: { passwordHash } })
  // Return 200 { ok: true }
}
```

**Modify:** `frontend/src/app/account/page.tsx`

Add state: `showPasswordForm`, `pwCurrent`, `pwNew`, `pwConfirm`, `pwError`, `pwSuccess`

Add collapsible section below the profile edit form (inside profile card):
```tsx
<button
  onClick={() => setShowPasswordForm(!showPasswordForm)}
  className="mt-3 text-sm text-gray-500 hover:text-brand transition-colors"
>
  Изменить пароль
</button>
{showPasswordForm && (
  <div className="mt-3 space-y-3 border-t pt-3">
    {/* currentPassword, newPassword, confirmPassword inputs */}
    {/* Validate match on client before submit */}
    {/* PATCH /api/account/password */}
  </div>
)}
```

---

## Phase 5 — Order Status History + Timeline UI

**Schema:** `OrderStatusLog` already exists with `id, orderId, status, prevStatus, note, createdAt`. Admin PATCH already writes logs. Add `cancelledBy` field (see Phase 1).

**No new API routes needed.** Modify the existing orders GET to include status logs.

**Modify:** `frontend/src/app/api/account/orders/route.ts`

Add `statusLogs` to the include:
```typescript
include: {
  items: { include: { product: { select: { name, slug, images } } } },
  statusLogs: { orderBy: { createdAt: 'asc' } },
}
```

**Modify:** `frontend/src/app/account/page.tsx`

Add `statusLogs` to the `Order` interface:
```typescript
statusLogs?: { id: string; status: string; prevStatus: string | null; createdAt: string }[]
```

Inside the expanded order view, add a timeline component after items:
```tsx
{order.statusLogs && order.statusLogs.length > 0 && (
  <div className="mt-4 pt-3 border-t">
    <p className="text-xs font-medium text-gray-500 mb-2">История заказа</p>
    <div className="space-y-2">
      {order.statusLogs.map((log, i) => (
        <div key={log.id} className="flex items-start gap-2">
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot[log.status] || 'bg-gray-300'}`} />
          <div>
            <span className="text-xs font-medium">{statusLabels[log.status]}</span>
            <span className="text-xs text-gray-400 ml-2">
              {new Date(log.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

Add `statusDot` mapping (colored dots) in the component file.

---

## Phase 6 — Order Cancellation by Customer

**File:** `frontend/src/app/api/account/orders/[id]/cancel/route.ts` (new)

```typescript
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // apiLimiter
  // getServerSession → 401 if not auth
  const { id } = await params
  // Fetch order: WHERE id = id AND userId = session.user.id
  //   → 404 if not found (prevents IDOR)
  // If order.status !== 'NEW' → 400 "Можно отменить только новый заказ"
  // $transaction:
  //   If !order.isPreorder:
  //     Restore stock: raw SQL `UPDATE "Product" SET totalStock = totalStock + qty, inStock = true WHERE id = productId`
  //     (mirror pattern from /api/admin/orders/[id]/route.ts lines 219–227)
  //   Update order: { status: 'CANCELLED' }
  //   Create OrderStatusLog: { orderId, status: 'CANCELLED', prevStatus: 'NEW', note: 'Отменён клиентом', cancelledBy: 'customer' }
  // Return 200 { ok: true }
}
```

**Modify:** `frontend/src/app/account/page.tsx`

Add `cancellingOrder` state (string | null).

In the order card header area (when `order.status === 'NEW'`), add:
```tsx
<button
  onClick={() => handleCancelOrder(order.id)}
  disabled={cancellingOrder === order.id}
  className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
>
  {cancellingOrder === order.id ? 'Отмена...' : 'Отменить заказ'}
</button>
```

`handleCancelOrder`:
- Show `window.confirm('Вы уверены, что хотите отменить заказ?')`
- PATCH `/api/account/orders/${id}/cancel`
- On success: update `orders` state (set status to 'CANCELLED')

---

## Phase 7 — Favorites in DB

**Schema:** `Favorite` already exists. API routes need to be created.

**File:** `frontend/src/app/api/account/favorites/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Fetch Favorites for userId, include product (id, name, slug, price, images[0])
  // Return array of products with favorite id
}

export async function POST(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse { productId }
  // Validate: product exists
  // prisma.favorite.upsert({ where: { userId_productId }, create, update: {} })
  // Return { ok: true }
}

export async function DELETE(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse { productId } from query params (?productId=...)
  // Delete favorite where { userId, productId }
  // Return { ok: true }
}
```

**File:** `frontend/src/app/api/account/favorites/sync/route.ts` (new)

```typescript
export async function POST(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse { productIds: string[] }
  // Validate: max 100 items, all strings
  // Verify products exist in DB: prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
  // createMany({ data: validIds.map(pid => ({ userId, productId: pid })), skipDuplicates: true })
  // Return { synced: count }
}
```

**Sync logic on login — Modify:** `frontend/src/app/client_account/login/page.tsx`

After successful `signIn` in `handleLogin`, before `router.push`:
```typescript
const localFavs: string[] = JSON.parse(localStorage.getItem('alash_favorites') || '[]')
if (localFavs.length > 0) {
  await fetch('/api/account/favorites/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: localFavs }),
  }).catch(() => {})
}
```

**Guest fallback:** unchanged — `lib/cart.ts` localStorage logic untouched.

---

## Phase 8 — Repeat Order

**No new API routes.** Client-side only.

**Modify:** `frontend/src/app/account/page.tsx`

Add import: `import { addToCart } from '@/lib/cart'` (or inline localStorage logic).

Add `handleRepeatOrder(order: Order)` function:
```typescript
const handleRepeatOrder = (order: Order) => {
  order.items.forEach(item => {
    addToCart({
      id: item.product.id ?? item.productId,
      name: item.product.name,
      price: item.price,
      quantity: item.quantity,
      slug: item.product.slug,
      image: item.product.images?.[0]?.url ?? '',
    })
  })
  window.dispatchEvent(new Event('cart-updated'))
  router.push('/cart')
}
```

**Note:** `OrderItem` interface needs `productId` field added (currently has only `product` object without `id`). Adjust the GET response or use `item.product.slug` as key. Check `lib/cart.ts` for the exact `addToCart` signature.

Add button in expanded order view:
```tsx
<button
  onClick={() => handleRepeatOrder(order)}
  className="mt-3 text-sm text-brand hover:text-brand-hover border border-brand rounded-lg px-3 py-1.5"
>
  Повторить заказ
</button>
```

**Verify `lib/cart.ts` exports `addToCart`** before wiring — check function signature in that file.

---

## Phase 9 — Product Reviews

### 9a — API Routes

**File:** `frontend/src/app/api/reviews/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  // Parse ?productId= from searchParams
  // Return approved reviews: prisma.review.findMany({
  //   where: { productId, isApproved: true },
  //   include: { user: { select: { name: true } } },
  //   orderBy: { createdAt: 'desc' }
  // })
  // Public — no auth required
}

export async function POST(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse { productId, rating, text }
  // Validate: rating 1–5, text 10–2000 chars
  // Check purchase: prisma.orderItem.findFirst({
  //   where: {
  //     productId,
  //     order: {
  //       userId: session.user.id,
  //       status: { in: ['DELIVERED', 'PICKED_UP'] }
  //     }
  //   }
  // }) → 403 if null "Только покупатели могут оставлять отзывы"
  // Check existing review: prisma.review.findUnique({ where: { userId_productId } }) → 400 if exists
  // Create review { userId, productId, rating, text, isApproved: false }
  // Return 201 { id, message: 'Отзыв отправлен на модерацию' }
}
```

**File:** `frontend/src/app/api/admin/reviews/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  // checkAdmin() → 403
  // Parse ?page=, ?approved= (true/false/all)
  // Return reviews with user name, product name/slug
}
```

**File:** `frontend/src/app/api/admin/reviews/[id]/route.ts` (new)

```typescript
export async function PATCH(request: NextRequest, { params }) {
  // checkAdmin() → 403
  // Parse { isApproved: boolean }
  // prisma.review.update({ where: { id }, data: { isApproved } })
  // Return { ok: true }
}

export async function DELETE(request: NextRequest, { params }) {
  // checkAdmin() → 403
  // prisma.review.delete({ where: { id } })
  // Return { ok: true }
}
```

### 9b — Product Page Review Form

**File:** `frontend/src/components/ReviewForm.tsx` (new, `'use client'`)

```typescript
// Props: { productId: string }
// Uses useSession — if no session, show "Войдите, чтобы оставить отзыв"
// State: rating (1–5 stars), text, loading, submitted, error
// On submit: POST /api/reviews
// Shows star selector (5 clickable stars using ★/☆)
// On success: shows "Отзыв отправлен на модерацию"
```

**File:** `frontend/src/components/ReviewList.tsx` (new, `'use client'`)

```typescript
// Props: { productId: string }
// useEffect: fetch /api/reviews?productId=
// Renders list of approved reviews with star rating and date
// Shows average rating if reviews > 0
```

**Modify product page** (`frontend/src/app/product/[slug]/page.tsx` or equivalent):

Add at bottom of product detail:
```tsx
<ReviewList productId={product.id} />
<ReviewForm productId={product.id} />
```

Find the actual product page path:
```bash
find frontend/src/app -name "page.tsx" | grep product
```

### 9c — Admin Reviews Page

**File:** `frontend/src/app/admin/reviews/page.tsx` (new, server component with client interactions)

```typescript
// 'use client'
// Fetch GET /api/admin/reviews
// Table: product name | user name | rating | text (truncated) | date | status | actions
// Actions: "Одобрить" (PATCH isApproved: true) | "Удалить" (DELETE)
// Filter tabs: "Ожидают" (isApproved=false) | "Одобренные" (isApproved=true)
```

**Modify:** `frontend/src/app/admin/AdminNav.tsx`

Add "Отзывы" link in nav list.

---

## Email Integration Touchpoints

### Hook into order creation

**Modify:** `frontend/src/app/api/orders/route.ts`

After the `Promise.all([notifyAdmins, sendTelegram])`, add:
```typescript
if (order.email) {
  sendOrderConfirmation({
    to: order.email,
    name,
    orderNumber: order.orderNumber,
    items: order.items.map(item => ({
      name: products.find(p => p.id === item.productId)?.name ?? '',
      quantity: item.quantity,
      price: item.price,
    })),
    total: order.total,
    deliveryMethod: deliveryMethod || null,
  }).catch(err => console.error('Email confirmation error:', err))
}
```

**Note:** products are already in scope inside the transaction. Capture them before `return tx.order.create(...)` or move the send outside the transaction using `order.items` from the result.

### Hook into status changes

**Modify:** `frontend/src/app/api/admin/orders/[id]/route.ts`

After the existing `OrderStatusLog.create`, add:
```typescript
const NOTIFY_STATUSES = new Set(['CONFIRMED', 'SHIPPED', 'DELIVERED'])
if (NOTIFY_STATUSES.has(body.status) && order.email) {
  sendOrderStatusUpdate({
    to: order.email,
    name: order.name,
    orderNumber: order.orderNumber,
    status: body.status,
  }).catch(err => console.error('Email status update error:', err))
}
```

Fetch `order.email`, `order.name`, `order.orderNumber` from the existing `prisma.order.update` return value (it's already assigned to `const order`).

---

## Dependencies to Install

```bash
cd frontend
npm install resend       # Email
# bcryptjs already installed (used in auth.ts and register/route.ts)
# crypto is built into Node.js — no install needed
```

---

## Expanded Test Plan

### Unit Tests (if/when test suite is added)

- `lib/email.ts`: mock Resend SDK, assert subject lines contain order number, assert HTML contains product names
- Token validation logic: expired token returns error, used token returns error, valid token succeeds
- Review form star selector: clicking star 3 sets rating=3

### Integration Tests (curl/httpie scripts)

**Forgot password flow:**
```bash
curl -X POST localhost:3000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com"}'
# Expect: 200, no email leaked in response
```

**Reset password:**
```bash
# After manually extracting token from DB:
curl -X POST localhost:3000/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<token>","password":"newpassword123"}'
# Expect: 200 { ok: true }
# Verify: token.usedAt is now set, old password no longer works
```

**Order cancellation — non-NEW order:**
```bash
curl -X PATCH localhost:3000/api/account/orders/<id>/cancel \
  -H 'Cookie: next-auth.session-token=...'
# With status=CONFIRMED → expect 400
```

**Favorites sync:**
```bash
curl -X POST localhost:3000/api/account/favorites/sync \
  -H 'Content-Type: application/json' \
  -H 'Cookie: ...' \
  -d '{"productIds":["prod1","prod2"]}'
# Expect: { synced: 2 }
# Second call: { synced: 0 } (skipDuplicates)
```

**Review purchase check:**
```bash
# User who never bought product
curl -X POST localhost:3000/api/reviews \
  -H 'Content-Type: application/json' \
  -H 'Cookie: ...' \
  -d '{"productId":"<id>","rating":5,"text":"Great product"}'
# Expect: 403
```

### E2E (manual)

1. Register → login → change password → logout → login with new password
2. Login → Forgot password → check email → click link → set new password → login
3. Place order → go to account → verify status timeline shows NEW → admin changes to CONFIRMED → refresh account → CONFIRMED appears in timeline
4. Place order (status=NEW) → account page → cancel → verify stock restored (admin product page shows +qty)
5. Add to favorites while logged out → login → check DB favorites include the localStorage items
6. Leave review on product → admin reviews → approve → product page shows review

### Observability

- All email sends log to console on error (`console.error('Email X error:', err)`) — consistent with existing push/telegram pattern
- OrderStatusLog provides a full audit trail — query `SELECT status, "createdAt", "cancelledBy" FROM "OrderStatusLog" WHERE "orderId" = '...'` for any order
- Password reset tokens: expired tokens accumulate (low volume, acceptable) — add optional cleanup cron if needed: `DELETE FROM "PasswordResetToken" WHERE "expiresAt" < now()`

---

## File Creation/Modification Summary

| Phase | Action | File Path |
|-------|--------|-----------|
| 1 | Modify | `frontend/prisma/schema.prisma` |
| 2 | New | `frontend/src/lib/email.ts` |
| 3 | New | `frontend/src/app/api/auth/forgot-password/route.ts` |
| 3 | New | `frontend/src/app/api/auth/reset-password/route.ts` |
| 3 | New | `frontend/src/app/forgot-password/page.tsx` |
| 3 | New | `frontend/src/app/reset-password/page.tsx` |
| 3 | Modify | `frontend/src/app/client_account/login/page.tsx` |
| 4 | New | `frontend/src/app/api/account/password/route.ts` |
| 4 | Modify | `frontend/src/app/account/page.tsx` |
| 5 | Modify | `frontend/src/app/api/account/orders/route.ts` |
| 5 | Modify | `frontend/src/app/account/page.tsx` |
| 6 | New | `frontend/src/app/api/account/orders/[id]/cancel/route.ts` |
| 6 | Modify | `frontend/src/app/account/page.tsx` |
| 7 | New | `frontend/src/app/api/account/favorites/route.ts` |
| 7 | New | `frontend/src/app/api/account/favorites/sync/route.ts` |
| 7 | Modify | `frontend/src/app/client_account/login/page.tsx` |
| 8 | Modify | `frontend/src/app/account/page.tsx` |
| 9 | New | `frontend/src/app/api/reviews/route.ts` |
| 9 | New | `frontend/src/app/api/admin/reviews/route.ts` |
| 9 | New | `frontend/src/app/api/admin/reviews/[id]/route.ts` |
| 9 | New | `frontend/src/components/ReviewForm.tsx` |
| 9 | New | `frontend/src/components/ReviewList.tsx` |
| 9 | New | `frontend/src/app/admin/reviews/page.tsx` |
| 9 | Modify | `frontend/src/app/admin/AdminNav.tsx` |
| 2+order | Modify | `frontend/src/app/api/orders/route.ts` |
| 2+status | Modify | `frontend/src/app/api/admin/orders/[id]/route.ts` |

**Total: 10 new files, 8 modified files**

---

## Validation

Build must pass after each phase:
```bash
cd frontend && npm run build
```

Schema push after Phase 1:
```bash
cd frontend && npx prisma db push && npx prisma generate
```

---

```
STRUCTURED_OUTPUT_START
ACCEPTANCE_CRITERION|AC-01|Пользователь получает email с составом заказа после оформления|curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' -d '{...valid order with email...}'|{"id":"...","orderNumber":...} AND Resend dashboard shows sent email
ACCEPTANCE_CRITERION|AC-02|При смене статуса на CONFIRMED/SHIPPED/DELIVERED клиент получает email|PATCH /api/admin/orders/:id {status:'CONFIRMED'} when order.email is set|200 OK AND email delivered to order.email
ACCEPTANCE_CRITERION|AC-03|Пользователь может сменить пароль из личного кабинета|curl -X PATCH localhost:3000/api/account/password -H 'Cookie:...' -d '{"currentPassword":"old","newPassword":"newpass123"}'|{"ok":true} AND login with newpass123 succeeds
ACCEPTANCE_CRITERION|AC-04|Неверный текущий пароль возвращает 400|PATCH /api/account/password with wrong currentPassword|{"error":"Неверный текущий пароль"} status 400
ACCEPTANCE_CRITERION|AC-05|Forgot password создаёт токен в БД и отправляет email|POST /api/auth/forgot-password {"email":"existing@user.com"}|200 AND PasswordResetToken row created in DB with expiresAt = now+1h
ACCEPTANCE_CRITERION|AC-06|Reset password с валидным токеном меняет пароль и инвалидирует токен|POST /api/auth/reset-password {"token":"<valid>","password":"newpass123"}|{"ok":true} AND token.usedAt IS NOT NULL AND old password login fails
ACCEPTANCE_CRITERION|AC-07|Истёкший токен reset-password возвращает 400|POST /api/auth/reset-password with token.expiresAt in past|status 400 containing "недействительна"
ACCEPTANCE_CRITERION|AC-08|Клиент видит таймлайн статусов внутри раскрытого заказа|GET /api/account/orders returns statusLogs array|Response JSON contains statusLogs[].status and statusLogs[].createdAt
ACCEPTANCE_CRITERION|AC-09|Клиент может отменить заказ в статусе NEW и сток восстанавливается|PATCH /api/account/orders/:id/cancel (order.status=NEW)|{"ok":true} AND Product.totalStock += ordered quantity
ACCEPTANCE_CRITERION|AC-10|Отмена заказа в статусе CONFIRMED возвращает 400|PATCH /api/account/orders/:id/cancel (order.status=CONFIRMED)|status 400 "Можно отменить только новый заказ"
ACCEPTANCE_CRITERION|AC-11|Избранное синхронизируется из localStorage в БД при логине|Login with localStorage alash_favorites containing productId, then GET /api/account/favorites|Response includes the product from localStorage
ACCEPTANCE_CRITERION|AC-12|POST /api/account/favorites создаёт запись, повторный запрос не дублирует|POST /api/account/favorites {"productId":"..."} twice|Both return 200, DB has exactly 1 Favorite row for userId+productId
ACCEPTANCE_CRITERION|AC-13|DELETE /api/account/favorites?productId=... удаляет запись|DELETE /api/account/favorites?productId=<id>|200 OK AND Favorite row gone from DB
ACCEPTANCE_CRITERION|AC-14|Кнопка "Повторить заказ" добавляет товары в корзину и редиректит на /cart|Click repeat order button on account page|localStorage alash_cart contains all order items AND user is on /cart
ACCEPTANCE_CRITERION|AC-15|Отзыв может оставить только купивший товар (DELIVERED/PICKED_UP)|POST /api/reviews by user with no qualifying order for that product|status 403 "Только покупатели могут оставлять отзывы"
ACCEPTANCE_CRITERION|AC-16|Отзыв создаётся с isApproved=false, не виден на странице товара до одобрения|POST /api/reviews by qualifying user, then GET /api/reviews?productId=...|Review not in public GET response until admin approves
ACCEPTANCE_CRITERION|AC-17|Один пользователь — один отзыв на товар|POST /api/reviews twice for same productId by same user|Second request returns 400
ACCEPTANCE_CRITERION|AC-18|Админ может одобрить отзыв через PATCH /api/admin/reviews/:id|PATCH /api/admin/reviews/:id {"isApproved":true}|200 AND GET /api/reviews?productId=... includes the review
ACCEPTANCE_CRITERION|AC-19|Страница /admin/reviews доступна только ADMIN|GET /admin/reviews without admin session|Redirect to login OR 403
ACCEPTANCE_CRITERION|AC-20|npm run build проходит после каждой фазы|cd frontend && npm run build|Exit code 0
PRINCIPLE|P-01|Surgical additions only — every change traces directly to a stated requirement
PRINCIPLE|P-02|Mirror existing patterns — auth, stock restore, rate limiting, fire-and-forget notifications
PRINCIPLE|P-03|Progressive enhancement — guest localStorage fallback is never broken by DB-layer favorites
PRINCIPLE|P-04|Email is non-blocking — send after responding to client, wrapped in .catch()
PRINCIPLE|P-05|One-time tokens with usedAt field — prevents replay even if TTL check has clock skew
DRIVER|D-01|Email provider simplicity — Resend wins: single package, managed deliverability, no SMTP config
DRIVER|D-02|Schema risk minimization — db push is destructive; plan adds only new models, never removes fields
DRIVER|D-03|Review trust — isApproved=false default prevents review spam from reaching public product pages
OPTION|O-01|Resend SDK for email|viable|4-line integration, 100 emails/day free tier, sufficient for store volume
OPTION|O-02|Nodemailer + SMTP|viable|no third-party SaaS, but complex setup, Gmail rate limits, harder HTML templating
OPTION|O-03|Skip email — log only|invalidated|fails stated requirement for email notifications
CUT|C-01|Custom email retry/queue|Matches existing fire-and-forget pattern (notifyAdmins, sendTelegram) — in-process queue adds complexity with no observable benefit at this traffic level
CUT|C-02|Tiptap rich text in review form|Plain textarea sufficient; Tiptap adds bundle weight and requires null-check pattern from existing RichTextEditor
CUT|C-03|Server-side favorites header badge|localStorage sync on login sufficient; favorites-updated DOM event already exists in lib/cart.ts
ADD|A-01|cancelledBy field on OrderStatusLog|Distinguishes customer vs admin cancellations without changing the admin dashboard UI
ADD|A-02|Centralized sendEmail wrapper in lib/email.ts|Future templates are one function call; keeps API routes thin
ADD|A-03|Rate limiting on forgot-password endpoint|Prevents email bombing via authLimiter (already exists, 30 req/min)
PREMORTEM|PM-01|Token race condition in forgot-password: user clicks submit twice, second token invalidates first, first email arrives with stale link — fix: deleteMany all tokens for user before creating new one
PREMORTEM|PM-02|Favorites sync overwrites DB state: naive localStorage-wins strategy loses products added on other devices — fix: createMany with skipDuplicates:true, never delete existing DB favorites during sync
PREMORTEM|PM-03|Review purchase check too loose: cancelled orders qualify user to review — fix: filter order status IN ('DELIVERED', 'PICKED_UP') strictly, not just any order with that productId
STRUCTURED_OUTPUT_END
```
