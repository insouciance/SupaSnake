# SupaSnake Monetization Design — SUPERSEDED

> **SUPERSEDED 2026-07-25** by `docs/PRODUCT_CONSTITUTION.md` §10, with the ruling
> and its costs recorded in the Constitution's §15 Overturn Record (row 1) and the
> owner's sign-off given via the Constitution brief. **Do not implement from this
> document.** It is preserved unedited below as the historical record of the v1.0
> position (progression perks, energy SKUs, ~1.7× DNA guardrail) that the
> Constitution overturned.

**Status:** ~~LOCKED (v1.0, 2026-07-19)~~ — superseded as above. Historical text
follows.

---

## 1. Philosophy (locked)

1. **Never pay-to-win.** Leaderboards, clan duels, gauntlets and anomaly
   boards are pure skill surfaces. No purchase — one-time or recurring —
   may affect run physics, scoring, stats or matchmaking. Premium may
   accelerate *collection progression* (economy convenience), never
   *competitive power*.
2. **No paid RNG, ever.** Every purchase is deterministic: you always see
   exactly what you get before paying. Breeding RNG exists only in the
   free-currency loop. There are no loot boxes, paid eggs, gacha or paid
   odds-based mechanics of any kind.
3. **No ads.** SupaSnake ships and stays ad-free. Premium's value is
   quality-of-life, cosmetics, prestige and content — not the removal of
   friction we manufactured.

**Positioning:** monetize enthusiasm, never frustration. Players should
subscribe because they love the Lab and want to support it (Path of
Exile / Deep Rock ethos), structured like the offerings players demonstrably
consider fair: Fortnite Crew (pass included + monthly cosmetic + recurring
value) and the Arknights/Welkin "daily claim" card (small daily ritual,
obvious cumulative value).

### Regulatory posture (Austria/EU)

- The Austrian OGH (6 Ob 228/24h, Dec 2025) made loot-box legality a
  case-by-case test; the EU Digital Fairness Act is expected to restrict
  loot boxes for minors and mandate real-money price transparency, and
  PEGI now rates loot-box games 16+. **"No paid RNG" removes the entire
  category of risk** — nothing to disclose, no odds tables, no age-related
  loot restrictions.
- Prices are gross EUR incl. VAT everywhere (PAngG; Stripe Tax,
  tax-inclusive). No premium currency: real money buys concrete things at
  real prices — exactly the transparency the DFA is heading toward.
- Subscription = digital *service*: §10 FAGG service-start consent at
  checkout, §16 FAGG pro-rata refund on withdrawal, cancel-anytime via
  Settings → Stripe Customer Portal (EU easy cancellation).
- Game minimum age is 14 (Austrian GDPR Art. 8); **recurring billing is
  18+** (self-declaration at checkout; wording flagged for human legal
  review — see `src/shared/config/legal.ts` SUBSCRIPTION notes).

---

## 2. The catalog

| Offer | Price (gross EUR) | What it is |
|---|---|---|
| Energy Pack / Bundle / Vault | 0.99 / 2.49 / 4.99 | One-time energy (convenience; uncapped past max_energy) |
| Starter Bundle (Day 2+) | 2.99 | 20 energy + 1000 DNA + CYBER VORTEX (deterministic) |
| Dynasty Booster (Day 2+) | 9.99 | 50 energy + 3000 DNA + COSMIC SUPERNOVA (deterministic) |
| **SupaSnake Premium** | **9.99/month or 89.99/year** | The subscription (below) |

The free game stays complete: every variant is unlockable through play,
energy regenerates (1/20min), Free Play is unlimited, contracts pay
~800–1000 DNA/day, and the season track's free lane keeps its cosmetics,
reroll tokens and capstone title.

---

## 3. SupaSnake Premium — €9.99/mo · €89.99/yr (~2 months free)

One subscription, no tiers. Cancel anytime, effective at period end.
`past_due` keeps perks through a 7-day payment-retry grace window.
**Nothing already granted is ever revoked.**

### Perks (all server-enforced via `has_premium()`)

1. **Season Pass included** — the premium season track (cosmetics only,
   e.g. Season 1 "Gilded" line) while subscribed. Goodwill rule: a season
   entered premium stays claimable for that season after lapse
   (`player_battle_pass.is_premium`).
2. **Daily Lab Stipend** — +3 energy, one tap per UTC day (idempotent;
   uncapped like purchased energy). The Welkin-style ritual that makes
   the subscription feel alive daily. Delivered via the Welcome Back
   claim and the shop card.
3. **Triple Contracts** — pick 3 of 3 daily contracts instead of 2 of 3
   (~+400–500 DNA/day). Progression acceleration, not competitive power:
   leaderboards score runs, not wallets.
4. **Extended Lab Uptime** — offline DNA accrues 48h instead of 24h.
5. **Monthly exclusive cosmetic** — one supporter-only trail/emblem/banner
   per calendar month (`premium_cosmetic_drops`), delivered with the
   first stipend claim of the month. Cosmetic-only, never stats.
