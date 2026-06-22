# ADR: Личный кабинет клиента — полная реализация

**Date:** 2026-05-09  
**Status:** Accepted (max_iter_no_consensus — see Consensus Status)  
**Plan source:** `deep-plan-20260509-204610/plan.md`

---

## Decision

**Implement the customer account area as a 9-phase surgical addition** using:

- **Resend SDK** for transactional email (order confirmation, status updates, password reset) with `try/catch + sendTelegram` fallback on every send failure.
- **Separate named rate limiters** (`forgotPasswordLimiter` name: `'forgot-password'`, `resetPasswordLimiter` name: `'reset-password'`) isolated from the shared `authLimiter` store.
- **Computed `inStock` expression** in stock-restore SQL: `"inStock" = ("totalStock" + qty) > 0` — never unconditional.
- **`createMany({ skipDuplicates: true })`** for favorites sync on login — never overwrites DB-side favorites.
- **All `account/page.tsx` changes batched** into a single Phase 4 implementation pass (sections 4a–4d) to prevent merge conflicts.

The selected option is **Option A (Resend SDK)** from the plan's RALPLAN-DR Viable Options.

---

## Drivers

1. **D-01 — Email provider simplicity:** Resend wins on a single `npm install resend`, managed deliverability, no SMTP configuration, and a 100 emails/day free tier sufficient for this store's traffic. Nodemailer+SMTP (Option B) requires SMTP auth setup, Gmail rate limit management, and harder HTML templating.

2. **D-02 — Schema change risk:** `npx prisma db push` is non-reversible for drops. The plan adds only new models (`PasswordResetToken`, `Review`) and a nullable column (`cancelledBy String?` on `OrderStatusLog`) — never removes existing fields. Every schema operation is additive and safe.

3. **D-03 — Review trust:** `isApproved = false` default prevents review spam from reaching public product pages before admin moderation. The `@@unique([userId, productId])` constraint (AC-17) is an intentional design decision, documented as such.

---

## Alternatives Considered

### Option A (Selected): Resend SDK

**Pros:**
- 4-line integration (`npm install resend`, instantiate, call `resend.emails.send`)
- Managed deliverability and DNS reputation handling
- Free tier 100 emails/day — sufficient for store volume
- Russian-friendly (any verified from-address)

**Cons:**
- External SaaS dependency; Resend incidents affect delivery
- Requires `RESEND_API_KEY` secret and domain DNS verification in Resend console (separate from API key creation — a deployment-time gap that was explicitly flagged in architect iter-1 CONCERN-01)

### Option B: Nodemailer + SMTP (Gmail/Yandex)

**Pros:**
- No third-party SaaS; works with existing Google Workspace if available
- No additional API key management

**Cons:**
- SMTP auth setup complexity
- Gmail rate limits and periodic OAuth refresh requirements
- Harder to template HTML emails server-side (no managed infrastructure)
- More brittle in serverless/EC2 PM2 environment

### Option C: Skip email, log only

**Pros:** Zero new dependencies.

**Cons:** Fails the stated requirement for order confirmation and password reset emails. **Invalidated.**

---

## Why Chosen

**Option A was selected on D-01 (simplicity).** The architect (iter-1) raised the strongest counter-argument: applying the fire-and-forget pattern to customer-facing transactional email is "a category error" — unlike admin Telegram alerts, order confirmation email has no other channel. The resolution (iter-2 CONCERN-01 synthesis) was not a retry queue but a Telegram fallback inside `sendEmail`'s `catch` block, reusing the existing `sendTelegram` infrastructure:

```
sendEmail fails → sendTelegram(⚠️ Email failed #orderId).catch(console.error)
```

The architect (iter-2) confirmed no circular dependency: `sendTelegram` has its own independent `try/catch` with no reference to `sendEmail`. The fallback turns a silent failure into a Telegram alert within seconds — sufficient for the stated traffic level without the complexity of an in-process retry queue (Cut C-01).

The architect (iter-2) explicitly noted the remaining tension: "the Telegram fallback turns a silent failure into a noisy failure with no automatic recovery" — the admin must manually follow up per failed email during any Resend incident. This is an accepted tradeoff (see Consequences).

**On stock restore correctness (D-02 risk, R-02):** The plan explicitly diverges from the existing admin PATCH pattern (`inStock = true` unconditionally) to prevent a discontinued product from reappearing on the storefront when a customer cancels an order. The architect (iter-2) verified that PostgreSQL evaluates all SET expressions against pre-update row values, making `"inStock" = ("totalStock" + qty) > 0` semantically correct.

**On rate limiter isolation (D-01, R-01):** The architect (iter-1) identified that `authLimiter` (name: `'auth'`) uses the same `stores` Map key as what the original plan assigned to forgot-password. The fix — separate named limiters with 15-minute windows — costs zero additional logic and prevents a 60-second DoS on password reset triggered by brute-force login attempts from the same IP.

---

## Consequences

### Accepted Tradeoffs

