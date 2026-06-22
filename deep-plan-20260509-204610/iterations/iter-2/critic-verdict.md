# Critic Verdict — Iteration 2

**Plan:** Личный кабинет клиента — полная реализация  
**Date:** 2026-05-09  
**Overall Verdict:** ITERATE

---

## Quality Gate Assessment

### 1. Principle-Option Consistency

All five principles are satisfied:

- **P-01 (Surgical additions):** Every new file maps to a named requirement. No speculative features.
- **P-02 (Mirror existing patterns):** The plan correctly diverges from the flawed `inStock = true` stock restore pattern and justifies the deviation with the correctness requirement. This is not a violation — it is explicit improvement.
- **P-03 (Progressive enhancement):** `lib/cart.ts` localStorage logic is explicitly stated as untouched. Guest path is not broken.
- **P-04 (Email fire-and-forget with fallback):** `sendEmail` wraps Resend in `try/catch` and calls `sendTelegram()` on failure. `sendTelegram` exists in `lib/telegram.ts` (verified on disk). No circular dependency — `sendTelegram` has no reference to `sendEmail`.
- **P-05 (One-time tokens):** `usedAt` field checked at read time, not just deleted-after-use. `deleteMany` before token creation prevents accumulation and race conditions.

**PASSES.**

### 2. Fair Alternative Exploration

Three options presented for email provider: Resend (selected), Nodemailer+SMTP (viable), Skip (invalidated). Each has honest pros and cons. Option C is correctly rejected because it fails the stated requirement.

No alternative to plaintext token storage was explored (flagged in iter-1 as well). This remains an acknowledged gap — the architect verdict is silent on it in iter-2, and the plan makes a deliberate decision to store tokens unhashed (generating with `crypto.randomBytes(32).toString('hex')` is sufficient entropy without bcrypt). The omission of analysis is a documentation concern only, not a blocking architectural issue at this traffic level.

**PASSES.**

### 3. Risk Mitigation Clarity

| Risk | Mitigation | Adequate? |
|------|-----------|-----------|
| authLimiter cross-contamination | forgotPasswordLimiter (name: 'forgot-password'), resetPasswordLimiter (name: 'reset-password') — distinct stores | YES |
| inStock = true unconditional | Computed `"inStock" = ("totalStock" + qty) > 0` in raw SQL | YES |
| Email delivery silent failure | sendTelegram() alert in catch block of sendEmail | YES |
| Favorites stale on account page | `await fetch(syncUrl)` before `router.push('/account')` | YES |
| Token race condition | `deleteMany` all tokens for user before creating new one | YES |
| Favorites sync overwrites DB state | `createMany({ skipDuplicates: true })` — never deletes existing DB entries | YES |
| account/page.tsx multi-phase merge | All four sets of changes batched into Phase 4 as single edit | YES |

**PASSES.**

### 4. Testable Acceptance Criteria (FAIL)

All 22 AC lines have 4 pipe-separated fields structurally. Field count check passes. Substance check identifies two failures:

**AC-22 is English prose, not a shell command:**

```
ACCEPTANCE_CRITERION|AC-22|Email failure triggers Telegram alert via sendTelegram|Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel|Telegram message contains "⚠️ Email failed" within 10 seconds of order creation
```

The `verification_command` field is `Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel`. This contains no executable binary, no `curl`, no `node`, no `psql`. It is identical in form to the AC-14 from iter-1 that was rejected as R-03. This is a regression of the same structural defect — R-03 was supposed to be resolved.

**AC-09 verification_command contains non-executable placeholders:**

```
PROD_ID=$(node -e "...get productId from NEW order items...") && BEFORE=$(node -e "...get Product.totalStock...")
```

The `...get productId from NEW order items...` and `...get Product.totalStock...` are English prose inside shell syntax. A developer running this command would get a syntax error or empty variable. The rest of AC-09 is well-formed, but the initial variable setup cannot execute. The verification is incomplete.

**Both ACs FAIL the falsifiability requirement.** R-03 was explicitly about this class of defect. AC-22 introduces a new instance; AC-09 has an incompletely-specified command.

### 5. Concrete Verification Steps

The integration test section (curl commands with actual flags, bodies, and expected HTTP codes) is genuinely executable. The E2E section is explicitly labeled as manual. The observability section references actual SQL queries. The rate limiter isolation test (lines 977-984) is a real shell script.

**PASSES** for the prose test plan. Fails for the two ACs identified above.

### 6. Pre-mortem (Deliberate Mode)

Three distinct scenarios:

- **PM-01:** Resend domain unverified — deployment/configuration failure causing 100% silent email drop. Fix: Telegram alert fires within seconds of first Resend 403.
- **PM-02:** Token race condition — user double-submits forgot-password, first email link becomes stale. Fix: deleteMany before create.
- **PM-03:** Favorites sync overwrites DB state — naive localStorage-wins loses mobile-added favorites. Fix: createMany skipDuplicates, never delete.

These are genuinely distinct failure modes across three different subsystems (email delivery, token management, favorites consistency). They are not rephrasings of each other.

