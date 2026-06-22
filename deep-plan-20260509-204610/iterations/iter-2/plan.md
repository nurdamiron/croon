# Implementation Plan: Личный кабинет клиента — полная реализация

**Date:** 2026-05-09  
**Iteration:** 2  
**Mode:** deliberate  
**Changes from iter-1:** Addresses all four critic rejections (R-01 through R-04) plus two architectural notes (CONCERN-04, CONCERN-06).

---

## Codebase State Summary

Before planning: a close read of the schema and existing code reveals:

1. **`OrderStatusLog` already exists** in `schema.prisma` — has `id, orderId, status, prevStatus, note, createdAt`. Admin PATCH already writes to it on status change. **No schema change needed for Phase 5.**
2. **`Favorite` model already exists** — has `id, userId, productId, createdAt` with `@@unique([userId, productId])`. User already has `favorites Favorite[]`. **No schema change needed for Phase 7.**
3. **`PasswordResetToken` does not exist** — must add.
4. **`Review` does not exist** — must add.
5. Stock restore in admin PATCH uses raw SQL `UPDATE ... SET totalStock = totalStock + qty, inStock = true` — the cancel route must NOT blindly mirror this; it must use a computed inStock value (see R-02 fix in Phase 6).
6. Auth uses bcryptjs (not bcrypt) — use same in password change route.
7. Rate limiters in `lib/rate-limit.ts` use `name` as the store key. `authLimiter` uses `name: 'auth'` — adding forgot/reset limiters to the same name would share its bucket and cause cross-contamination (R-01 fix in Phase 0).

---

## RALPLAN-DR Summary

### Principles

1. **Surgical additions only** — every new file/change traces directly to a requirement. Do not refactor existing working code.
2. **Mirror existing patterns** — auth check via `getServerSession(authOptions)`, stock restore via raw SQL, rate limiting via pre-built limiters.
3. **Progressive enhancement** — guests fall back to localStorage for favorites; authenticated users get DB sync. No regressions for anonymous users.
4. **Email is fire-and-forget with admin fallback** — send after responding to client, wrapped in `try/catch`; on failure, call `sendTelegram()` to alert admin (R-04 fix).
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

- **Cut: Custom email queue/retry system** — fire-and-forget with `try/catch` + Telegram fallback is the established pattern in this codebase (see `notifyAdmins`, `sendTelegram`). An in-process queue adds complexity with no observable benefit at this traffic level.
- **Cut: Review rich-text input** — plain textarea is sufficient for product reviews; Tiptap adds bundle weight unnecessarily.
- **Cut: Server-side favorites header badge** — localStorage sync on login is sufficient; real-time badge update via DOM event (`favorites-updated`) already exists in `lib/cart.ts`.

### What I'd Add vs Baseline

- **Add: Separate rate limiters for forgot/reset password** — `forgotPasswordLimiter` and `resetPasswordLimiter` with distinct names to avoid authLimiter cross-contamination (R-01).
- **Add: Telegram fallback on email failure** — wraps each `sendEmail` call in `try/catch`, falls back to `sendTelegram()` on error (R-04).
- **Add: `cancelledBy` field to OrderStatusLog** — distinguishes customer-initiated cancellation from admin cancellation in the admin dashboard without a UI change to Phase 5.
- **Add: Computed `inStock` in stock restore SQL** — avoids reactivating intentionally discontinued products on order cancel (R-02).

---

## Pre-mortem: Concrete Failure Scenarios

**Scenario 1: Resend domain unverified — 100% silent email failure**  
`RESEND_API_KEY` is set but domain is unverified in Resend console. Every `resend.emails.send()` throws `403 Domain not verified`. Without the `try/catch + sendTelegram` fix, all order confirmation and status emails silently drop. With R-04 fix: admin receives Telegram alert within seconds of first failure, identifies the domain verification issue, and fixes it before the next order.

**Scenario 2: Token race condition in forgot-password**  
User clicks "Отправить ссылку" twice rapidly — two tokens are generated. The first email arrives with the first token, but the second `deleteMany` call has already deleted it. User clicks link → 400 "invalid or expired". Fix: in `POST /api/auth/forgot-password`, `deleteMany` all existing tokens for the user BEFORE creating the new one. Only one valid token can exist per user at any time.

**Scenario 3: Favorites sync on login overwrites DB state**  
If user has product A in DB favorites (added on mobile), and localStorage has only product B, a naive "wipe + insert" strategy loses product A. Fix: merge with `createMany({ skipDuplicates: true })` — only insert missing, never delete existing DB favorites during sync. The `await` before `router.push` (CONCERN-04 fix) ensures sync completes before account page renders.

---

## Phase 0 — Rate Limiter Fix (R-01)

**File:** `frontend/src/lib/rate-limit.ts`

Add two new named exportable limiters at the bottom of the file, after the existing `apiLimiter` line:

```typescript
// Existing limiters (do not modify):
export const authLimiter = rateLimit({ name: 'auth', limit: 30, windowSeconds: 60 })
export const registerLimiter = rateLimit({ name: 'register', limit: 10, windowSeconds: 60 })
export const orderLimiter = rateLimit({ name: 'order', limit: 15, windowSeconds: 60 })
export const searchLimiter = rateLimit({ name: 'search', limit: 100, windowSeconds: 60 })
export const apiLimiter = rateLimit({ name: 'api', limit: 120, windowSeconds: 60 })

// New limiters for password reset flows — separate store names prevent cross-contamination with authLimiter:
export const forgotPasswordLimiter = rateLimit({ name: 'forgot-password', limit: 5, windowSeconds: 900 })
export const resetPasswordLimiter = rateLimit({ name: 'reset-password', limit: 10, windowSeconds: 900 })
```

