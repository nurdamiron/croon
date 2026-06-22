# Critic Verdict — Iteration 1

**Plan:** Личный кабинет клиента — полная реализация  
**Date:** 2026-05-09  
**Overall Verdict:** ITERATE

---

## Quality Gate Assessment

### 1. Principle-Option Consistency

**P-02 (Mirror existing patterns):** The plan explicitly mirrors the admin stock restore pattern (`inStock = true` unconditionally). The actual file at `frontend/src/app/api/admin/orders/[id]/route.ts` line 223 confirms this pattern exists. However, the architect demonstrated that mirroring a flawed pattern propagates a correctness bug. The plan acknowledges this in P-02 but accepts it; the architect's synthesis provides a one-line fix. This is an unresolved conflict between P-02 literal compliance and the task's implicit correctness requirement.

**P-04 (Email is fire-and-forget):** The plan correctly invokes `sendOrderConfirmation(...).catch(...)` without `await`. Non-blocking. However, the principle says "non-blocking" — it does not say "unmonitored." The architect correctly identified that for transactional customer-facing email, silent failure violates the spirit of the notification requirement even if P-04 is literally satisfied. The plan documents no compensating mechanism.

**P-01 (Surgical additions only):** Satisfied. Every new file maps to a requirement.

**P-03 (Progressive enhancement):** Satisfied. localStorage fallback is untouched.

**P-05 (One-time tokens):** Satisfied. `usedAt` checked at read time, `deleteMany` before insert prevents accumulation.

### 2. Fair Alternative Exploration

Three options presented for email provider (Resend, Nodemailer+SMTP, skip). Honest pros/cons. Option C is correctly invalidated. This passes.

No alternatives explored for token storage (plaintext vs. hashed). The architect flagged this as a critical explicit-decision requirement. The plan provides no analysis of plaintext vs. HMAC/bcrypt for PasswordResetToken storage. **FAIL** — not fatal alone, but combined with the rate limiter issue below, the forgot-password section requires iteration.

### 3. Risk Mitigation Clarity

| Risk | Mitigation in Plan | Adequate? |
|------|-------------------|-----------|
| Token race condition (PM-01) | `deleteMany` before create | Yes |
| Favorites sync overwrites DB (PM-02) | `createMany skipDuplicates` | Yes |
| Review purchase check too loose (PM-03) | DELIVERED/PICKED_UP filter | Yes |
| Email delivery failure | `.catch(console.error)` only | **NO — "monitor logs" is not mitigation** |
| authLimiter cross-contamination (CONCERN-02) | Not addressed | **NO** |
| `inStock = true` unconditional (CONCERN-03) | Not addressed | **NO** |
| Favorites stale data after sync (CONCERN-04) | Not addressed | **NO** |
| `account/page.tsx` multi-phase merge risk (CONCERN-06) | Not addressed | **NO** |

Five risks have no concrete mitigations. "Console.error" is monitor-the-logs, not a mitigation.

### 4. Testable Acceptance Criteria

All 20 AC lines have 4 pipe-separated fields (id|criterion|verification_command|expected_output_pattern). Format passes structurally.

**Substance checks:**

- **AC-01:** `verification_command` includes `"AND Resend dashboard shows sent email"` — this is not a shell command. Verification depends on manual Resend UI inspection. Not fully machine-testable as written. Marginal but not a hard block.

- **AC-02:** `verification_command` is `"PATCH /api/admin/orders/:id {status:'CONFIRMED'}"` — not a shell command (missing `curl`, no actual URL form). Expected output includes `"email delivered to order.email"` — unverifiable programmatically. Same issue as AC-01.

- **AC-08:** `verification_command` is `"GET /api/account/orders returns statusLogs array"` — not an executable command. Should be `curl -X GET localhost:3000/api/account/orders -H 'Cookie:...'`.

- **AC-14:** `verification_command` is `"Click repeat order button on account page"` — browser interaction, not a shell command. The criterion requires a Playwright/Cypress test or a purely manual step, but no `verification_command` is shell-executable. **FAIL** — this criterion is not independently verifiable.

- **AC-19:** `verification_command` is `"GET /admin/reviews without admin session"` — not a complete shell command.

Several verification_commands are English descriptions of what to do, not executable shell commands. They fail the falsifiability requirement: a developer cannot run them and observe a pass/fail result. The `npm run build` check (AC-20) is the only criterion with a truly executable shell command.

