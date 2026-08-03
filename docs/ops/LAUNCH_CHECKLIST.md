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
      migration, currently 065, on a clean database; the
      062–065 reviewed bridge chain and its ordinary/concurrency contracts are
      also exercised
- [ ] `supabase db push --linked --include-all --dry-run` is a no-op for the
      current baseline, or lists exactly the migrations named in a future
      release plan
- [ ] While the exact outgoing Production artifact does not yet prove the full
      Genome v2 capability **and** the corrected 2/3/4 Strain profile, the
      dedicated hosted read-only preflight reports
      zero durable v2 sessions before schema mutation and again immediately
      before Production; any nonzero result blocks this first-cutover rules-v2
      threshold correction
- [ ] Build / Lint / Test / E2E workflows are green on the release commit
- [ ] CI and production builds use `NEXT_PUBLIC_FTUE_V2=true`,
      `NEXT_PUBLIC_HUD_COCKPIT_V1=true`, `NEXT_PUBLIC_LADDER_V1=true`, and
      `NEXT_PUBLIC_CAREER_SPINE_V1=true`. Genome v2 production additionally
      requires exact `NEXT_PUBLIC_GENOME_V2=true`; new starts use v1 for every
      other value while already-stamped v2 sessions remain resumable. The
      production workflow and its E2E
      matrix additionally compile `NEXT_PUBLIC_RUN_FLOW_V1=true` and prove it
      through `/api/health`; the ordinary Build workflow may retain its
      deliberate flag-off rollback compile. Career settlement and earned
      progress must never depend on either presentation flag.
      `NEXT_PUBLIC_GROWTH_LAB_V1` is retired and must not be required by
      current behavior.
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
- [ ] Every accepted earning run survives a dropped response, reload, reconnect,
      and duplicate completion through server-side recovery; no progress fact,
      pending request, receipt, attention item, or pursuit is persisted in
      browser storage
- [ ] Results presents no more than three meaningful Career recognition beats;
      destination-specific acknowledgement clears server-backed attention
      without bell-open or route-open shortcuts
- [ ] Tactical Loom candidates name their Strains, show affected 2/3/4 routes
      and direct Splice fates as a compact reaction map, and never rank choices
- [ ] Results `Study this Genome` opens the exact owned terminal Genome in the
      free Research Workbench through an opaque server-backed handoff; no
      authoritative state appears in URL or browser storage
- [ ] Flag-off new starts stay v1 while a pre-existing v2 session reconnects,
      banks/crashes, and settles correctly
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
- [ ] Follow `docs/ops/RELEASE_RUNBOOK.md` (including exact outgoing inspection
      → cron snapshot → Preview contract → exact migration plan → linked probe
      → exact application SHA cutover; the two zero-v2 proofs apply only on the
      legacy-origin/recovery path while outgoing lacks the exact v2 marker)
- [ ] Post-release health and core smoke checks pass on `supasnake.com`
- [ ] Every configured cron route rejects no/incorrect bearer tokens
- [ ] Discord outbox, Analyst daily job and deletion worker appear in Vercel logs

## No-go triggers

- Any double charge, missing credit, webhook failure, or refund inconsistency
- Save/collection/lineage corruption or cross-player data exposure
- Failed production environment, migration dry-run, health, or RLS check
- Genome capability, flag, versioned-session continuity, or Research ownership
  mismatch
- Unresolved consent, age, legal-disclosure, or account-erasure defect
- Crash-free sessions below 99% during soak
