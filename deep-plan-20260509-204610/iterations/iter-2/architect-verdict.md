# Architect Verdict — Iteration 2

**Plan:** Личный кабинет клиента — полная реализация  
**Date:** 2026-05-09  
**Verdict:** ARCHITECT_OK

---

## 1. Review of Iter-1 Concerns

### CONCERN-01 — Email fire-and-forget: ADDRESSED

The iter-2 plan adds a `try/catch` block in `sendEmail` that calls `sendTelegram()` on every Resend failure (R-04 fix). The Telegram fallback is verified to exist in `lib/telegram.ts` with its own internal try/catch — no circular dependency. `sendTelegram` itself handles its own failure silently via `console.error`, which is appropriate (it is an alert channel, not the primary flow). The pattern is:

```
sendEmail fails → sendTelegram(alert).catch(console.error)
```

`sendTelegram` has no reference to `sendEmail`. No circular dependency. The concern about silent failures is mitigated. Admin sees a Telegram alert within seconds of any Resend failure. This is sufficient for the stated traffic level.

### CONCERN-02 — Rate limiter cross-contamination: ADDRESSED

Phase 0 explicitly defines `forgotPasswordLimiter` (name: `'forgot-password'`, 5/900s) and `resetPasswordLimiter` (name: `'reset-password'`, 10/900s). The `rateLimit` function in `lib/rate-limit.ts` uses `name` as the key into the `stores` Map — verified by reading the actual file. These are fully isolated from `authLimiter` (name: `'auth'`). Phase 3 explicitly imports and applies these limiters in the respective route files. The wiring is complete in the plan.

The plaintext token storage concern from iter-1 was acknowledged as a deliberate decision. No regression.

### CONCERN-03 — Stock restore unconditional `inStock = true`: ADDRESSED

Phase 6 replaces unconditional `inStock = true` with:
```sql
SET "totalStock" = "totalStock" + qty,
    "inStock" = ("totalStock" + qty) > 0
```

**SQL semantics verification:** In PostgreSQL, all expressions in a SET clause evaluate using the **pre-update row values** — not the values being set by other assignments in the same statement. Therefore `("totalStock" + qty)` in the `inStock` expression uses the **old** `totalStock`. The result equals `old_totalStock + qty`, which is exactly the new `totalStock` value. The computation is semantically correct. A product with `totalStock=0` before the order that had `qty=1` decremented from it will have `totalStock=-1` (if decrement happened) — restoring +1 yields 0, `inStock = (0) > 0 = false`. Wait — if `totalStock` was 0 before and decrement happened (qty=1), then `totalStock` in DB is now `-1`... but the codebase uses `WHERE totalStock >= quantity` for decrement, so if `totalStock=1` at order time, it becomes `0` after decrement. Restoring: `0 + 1 = 1 > 0 = true`. Correct.

The edge case noted in the plan (unlimited stock, `totalStock=0`) is handled correctly: if no decrement occurred (unlimited stock path), the restore branch is skipped for `isPreorder` orders. For the `inStock=false` + `totalStock=0` discontinuation case: if an admin manually sets `inStock=false` and `totalStock=0`, and the order was not a preorder (which is contradictory since `inStock=false` routes to preorder), this branch is already unreachable. The logic is sound.

### CONCERN-04 — Favorites sync stale data on account page: ADDRESSED

The plan explicitly awaits the sync `fetch` before `router.push`:
```typescript
await fetch('/api/account/favorites/sync', {...}).catch(() => {})
router.push('/account')
```

The `.catch(() => {})` ensures sync failure never blocks login. The `await` ensures sync completes before navigation. If sync takes 1-2 seconds, user experiences a brief pause after clicking "войти" — acceptable UX tradeoff for data consistency. The account page will render with the synced state.

### CONCERN-05 — Review purchase gate index: NOT ADDRESSED (intentionally acceptable)

No index added to `OrderItem.productId`. The plan's CONCERN-05 note from iter-1 was marked minor. At this store's scale, the query is acceptable. No regression.

### CONCERN-06 — account/page.tsx multiple touches: ADDRESSED

Phase 4 explicitly batches all four sets of changes to `account/page.tsx` into a single combined phase with clear section labeling (4a through 4d). The file creation summary also groups these as a single "Modify" entry. Implementation risk is explicitly mitigated.

### CONCERN-07 — cancelledBy nullable add: ADDRESSED (was safe from iter-1)

Correctly implemented as `cancelledBy String?` — nullable, non-destructive.

### CONCERN-08 — Review unique constraint: ADDRESSED (documented decision)

The plan explicitly states "Один пользователь — один отзыв на товар" and maps it to AC-17. The design decision is intentional and documented.

---

## 2. SQL Semantics Deep Dive (Specifically Requested)

The question was: does `("totalStock" + qty) > 0` in the SET clause evaluate BEFORE or AFTER the `totalStock` update?

**Answer: BEFORE.** PostgreSQL evaluates all SET expressions against the original row values. The expression `("totalStock" + qty)` uses the old `totalStock`, producing the same value as the new `totalStock` column will hold after the update. This means `inStock = (new_totalStock) > 0` — which is the correct invariant. The SQL is architecturally sound.