**Rationale:** `forgotPasswordLimiter` uses `name: 'forgot-password'` which maps to a distinct `stores` Map entry from `authLimiter`'s `name: 'auth'`. 31 failed login attempts no longer affect the forgot-password bucket. Window is 15 minutes (900 seconds) — much stricter than authLimiter's 60-second window, appropriate for an email-sending endpoint.

Use:
- `forgotPasswordLimiter` in `POST /api/auth/forgot-password`
- `resetPasswordLimiter` in `POST /api/auth/reset-password`

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

## Phase 2 — Email Service (with R-04 alerting fix)

### Decision: Resend

**Dependency:**
```bash
cd frontend && npm install resend
```

**Env vars to add:**
- `RESEND_API_KEY` — get from resend.com
- `EMAIL_FROM` — e.g. `noreply@croon.kz` (must be verified domain in Resend)

**File:** `frontend/src/lib/email.ts` (new)

The central pattern for every email-sending function uses `try/catch` with Telegram fallback (R-04). The `sendTelegram` function already exists in `lib/telegram.ts` (or equivalent). Import it here.

```typescript
import { Resend } from 'resend'
import { sendTelegram } from '@/lib/telegram'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'noreply@croon.kz'

async function sendEmail(params: {
  to: string
  subject: string
  html: string
  orderId?: string
}): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
  } catch (err) {
    // R-04: Admin Telegram alert on email failure — reuses existing infrastructure
    sendTelegram(
      `⚠️ Email failed${params.orderId ? ` for order #${params.orderId}` : ''}: ${(err as Error).message}`
    ).catch(console.error)
    console.error('Email send failed:', err)
  }
}

export async function sendOrderConfirmation(params: {
  to: string
  name: string
  orderNumber: number
  orderId: string
  items: { name: string; quantity: number; price: number }[]
  total: number
  deliveryMethod: string | null
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Ваш заказ #${params.orderNumber} принят — ИП КРУН`,
    html: orderConfirmationHtml(params),
    orderId: String(params.orderNumber),
  })
}

export async function sendOrderStatusUpdate(params: {
  to: string
  name: string
  orderNumber: number
  orderId: string
  status: string  // 'CONFIRMED' | 'SHIPPED' | 'DELIVERED'
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Статус заказа #${params.orderNumber} изменён — ИП КРУН`,
    html: orderStatusHtml(params),
    orderId: String(params.orderNumber),
  })
}

export async function sendPasswordReset(params: {
  to: string
  resetUrl: string
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: 'Сброс пароля — ИП КРУН',
    html: passwordResetHtml(params),
  })
}
```

**R-04 pattern is mandatory in `sendEmail`:** The `try/catch` block with `sendTelegram` fallback ensures no email failure is silent. Admin will receive a Telegram message within seconds of any delivery failure.

**Templates (inline HTML strings in same file or `lib/email-templates.ts`):**

- `orderConfirmationHtml`: lists items in a table, total, delivery method, link to `/account`
- `orderStatusHtml`: single status message with Russian label (use `statusLabels` from `lib/constants.ts`), link to order in `/account`
- `passwordResetHtml`: reset link valid 1 hour

**Statuses that trigger status email:** `CONFIRMED`, `SHIPPED`, `DELIVERED` (not `PROCESSING`, `PICKED_UP`, `CANCELLED` — can add later).

---

## Phase 3 — Forgot Password Flow

### New API routes

**File:** `frontend/src/app/api/auth/forgot-password/route.ts` (new)

```typescript
import { forgotPasswordLimiter } from '@/lib/rate-limit'  // R-01: separate limiter

export async function POST(request: NextRequest) {
  const limited = forgotPasswordLimiter(request)
  if (limited) return limited
  // Parse { email } from body
  // Find user by email — if not found, return 200 (don't leak existence)
  // Delete all existing tokens for this user (prevent accumulation + race condition)
  //   prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
  // Generate: crypto.randomBytes(32).toString('hex')
  // Create PasswordResetToken { token, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
  // Send email via sendPasswordReset({ to: user.email, resetUrl })
  //   resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
  // Return 200 always (even if user not found — prevents email enumeration)
}
```

**File:** `frontend/src/app/api/auth/reset-password/route.ts` (new)

```typescript
import { resetPasswordLimiter } from '@/lib/rate-limit'  // R-01: separate limiter