**PASSES.**

### 7. Expanded Test Plan (Deliberate Mode)

All four required sections present:

- **Unit:** `lib/email.ts` mock Resend, limiter isolation, token validation, star selector
- **Integration:** curl scripts for forgot/reset password, rate limiter test, order cancel, stock verify, favorites idempotency, review purchase gate
- **E2E (manual):** 6 labeled scenarios covering full user flows
- **Observability:** Email failure Telegram alert, OrderStatusLog SQL query, token cleanup query, rate limiter store behavior

**PASSES.**

### 8. Prior Rejections Resolved

| Rejection | Status | Evidence |
|-----------|--------|---------|
| R-01 (rate limiter isolation) | RESOLVED | Plan lines 293-296: `import { forgotPasswordLimiter }` and `const limited = forgotPasswordLimiter(request)` in forgot-password route. Lines 313-316: same for resetPasswordLimiter. Verified `lib/rate-limit.ts` uses `stores` Map keyed by `name` — fully isolated. |
| R-02 (inStock SQL) | RESOLVED | Exact SQL at plan line 610: `"inStock" = ("totalStock" + ${item.quantity}) > 0` in `$executeRaw`. Standalone SQL block at lines 637-641 confirms exact pattern. Architect verified PostgreSQL SET clause evaluates pre-update values. |
| R-03 (executable ACs) | PARTIALLY RESOLVED — AC-22 is a new prose-only verification_command. AC-09 has non-executable placeholders. These are new instances of the same defect class. |
| R-04 (email fallback) | RESOLVED | Plan lines 203, 222-225 show `import { sendTelegram }` and actual `sendTelegram(...)` call inside `catch` block of `sendEmail`. `lib/telegram.ts` confirmed on disk with its own independent try/catch. |

---

## Rejections (Falsifiable)

### REJECTION-01: AC-22 Verification Command Is English Prose (STRUCTURAL — R-03 Regression)

**Dimension:** Testable acceptance criteria

**Failure scenario:** A developer implementing Phase 2 attempts to verify AC-22 ("Email failure triggers Telegram alert via sendTelegram") using the stated `verification_command`: `Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel`. This is not a shell command. There is no executable binary, no protocol, no URL. Running it in a terminal produces `bash: Set: command not found`. The developer cannot independently verify the criterion without rewriting it themselves. R-03 was explicitly rejected in iter-1 for this same defect — AC-22 is a new instance that was introduced in iter-2 while fixing AC-14.

**Verification command:**
```bash
grep "ACCEPTANCE_CRITERION|AC-22" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-2/plan.md
```

Expected output will show the verification_command field as `Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel` — English prose with no executable binary.

---

### REJECTION-02: AC-09 Verification Command Has Non-Executable Placeholders (STRUCTURAL)

**Dimension:** Testable acceptance criteria

**Failure scenario:** A developer runs the AC-09 `verification_command` to verify stock restore correctness. The command begins with `PROD_ID=$(node -e "...get productId from NEW order items...")` — the string `...get productId from NEW order items...` is English prose inside a node -e invocation. Node.js will throw a syntax error or produce an empty string, causing `$PROD_ID` to be unset. The subsequent `WHERE id='$PROD_ID'` DB query returns no rows. The stock restore check cannot be performed. The ellipsis placeholders are not executable — they must be replaced with actual Prisma client calls like those used in AC-05, AC-06, and AC-18.

**Verification command:**
```bash
grep "ACCEPTANCE_CRITERION|AC-09" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-2/plan.md
```

Expected output shows `PROD_ID=$(node -e "...get productId from NEW order items...")` — the `...` is not valid JavaScript and will cause a syntax error when node evaluates it.

---

## Approval Evidence (Items That Pass)

- **R-01:** `forgotPasswordLimiter` and `resetPasswordLimiter` are imported AND applied (`const limited = forgotPasswordLimiter(request)`) in both route stubs in Phase 3. The plan shows the complete import lines and the `if (limited) return limited` pattern mirroring the existing codebase convention. Verified against actual `lib/rate-limit.ts` which uses a `stores` Map keyed by `name` — distinct name = distinct store = no cross-contamination.

- **R-02:** Exact SQL template `"inStock" = ("totalStock" + ${item.quantity}) > 0` shown in the `$executeRaw` block. Architect confirmed PostgreSQL evaluates SET expressions against pre-update row values — the expression produces the correct new totalStock value. Plan walks through three edge cases including the `totalStock=0` unlimited case.

- **R-04:** `sendTelegram` is imported from `@/lib/telegram` at the top of `lib/email.ts` code block. The catch block calls `sendTelegram(...).catch(console.error)`. The actual `lib/telegram.ts` file on disk has an independent try/catch with no reference to email — no circular dependency.

- **AC-03, AC-04:** curl PATCH with Cookie header and exact JSON body. Expected HTTP status + JSON error string. Independently machine-verifiable.

- **AC-05, AC-06, AC-07:** Token lifecycle checks with DB verification via Prisma client node invocations. AC-06 chains token extraction → curl reset → DB usedAt check. Full end-to-end verifiability.