### 5. Concrete Verification Steps

The integration test section has real `curl` commands with actual flags and bodies. The E2E section is manual but explicitly labeled. The observability section references actual SQL queries. This passes for the test plan prose. However, the gap between the prose test plan and the STRUCTURED_OUTPUT AC verification_commands is significant: the prose has good commands, the structured output has incomplete ones.

### 6. Pre-mortem (Deliberate Mode)

Three distinct scenarios:
- PM-01: Token race condition (concurrent submits, stale link)
- PM-02: Favorites sync overwrites remote state
- PM-03: Cancelled-order purchase gate bypass

These are genuinely distinct failure modes across different subsystems. Passes.

**However:** The architect identified a fourth scenario not in the pre-mortem: domain verification gap at deploy time causing silent total email failure. This is a deployment failure mode, not a code logic failure, and it is absent from both the pre-mortem and the risk mitigations.

### 7. Expanded Test Plan (Deliberate Mode)

Sections present: Unit, Integration (curl), E2E (manual), Observability. All four sections exist. Passes structurally.

Quality: Unit tests are speculative ("if/when test suite is added") since the project has no test suite. This is honest and appropriate given the project's constraints (CLAUDE.md confirms "No test suite exists").

### 8. Architect Concerns Addressed

| Concern | Addressed in Plan? |
|---------|--------------------|
| CONCERN-01: Email silent failure | **NOT ADDRESSED** — plan notes `.catch(console.error)` only |
| CONCERN-02: authLimiter cross-contamination | **NOT ADDRESSED** — plan says "use authLimiter" for forgot-password without noting the shared-store problem |
| CONCERN-03: inStock = true unconditional | **NOT ADDRESSED** — plan mirrors the flawed pattern intentionally |
| CONCERN-04: Favorites stale UX after sync | **NOT ADDRESSED** — no re-fetch or loading state |
| CONCERN-06: account/page.tsx merge risk | **NOT ADDRESSED** — no batching note |

This is the iteration-1 plan — it was written before the architect verdict. So none of these were addressed because the architect hadn't spoken yet. The verdict I'm writing now gates iteration 2, which must address all of them.

---

## Rejections (Falsifiable)

### REJECTION-01: authLimiter Cross-Contamination (CRITICAL)

**Dimension:** Risk mitigation clarity / Architect concern unaddressed

**Failure scenario:** An attacker sends 31 rapid POST requests to `/api/auth/[...nextauth]/route.ts` (the login endpoint). The `authLimiter` name is `'auth'` — a shared in-memory store. All subsequent requests to `/api/auth/forgot-password` from the same IP return 429 for the remaining window (up to 60 seconds). A legitimate user who triggered the rate limit by mistyping their password cannot reset it either, because forgot-password shares the same store and will return 429. The rate limiter is stored by IP, not by endpoint — confirmed in `frontend/src/lib/rate-limit.ts` lines 8–17 (single `stores` Map, keyed by `name`). The plan assigns `authLimiter` (name: `'auth'`) to the new forgot-password route, which contaminates the shared bucket.

**Verification command:**
```bash
# Exhaust the auth limiter via login endpoint
for i in $(seq 1 32); do curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"wrong","redirect":"false","callbackUrl":"/"}'; echo; done
# Then immediately attempt forgot-password from same IP:
curl -X POST localhost:3000/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"real@user.com"}'
# Expected (bug): 429 Слишком много запросов — user cannot reset password
# Required: 200 (separate limiter should not be exhausted by login attempts)
```

---

### REJECTION-02: inStock = true Unconditional on Cancel (MAJOR)

**Dimension:** Risk mitigation clarity / Architect concern unaddressed

**Failure scenario:** Admin disables a product listing by setting `inStock = false` (product is discontinued but still has pending orders). A customer with a NEW order containing that product cancels their order. The cancel route executes `UPDATE "Product" SET "totalStock" = "totalStock" + qty, "inStock" = true` — the discontinued product reappears on the public storefront as available for purchase. The architect's synthesis provides the one-line fix: `"inStock" = ("totalStock" + ${qty}) > 0`. The plan acknowledges the issue ("plan correctly mirrors it") but does not fix it.