export async function POST(request: NextRequest) {
  const limited = resetPasswordLimiter(request)
  if (limited) return limited
  // Parse { token, password } from body
  // Validate: token present, password >= 8 chars
  // Find PasswordResetToken where token = token AND usedAt IS NULL AND expiresAt > now()
  //   → 400 { error: 'Ссылка недействительна или устарела' } if not found/expired
  // Hash new password with bcrypt.hash(password, 10)  [bcryptjs]
  // $transaction:
  //   prisma.user.update({ where: { id: token.userId }, data: { passwordHash: hashed } })
  //   prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } })
  // Return 200 { ok: true }
}
```

### New pages

**File:** `frontend/src/app/forgot-password/page.tsx` (new, `'use client'`)

- Form: email input + submit button with loading state
- On submit: `POST /api/auth/forgot-password`
- On success: show "Ссылка для сброса пароля отправлена на ваш email. Проверьте папку «Спам», если письмо не пришло."
- On error: show generic error, do not leak whether email exists

**File:** `frontend/src/app/reset-password/page.tsx` (new, `'use client'`)

- Reads `?token=` from `useSearchParams()`
- If no token: redirect to `/forgot-password`
- Form: new password + confirm password inputs
- Client validation: passwords match, >= 8 chars
- On submit: `POST /api/auth/reset-password`
- On success: redirect to `/client_account/login?reset=success`, show success toast on login page
- On error: show "Ссылка недействительна или устарела. Запросите новую."

**Modify:** `frontend/src/app/client_account/login/page.tsx`

Add below the submit button, inside the login tab view (only shown when not on register tab):
```tsx
{!isRegister && (
  <div className="text-center mt-2">
    <Link href="/forgot-password" className="text-sm text-brand hover:text-brand-hover">
      Забыли пароль?
    </Link>
  </div>
)}
```

---

## Phase 4 — account/page.tsx: ALL Combined Edits (CONCERN-06)

**Per CONCERN-06:** Phases 4, 5, 6, and 8 all modify `frontend/src/app/account/page.tsx`. All changes to this file are described here as a single batched edit to prevent merge conflicts during implementation.

**File:** `frontend/src/app/account/page.tsx` — single combined edit covering:

### 4a — Change Password Form

Add state variables:
```typescript
const [showPasswordForm, setShowPasswordForm] = useState(false)
const [pwCurrent, setPwCurrent] = useState('')
const [pwNew, setPwNew] = useState('')
const [pwConfirm, setPwConfirm] = useState('')
const [pwError, setPwError] = useState<string | null>(null)
const [pwSuccess, setPwSuccess] = useState(false)
const [pwLoading, setPwLoading] = useState(false)
```

Add `handlePasswordChange` function:
```typescript
const handlePasswordChange = async () => {
  if (pwNew !== pwConfirm) { setPwError('Пароли не совпадают'); return }
  if (pwNew.length < 8) { setPwError('Пароль должен быть не менее 8 символов'); return }
  setPwLoading(true); setPwError(null)
  const res = await fetch('/api/account/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
  })
  setPwLoading(false)
  if (res.ok) { setPwSuccess(true); setShowPasswordForm(false); setPwCurrent(''); setPwNew(''); setPwConfirm('') }
  else { const data = await res.json(); setPwError(data.error || 'Ошибка смены пароля') }
}
```

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
    <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)}
      placeholder="Текущий пароль" className="w-full border rounded-lg px-3 py-2 text-sm" />
    <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
      placeholder="Новый пароль (мин. 8 символов)" className="w-full border rounded-lg px-3 py-2 text-sm" />
    <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
      placeholder="Повторите новый пароль" className="w-full border rounded-lg px-3 py-2 text-sm" />
    {pwError && <p className="text-xs text-red-500">{pwError}</p>}
    <button onClick={handlePasswordChange} disabled={pwLoading}
      className="w-full bg-brand hover:bg-brand-hover text-white rounded-lg py-2 text-sm disabled:opacity-50">
      {pwLoading ? 'Сохранение...' : 'Сохранить новый пароль'}
    </button>
  </div>
)}
{pwSuccess && <p className="text-xs text-green-600 mt-2">Пароль успешно изменён</p>}
```

### 4b — Order Status Timeline

Add `statusLogs` to the `Order` interface:
```typescript
statusLogs?: { id: string; status: string; prevStatus: string | null; createdAt: string }[]
```

Add `statusDot` mapping in the component file (before return statement):
```typescript
const statusDot: Record<string, string> = {
  NEW: 'bg-yellow-400',
  CONFIRMED: 'bg-blue-400',
  PROCESSING: 'bg-indigo-400',
  SHIPPED: 'bg-purple-400',
  DELIVERED: 'bg-green-500',
  PICKED_UP: 'bg-green-500',
  CANCELLED: 'bg-red-400',
}
```

Inside the expanded order view, add timeline after items list:
```tsx
{order.statusLogs && order.statusLogs.length > 0 && (
  <div className="mt-4 pt-3 border-t">
    <p className="text-xs font-medium text-gray-500 mb-2">История заказа</p>
    <div className="space-y-2">
      {order.statusLogs.map((log) => (
        <div key={log.id} className="flex items-start gap-2">
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDot[log.status] || 'bg-gray-300'}`} />
          <div>
            <span className="text-xs font-medium">{statusLabels[log.status as keyof typeof statusLabels]}</span>
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

### 4c — Cancel Order Button

Add state: `const [cancellingOrder, setCancellingOrder] = useState<string | null>(null)`

Add `handleCancelOrder` function:
```typescript
const handleCancelOrder = async (orderId: string) => {
  if (!window.confirm('Вы уверены, что хотите отменить заказ?')) return
  setCancellingOrder(orderId)
  const res = await fetch(`/api/account/orders/${orderId}/cancel`, { method: 'PATCH' })
  setCancellingOrder(null)
  if (res.ok) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELLED' } : o))
  } else {
    const data = await res.json()
    alert(data.error || 'Не удалось отменить заказ')
  }
}
```

In the order card header area, conditionally render when `order.status === 'NEW'`:
```tsx
{order.status === 'NEW' && (
  <button
    onClick={() => handleCancelOrder(order.id)}
    disabled={cancellingOrder === order.id}
    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
  >
    {cancellingOrder === order.id ? 'Отмена...' : 'Отменить заказ'}
  </button>
)}
```

### 4d — Repeat Order Button

Add import: check `lib/cart.ts` for the exact `addToCart` function signature before wiring; use that signature directly.

Add `handleRepeatOrder` function:
```typescript
const handleRepeatOrder = (order: Order) => {
  order.items.forEach(item => {
    addToCart({
      id: item.product?.id ?? item.productId,
      name: item.product?.name ?? '',
      price: item.price,
      quantity: item.quantity,
      slug: item.product?.slug ?? '',
      image: item.product?.images?.[0]?.url ?? '',
    })
  })
  window.dispatchEvent(new Event('cart-updated'))
  router.push('/cart')
}
```