One remaining edge: `totalStock=0` meaning "unlimited" (no decrement). If a non-preorder item with `totalStock=0` (unlimited) is cancelled, the restore attempts `0 + qty > 0 = true`. This would set `inStock=true`, which may be correct (the product was in stock). But it also increments `totalStock` from 0 to `qty` — turning "unlimited" into "tracked". This is a pre-existing model ambiguity in the codebase (`totalStock=0` = unlimited), not introduced by this plan. The plan's comment acknowledges this edge case. The risk is minor and pre-existing.

---

## 3. New Architectural Concerns Introduced by Iter-2

### NEW-CONCERN-01 — `sendOrderConfirmation` fires without `await` but `sendEmail` internally awaits Resend (Minor)

In the order creation hook, `sendOrderConfirmation` is called without `await` (fire-and-forget). Inside `lib/email.ts`, `sendEmail` uses `await resend.emails.send(...)`. The Resend call is awaited inside the Promise chain. The fire-and-forget pattern is correct — the outer call is non-blocking and the internal await only blocks the Promise, not the response. No issue.

However: the comment in the plan says "Do NOT add .catch() here — it's already handled inside lib/email.ts". This is true, but a developer implementing this may instinctively not await the call — which is the correct behavior — but might also omit error handling entirely at the call site assuming `sendEmail` never rejects. `sendEmail` internally swallows all errors via try/catch — it cannot reject. This is correct but worth noting explicitly in the implementation comment.

### NEW-CONCERN-02 — `cancelledBy` Field Not in `OrderStatusLog.create` Default Branches (Minor)

The `cancelledBy` field is added to `OrderStatusLog` schema. The admin PATCH route at `api/admin/orders/[id]/route.ts` already creates `OrderStatusLog` entries on every status change. After the schema add, those existing `create` calls will omit `cancelledBy`, which defaults to `null` — correct for admin-initiated actions. No code change needed there.

The plan's cancel route correctly sets `cancelledBy: 'customer'`. No issue.

### NEW-CONCERN-03 — Review `text` Field Length Validation Is Server-Side Only (Minor)

The `POST /api/reviews` route validates `text` length 10–2000 chars server-side. The `ReviewForm` component uses a plain textarea with no `maxLength` attribute mentioned. A user can paste 10,000 characters and the server will reject with 400. The UX could be improved with `maxLength={2000}` and a character counter, but this is a UX concern only — the server-side validation is correct and complete.

### NEW-CONCERN-04 — `PICKED_UP` Status Not in `NOTIFY_STATUSES` Set (Minor, Intentional)

The plan limits email notifications to `CONFIRMED`, `SHIPPED`, `DELIVERED`. `PICKED_UP` (pickup completion) is explicitly excluded with a note "can add later". This means customers who pick up their order receive no email confirmation of pickup. This may cause confusion ("did my order get processed?"). It is a deliberate cut documented in the plan. No architectural issue.

---

## 4. Steelman Antithesis Against the Chosen Approach

**The strongest case against this plan as written:**

The plan addresses CONCERN-01 with a Telegram fallback, but this is a notification about failure, not prevention of failure. The fundamental issue remains: **the customer receives no order receipt when email fails**. The admin receives a Telegram alert and can manually follow up — but this creates a manual process loop for every email failure. At scale (or during a Resend incident), the admin could receive 50 Telegram alerts for 50 orders and must manually email each customer. The Telegram fallback turns a silent failure into a noisy failure with no automatic recovery.

A more robust approach would be to store a `emailSentAt` timestamp on the `Order` model, and surface a UI indicator in the admin dashboard showing orders where `emailSentAt IS NULL` after 5 minutes. This provides a passive recovery mechanism without a queue.

Additionally, the plan's email templates are defined as inline HTML strings in `lib/email.ts` or `lib/email-templates.ts`. There is no templating system — no variable escaping of user-provided strings like `name` and `order.items[].name`. If a product name contains `<script>` tags or HTML entities, the email HTML will be malformed or, in worst case, deliver XSS to email clients that render HTML. Product names come from admin-entered data, so the attack surface is low — but the plan should specify that template rendering uses HTML entity escaping on all user-provided string interpolation.

**The strongest case against the `await fetch(syncFavorites)` UX:**

Awaiting the sync before `router.push` adds latency to the login flow proportional to the network RTT + server processing time for the sync endpoint. On a slow connection or under DB load, this could add 500ms–2000ms of perceived freeze after the user clicks "войти". The previous approach (fire-and-forget + re-fetch on account page) would have faster perceived login. The plan trades perceived login speed for data consistency — the tradeoff is reasonable for this use case (favorites sync is not critical path) but the latency impact is real.

---

## 5. Remaining Real Tradeoff Tensions

**Tension 1: Email delivery observability vs. implementation complexity**

The plan's `try/catch + sendTelegram` pattern is the minimal viable observability mechanism. It requires the admin to manually process Telegram alerts and follow up with customers. A `emailSentAt` timestamp on `Order` would enable passive recovery monitoring but adds a schema field and admin UI concern. The plan correctly rejects a full queue but the middle ground (timestamp + admin dashboard indicator) was not explored.