- **AC-10:** curl PATCH to cancel endpoint with CONFIRMED order ID, expects 400 with Russian error string. Single observable, machine-verifiable.

- **AC-11, AC-12, AC-13:** Favorites CRUD with DB count verification. AC-12 tests upsert idempotency (two POSTs → count = 1).

- **AC-14:** `cd frontend && npm run build 2>&1 | tail -5` — legitimate proxy for UI component existence in a project with no test suite. A missing JSX element causing TypeScript type error would fail the build.

- **AC-15:** Non-buyer POST to /api/reviews → 403. Single observable HTTP status.

- **AC-16:** Post review → GET reviews → count 0 (pre-approval). Two chained curl commands with pipe to node JSON parse.

- **AC-17, AC-18, AC-19:** Review moderation lifecycle. AC-18 chains DB query for pending review ID → PATCH approve → GET public reviews → count 1.

- **AC-20:** `cd frontend && npm run build` → exit code 0. Executable, unambiguous.

- **AC-21:** Shell loop to exhaust authLimiter → curl forgot-password → expect 200 not 429. The full script is executable.

- **Pre-mortem:** 3 distinct scenarios (Resend 403, token race, favorites overwrite). Different subsystems, different actors, different failure modes.

- **Expanded test plan:** Unit/Integration/E2E/Observability all present with real curl commands and SQL.

---

## Required Fixes for Iter-3

The plan is architecturally sound and all four prior rejections are correctly resolved. Only two structured output fields need repair:

1. **AC-22 `verification_command`:** Replace prose with executable shell. Example replacement:
   ```
   RESEND_API_KEY=invalid_key_test node -e "const {Resend}=require('resend');const r=new Resend('invalid_key_test');r.emails.send({from:'noreply@croon.kz',to:'test@test.com',subject:'T',html:'<p>T</p>'}).then(()=>console.log('no-error')).catch(e=>{const {sendTelegram}=require('./src/lib/telegram');sendTelegram('⚠️ Email failed: '+e.message).catch(()=>{});console.log('caught:',e.message)})" 2>&1 | grep -E "caught:|⚠️"
   ```

2. **AC-09 `verification_command`:** Replace `...get productId from NEW order items...` and `...get Product.totalStock...` placeholders with actual Prisma client node invocations (as used in AC-05, AC-06, AC-18).

No other changes are needed. The core architecture, schema, rate limiter wiring, SQL semantics, email fallback pattern, and pre-mortem are all correct.

---

```
STRUCTURED_OUTPUT_START
VERDICT|ITERATE
REJECTION|R-05|testable_acceptance_criteria|Developer runs AC-22 verification_command 'Set RESEND_API_KEY=invalid_key, place order with email, check Telegram admin channel' in terminal — bash reports 'Set: command not found' because the field is English prose with no executable binary; the email fallback cannot be independently verified without rewriting the command|grep "ACCEPTANCE_CRITERION|AC-22" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-2/plan.md
REJECTION|R-06|testable_acceptance_criteria|Developer runs AC-09 verification_command beginning with PROD_ID=$(node -e "...get productId from NEW order items...") — node.js receives English prose as JavaScript, throws SyntaxError or returns empty string, PROD_ID is unset, subsequent DB query WHERE id='' returns no rows; stock restore correctness cannot be verified|grep "ACCEPTANCE_CRITERION|AC-09" /Users/nurdauletakhmatov/Desktop/alashed-workspace/alash-electronics/deep-plan-20260509-204610/iterations/iter-2/plan.md
APPROVAL_EVIDENCE|AE-01|R-01|forgotPasswordLimiter imported and called (const limited = forgotPasswordLimiter(request)) at plan lines 293-296; resetPasswordLimiter imported and called at lines 313-316; lib/rate-limit.ts on disk uses stores Map keyed by name — distinct names = distinct stores = zero cross-contamination with authLimiter
APPROVAL_EVIDENCE|AE-02|R-02|Exact SQL "inStock" = ("totalStock" + ${item.quantity}) > 0 shown in $executeRaw block at plan line 610; standalone SQL template at lines 637-641; architect verified PostgreSQL evaluates SET expressions against pre-update row values making this semantically correct
APPROVAL_EVIDENCE|AE-03|R-04|sendTelegram imported from @/lib/telegram in email.ts code block; catch block calls sendTelegram(...).catch(console.error); lib/telegram.ts verified on disk with independent try/catch and no reference to sendEmail — no circular dependency
APPROVAL_EVIDENCE|AE-04|AC-21|Shell loop exhausts authLimiter (31 requests to signin/credentials) then immediately POSTs to forgot-password and expects 200 not 429 — fully executable script, correctly verifies R-01 fix at runtime
APPROVAL_EVIDENCE|AE-05|AC-06|Chains TOKEN extraction via Prisma node invocation → curl POST reset-password → DB check that usedAt is not null — three independent observable assertions, all machine-verifiable
STRUCTURED_OUTPUT_END
```
