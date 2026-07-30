# v0.1 Launch Checklist (Web)

Ship gate for `supasnake.com`. The production workflow may be exercised with
Stripe sandbox credentials before launch; do not select `live` or announce the
game until every applicable box is checked. Owner: the monitored legal mailbox.

## Release-commit gates

- [ ] `npm ci` succeeds on Node 22
- [ ] Full Jest suite and the coverage ratchet pass
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run lint` is clean
- [ ] `npm audit --audit-level=high` reports no blocking advisory
- [ ] `npm run build` succeeds
- [ ] All migrations apply from 001 through the release's highest numbered
      migration (060 for the Career Spine release) on a clean database
- [ ] `supabase db push --linked --include-all --dry-run` is a no-op for the
      current baseline, or lists exactly the migrations named in a future
      release plan
- [ ] Build / Lint / Test / E2E workflows are green on the release commit
- [ ] CI and production builds use `NEXT_PUBLIC_FTUE_V2=true`,
      `NEXT_PUBLIC_HUD_COCKPIT_V1=true`, and `NEXT_PUBLIC_LADDER_V1=true`, unless
      deliberately testing rollback. `NEXT_PUBLIC_GROWTH_LAB_V1` is retired and
      must not be required by current behavior.
- [ ] Production environment presence check passes; Vercel cloud-build value
      validation passes for the selected Stripe mode

## Manual staging and product checks

- [ ] Hosted preview smoke tests preserve the existing operator test data
- [ ] E2E is green against the disposable local stack; no test touched hosted data
- [ ] Lighthouse mobile score is at least 80 on `/`, `/game`, and `/shop`
- [ ] Sentry receives a staged release and a deliberate test error
- [ ] Crash-free sessions exceed 99% during a 48-hour staging soak
- [ ] Fresh browser: no PostHog request before consent; Reject remains silent
- [ ] Age gate rejects under-14 and accepts an eligible 14+ user
- [ ] Guest → atomic PRIMAL bootstrap → run → DNA → daily reward flow persists
      after reload without mandatory Lab or a second Play action
- [ ] Run Setup shows server-authoritative Energy, partial recovery, next-unit
      time, 1–6 commitment choices and the exact multiplier; six Energy requires
      a second deliberate confirmation
- [ ] One-, multi-, crash, abandon, reconnect, revive, and duplicate-completion
      journeys consume Energy exactly once and reconcile the displayed DNA with
      the authoritative settlement
- [ ] During an active clan cycle, positive-Energy normal runs attach at start,
      update only the player's best five banked Yields, and expose no teammate
      performance detail or paid advantage
- [ ] Guest-to-email upgrade preserves collection, DNA, lineage, and Codex
- [ ] Registered deletion schedules 30 days out; a new sign-in cancels it
- [ ] Guest deletion requires `DELETE MY ACCOUNT` and erases immediately

## Payments

- [ ] Stripe remains in sandbox while running pre-launch checks
- [ ] The live source catalog contains only reviewed constitutional products;
      retired Energy/DNA/variant products and the old Premium plans cannot be
      checked out
- [ ] Founding Keeper is the only first-launch SKU, is gross-EUR and
      tax-inclusive, and previews every permanent entitlement before payment
- [ ] Stripe Tax is active and Checkout requests automatic tax
- [ ] Sandbox purchase grants each entitlement exactly once and records the
      order, line item, consent, provider event, and ownership source
- [ ] Sandbox restore, refund, and dispute reconcile ownership without touching
      earned cosmetics, DNA, progression, or unrelated permanent deliveries
- [ ] Before Keeper is sold, monthly/yearly checkout, portal cancellation,
      renewal, grace, lapse, restoration, and permanent-delivery behavior are
      verified at the approved Keeper name and prices
- [ ] Live-mode keys, the exact reviewed active Price IDs, and a live webhook
      are installed as one change; the production workflow is run with `live`

## Legal and operations

- [x] Company register number, VAT ID, and management disclosure populated
- [x] All application legal/privacy/support surfaces use `support@supasnake.com`
- [ ] Verify delivery and active monitoring for `support@supasnake.com`
- [ ] Confirm the exact WKO Fachgruppe wording
- [ ] Confirm processor DPAs and transfer safeguards
- [ ] Verify Supabase Auth SMTP/domain delivery and configure `RESEND_API_KEY` if
      weekly digests are a launch feature
- [ ] Assign an owner and SLA for contact/GDPR requests
- [ ] Review the Impressum, Terms, Privacy, withdrawal and accessibility pages
      with Austrian counsel
- [ ] Document the GDPR Article 33 breach-notification path

## Release execution

- [ ] Backups/PITR and current Vercel production deployment ID are recorded
- [ ] Follow `docs/ops/RELEASE_RUNBOOK.md` (application first, database second)
- [ ] Post-release health and core smoke checks pass on `supasnake.com`
- [ ] Every configured cron route rejects no/incorrect bearer tokens
- [ ] Discord outbox, Analyst daily job and deletion worker appear in Vercel logs

## No-go triggers

- Any double charge, missing credit, webhook failure, or refund inconsistency
- Save/collection/lineage corruption or cross-player data exposure
- Failed production environment, migration dry-run, health, or RLS check
- Unresolved consent, age, legal-disclosure, or account-erasure defect
- Crash-free sessions below 99% during soak
