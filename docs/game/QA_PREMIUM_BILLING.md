# QA — SupaSnake Premium billing lifecycle (Stripe test clocks)

Manual playtest script for the subscription lifecycle that cannot run in
CI e2e (it needs Stripe test-mode time travel). Run against a deploy with
`STRIPE_SECRET_KEY` (test mode), the webhook endpoint registered for:
`checkout.session.completed`, `customer.subscription.created/updated/deleted`,
`invoice.paid`, `invoice.payment_failed`, and migration 028 applied.

Reference: `docs/game/MONETIZATION_DESIGN.md` (LOCKED),
`supabase/migrations/028_premium_subscription.sql`.

## Setup

1. Stripe Dashboard (test mode) → create a **test clock**, then a customer
   on that clock with card `4242 4242 4242 4242`.
2. Register a fresh (non-anonymous) SupaSnake account; note `players.id`.
3. Manually attach the test-clock customer id to the player row
   (`players.stripe_customer_id`) OR subscribe through the UI first and
   note the created customer (test clocks then need the API flow —
   `stripe subscriptions create -c <cus> -p <price>` on the clock).

## Stage 1 — Subscribe (UI happy path)

- [ ] `/shop` → Premium section shows €9.99/month incl. VAT, yearly toggle
      shows €89.99 + "2 months free".
- [ ] Subscribe is blocked until BOTH boxes are ticked (§10 FAGG service
      start + 18+). Error text names the missing consents.
- [ ] Complete Stripe Checkout (4242 card). Redirect lands on
      `/shop?premium=success…` with the welcome banner.
- [ ] DB: `premium_subscriptions` row `status=active`, correct
      `billing_interval`, `current_period_end` ≈ +1 month;
      `players.stripe_customer_id` set; `stripe_events` has the
      checkout + subscription events, each `processed_at` set.
- [ ] Supporter badge + Patron Aurora banner appear in `player_cosmetics`;
      the crown flair renders next to the handle (PlayerCard, leaderboard).
- [ ] `player_battle_pass.is_premium = true` for the active season; the
      season track shows the Gilded (premium) tiers claimable at reached
      levels.

## Stage 2 — Perks

- [ ] `/shop` premium card: "Claim daily +3 energy" grants +3 (may exceed
      max_energy), button flips to "Daily stipend claimed". Second claim
      attempt (other tab / API) → 409 `already_claimed`.
- [ ] First stipend of the month also delivers the monthly cosmetic
      (`premium_drop_claims` row + inventory).
- [ ] Contracts board offers picking all 3 contracts; a 3rd pick succeeds
      (free account control: limit stays 2).
- [ ] `/stats` renders the dashboard (free account control: locked
      preview + shop link).
- [ ] `economy_transactions` has `premium_stipend` rows with correct
      `balance_after`.

## Stage 3 — Renewal (test clock +1 month)

- [ ] Advance the clock ~32 days. `invoice.paid` +
      `customer.subscription.updated` arrive; `current_period_end`
      advances; entitlement stays on; no duplicate cosmetic grants.

## Stage 4 — Payment failure + grace (past_due)

- [ ] Swap the card for `4000 0000 0000 0341` (attaches, then fails), then
      advance the clock past renewal.
- [ ] `invoice.payment_failed` recorded in `stripe_events` + Sentry
      warning; subscription → `past_due`.
- [ ] Entitlement REMAINS for 7 days past `current_period_end`
      (`has_premium()` grace) — stipend still claimable; settings shows
      the "payment issue" hint.
- [ ] Advance beyond the grace window / let Smart Retries exhaust →
      subscription → `canceled`/`unpaid`; perks stop (stipend 403, picks
      back to 2, stats locked) — but cosmetics and claimed season tiers
      REMAIN (never-revoke covenant).

## Stage 5 — Cancellation (EU easy cancellation)

- [ ] Settings → Subscription → "Manage / cancel subscription" opens the
      Stripe portal; cancel at period end.
- [ ] `cancel_at_period_end=true` mirrored in DB; UI shows "ends <date>";
      perks run to period end, then lapse.
- [ ] Season lock-in: premium tiers CLAIMED this season stay claimed, and
      if the season was entered premium, remaining premium tiers of THIS
      season stay claimable after lapse (`player_battle_pass.is_premium`).

## Stage 6 — Withdrawal / refund path

- [ ] Refund the first invoice in the Dashboard → `charge.refunded` is
      recorded + Sentry escalation (manual review, no auto-clawback).
- [ ] Pro-rata handling per `/legal/withdrawal` §3 is a manual support
      action at launch — verify the page text matches the flow.

## Regression guards

- [ ] One-time energy pack purchase still works end-to-end (mode=payment
      path untouched) and grants exactly once on webhook retry.
- [ ] Replay a subscription webhook event (Stripe "resend") →
      `already_processed`, no state change.
- [ ] Deliver an older subscription event after a newer one (resend the
      creation event) → `stale_event`, no state regression.
