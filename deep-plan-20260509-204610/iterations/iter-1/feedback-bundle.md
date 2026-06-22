# Feedback Bundle — iter-1 → iter-2

## Critic Rejections (all must be addressed)

### R-01 [CRITICAL] — authLimiter cross-contamination
**Dimension:** risk_mitigation
**Failure scenario:** authLimiter name='auth' is shared with login route. 31 failed login attempts from one IP lock out forgot-password endpoint for 60s, blocking legitimate password reset.
**Fix required:** Create separate named limiters: `forgotPasswordLimiter` (name: 'forgot-password', max: 5, window: 15min) and `resetPasswordLimiter` (name: 'reset-password', max: 10, window: 15min) in `lib/rate-limit.ts`.

### R-02 [MAJOR] — `inStock = true` unconditional on cancel
**Dimension:** risk_mitigation
**Failure scenario:** Admin intentionally disables product (inStock=false, totalStock=0). Customer cancels order containing that product. Cancel route sets inStock=true, reactivating a discontinued product.
**Fix required:** Stock restore SQL must be: `SET "totalStock" = "totalStock" + qty, "inStock" = ("totalStock" + qty) > 0`

### R-03 [STRUCTURAL] — Non-executable AC verification commands
**Dimension:** testable_acceptance_criteria
**Failure scenario:** AC-14, AC-01, AC-02, AC-08, AC-19 have English prose as verification_command (e.g. "Click repeat order button on account page"). These cannot be run by CI or a developer to verify correctness.
**Fix required:** Every ACCEPTANCE_CRITERION in STRUCTURED_OUTPUT must have a real executable shell command (curl, node script, psql query, npm run build). For UI-only criteria use `curl -s http://localhost:3000/account -H "Cookie: next-auth.session-token=TEST" | grep "Повторить заказ"` or equivalent.

### R-04 [CRITICAL] — Email silent failure, zero admin visibility
**Dimension:** risk_mitigation
**Failure scenario:** RESEND_API_KEY set but Resend domain unverified causes 100% silent email failure. Orders complete, customers receive nothing, no human is alerted.
**Fix required:** In `lib/email.ts`, wrap sendEmail in try/catch. On failure, call existing `sendTelegram()` with message "⚠️ Email failed for order #{orderId}: {error.message}". Reuses existing infrastructure, ~3 lines.

## Architect Concerns (non-blocking, but address in plan notes)

### CONCERN-04 — Favorites sync UX gap
After login sync fires, account page may render before POST completes. Plan should note: login page should await sync Promise before router.push, or account page should re-fetch favorites on mount.

### CONCERN-06 — account/page.tsx multi-phase modifications
Phases 4, 5, 6, 8 all modify account/page.tsx. Plan must treat all account/page.tsx changes as a single batched edit (Phase 4 in execution order) to prevent merge conflicts during implementation.