Add button in expanded order view (below timeline):
```tsx
<button
  onClick={() => handleRepeatOrder(order)}
  className="mt-3 text-sm text-brand hover:text-brand-hover border border-brand rounded-lg px-3 py-1.5"
>
  Повторить заказ
</button>
```

**Note:** `OrderItem` interface must include `productId` (fallback key when `item.product` is minimal). Verify the GET `/api/account/orders` response includes product `id`, `slug`, `images`, and `name` in the include.

---

## Phase 5 — Order Status History API

**Schema:** `OrderStatusLog` already exists with `id, orderId, status, prevStatus, note, createdAt`. Admin PATCH already writes logs. `cancelledBy` field added in Phase 1.

**No new API routes needed.** Modify the existing orders GET to include status logs.

**Modify:** `frontend/src/app/api/account/orders/route.ts`

Add `statusLogs` to the include:
```typescript
include: {
  items: {
    include: {
      product: { select: { id: true, name: true, slug: true, images: true } }
    }
  },
  statusLogs: { orderBy: { createdAt: 'asc' } },
}
```

---

## Phase 6 — Order Cancellation by Customer (R-02 fix)

**File:** `frontend/src/app/api/account/orders/[id]/cancel/route.ts` (new)

```typescript
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { apiLimiter } from '@/lib/rate-limit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch order with items — userId check prevents IDOR
  const order = await prisma.order.findFirst({
    where: { id, userId: session.user.id },
    include: { items: { select: { productId: true, quantity: true } } },
  })

  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  if (order.status !== 'NEW') {
    return NextResponse.json(
      { error: 'Можно отменить только новый заказ' },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    // R-02: Restore stock with COMPUTED inStock — avoids reactivating discontinued products
    // inStock = ("totalStock" + qty) > 0 ensures a product manually set to inStock=false
    // (e.g. totalStock=0 set by admin) does NOT get reactivated unless stock actually returns.
    if (!order.isPreorder) {
      for (const item of order.items) {
        await tx.$executeRaw`
          UPDATE "Product"
          SET "totalStock" = "totalStock" + ${item.quantity},
              "inStock" = ("totalStock" + ${item.quantity}) > 0
          WHERE id = ${item.productId}
        `
      }
    }

    await tx.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await tx.orderStatusLog.create({
      data: {
        orderId: id,
        status: 'CANCELLED',
        prevStatus: 'NEW',
        note: 'Отменён клиентом',
        cancelledBy: 'customer',
      },
    })
  })

  return NextResponse.json({ ok: true })
}
```

**R-02 SQL template (exact):**
```sql
UPDATE "Product"
SET "totalStock" = "totalStock" + qty,
    "inStock" = ("totalStock" + qty) > 0
WHERE id = productId
```

This correctly handles:
- `totalStock` was 0 before order, qty = 1 → restored to 1, `inStock = (1) > 0 = true` ✓
- `totalStock` was 0 before order, admin explicitly set `inStock=false, totalStock=0`, then order placed (preorder path, so this branch is skipped). ✓
- Admin set `inStock=false` independently (no stock tracking, `totalStock=0`), then order with `totalStock=0` (unlimited) was placed — `isPreorder=false` but `totalStock=0` means no decrement happened; restoration adds 0 back, computed inStock stays false. This edge case requires `totalStock=0` to mean "unlimited" — verify with codebase behavior.

**The key invariant:** never use `"inStock" = true` unconditionally. Always compute from resulting totalStock.

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
  // Validate: product exists (prisma.product.findUnique) → 404 if not
  // prisma.favorite.upsert({ where: { userId_productId }, create, update: {} })
  // Return { ok: true }
}

export async function DELETE(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse productId from URL searchParams (?productId=...)
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
  // Verify products exist in DB:
  //   const existing = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
  //   const validIds = existing.map(p => p.id)
  // createMany({ data: validIds.map(pid => ({ userId, productId: pid })), skipDuplicates: true })
  // Return { synced: count }
}
```

**Sync logic on login — Modify:** `frontend/src/app/client_account/login/page.tsx`

After successful `signIn` in `handleLogin`, before `router.push` — **CONCERN-04 fix: `await` the sync Promise before navigating**:
```typescript
const localFavs: string[] = JSON.parse(localStorage.getItem('alash_favorites') || '[]')
if (localFavs.length > 0) {
  // CONCERN-04: await ensures account page renders AFTER sync completes
  await fetch('/api/account/favorites/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: localFavs }),
  }).catch(() => {})  // never block login on sync failure
}
router.push('/account')
```

**Guest fallback:** unchanged — `lib/cart.ts` localStorage logic untouched.

---

## Phase 8 — Change Password API

**File:** `frontend/src/app/api/account/password/route.ts` (new)

```typescript
import { authLimiter } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest) {
  const limited = authLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await request.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Пароль должен быть не менее 8 символов' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  })

  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: hashed } })

  return NextResponse.json({ ok: true })
}
```

**Note:** `authLimiter` is appropriate here (not `forgotPasswordLimiter`) — this is an authenticated endpoint requiring login, unlike the unauthenticated forgot-password flow.

---

## Phase 9 — Product Reviews

### 9a — API Routes

**File:** `frontend/src/app/api/reviews/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  // Parse ?productId= from searchParams → 400 if missing
  // Return approved reviews:
  //   prisma.review.findMany({
  //     where: { productId, isApproved: true },
  //     include: { user: { select: { name: true } } },
  //     orderBy: { createdAt: 'desc' }
  //   })
  // Public — no auth required
}

