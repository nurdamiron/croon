# Architect Verdict — Iteration 1

**Plan:** Личный кабинет клиента — полная реализация  
**Date:** 2026-05-09  
**Verdict:** ARCHITECT_CONCERNS

---

## Favored Option Analysis

The plan selects **Resend SDK** (Option A) for email delivery with a fire-and-forget pattern, mirroring the existing `notifyAdmins` / `sendTelegram` pattern. The rationale is sound for the traffic level stated. The steelman antithesis and tradeoff analysis follow.

---

## 1. Steelman Antithesis: Against Fire-and-Forget Email

The plan explicitly designates email as fire-and-forget (Principle P-04). This is the most consequential architectural decision in the plan.

**The strongest counter-argument:**

Email here is not a nice-to-have notification like Telegram — it is a **transactional confirmation** that replaces an InSales platform feature the customer was already receiving. The customer's purchase journey now depends on receiving order confirmation email. When Resend is down or returns a 5xx (their status history shows incidents), or when the `RESEND_API_KEY` is misconfigured in prod, or when the email domain is unverified — the order still completes but the customer gets no receipt. The customer has no other way to know their order was placed (no on-page confirmation email UI exists, no PDF download). They will phone the store. This creates customer service load and erodes trust.

The plan's fire-and-forget `.catch(console.error)` means failures are **invisible in production** unless someone is watching PM2 logs. There is no dead-letter mechanism, no retry, no admin alert, and no counter. On EC2 with PM2, console logs rotate and are not monitored. An entire day of zero confirmation emails could go undetected.

The existing `notifyAdmins` / `sendTelegram` pattern is appropriate for admin alerts (fire-and-forget is fine if one channel is down — the other compensates). Applying that same pattern to customer-facing transactional email is a category error.

**Concrete failure mode not in pre-mortem:** Resend's free tier rejects emails when the sending domain is not verified (returns 403, not retried). In the Resend dashboard, domain verification is separate from API key creation. If the developer creates the API key but never completes DNS verification of `alash-electronics.kz`, every email silently fails. This is a deployment-time error that the plan's test plan cannot catch until go-live.

---

## 2. Real Tradeoff Tension

**Tradeoff: Admin-side stock restore atomicity traded for simplicity**

The cancel route (Phase 6) mirrors the admin stock restore pattern — raw SQL `UPDATE SET totalStock = totalStock + qty, inStock = true`. The admin pattern (lines 219–227 in `admin/orders/[id]/route.ts`) does this **outside** a `$transaction` block. The plan says to wrap the cancel route in `$transaction` — but the restore SQL and the order status update are done in two separate DB operations even within a transaction (raw SQL + ORM update).

The real cost: **`inStock = true` is unconditional on restore**. If a product was manually set to `inStock = false` by the admin for reasons unrelated to stock count (e.g., product discontinued, listing withdrawn), cancelling any order that contains it will flip `inStock = true` back. The existing admin code has this same bug, so the plan correctly mirrors it — but it means the cancel route inherits a stock-flag corruption risk.