- **Email observability vs. complexity (architect iter-2):** The Telegram fallback notifies admin of each email failure but does not enable passive recovery monitoring. A `emailSentAt` timestamp on `Order` (enabling an admin dashboard indicator for orders missing receipt) was considered but not implemented — it adds a schema field and admin UI concern beyond this plan's scope. The minimal approach is sufficient at current traffic.

- **Login latency vs. stale favorites (architect iter-2):** `await fetch(syncUrl)` before `router.push('/account')` adds 500ms–2000ms of perceived freeze after login on slow connections. The plan prioritizes data consistency (account page renders complete favorites on first load) over perceived speed. Acceptable for this use case.

- **Review adoption rate (architect iter-2):** The `DELIVERED` or `PICKED_UP` purchase gate is strict — customers whose order is in `SHIPPED` or `PROCESSING` cannot review. This is intentional but means review volume will be low initially. Not an architectural issue.

- **Plaintext token storage:** `PasswordResetToken` stores `crypto.randomBytes(32).toString('hex')` tokens in plaintext. A DB breach exposes all valid reset tokens. This was flagged (iter-1 CONCERN-02) and accepted as a deliberate decision — 64-hex-char tokens have sufficient entropy at this traffic level without bcrypt overhead. Documented, not an oversight.

- **`totalStock=0` unlimited ambiguity (architect iter-2):** If a non-preorder item with `totalStock=0` (unlimited stock marker) is cancelled, the restore increments `totalStock` from 0 to `qty`, converting "unlimited" to "tracked". This is a pre-existing model ambiguity in the codebase, not introduced by this plan.

### Surviving Non-Blocking Concerns

- **NEW-CONCERN-03 (iter-2):** `ReviewForm` textarea has no `maxLength` attribute — user can attempt >2000 char input and receive a 400 with no client-side indication. Server-side validation is correct; UX improvement deferred.
- **NEW-CONCERN-04 (iter-2):** `PICKED_UP` status intentionally excluded from `NOTIFY_STATUSES`. Customers collecting pickup orders receive no email completion confirmation. Documented deferral.
- **CONCERN-05 (iter-1):** No index on `OrderItem.productId` for the review purchase gate query. Acceptable at current scale.
- **Review unique constraint (CONCERN-08):** `@@unique([userId, productId])` blocks re-review after repeat purchase. Intentional design decision, documented in AC-17.

---

## Follow-ups

### Open Questions

1. **Resend domain verification:** Must complete DNS verification for `alash-electronics.kz` in Resend dashboard before deploying Phase 2. This is a deployment-time step separate from API key creation — failure causes 100% silent email drops that surface only as Telegram alerts.
2. **`emailSentAt` timestamp on `Order`:** Not implemented in this plan. If Resend incidents increase, consider adding to enable passive recovery monitoring in admin dashboard.
3. **`OrderItem.productId` index:** Add when review volume grows or purchase gate query latency becomes observable.
4. **`PICKED_UP` email notification:** Deferred; add to `NOTIFY_STATUSES` in a subsequent iteration if customer confusion is reported.

### Monitoring Items

- **Email delivery:** Monitor Telegram channel for `⚠️ Email failed` messages after each deploy and order spike.
- **Rate limiter stores:** In-memory per PM2 process — resets on restart. False positives self-clear within 15-minute window (`forgotPasswordLimiter`/`resetPasswordLimiter`).
- **OrderStatusLog audit trail:** `SELECT status, "createdAt", "cancelledBy" FROM "OrderStatusLog" WHERE "orderId" = '<id>'` — `cancelledBy = 'customer'` distinguishes customer-initiated cancellations from admin actions.
- **Password reset tokens:** `DELETE FROM "PasswordResetToken" WHERE "expiresAt" < now()` — optional periodic cleanup; tokens expire naturally via `expiresAt` enforcement at read time.
- **Review moderation queue:** Admin dashboard `/admin/reviews` with "Ожидают" filter shows `isApproved = false` reviews pending action.

---

## Consensus Status

**Termination label: `max_iter_no_consensus`**

The plan reached 3 iterations without full critic approval. The architect approved after iter-2 (`ARCHITECT_OK`). The critic rejected iter-3 on a single structural defect in the AC-09 `expected_output` field.

**Last unresolved rejection (verbatim from iter-3 critic STRUCTURED_OUTPUT):**

> R-07: AC-09 expected_output 'Build completed successfully' does not match Next.js 14 actual build output — trivial fix: change to `npm run build; echo "exit:$?"` with expected `exit:0`

This rejection is a documentation defect only: the command (`npm run build 2>&1 | tail -1`) is executable (R-06 was resolved), but the `expected_output` string `Build completed successfully` is never produced by Next.js 14. The actual last line of a successful Next.js build is a route table entry such as `ƒ  (Dynamic)  server-rendered on demand`. The fix has been applied in `plan.md` (see AC-09 in STRUCTURED_OUTPUT: command changed to `cd frontend && npm run build; echo "exit:$?"`, expected output changed to `exit:0`).

**No implementation phases, schema decisions, API routes, or architectural choices are disputed.** All four prior rejections (R-01 through R-04, R-05, R-06) are fully resolved. The plan is approved for implementation with the AC-09 fix applied in `plan.md`.