**Verification command:**
```bash
# Setup: Set a product inStock=false manually in DB (admin discontinued it)
psql $DATABASE_URL -c "UPDATE \"Product\" SET \"inStock\" = false, \"totalStock\" = 5 WHERE id = '<product_id>'"
# Cancel an order containing that product via the new cancel route
curl -X PATCH localhost:3000/api/account/orders/<order_id>/cancel -H 'Cookie: next-auth.session-token=<valid_token>'
# Verify bug: product is now inStock=true despite admin intent
psql $DATABASE_URL -c "SELECT \"inStock\", \"totalStock\" FROM \"Product\" WHERE id = '<product_id>'"
# Bug confirmed if inStock=true; correct behavior is inStock=false (totalStock > 0 but admin disabled it)
```

---

### REJECTION-03: Acceptance Criteria Not Machine-Verifiable (STRUCTURAL)

**Dimension:** Testable acceptance criteria

**Failure scenario:** A developer implementing AC-14 ("Кнопка Повторить заказ") runs the `verification_command` as specified: `"Click repeat order button on account page"`. This is English prose, not a shell command. The developer has no automated way to verify the criterion passes. The same applies to AC-01, AC-02, AC-08, AC-19. When a CI/CD system or a second developer attempts to verify these criteria independently, they cannot execute the verification_command — it contains no executable binary, no URL scheme, no curl/psql/node invocation.

**Verification command:**
```bash
# Check if the verification_command fields in STRUCTURED_OUTPUT are shell-executable:
grep "ACCEPTANCE_CRITERION|AC-14" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-1/plan.md
# Output will show: verification_command = "Click repeat order button on account page"
# This is not shell-executable — no binary, no URL, no protocol. Criterion fails falsifiability requirement.
```

---

### REJECTION-04: Email Silent Failure — No Admin Visibility (CRITICAL)

**Dimension:** Risk mitigation clarity / Architect concern unaddressed

**Failure scenario:** Resend `RESEND_API_KEY` is set in prod `.env` but the sending domain `alash-electronics.kz` has not completed DNS verification in the Resend dashboard. Every call to `resend.emails.send()` returns HTTP 403 from Resend's API. The `.catch(err => console.error('Email confirmation error:', err))` logs to PM2 stdout. On EC2, PM2 logs are in `~/.pm2/logs/alash-electronics-out.log` and rotate. No admin receives a notification. A customer places an order, receives no email confirmation, and phones the store. The plan has no mechanism to surface this failure to a human within the same session — no Telegram alert, no counter, no retry. This is not a hypothetical: the architect confirmed Resend domain verification is separate from API key creation and is a known deployment gap.

**Verification command:**
```bash
# Simulate Resend 403 by using invalid API key; confirm no admin alert fires
RESEND_API_KEY=invalid_key_test node -e "
const { Resend } = require('resend');
const r = new Resend('invalid_key_test');
r.emails.send({ from: 'test@alash-electronics.kz', to: 'customer@test.com', subject: 'Test', html: '<p>test</p>' })
  .catch(err => console.error('Email confirmation error:', err));
console.log('Order response sent'); // This fires immediately — customer gets 200 OK, no email
"
# Expected: "Order response sent" prints, then error logs — zero admin notification mechanism
```

---

## Items Requiring Iteration (Summary)

The plan must address ALL of the following before implementation can proceed:

1. **REJECTION-01 (CRITICAL):** Create a separate `forgotPasswordLimiter` (name: `'forgot-password'`) and `resetPasswordLimiter` (name: `'reset-password'`) in `lib/rate-limit.ts`. Do not use `authLimiter` for these routes.

2. **REJECTION-02 (MAJOR):** Replace `"inStock" = true` with `"inStock" = ("totalStock" + ${item.quantity}) > 0` in the Phase 6 cancel route SQL.

3. **REJECTION-03 (STRUCTURAL):** AC-01, AC-02, AC-08, AC-14, AC-19 must have shell-executable `verification_command` values (curl/psql/node/grep commands), not English prose.

4. **REJECTION-04 (CRITICAL):** Add a concrete failure-visibility mechanism for email. Minimum: on Resend call failure, invoke `sendTelegram` (already exists in codebase) with `orderId` and `orderNumber`. This is ~3 lines and reuses existing infrastructure. "Console.error only" is not acceptable for customer-facing transactional email.

5. **CONCERN-04 (MAJOR, not rejected but must be addressed):** After `POST /api/account/favorites/sync` resolves in `login/page.tsx`, trigger a re-fetch of favorites or pass a flag to `account/page.tsx` to reload favorites state on mount. Otherwise the account page renders stale data.