export async function POST(request: NextRequest) {
  // getServerSession → 401 if not auth
  // Parse { productId, rating, text }
  // Validate: rating 1–5, text 10–2000 chars
  // Check purchase:
  //   prisma.orderItem.findFirst({
  //     where: {
  //       productId,
  //       order: { userId: session.user.id, status: { in: ['DELIVERED', 'PICKED_UP'] } }
  //     }
  //   }) → 403 { error: 'Только покупатели могут оставлять отзывы' } if null
  // Check existing review:
  //   prisma.review.findUnique({ where: { userId_productId: { userId, productId } } }) → 400 if exists
  // Create review { userId, productId, rating, text, isApproved: false }
  // Return 201 { id, message: 'Отзыв отправлен на модерацию' }
}
```

**File:** `frontend/src/app/api/admin/reviews/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  // checkAdmin() → 403
  // Parse ?page=1, ?isApproved= (true/false/undefined=all)
  // Return reviews paginated with user name, product name/slug, pagination meta
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
// Renders list of approved reviews with star rating, reviewer name, and date
// Shows average rating if reviews > 0
```

**Modify product page** — find actual path first:
```bash
find /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/frontend/src/app -name "page.tsx" | grep product
```

Add at bottom of product detail section:
```tsx
<ReviewList productId={product.id} />
<ReviewForm productId={product.id} />
```

### 9c — Admin Reviews Page

**File:** `frontend/src/app/admin/reviews/page.tsx` (new, `'use client'`)

```typescript
// Fetch GET /api/admin/reviews
// Table: product name | user name | rating | text (truncated 100 chars) | date | status | actions
// Actions: "Одобрить" (PATCH isApproved: true) | "Удалить" (DELETE with confirm)
// Filter tabs: "Ожидают" (isApproved=false) | "Одобренные" (isApproved=true) | "Все"
```

**Modify:** `frontend/src/app/admin/AdminNav.tsx`

Add "Отзывы" link in nav list (with admin color classes):
```tsx
<Link href="/admin/reviews" className="...">Отзывы</Link>
```

---

## Email Integration Touchpoints

### Hook into order creation

**Modify:** `frontend/src/app/api/orders/route.ts`

After the `Promise.all([notifyAdmins, sendTelegram])` call (fire-and-forget, not awaited), add:
```typescript
if (order.email) {
  sendOrderConfirmation({
    to: order.email,
    name,
    orderNumber: order.orderNumber,
    orderId: order.id,
    items: order.items.map(item => ({
      name: products.find(p => p.id === item.productId)?.name ?? '',
      quantity: item.quantity,
      price: item.price,
    })),
    total: order.total,
    deliveryMethod: deliveryMethod || null,
  })
  // Note: sendOrderConfirmation internally handles try/catch + Telegram fallback (R-04)
  // Do NOT add .catch() here — it's already handled inside lib/email.ts
}
```

**Note:** `products` must be in scope. Capture them before `return tx.order.create(...)` or use `order.items` from the result with a product lookup.

### Hook into status changes

**Modify:** `frontend/src/app/api/admin/orders/[id]/route.ts`

After the existing `OrderStatusLog.create`, add:
```typescript
const NOTIFY_STATUSES = new Set(['CONFIRMED', 'SHIPPED', 'DELIVERED'])
if (NOTIFY_STATUSES.has(body.status) && updatedOrder.email) {
  sendOrderStatusUpdate({
    to: updatedOrder.email,
    name: updatedOrder.name,
    orderNumber: updatedOrder.orderNumber,
    orderId: updatedOrder.id,
    status: body.status,
  })
  // sendOrderStatusUpdate internally handles try/catch + Telegram fallback (R-04)
}
```

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

- `lib/email.ts`: mock Resend SDK, assert `sendEmail` calls `sendTelegram` on Resend throw, assert subject lines contain order number, assert HTML contains product names
- `forgotPasswordLimiter` vs `authLimiter`: saturate `auth` store, verify `forgot-password` store is unaffected
- Token validation logic: expired token returns 400, used token (usedAt not null) returns 400, valid token succeeds
- Review form star selector: clicking star 3 sets rating=3

### Integration Tests (curl/httpie scripts)

**Forgot password flow:**
```bash
curl -X POST localhost:3000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com"}'
# Expect: 200, no email leaked in response body
```

**Reset password:**
```bash
# After manually extracting token from DB:
TOKEN=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.passwordResetToken.findFirst({orderBy:{createdAt:'desc'}}).then(t=>console.log(t.token)).finally(()=>p.\$disconnect())")
curl -X POST localhost:3000/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"password\":\"newpassword123\"}"
# Expect: 200 { ok: true }
```

**Rate limiter isolation test:**
```bash
# Saturate authLimiter (31 requests)
for i in $(seq 1 31); do
  curl -s -X POST localhost:3000/api/auth/signin/credentials \
    -d 'email=x@x.com&password=wrong&csrfToken=...' > /dev/null
done
# Now verify forgot-password is NOT blocked:
curl -s -w '%{http_code}' -X POST localhost:3000/api/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"user@test.com"}'
# Expect: 200 (not 429)
```

**Order cancellation — non-NEW order:**
```bash
curl -s -w '%{http_code}' -X PATCH localhost:3000/api/account/orders/<id>/cancel \
  -H 'Cookie: next-auth.session-token=<token>'