The tradeoff: simplicity (mirror existing pattern) for correctness (don't unconditionally set `inStock = true` on a product that the admin intentionally disabled).

**Cost of losing correctness:** Low probability but non-trivial. A discontinued product reappears on the storefront after a customer cancels an old order.

---

## 3. Synthesis

**Synthesis on email reliability (CONCERN-01):** The plan need not implement a full queue. A lightweight in-process retry is sufficient: wrap the Resend call in a 1-retry wrapper with a 2-second delay before giving up. This is ~10 lines, matches the codebase's "minimal code" ethos, and catches transient 429/5xx from Resend without a queue system. More importantly, on first email failure, the plan should log a structured error with the `orderId` and `orderNumber` so the admin can manually follow up. A Telegram alert to the admin on email send failure costs 3 lines and uses an existing channel.

**Synthesis on stock restore correctness (CONCERN-03):** Instead of `inStock = true` unconditionally, use `inStock = (totalStock + qty) > 0`. This is a one-line change that prevents reactivating intentionally-disabled products. The existing admin route has the same bug and should be corrected there too, but at minimum the new cancel route should not repeat it.

---

## 4. Additional Architectural Concerns

### CONCERN-02: Token Enumeration via Timing (Phase 3 — Critical)

The `POST /api/auth/reset-password` endpoint does:
1. DB lookup for `PasswordResetToken WHERE token = token AND usedAt IS NULL AND expiresAt > now()`
2. If not found → 400
3. If found → hash password → update user → mark token used

The plan uses `crypto.randomBytes(32).toString('hex')` (64 hex chars) stored as plaintext in the DB. This is vulnerable to **token enumeration** if an attacker can distinguish "token exists but expired" from "token not found" via response timing or message content. The plan suggests returning a message containing "недействительна" for both cases — good. But the plan stores tokens in plaintext, meaning a DB breach exposes all valid reset tokens. Standard practice is to store `bcrypt(token)` in the DB and compare with `bcrypt.compare` at reset time, or to use HMAC. For a small store with low breach risk, plaintext may be acceptable, but it should be an explicit decision, not an implicit default.

**More critical:** The `authLimiter` is shared between `/api/auth/forgot-password`, `/api/auth/reset-password`, **and the login route** (since it's `name: 'auth'`). An attacker who hits the rate limit on login also blocks password reset for all users from that IP. These should be separate named limiters.

### CONCERN-04: Favorites Sync Race Condition on Multi-Device Login (Phase 7 — Major)

The plan correctly uses `createMany({ skipDuplicates: true })` to avoid overwriting DB state. However, the sync is triggered in the login page's `handleLogin` **before** `router.push`. If the user opens two login tabs simultaneously (e.g., mobile and desktop), both tabs fetch the session and both fire `POST /api/account/favorites/sync` with their respective localStorage contents. Since `skipDuplicates: true` is used, this is safe — the DB converges correctly. No race condition creates duplicates.

However, there is a subtler issue: the sync happens **in the browser, client-side, after signIn resolves**. On redirect (`router.push`), if the account page loads before the `fetch('/api/account/favorites/sync')` completes, the account favorites list will show stale (pre-sync) data. The plan has no loading indicator or re-fetch trigger after sync completes. This is a UX gap, not a data integrity issue.

### CONCERN-05: Review Purchase Gate Performance (Phase 9 — Minor)

The `orderItem.findFirst` query joins `OrderItem → Order` with a filter on `Order.userId` and `Order.status IN ('DELIVERED', 'PICKED_UP')`. `OrderItem` has an index on `orderId` but not on `productId`. For a product with many orders (popular product), this requires scanning all `OrderItem` rows with matching `productId`. Since `@@unique([userId, productId])` on `Review` prevents double submission and the gate is only hit on POST (not GET), this is acceptable at current scale but should have an index on `OrderItem.productId` if review volume grows.

### CONCERN-06: Phase Ordering Creates a Blocking Dependency (Major)

Phase 2 (email lib) is consumed by Phase 3 (forgot-password) and the order creation hook. The plan lists these as separate phases, implying sequential implementation. If Phase 2 is merged/deployed first without the order creation hook, the `lib/email.ts` file exists but is unused — no harm. However, the plan modifies `frontend/src/app/account/page.tsx` in **Phases 4, 5, 6, and 8** — four separate touches to the same file. Each touch must build successfully. If the developer implements these out of order or in parallel PRs, the file will have merge conflicts. The plan should note that all `account/page.tsx` changes should be batched into a single implementation pass, not sequential PRs.

### CONCERN-07: `cancelledBy` Field Added to `OrderStatusLog` Without Migration Path (Minor)

`OrderStatusLog` already has rows in production. Adding `cancelledBy String?` via `prisma db push` will add a nullable column with NULL for all existing rows — this is non-destructive and safe. The plan notes this correctly (nullable). No concern here beyond confirming this is safe.

### CONCERN-08: `Review.@@unique([userId, productId])` Blocks Future Legitimate Re-review (Minor)

If a customer buys the same product twice (e.g., a consumable), they cannot update their review — the unique constraint silently returns 400. The plan says "Один пользователь — один отзыв на товар" as AC-17, so this is intentional. However, a future requirement to allow review editing will require either dropping the unique constraint or adding an `updatedAt`-based update path. Flag as a known design decision.

---

## 5. Principle Violation Flags (Deliberate Mode)

### P-02 Violation — Admin Stock Restore Pattern Is Itself Flawed

The plan states "Mirror existing patterns — stock restore via raw SQL matching `/api/admin/orders/[id]/route.ts`". Reading the actual file (lines 219–227): the admin stock restore runs **outside** the `$transaction` block. The status update and stock restore are not atomic in the admin route. The plan's Phase 6 cancel route is intended to use `$transaction` — good — but the stock restore SQL sets `inStock = true` unconditionally (same as admin). Mirroring a pattern that has a correctness bug is a P-02 violation of intent, even if it matches the letter of P-02.

### P-04 Partial Violation — Email Is Blocking for `sendOrderConfirmation` in the Plan's Implementation Note

The plan says "send after responding to client". But in the implementation note for order creation, the email is sent **before** `return NextResponse.json(...)`:
```typescript
if (order.email) {
  sendOrderConfirmation({...}).catch(...)
}
return NextResponse.json(...)
```
Since `sendOrderConfirmation` is called without `await`, it returns immediately and the `.catch` is registered on the returned Promise. This is correctly non-blocking. No violation — just confirming the implementation note is correct as written. The concern is that a developer might accidentally `await` it during implementation.

---

## Summary of Concerns

| ID | Area | Severity | Description |
|----|------|----------|-------------|
| CONCERN-01 | Email fire-and-forget | Critical | Silent failure on Resend down/misconfigured; no visibility, no retry, no admin alert |
| CONCERN-02 | Token security | Critical | `authLimiter` shared with login blocks reset for all users from same IP; plaintext token storage should be explicit decision |
| CONCERN-03 | Stock restore | Major | `inStock = true` unconditionally reactivates intentionally-disabled products |
| CONCERN-04 | Favorites sync UX | Major | Account page may show stale favorites list if loaded before sync completes |
| CONCERN-05 | Review query perf | Minor | Missing index on `OrderItem.productId` for purchase gate query |
| CONCERN-06 | Phase ordering | Major | Four separate touches to `account/page.tsx` creates merge conflict risk if parallelized |
| CONCERN-07 | cancelledBy column | Minor | Safe nullable add — no concern |
| CONCERN-08 | Review unique constraint | Minor | Blocks re-review after repeat purchase — intentional but undocumented decision |

---

```
STRUCTURED_OUTPUT_START
VERDICT|ARCHITECT_CONCERNS
CONCERN|CONCERN-01|Email fire-and-forget for transactional order confirmation: Resend failures (domain unverified, API key misconfigured, 5xx incidents) are silent in production — no retry, no dead-letter, no admin alert, no visibility in PM2 logs. Customer receives no receipt. Applying the admin-alert fire-and-forget pattern to customer-facing transactional email is a category error.|critical
CONCERN|CONCERN-02|authLimiter is shared by forgot-password, reset-password, AND login (all use the 'auth' named limiter). A brute-force attack on login blocks password reset for all users from the same IP. These should be separate named limiters. Additionally, plaintext token storage in DB means a DB breach exposes all valid reset tokens — this should be an explicit design decision, not a default.|critical
CONCERN|CONCERN-03|Stock restore on cancel uses `inStock = true` unconditionally, matching the admin pattern. This reactivates intentionally-disabled products (admin manually set inStock=false for discontinuation). Should use `inStock = (totalStock + qty) > 0` instead.|major
CONCERN|CONCERN-04|Favorites sync fires client-side after signIn resolves, before router.push. If account page loads before sync POST completes, the rendered favorites list shows pre-sync (stale) data. No re-fetch trigger or loading state planned for post-sync.|major
CONCERN|CONCERN-05|Review purchase gate query (orderItem.findFirst joining Order on userId+status) lacks an index on OrderItem.productId. Acceptable at current scale but will degrade on popular products with many orders.|minor
CONCERN|CONCERN-06|account/page.tsx is modified in Phases 4, 5, 6, and 8 across separate plan steps. Parallel or out-of-order implementation creates merge conflict risk. Plan should explicitly note all account/page.tsx changes must be batched in a single implementation pass.|major
TRADEOFF|Simplicity of fire-and-forget email (matching existing notifyAdmins/sendTelegram pattern) trades away delivery observability for transactional confirmation emails. The cost: customer receives no receipt when Resend fails, admin has no visibility without monitoring PM2 logs, and domain verification gaps at deploy time create silent total failure. The benefit: zero additional dependencies, matches codebase idiom.
SYNTHESIS|For email reliability: add a 1-retry wrapper in lib/email.ts (~10 lines) that catches Resend 5xx and retries once after 2 seconds. On final failure, send a Telegram alert to admins using the existing sendTelegram channel with the orderId — this reuses existing infrastructure and surfaces failures to humans. No queue needed. For stock restore correctness: replace `inStock = true` with `inStock = (totalStock + qty) > 0` in the cancel route. For rate limiter isolation: create separate `forgotPasswordLimiter` and `resetPasswordLimiter` in lib/rate-limit.ts with lower limits (5/15min) to prevent cross-contamination with login rate limiting.
PRINCIPLE_VIOLATION|P-02|The plan mirrors the admin stock restore pattern (`inStock = true` unconditionally) which itself has a correctness bug — it reactivates intentionally-disabled products on any stock restore. Mirroring a flawed pattern propagates the flaw. The cancel route should correct it rather than replicate it.
PRINCIPLE_VIOLATION|P-04|Email is declared non-blocking but the plan provides no mechanism to detect or recover from silent failures. The principle's intent (don't block order creation) is satisfied, but the spirit (notifications should reliably reach their destination) is violated for the customer-facing confirmation flow where no fallback channel exists.
STRUCTURED_OUTPUT_END
```