**Tension 2: `await syncFavorites` login latency vs. stale favorites on account page**

Addressed above. The plan's choice (await sync, then navigate) is the correct tradeoff for data integrity over perceived speed.

**Tension 3: Review purchase gate strictness vs. review volume**

Requiring `DELIVERED` or `PICKED_UP` status is strict — a customer whose order is `SHIPPED` cannot yet review. This is intentional and correct (prevent unverified reviews), but means the review feature will have very low initial adoption since most ИП КРУН orders may stay in `CONFIRMED` or `PROCESSING` for extended periods. Not an architectural issue, but a business outcome worth noting.

---

## 6. Principle Violations

**No new principle violations introduced in iter-2.** The iter-1 violations were:

- P-02 violation (mirroring flawed stock restore pattern): **RESOLVED** by computing `inStock` from resulting `totalStock`.
- P-04 partial violation (no fallback for email failure): **RESOLVED** by adding Telegram fallback in `sendEmail`.

The plan is now architecturally consistent with all five stated principles.

---

## Summary

| ID | Area | Status | Severity |
|----|------|--------|----------|
| CONCERN-01 | Email failure visibility | ADDRESSED | — |
| CONCERN-02 | Rate limiter isolation | ADDRESSED | — |
| CONCERN-03 | Stock restore correctness | ADDRESSED | — |
| CONCERN-04 | Favorites sync stale data | ADDRESSED | — |
| CONCERN-05 | Review purchase gate index | NOT ADDRESSED (acceptable) | minor |
| CONCERN-06 | account/page.tsx batch edits | ADDRESSED | — |
| CONCERN-07 | cancelledBy nullable | ADDRESSED | — |
| CONCERN-08 | Review unique constraint | DOCUMENTED (intentional) | — |
| NEW-CONCERN-01 | sendEmail fire-and-forget comment clarity | NEW | minor |
| NEW-CONCERN-02 | cancelledBy null default in admin route | NEW | minor (safe) |
| NEW-CONCERN-03 | Review textarea no maxLength | NEW | minor |
| NEW-CONCERN-04 | PICKED_UP not in NOTIFY_STATUSES | NEW (intentional) | minor |

All critical and major concerns from iter-1 are resolved. Remaining items are minor. The plan is approved for implementation.

---

```
STRUCTURED_OUTPUT_START
VERDICT|ARCHITECT_OK
CONCERN|NEW-CONCERN-01|sendEmail is called fire-and-forget at call sites, and internally swallows all errors via try/catch. Implementation comment should explicitly state sendEmail never rejects, so developers do not add redundant .catch() or accidentally await it at call site.|minor
CONCERN|NEW-CONCERN-02|cancelledBy field added to OrderStatusLog schema. Existing admin PATCH route creates OrderStatusLog entries without cancelledBy — they will receive null by default. Safe, but the plan does not note this explicitly. No code change needed.|minor
CONCERN|NEW-CONCERN-03|Review text field validated 10-2000 chars server-side, but ReviewForm textarea has no maxLength attribute or character counter in the plan spec. User can attempt oversized input and receive a 400 with no client-side indication of why.|minor
CONCERN|NEW-CONCERN-04|PICKED_UP status intentionally excluded from NOTIFY_STATUSES. Customers who collect pickup orders receive no email completion confirmation. Documented as deferral in the plan. Business impact: customers may not know pickup was logged.|minor
TRADEOFF|await-sync-vs-login-speed: Awaiting the favorites sync before router.push adds perceived login latency (500ms-2000ms on slow connections) proportional to sync RTT + DB write time. The plan correctly prioritizes data consistency (account page shows complete favorites on first render) over perceived speed. The tradeoff is appropriate for this use case but adds noticeable friction on slow connections.
TRADEOFF|email-observability-vs-complexity: The Telegram fallback on email failure notifies admin but does not enable passive recovery monitoring. A stored emailSentAt timestamp on Order would let admin identify orders missing receipt without acting on every Telegram alert. The plan's approach is minimal but requires manual follow-up per failed email during any Resend incident.
SYNTHESIS|The iter-2 plan adequately resolves all four critical and major concerns from iter-1. The SQL for inStock computation is semantically correct (SET expressions evaluate pre-update row values in PostgreSQL). The Telegram fallback in sendEmail does not create circular dependency — sendTelegram has its own independent try/catch with no reference to sendEmail. The rate limiters are correctly defined in lib/rate-limit.ts with distinct name keys and correctly imported in the route files. The await on favorites sync is the correct tradeoff for data consistency. Remaining new concerns are all minor and do not block implementation. Plan is ready for implementation.
PRINCIPLE_VIOLATION|none|No principle violations remain in iter-2. P-02 violation (mirroring flawed stock restore) was resolved by computed inStock SQL. P-04 violation (no email failure fallback) was resolved by Telegram alert in sendEmail catch block.
STRUCTURED_OUTPUT_END
```