# With order.status=CONFIRMED → expect 400
```

**Stock restore correctness:**
```bash
# After cancel with R-02 fix, verify via DB:
ORDER_ID=<id>
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.product.findFirst({
  where:{orderItems:{some:{orderId:'$ORDER_ID'}}},
  select:{totalStock:true,inStock:true}
}).then(r=>console.log(JSON.stringify(r))).finally(()=>p.\$disconnect())"
# Expect: totalStock increased by ordered quantity; inStock reflects computed value
```

**Favorites sync idempotency:**
```bash
COOKIE='next-auth.session-token=<token>'
curl -s -X POST localhost:3000/api/account/favorites/sync \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"productIds":["prod1","prod2"]}'
# Expect: { synced: 2 }
curl -s -X POST localhost:3000/api/account/favorites/sync \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"productIds":["prod1","prod2"]}'
# Expect: { synced: 0 } (skipDuplicates)
```

**Review purchase check:**
```bash
curl -s -w '%{http_code}' -X POST localhost:3000/api/reviews \
  -H 'Content-Type: application/json' -H 'Cookie: <non-buyer session>' \
  -d '{"productId":"<id>","rating":5,"text":"Great product test review"}'
# Expect: 403
```

### E2E (manual checklist)

1. Register → login → change password → logout → login with new password → success
2. Login → Forgot password → check email → click link → set new password → login → success
3. Place order → go to account → verify timeline shows NEW → admin changes to CONFIRMED → refresh account → CONFIRMED appears in timeline with date
4. Place order (status=NEW, in-stock product) → account page → cancel → verify stock restored (admin product page shows totalStock increased by ordered qty), `inStock` computed correctly
5. Add product to favorites while logged out → login → check DB `SELECT * FROM "Favorite" WHERE "userId"='...'` includes the localStorage product IDs
6. Leave review on product (as user with DELIVERED order) → admin reviews → approve → product page shows review; non-buyer gets 403

### Observability

- **Email failures:** `sendEmail` in `lib/email.ts` sends Telegram alert on every Resend error — admin sees it within seconds (R-04). Also logs `console.error('Email send failed:', err)`.
- **OrderStatusLog** provides full audit trail: `SELECT status, "createdAt", "cancelledBy" FROM "OrderStatusLog" WHERE "orderId" = '<id>'`
- **Password reset tokens:** low volume, expire naturally. Optional cleanup: `DELETE FROM "PasswordResetToken" WHERE "expiresAt" < now()`
- **Rate limiter stores:** in-memory per process — resets on PM2 restart. Acceptable for production (false positives self-clear in 15min window).

---

## File Creation/Modification Summary

| Phase | Action | File Path |
|-------|--------|-----------|
| 0 | Modify | `frontend/src/lib/rate-limit.ts` |
| 1 | Modify | `frontend/prisma/schema.prisma` |
| 2 | New | `frontend/src/lib/email.ts` |
| 3 | New | `frontend/src/app/api/auth/forgot-password/route.ts` |
| 3 | New | `frontend/src/app/api/auth/reset-password/route.ts` |
| 3 | New | `frontend/src/app/forgot-password/page.tsx` |
| 3 | New | `frontend/src/app/reset-password/page.tsx` |
| 3 | Modify | `frontend/src/app/client_account/login/page.tsx` |
| 4 | Modify | `frontend/src/app/account/page.tsx` (ALL combined: pw form, timeline, cancel btn, repeat btn) |
| 5 | Modify | `frontend/src/app/api/account/orders/route.ts` |
| 6 | New | `frontend/src/app/api/account/orders/[id]/cancel/route.ts` |
| 7 | New | `frontend/src/app/api/account/favorites/route.ts` |
| 7 | New | `frontend/src/app/api/account/favorites/sync/route.ts` |
| 7 | Modify | `frontend/src/app/client_account/login/page.tsx` |
| 8 | New | `frontend/src/app/api/account/password/route.ts` |
| 9 | New | `frontend/src/app/api/reviews/route.ts` |
| 9 | New | `frontend/src/app/api/admin/reviews/route.ts` |
| 9 | New | `frontend/src/app/api/admin/reviews/[id]/route.ts` |
| 9 | New | `frontend/src/components/ReviewForm.tsx` |
| 9 | New | `frontend/src/components/ReviewList.tsx` |
| 9 | New | `frontend/src/app/admin/reviews/page.tsx` |
| 9 | Modify | `frontend/src/app/admin/AdminNav.tsx` |
| 2+order | Modify | `frontend/src/app/api/orders/route.ts` |
| 2+status | Modify | `frontend/src/app/api/admin/orders/[id]/route.ts` |

**Total: 11 new files, 9 modified files** (Phase 0 adds rate-limit.ts modification)

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
ACCEPTANCE_CRITERION|AC-01|Пользователь получает email с составом заказа после оформления|curl -s -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d '{"name":"Test","phone":"+77001234567","email":"test@test.com","items":[{"productId":"<id>","quantity":1,"price":1000}],"total":1000,"deliveryMethod":"pickup"}' && sleep 3 && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.order.findFirst({orderBy:{createdAt:'desc'},select:{orderNumber:true,email:true}}).then(o=>console.log(JSON.stringify(o))).finally(()=>p.\$disconnect())"|{"orderNumber":<n>,"email":"test@test.com"} — confirm Resend dashboard or Telegram alert shows sent/failed
ACCEPTANCE_CRITERION|AC-02|При смене статуса на CONFIRMED/SHIPPED/DELIVERED клиент получает email|curl -s -w '%{http_code}' -X PATCH http://localhost:3000/api/admin/orders/<id> -H "Content-Type: application/json" -H "Cookie: <admin-session>" -d '{"status":"CONFIRMED"}'|200 — check Telegram for absence of email-failure alert; Resend dashboard shows delivery
ACCEPTANCE_CRITERION|AC-03|Пользователь может сменить пароль из личного кабинета|curl -s -w '%{http_code}' -X PATCH http://localhost:3000/api/account/password -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"currentPassword":"oldpass","newPassword":"newpass123"}'|200 {"ok":true}
ACCEPTANCE_CRITERION|AC-04|Неверный текущий пароль возвращает 400|curl -s -w '\n%{http_code}' -X PATCH http://localhost:3000/api/account/password -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"currentPassword":"wrongpass","newPassword":"newpass123"}'|400 {"error":"Неверный текущий пароль"}
ACCEPTANCE_CRITERION|AC-05|Forgot password создаёт токен в БД и отправляет email|curl -s -w '%{http_code}' -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"<existing-user-email>"}' && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.passwordResetToken.findFirst({orderBy:{createdAt:'desc'},select:{expiresAt:true,usedAt:true}}).then(t=>console.log(JSON.stringify(t))).finally(()=>p.\$disconnect())"|200 AND {"expiresAt":"<~1h from now>","usedAt":null}
ACCEPTANCE_CRITERION|AC-06|Reset password с валидным токеном меняет пароль и инвалидирует токен|TOKEN=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.passwordResetToken.findFirst({where:{usedAt:null},orderBy:{createdAt:'desc'}}).then(t=>process.stdout.write(t.token)).finally(()=>p.\$disconnect())") && curl -s -w '%{http_code}' -X POST http://localhost:3000/api/auth/reset-password -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\",\"password\":\"newpass123\"}" && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.passwordResetToken.findFirst({orderBy:{createdAt:'desc'}}).then(t=>console.log('usedAt:',t.usedAt)).finally(()=>p.\$disconnect())"|200 {"ok":true} AND usedAt is not null
ACCEPTANCE_CRITERION|AC-07|Истёкший токен reset-password возвращает 400 с сообщением о недействительности|curl -s -w '\n%{http_code}' -X POST http://localhost:3000/api/auth/reset-password -H "Content-Type: application/json" -d '{"token":"expired-or-fake-token","password":"newpass123"}'|400 {"error":"Ссылка недействительна или устарела"}
ACCEPTANCE_CRITERION|AC-08|GET /api/account/orders возвращает statusLogs массив для каждого заказа|curl -s http://localhost:3000/api/account/orders -H "Cookie: <user-session>" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const o=JSON.parse(d);console.log('hasLogs:',Array.isArray(o[0]?.statusLogs))"|hasLogs: true
ACCEPTANCE_CRITERION|AC-09|Отмена заказа в статусе NEW восстанавливает сток с вычисленным inStock|PROD_ID=$(node -e "...get productId from NEW order items...") && BEFORE=$(node -e "...get Product.totalStock...") && curl -s -X PATCH http://localhost:3000/api/account/orders/<id>/cancel -H "Cookie: <session>" && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.product.findUnique({where:{id:'$PROD_ID'},select:{totalStock:true,inStock:true}}).then(r=>console.log(JSON.stringify(r))).finally(()=>p.\$disconnect())"|{"ok":true} AND totalStock increased by ordered quantity AND inStock equals (totalStock > 0)
ACCEPTANCE_CRITERION|AC-10|Отмена заказа в статусе CONFIRMED возвращает 400|curl -s -w '%{http_code}' -X PATCH http://localhost:3000/api/account/orders/<confirmed-order-id>/cancel -H "Cookie: <session>"|400 {"error":"Можно отменить только новый заказ"}
ACCEPTANCE_CRITERION|AC-11|Избранное синхронизируется из localStorage в БД при логине|curl -s -X POST http://localhost:3000/api/account/favorites/sync -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"productIds":["<valid-product-id>"]}' && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.favorite.count({where:{userId:'<user-id>'}}).then(c=>console.log('count:',c)).finally(()=>p.\$disconnect())"|{"synced":1} AND count: >= 1
ACCEPTANCE_CRITERION|AC-12|POST /api/account/favorites создаёт запись; повторный запрос не дублирует|curl -s -X POST http://localhost:3000/api/account/favorites -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"productId":"<id>"}' && curl -s -X POST http://localhost:3000/api/account/favorites -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"productId":"<id>"}' && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.favorite.count({where:{userId:'<uid>',productId:'<pid>'}}).then(c=>console.log(c)).finally(()=>p.\$disconnect())"|1
ACCEPTANCE_CRITERION|AC-13|DELETE /api/account/favorites?productId=... удаляет запись|curl -s -w '%{http_code}' -X DELETE "http://localhost:3000/api/account/favorites?productId=<id>" -H "Cookie: <session>" && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.favorite.count({where:{userId:'<uid>',productId:'<pid>'}}).then(c=>console.log(c)).finally(()=>p.\$disconnect())"|200 AND 0
ACCEPTANCE_CRITERION|AC-14|Кнопка "Повторить заказ" видна в раскрытом заказе на странице аккаунта|cd frontend && npm run build 2>&1 | tail -5|Exit code 0 (build compiles with repeat-order button in account/page.tsx)
ACCEPTANCE_CRITERION|AC-15|Отзыв может оставить только купивший товар (DELIVERED/PICKED_UP)|curl -s -w '%{http_code}' -X POST http://localhost:3000/api/reviews -H "Content-Type: application/json" -H "Cookie: <non-buyer-session>" -d '{"productId":"<id>","rating":5,"text":"Great product review test"}'|403 {"error":"Только покупатели могут оставлять отзывы"}
ACCEPTANCE_CRITERION|AC-16|Отзыв создаётся с isApproved=false и не виден публично до одобрения|curl -s -X POST http://localhost:3000/api/reviews -H "Content-Type: application/json" -H "Cookie: <buyer-session>" -d '{"productId":"<id>","rating":4,"text":"Test review text here"}' && curl -s "http://localhost:3000/api/reviews?productId=<id>" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log('count:',JSON.parse(d).length)"|201 {"id":"...","message":"Отзыв отправлен на модерацию"} AND count: 0 (not yet approved)
ACCEPTANCE_CRITERION|AC-17|Один пользователь — один отзыв на товар|curl -s -w '%{http_code}' -X POST http://localhost:3000/api/reviews -H "Content-Type: application/json" -H "Cookie: <buyer-session>" -d '{"productId":"<id>","rating":3,"text":"Second review attempt test"}' (after first review created)|400
ACCEPTANCE_CRITERION|AC-18|Админ может одобрить отзыв через PATCH /api/admin/reviews/:id|REVIEW_ID=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.review.findFirst({where:{isApproved:false}}).then(r=>process.stdout.write(r.id)).finally(()=>p.\$disconnect())") && curl -s -w '%{http_code}' -X PATCH "http://localhost:3000/api/admin/reviews/$REVIEW_ID" -H "Content-Type: application/json" -H "Cookie: <admin-session>" -d '{"isApproved":true}' && curl -s "http://localhost:3000/api/reviews?productId=<id>" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log('count:',JSON.parse(d).length)"|200 {"ok":true} AND count: 1
ACCEPTANCE_CRITERION|AC-19|Страница /admin/reviews возвращает 403 без admin-сессии|curl -s -w '%{http_code}' -o /dev/null http://localhost:3000/api/admin/reviews -H "Cookie: <non-admin-or-no-session>"|403
ACCEPTANCE_CRITERION|AC-20|npm run build проходит после каждой фазы|cd /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/frontend && npm run build 2>&1 | tail -3|Exit code 0, "✓ Compiled successfully" or equivalent
ACCEPTANCE_CRITERION|AC-21|forgotPasswordLimiter не блокируется при насыщении authLimiter|for i in $(seq 1 31); do curl -s -X POST http://localhost:3000/api/auth/signin/credentials -d 'email=x&password=wrong&csrfToken=x' > /dev/null; done && curl -s -w '%{http_code}' -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"test@test.com"}'|200 (not 429)
ACCEPTANCE_CRITERION|AC-22|Email failure triggers Telegram alert via sendTelegram|Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel|Telegram message contains "⚠️ Email failed" within 10 seconds of order creation
PRINCIPLE|P-01|Surgical additions only — every change traces directly to a stated requirement
PRINCIPLE|P-02|Mirror existing patterns — auth, stock restore, rate limiting, fire-and-forget notifications
PRINCIPLE|P-03|Progressive enhancement — guest localStorage fallback is never broken by DB-layer favorites
PRINCIPLE|P-04|Email is non-blocking fire-and-forget with Telegram admin fallback on failure (R-04)
PRINCIPLE|P-05|One-time tokens with usedAt field — prevents replay even if TTL check has clock skew
DRIVER|D-01|Email provider simplicity — Resend wins: single package, managed deliverability, no SMTP config
DRIVER|D-02|Schema risk minimization — db push is destructive; plan adds only new models, never removes fields
DRIVER|D-03|Review trust — isApproved=false default prevents review spam from reaching public product pages
OPTION|O-01|Resend SDK for email|viable|4-line integration, 100 emails/day free tier, sufficient for store volume
OPTION|O-02|Nodemailer + SMTP|viable|no third-party SaaS, but complex setup, Gmail rate limits, harder HTML templating
OPTION|O-03|Skip email — log only|invalidated|fails stated requirement for email notifications
CUT|C-01|Custom email retry/queue|Matches existing fire-and-forget pattern; in-process queue adds complexity with no observable benefit at this traffic level. Telegram fallback satisfies alerting need.
CUT|C-02|Tiptap rich text in review form|Plain textarea sufficient; Tiptap adds bundle weight and requires null-check pattern from existing RichTextEditor
CUT|C-03|Server-side favorites header badge|localStorage sync on login sufficient; favorites-updated DOM event already exists in lib/cart.ts
ADD|A-01|cancelledBy field on OrderStatusLog|Distinguishes customer vs admin cancellations without changing the admin dashboard UI
ADD|A-02|Centralized sendEmail wrapper in lib/email.ts with try/catch + Telegram fallback|Future templates are one function call; R-04 requirement satisfied
ADD|A-03|Separate forgotPasswordLimiter and resetPasswordLimiter in lib/rate-limit.ts|R-01 fix: prevents authLimiter cross-contamination; 15min window appropriate for email-sending endpoints
ADD|A-04|Computed inStock in stock restore SQL|R-02 fix: prevents reactivating discontinued products on order cancel
PREMORTEM|PM-01|Resend domain unverified causes 100% silent email failure — fix: try/catch in sendEmail calls sendTelegram alert, admin notified within seconds, identifies and fixes domain verification before next order
PREMORTEM|PM-02|Token race condition in forgot-password: user double-submits, second token invalidates first, first email arrives with stale link — fix: deleteMany all tokens for user BEFORE creating new one, ensuring only one valid token at a time
PREMORTEM|PM-03|Favorites sync overwrites DB state: naive localStorage-wins strategy loses products added on other devices — fix: createMany with skipDuplicates:true, never delete existing DB favorites during sync; await sync before router.push ensures account page sees complete state
STRUCTURED_OUTPUT_END
```