6. **CONCERN-06 (MAJOR, not rejected but must be addressed):** Add an explicit note in the implementation plan that all modifications to `account/page.tsx` (Phases 4, 5, 6, 8) must be implemented in a single development pass on the same branch, not across parallel PRs.

---

## Approval Evidence (Items That Pass)

- AC-03, AC-04: curl commands with Cookie header, concrete expected responses. Pass.
- AC-05, AC-06, AC-07: token lifecycle checks with DB verification. Pass.
- AC-09, AC-10: stock and cancellation checks with HTTP status expectations. Pass.
- AC-11, AC-12, AC-13: favorites CRUD with DB state verification. Pass.
- AC-15, AC-16, AC-17, AC-18: review gating and moderation lifecycle. Pass.
- AC-20: `cd frontend && npm run build` → exit code 0. Pass.
- Pre-mortem: 3 distinct scenarios covering different subsystems. Pass.
- Expanded test plan: unit/integration/e2e/observability sections present. Pass.
- Principle-option consistency for P-01, P-03, P-05. Pass.
- Option exploration for email provider (3 options with honest tradeoffs). Pass.
- Schema additions (PasswordResetToken, Review): correct Prisma syntax, appropriate indexes, nullable cancelledBy field. Pass.
- Phase 7 sync logic (`createMany skipDuplicates`): correctly addresses the multi-device merge concern from PM-02. Pass.

---

```
STRUCTURED_OUTPUT_START
VERDICT|ITERATE
REJECTION|R-01|risk_mitigation|authLimiter name='auth' shared with login endpoint — 31 login attempts from same IP exhaust the bucket, subsequent forgot-password POST returns 429, legitimate user cannot reset password during the 60-second window|for i in $(seq 1 32); do curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"wrong","redirect":"false","callbackUrl":"/"}'; done && curl -s -w "\n%{http_code}" -X POST localhost:3000/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"real@user.com"}'
REJECTION|R-02|risk_mitigation|Cancel route sets inStock=true unconditionally — admin-discontinued product (inStock=false, totalStock=5) reappears on storefront after customer cancels their order|psql $DATABASE_URL -c "UPDATE \"Product\" SET \"inStock\"=false, \"totalStock\"=5 WHERE id='<pid>'" && curl -X PATCH localhost:3000/api/account/orders/<oid>/cancel -H 'Cookie: next-auth.session-token=<tok>' && psql $DATABASE_URL -c "SELECT \"inStock\" FROM \"Product\" WHERE id='<pid>'"
REJECTION|R-03|testable_acceptance_criteria|AC-14 verification_command is English prose 'Click repeat order button on account page' — not a shell-executable command; cannot be run by CI or second developer to verify pass/fail|grep "ACCEPTANCE_CRITERION|AC-14" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-1/plan.md
REJECTION|R-04|risk_mitigation|RESEND_API_KEY set but domain unverified causes Resend 403 on every email send — .catch(console.error) only, no Telegram alert, no retry; entire day of zero order confirmation emails goes undetected on EC2 PM2 instance|RESEND_API_KEY=bad node -e "const {Resend}=require('resend');const r=new Resend('bad');r.emails.send({from:'x@alash-electronics.kz',to:'c@t.com',subject:'T',html:'<p>T</p>'}).catch(e=>console.error('Email error:',e));console.log('response_sent')"
APPROVAL_EVIDENCE|AE-01|AC-20|cd frontend && npm run build produces exit code 0 — this is a real executable shell command with a binary, a directory, and a verifiable exit code pattern
APPROVAL_EVIDENCE|AE-02|AC-06|POST /api/auth/reset-password curl command with token and password fields, expected_output_pattern checks both ok:true AND DB state (token.usedAt IS NOT NULL) — independently verifiable
APPROVAL_EVIDENCE|AE-03|AC-09|PATCH cancel route command checks HTTP 200 AND DB stock increment — two independent observables confirm both the API response and the side effect
APPROVAL_EVIDENCE|AE-04|AC-15|POST /api/reviews by user with no qualifying order returns 403 — single observable, machine-verifiable HTTP status code
APPROVAL_EVIDENCE|AE-05|AC-12|POST favorites twice, DB has exactly 1 row — verifiable via psql count query, tests upsert skipDuplicates behavior
STRUCTURED_OUTPUT_END
```
