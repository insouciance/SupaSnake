# v0.1 Launch Checklist (Web)

Ship gate for supasnake.com. Every box checked before flipping Stripe out of
sandbox / announcing. Owner: bllj@proton.me.

## Automated gates (must be green)

- [ ] `npx tsc --noEmit` clean
- [ ] Jest suite green (`npm test`) - all suites, no skips added since last release
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds with production env
- [ ] E2E green: `npm run test:e2e` (chromium, excludes `@stripe`) locally **and** the E2E workflow on the release PR
- [ ] CI workflows (Build / Lint / Test / E2E) green on the release commit

## Manual verification

- [ ] Lighthouse >= 80 on `/`, `/game`, `/shop` (run manually: Chrome DevTools > Lighthouse, mobile preset, production URL)
- [ ] Sentry receiving events: trigger a test error on staging, confirm it lands in the project
- [ ] Crash-free sessions > 99% over a 48h staging soak (Sentry release health)
- [ ] One real sandbox purchase completed end-to-end (Stripe test card) - energy credited, webhook processed, purchase visible in Stripe dashboard
- [ ] That purchase refunded via Stripe dashboard - refund webhook handled, no orphaned entitlements
- [ ] Consent verified: fresh browser shows banner; PostHog makes **zero** network calls before "Accept"; Reject All keeps it silent; choice persists
- [ ] Age gate on signup blocks a birth year < 13 and lets 13+ through
- [ ] Fresh-player loop by hand: guest play -> starter pick -> one game run -> DNA credited -> daily reward claim
- [ ] Account upgrade (guest -> email) keeps collection + DNA

## No-go triggers (any one blocks launch)

- Payment bug of any kind: double charge, missing credit, webhook failure, refund not honored
- Save corruption: player state (DNA, collection, equipped snake) lost or wrong after reload/upgrade
- Crash-free < 99% during soak
- Consent or age gate not enforcing (compliance risk)
- Supabase RLS misconfiguration exposing another player's data

## Rollback

- Vercel: promote previous production deployment (instant)
- Keep Stripe in sandbox until the first post-launch smoke test passes