6. **Supporter prestige** — "Lab Patron" badge, "Patron Aurora" frame,
   crown flair beside the handle on every identity surface
   (`player_identity_view.is_premium`). Visible support, PoE-style.
7. **Lab Analytics** — the `/stats` dashboard: bank rate, per-dynasty
   performance, DNA income, personal bests over recent earned runs.
8. **Breeding queue 5 slots** (vs 3) — dormant until the breeding queue
   feature ships (breeding is instant today).

### Why this bundle

- **Value math a player can do:** the pass alone is €4.99/season; the
  stipend is ~90 energy/month (> the €4.99 Energy Vault ×3); plus the
  drop, contracts slot, analytics and flair. The subscription is plainly
  cheaper than buying its parts — without being required for anything.
- **Habit, not hostage:** every perk removes friction or adds prestige;
  none gates content. A lapsed subscriber loses nothing they earned and
  falls back to the complete free game.
- **Competitive integrity intact:** the multiplier stack
  (extraction × streak × set × duel) is untouched; premium touches
  faucet *access* (extra contract, stipend), not multipliers or physics.

### Economy guardrails

- Premium daily faucet delta ≈ +3 energy + 1 contract → roughly
  1.4–1.6× the F2P daily DNA baseline. Collection completion accelerates
  ~30–40%; it must never trivialize (no instant unlocks for money).
- Any future perk must pass all three §1 principles AND keep the
  premium/free DNA ratio under ~1.7× — beyond that, "convenience"
  becomes soft pay-to-progress pressure.

---

## 4. Lifecycle & trust rules

- **Server authority:** entitlement is derived (`has_premium()`) from the
  Stripe-mirrored `premium_subscriptions` row; every perk check is
  server-side; the client only renders.
- **Webhook discipline:** idempotent by event id (insert-first into
  `stripe_events`), ordered by `event.created` (out-of-order guard),
  non-2xx on failure so Stripe retries. One live subscription per player.
- **Cancellation:** always-visible button in Settings → Stripe Customer
  Portal. No retention dark patterns, no cancel-flow discounts at launch.
- **Refunds/disputes:** recorded + escalated for manual review; no
  automatic clawback of granted rewards.
- **Consent hygiene:** the two subscription consents (§10 FAGG + 18+) are
  active choices per visit, recorded in checkout metadata, never
  pre-ticked or persisted.

---

## 5. Future-proofing (framework, no redesign needed)

All of these ride existing primitives (deterministic products,
`cosmetic_definitions`, entitlements, checkout metadata):

- **Cosmetic shop:** direct EUR purchases of cosmetics (deterministic;
  `StoreProduct` + a cosmetic grant in `grant_purchase_rewards`).
  Founder/mastery/champion items stay unbuyable forever (022 §10.2).
- **Supporter packs:** PoE-style one-time bundles (badge tier + cosmetic
  set) for players who want to give more than €9.99/mo. No power.
- **Battle pass upsell:** the €4.99 one-off premium-track purchase for
  non-subscribers (tables already support it via
  `player_battle_pass.is_premium`).
- **Seasonal content:** each season ships a free lane + a Gilded lane +
  a monthly-drop line — the cadence Premium's value depends on.
- **Creator support:** creator codes in checkout metadata → revenue share.
- **Clan features:** cosmetic clan heraldry; never competitive research.
- **Gifting:** Stripe Checkout gifting of Premium months (EU consumer
  rules re-check needed).

**Explicitly out, permanently:** paid loot boxes/gacha, paid stat boosts,
paid multipliers, energy-gated *practice* (Free Play stays unlimited),
ads, premium currency obfuscation, FOMO countdown pricing.

---

## 6. Success measures (trust-first)

Watch, in order: (1) D30+ retention of subscribers vs matched free
players, (2) voluntary conversion after 2+ weeks of play (not day-1),
(3) churn with reasons, (4) refund/dispute rate (~0 expected),
(5) sentiment on the "never pay-to-win" promise. Revenue is the output,
not the target.

---

## 7. Implementation map

| Piece | Where |
|---|---|
| Schema + RPCs + entitlement | `supabase/migrations/028_premium_subscription.sql` |
| Perk constants (TS mirror) | `src/shared/config/premium.ts` |
| Plans / Stripe prices | `src/lib/stripe/premium.ts` (+ `.env.example`) |
| Checkout / portal / status / stipend / stats APIs | `src/app/api/premium/*` |
| Webhook lifecycle sync | `src/app/api/webhook/stripe/route.ts` |
| Perk enforcement | `pick_contracts` (028), `src/app/api/player/claim-offline`, `src/app/api/contracts` |
| Shop card / settings / flair / season track / stats UI | `PremiumSection`, `SubscriptionPanel`, `PlayerCard`, `SeasonTrack`, `src/app/stats` |
| Legal | `/legal/terms` §4a, `/legal/withdrawal` §3, `src/shared/config/legal.ts` |
| QA | `src/app/api/premium/migration.test.ts`, `e2e/premium.spec.ts`, `docs/game/QA_PREMIUM_BILLING.md` |
