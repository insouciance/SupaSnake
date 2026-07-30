# QA — Supporter billing lifecycle

This is the manual Stripe test-clock script for the current sandbox
subscription plumbing and the acceptance gate for the future Keeper product.
It complements automated webhook tests; it does not authorize live payments.

Authority:

- [`PRODUCT_CONSTITUTION.md`](../PRODUCT_CONSTITUTION.md) §10
- [`MONETIZATION_STRATEGY.md`](./MONETIZATION_STRATEGY.md)
- `supabase/migrations/028_premium_subscription.sql`

## Current-state warning

Operator production is Stripe sandbox only. The code still calls the
subscription **Premium** and uses €9.99/month and €89.99/year test prices. The
constitutional product is **Keeper** at €3.99/month or €34.99/year [H]. Do not
switch Stripe to live until the name, price, entitlement boundary, copy, and
tests have migrated together.

The only current one-time source catalog is empty. A completed one-time payment
is recorded and deliberately grants nothing; retired Energy/DNA/variant product
IDs must fail closed.

Current sandbox subscription activation may exercise the shipped supporter
cosmetic/drop substrate. It must never grant Energy, DNA, extra contracts,
offline recovery, progression, variants, genes, battle eligibility, Score,
Yield, or Depth. The Premium Stats paywall is a known constitutional conflict:
actionable analytics must become free before Keeper goes live.

## Setup

1. Use Stripe **test mode** and a test clock; never use a live customer or card.
2. Register a fresh non-anonymous SupaSnake test account and record its
   `players.id`.
3. Ensure the test webhook receives `checkout.session.completed`, subscription
   created/updated/deleted, `invoice.paid`, `invoice.payment_failed`,
   `charge.refunded`, and `charge.dispute.created`.
4. Keep the hosted operator database intact. Use a reviewed preview or a
   disposable local stack for destructive/replay cases.

## A. Existing sandbox plumbing regression

### A1. Subscribe

- [ ] `/shop` exposes exactly one commercial surface and clearly labels the
      current product/test prices; no one-time product is available.
- [ ] Anonymous players are routed to account creation so ownership is not
      device-bound.
- [ ] Checkout is blocked until both immediate-service and 18+ recurring
      billing confirmations are actively selected.
- [ ] Successful test Checkout returns safely and creates one
      `premium_subscriptions` row with the correct interval/status/period,
      durable Stripe customer mapping, and processed `stripe_events` rows.
- [ ] Supporter cosmetics are inserted idempotently. Resending the event creates
      no duplicate ownership row or drop.
- [ ] The subscription changes no Energy, DNA, progression, Genome, lineage,
      score, Yield, Depth, clan, or battle field.

### A2. Renewal and event ordering

- [ ] Advance the clock through renewal. `invoice.paid` and subscription update
      events advance the paid period exactly once.
- [ ] Replay an already processed event; it returns `already_processed` and
      changes no state.
- [ ] Deliver an older subscription event after a newer one; it returns
      `stale_event` and cannot regress the subscription.
- [ ] A malformed/unresolvable subscription is logged and reported without
      granting ownership.

### A3. Payment failure, cancellation, and lapse

- [ ] A failed renewal records the event and moves the subscription to the
      provider state; the documented seven-day past-due grace uses provider
      time, not client time.
- [ ] Settings opens Stripe Billing Portal; cancel-at-period-end is mirrored and
      shown with the actual date.
- [ ] Access continues through the paid period and then lapses. Previously
      delivered cosmetics and permanent history remain.
- [ ] Lapse cannot remove an earned or delivered cosmetic, Record, lineage row,
      Season reward, or patron mark.

### A4. Refund/dispute and one-time fail-closed path

- [ ] Refund and dispute events are idempotently recorded and escalated for the
      current manual policy; no unrelated player state changes.
- [ ] A forged, stale, or retired one-time product ID cannot call a reward RPC,
      mint a cosmetic, or grant any gameplay resource.
- [ ] A completed one-time test payment while the catalog is empty returns
      `not_fulfillable`, records the incident, and raises operator visibility.

## B. Keeper pre-live acceptance

Run this section only after Keeper and the generic entitlement ledger are
implemented. Every box blocks live mode.

### B1. Product truth

- [ ] Every player-facing and provider-facing name says Keeper; no Premium name
      remains in sale, consent, invoice, portal, or support copy except a clearly
      labeled migration/history reference.
- [ ] Gross prices are exactly the reviewed €3.99/month and €34.99/year [H], or
      an explicit owner amendment documents a changed value.
- [ ] The purchase screen lists only real delivered benefits: permanent monthly
      cosmetic, Keeper-since mark, extra cosmetic loadouts, archive/Chronicle
      presentation, and owned-variant colorways that actually exist.
- [ ] Actionable Workbench calculations and run analytics are free. Keeper adds
      archive depth and presentation, never a better conclusion.
- [ ] The lapse sentence is visible before Checkout: delivered goods are kept;
      stopping only stops future deliveries/access.

### B2. Entitlement and restoration

- [ ] Checkout sends a stable server-resolved product/price version; the client
      cannot choose entitlements, price, recipient, or duration.
- [ ] The webhook atomically records order/provider event and named
      entitlements. Retries and out-of-order events are harmless.
- [ ] A new browser/device restores the exact ownership from the authenticated
      account without local storage authority.
- [ ] Guest-to-account conversion preserves all pre-existing play state and
      enables purchase without creating a second player.
- [ ] The GDPR export includes subscription, order, entitlement, permanent
      cosmetic source, refund/dispute, and delivery history.

### B3. Delivery lifecycle

- [ ] At least three months of named drops are complete before sale.
- [ ] Each monthly delivery grants once despite webhook retry, login retry,
      month boundary, timezone, or concurrent tabs.
- [ ] A new subscriber receives only the explicitly advertised current/backfill
      goods; tenure cannot be purchased retroactively.
- [ ] Renewal does not duplicate prior drops. Lapse and resubscribe preserve
      delivered goods and continue honest tenure according to the published
      contract.

### B4. Refund and support operations

- [ ] The reviewed refund/withdrawal rule reconciles only paid entitlements and
      never earned state or unrelated monthly deliveries.
- [ ] Partial, full, duplicate, and out-of-order refund/dispute events converge
      idempotently.
- [ ] Customer support can inspect a non-secret transaction/entitlement audit,
      restore ownership safely, and record an append-only correction.
- [ ] Terms, withdrawal, cancellation, tax invoice, support mailbox, and German
      cancellation requirements have completed counsel/operations review.

## C. Founding Keeper and one-time commerce

- [ ] Founding Keeper is the only first commercial-launch SKU and every included
      cosmetic/mark is previewed before payment.
- [ ] The future first-Season entitlement is stored and can be fulfilled
      idempotently when that permanent Season exists.
- [ ] Purchase, restore, refund/dispute, data export, and account
      erasure/anonymization work without a generic resource-grant payload.
- [ ] Ownership survives browser/device changes; duplicate Checkout completion
      cannot duplicate cosmetics or Chronicle recognition.
- [ ] No commercial prompt appears in a run, on Results, in notifications, or
      inside clan surfaces.

## Evidence record

For each manual run, record commit, deployment, Stripe mode, test-clock/customer
IDs in the private operator log, webhook event IDs, expected and observed rows,
screenshots of product/consent/cancel copy, refund result, and any Sentry issue.
Never commit customer identifiers, credentials, cards, or provider payloads.
