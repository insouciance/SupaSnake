# SupaSnake Monetization Strategy

**Status:** Authoritative commercial product strategy within
[`PRODUCT_CONSTITUTION.md`](../PRODUCT_CONSTITUTION.md) v1.5. The Constitution
remains design law; this document turns §10 into a repository-grounded product,
packaging, and implementation plan. The historical
[`MONETIZATION_DESIGN.md`](./MONETIZATION_DESIGN.md) remains superseded and must
not be implemented.

**Decision date:** 2026-07-29

**Current commercial state:** operator production uses Stripe sandbox. There is
no live-money catalog and no one-time product currently fulfills a reward.

---

## 1. Executive assessment

SupaSnake can support a meaningful catalog, but its strongest business is not
selling power, attempts, or answers. Its durable commercial assets are the
player's snake, lineage, run history, public identity, clan belonging, and the
desire to patronize a game that treats those things honestly.

The strongest opportunities, in order, are:

1. **Patronage at launch:** one permanent Founding Keeper package for the first
   retained community. It is legible, bounded, and does not create recurring
   delivery debt before retention is known.
2. **Keeper after retention:** a low-priced supporter subscription built around
   permanent monthly cosmetics, cosmetic loadouts, archive presentation, and
   continuity. Lapsing never removes anything already received.
3. **A permanent Atelier:** direct-purchase modular cosmetics in the six
   identity slots already represented by the data model. Catalog depth, rather
   than catalog pressure, creates many legitimate purchases.
4. **Permanent Chronicle Seasons:** a real free lane plus a €4.99 cosmetic and
   narrative lane that never expires and grants late buyers retroactive credit.
5. **High-trust patron and clan commissions:** expensive, explicit cosmetic
   collections for enthusiasts, including a narrowly defined clan-owned visual
   commission only after clan population justifies its operating cost.

Three requested opportunities should be narrowed or rejected:

- **Do not sell advanced Workbench intelligence.** The existing Workbench is a
  first-party calculator for build order, reachability, Yield, offer share, and
  recommendations. Better simulation, comparison, or advice is planning
  information and can affect competitive Depth. All tactical accuracy and
  optimization must remain free. Keeper may sell archive presentation and
  organization around plans, never better answers.
- **Do not sell serious-clan workforce management.** Member performance reports,
  participation grading, recruitment scoring, officer tools, and scheduled
  accountability reports would turn a small clan from witness into workplace.
  The current system deliberately removed officers and teammate contribution
  detail. Core clan administration and battle facts stay free.
- **Do not sell gameplay scenarios.** Fixed-seed challenges, puzzles, Dynasty
  trials, and gauntlets can teach routes or builds and therefore create a paid
  practice advantage. They belong in free Training, Mastery, Signals, or
  Seasons. A paid product may theme or commemorate them, but may not gate the
  playable content.

This is not a narrow cosmetic shop. It is a deep, permanent catalog spread
across four constitutional product families: Keeper, Atelier, Chronicle Season,
and Patronage. Each item has one transparent real-money price, with no premium
currency, rotation, loot box, consumable, or purchase that changes a computed
gameplay or clan number.

---

## 2. What the repository already supports

### 2.1 Observed implementation

| Capability | Current state | Evidence and consequence |
|---|---|---|
| Recurring billing | **Partial** | [`premium.ts`](../../src/lib/stripe/premium.ts), migration 028, Checkout, Billing Portal, and the Stripe webhook implement one per-player subscription with idempotent event ordering. It is still named Premium and configured at €9.99/€89.99, not Keeper at the constitutional €3.99/€34.99. |
| Permanent cosmetics | **Usable substrate** | Migration 022 provides `cosmetic_definitions`, permanent `player_cosmetics`, and `player_loadout`; title, banner, badge, trail, board accent, and emblem are already modeled. |
| Monthly supporter drops | **Partial** | Migration 028 has premium cosmetic drops and permanent claims. Only a small initial drop pipeline exists; it is not yet enough inventory to promise an ongoing live subscription. |
| One-time catalog | **Intentionally empty** | [`products.ts`](../../src/lib/stripe/products.ts) constrains rewards to cosmetics but exports `ALL_PRODUCTS = []`. Migration 043 removed the old Energy/DNA/variant grant faucet. |
| Checkout safety | **Good foundation** | Registered accounts, deliberate consent to immediate digital delivery, Stripe Tax, server-side product lookup, and webhook signature checks exist. Invalid retired products fail closed. |
| Idempotency | **Good foundation** | `stripe_events` records processed webhook IDs; subscription updates are service-role-only and ordered. One-time entitlement fulfillment still needs an equally strict path. |
| Transaction history | **Legacy/partial** | `purchase_history` records the old product/reward model and refund/dispute state. It is not a general order, line-item, entitlement, gift, pass, or clan-ownership ledger. |
| Refund handling | **Partial** | Refunds and disputes are recorded, but permanent-entitlement reconciliation is not a complete automated contract. |
| Account ownership | **Good foundation** | Purchases require a registered Supabase identity; guest-to-account upgrade preserves the player identity, so web ownership can be restored across browsers. |
| Workbench | **Strong and free** | [`workbench.ts`](../../src/shared/game/workbench.ts) already performs deterministic, account-aware planning with the engine's real formulas. There is no persisted plan library, foldering, or version history. |
| Analytics | **Strong event substrate** | Consent-gated PostHog events and a purchase funnel exist. The current Premium Stats endpoint paywalls actionable run analytics, which conflicts with the constitutional ban on selling information and must be corrected before live commerce. |
| Clan ownership | **Not supported** | Entitlements are player-scoped. Clans cap at 12 and deliberately have only owner/member roles; the Energy Battle exposes a player's own best five and aggregate clan totals, not teammate evaluation data. |
| Gifting, passes, bundles, tier upgrades | **Not supported** | No generic entitlement graph, recipient claim, retroactive pass grant, owned-component credit, or pay-the-difference upgrade path exists. |
| Regional/cross-platform commerce | **Not supported** | The web launch is EUR/Stripe. There is no regional price book or native-platform receipt ingestion. This is acceptable for launch. |
| Data portability | **Incomplete for commerce** | The GDPR export includes legacy purchases and only 100 recent sessions; it omits subscriptions, cosmetics, entitlements, gifts, and pass ownership. |

### 2.2 Strategic inference

The code is closer to a trustworthy subscription and cosmetic foundation than
to a general commerce platform. Extending the old `purchase_history.rewards`
shape would recreate a reward faucet and make refunds, gifts, bundles, and clan
ownership ambiguous. The correct next step is a small generic entitlement
ledger, not a larger hard-coded product array.

The current cosmetic substrate is the commercial advantage. A theme can be a
parameterized recipe across existing slots rather than six bespoke art
pipelines. That lets one technical-art system produce both small Atelier items
and coherent high-value patron collections without changing the snake's
gameplay silhouette.

---

## 3. Product law and free-versus-paid boundaries

### 3.1 Binding product test

Every paid entitlement must pass all of these tests:

1. It changes appearance, continuity of presentation, collection, or declared
   patronage—not physics, economy, information quality, eligibility, or odds.
2. Its material outcome is fully visible before payment.
3. It is permanent unless it is the prospective delivery of a clearly labeled
   subscription; all delivered subscription goods remain permanent.
4. It cannot expire, rotate out, decay, or be confiscated because the player
   stopped paying.
5. It creates no commercial surface in-run or on Results, and at most one on
   any other screen.
6. It cannot improve Energy recovery/capacity, DNA, Yield, Score, Depth,
   generation, Genome access, Training, battle eligibility, matchmaking, or
   leaderboard standing.
7. It creates no paid authority over a clan member and reveals no teammate
   performance detail that the free clan contract withholds.

### 3.2 Recommended boundary

| System | Free forever | Legitimate paid layer |
|---|---|---|
| Immediate game | Every run, dynasty, control, physics rule, banking decision, Energy recovery and commitment | Cosmetic expression only; never an offer during a run or on Results |
| Genome and Workbench | Full calculations, comparison accuracy, simulations, recommendations, reachability, sharing/import/export, and enough saved active plans for normal use | Archive presentation: folders, tags, notes, historical versions, cosmetic plan cards, and longer retention. No higher-fidelity result, extra probability, faster compute, or exclusive recommendation |
| Run analytics | All actionable summaries, current bests, Dynasty comparison, Energy-efficiency data, and information needed to improve | Full archive retention, richer visual presentation, annotations, collection views, and export packaging—not exclusive conclusions |
| Replays | A useful recent window, PB/record replays, battle-contribution replays, and sharing needed for fair learning | Larger archive, folders, cosmetic overlays, showcase curation, and high-quality export presentation |
| Identity | Strong earned items in every slot, permanent Records, PBs, lineage, profile, clan identity, and share cards | Direct-purchase cosmetic variants, extra cosmetic loadouts, colorways, presentation themes, and patron marks |
| Progression | All Mastery, Lineage, Discovery, DNA sinks, genes, variants, challenges, and rewards | Cosmetic/narrative season lane only; paid completion never changes progression power |
| Clan | Found/join/leave, invite links, roster, moderation, heraldry baseline, Discord link, Energy Battle facts, own best five, aggregate totals, and share cards | At most a later clan-owned visual commission: heraldry expansion and presentation assets. No member analytics, officer tier, recruitment score, extra capacity, or battle benefit |
| Organization | Generous limits that support ordinary play; basic filters and sharing | Additional cosmetic loadouts, archival folders/tags/notes, profile showcases, and long-term curation |

**Required correction before live sale:** the current
`/api/premium/stats` endpoint makes per-Dynasty performance and extraction
efficiency Premium-only. Those are actionable gameplay facts. Make that insight
free, then let Keeper enhance archive depth and presentation around it.

---

## 4. Prioritized product catalog

### 4.1 Commercial launch — smallest meaningful release

#### P0. Founding Keeper — €24.99 one time [H]

**Contents:** a permanent founding mark, one coordinated six-slot-compatible
cosmetic theme, Chronicle recognition of the founding era, and an entitlement
to the first Chronicle Season when that product ships. Contents are named and
previewed individually before purchase.

**Why first:** it tests willingness to support the actual product without
creating a monthly content obligation or an empty storefront. It fits the
first-campus community and creates a high-signal cohort for interviews.

**Launch requirements:** generic player entitlement ledger; idempotent
one-time fulfillment; automated ownership restoration; refund/dispute policy;
GDPR export; permanent product page; full sandbox purchase/refund test; legal
copy; all promised cosmetics complete. Do not charge for a future-season
promise unless the entitlement and fulfillment contract already work.

**Explicit launch exclusions:** no live Premium subscription at its current
name/price, no Atelier filler catalog, no bundle, no pass, no gifts, no clan
purchase, no paid challenge, and no premium currency.

### 4.2 Shortly after launch — only after the retention gate

#### P1. Keeper — €3.99/month or €34.99/year [H]

- One named monthly cosmetic delivery, permanent once received.
- Keeper-since mark with honest tenure depth.
- Extra **cosmetic** loadouts.
- Full run/replay archive retention and richer Chronicle presentation.
- Dynasty colorways of variants the player already owns.
- Organizational presentation such as archive folders, tags, annotations, and
  profile showcases.
- Cancellation stops future deliveries only. Everything received remains.

Do not launch until at least three months of drops are complete and the
delivery calendar, failed-payment grace, cancellation, restoration, and lapse
copy pass sandbox QA. Subscription inventory debt is a product liability, not
just an art task.

#### P1. The Atelier — initial 6–12 permanent items

Direct EUR purchases from €1.99 to €6.99 [H]. Start with a deliberately small,
coherent collection across existing slots and add quietly each month. Nothing
rotates out, changes price as a pressure tactic, or appears beside an earnable
version of the same item.

#### P1. Gifting

Gift a complete catalog item to a registered handle or via a single-use invite
claim. The recipient sees the exact item before accepting. Add a fraud hold for
new/high-risk payments, block circular/self-gift abuse, make claims idempotent,
and define refund behavior before release. Never prompt for gifts inside clan
surfaces.

Wish lists can ship with gifting as a free profile/Shop organization feature:
the owner deliberately publishes exact permanent-catalog items, with no stock,
expiry, urgency, or notification pressure. Member welcome gifts use the same
ordinary gift path; a clan invite may carry one already-paid item, but the clan
screen does not solicit it. Event prizes should grant a named cosmetic through
an audited operator entitlement, never currency, randomized rewards, or battle
power. Clan wallets, pooled funding, group buys, tradeable gifts, and prize pots
are deferred because their fraud, chargeback, minor, ownership, and social-
pressure surface is disproportionate to launch value.

### 4.3 Later-stage systems

#### P2. Chronicle Season — €4.99 [H]

A permanent themed challenge track with a substantial free lane. It progresses
through ordinary play, never expires, can be completed years later, and grants
all already-earned paid-lane rewards when bought late. It contains only
cosmetics and narrative/Chronicle presentation. Paid ownership does not add
objectives, attempts, XP rates, genes, or power.

#### P2. Patron Packs — €19.99 / €49.99 / €99.99 examples [H]

At most three nested tiers per season. Each tier is a fully specified permanent
collection plus a patron mark. An owner upgrades by paying exactly the current
difference; the interface must not call that credit a discount. Packs remain in
the back catalog, are never discounted, and never contain earnable items.

#### P2. Clan Patron Commission — conditional

A one-time Patronage product, not a fifth SKU family. One purchaser grants a
permanent appearance package to a stable clan ID: expanded preset heraldry,
clan/profile/settlement-card treatment, and downloadable share/Discord assets.
The purchaser also receives a personal patron mark. The package stays with the
clan if the purchaser leaves; the personal mark stays with the purchaser if
the clan dissolves. Refund/dispute behavior must be stated in advance.

Ship only after enough real clans exist to validate demand and after a Rule 8
review. Do **not** ship multi-contributor funding, a clan wallet, recurring clan
billing, paid member slots, officer dashboards, member reports, participation
quotas, performance exports, recruitment scoring, or commercial prompts on the
clan screen.

#### P3. Earned shelf and creator presentation

Add a disjoint DNA-priced wardrobe for free players, plus bought frames around
earned contents, replay/clip presentation, and lineage colorway inheritance.
The same item is never both earned and purchased.

### 4.4 Products not recommended

| Proposal | Ruling | Reason |
|---|---|---|
| Paid advanced Workbench simulations/recommendations | **Reject** | Sells planning information and creates a competitive information gap |
| Paid fixed-seed challenges, puzzles, gauntlets, or campaigns | **Reject as paid content** | Can provide practice/build knowledge; ship gameplay free and sell only optional commemoration |
| Paid build slots with frustrating free limits | **Reject** | Manufactured organization friction can become a buildcraft advantage |
| Clan supporter analytics/admin subscription | **Reject** | Creates paid authority and workplace-like evaluation inside a small social witness |
| Energy, DNA, recovery, commitment boosts, revives, genes, variants | **Reject permanently** | Direct power/progression and explicit never-sold list |
| Store rotation, timed bundles, daily deals | **Reject permanently** | FOMO and operational churn without product fit |
| Premium currency | **Reject permanently** | Obscures prices and violates the one-currency cap |
| Ads, rewarded ads, and sponsored run mechanics | **Reject** | Interrupt immediate play and monetize attention/friction instead of attachment |
| Loot boxes or paid randomized rewards | **Reject now; amendment required later** | The current Constitution forbids randomness outright. Odds, duplicate protection, and hard pity would be minimum safeguards, not authorization |

---

## 5. Personal supporter structure

### 5.1 Founding Keeper

One permanent launch package, upgrade-independent from the recurring Keeper.
Owning it should be visible in Chronicle, profile, share card, and an optional
gameplay-safe treatment. It is not “lifetime Keeper” and grants no ongoing
subscription service beyond the explicitly included first Season entitlement.

### 5.2 Keeper subscription

Keeper should answer “I want to keep and arrange more of my history, express
myself in more places, and support continued development,” not “I need better
tools.”

Recommended free/Keeper shape:

| Capability | Free | Keeper |
|---|---|---|
| Tactical analytics | Complete actionable insight | Same conclusions |
| Records/PBs/lineage | Permanent | Permanent |
| Detailed run list | Useful recent window plus record and contributing runs | Full retained archive |
| Replay access | Useful recent window plus record/contribution preservation | Full retained archive and richer export presentation |
| Workbench | Full calculator, sharing, and generous active-plan allowance | Archive folders, tags, notes, history, and presentation |
| Cosmetic loadouts | At least one complete loadout | Additional complete loadouts |
| Monthly delivery | None | One permanent named cosmetic |
| Variant expression | Earned/bought cosmetics | Colorways for already-owned variants |
| Chronicle/profile | Complete identity and history | Richer layout and showcases, never exclusive facts |

The exact free archive window should be chosen after measuring storage cost and
normal revisitation, not to manufacture anxiety. Preserve every record and
socially consequential run even when it falls outside that window.

---

## 6. Clan supporter structure

The requested clan package contains two different ideas and only one fits.

**The good idea:** one purchase can fund a shared clan identity rather than
asking every member to subscribe. This supports belonging and makes a small
clan's public artifacts more distinctive.

**The harmful idea:** paid tools that let owners quantify, compare, recruit,
schedule, or pressure members. SupaSnake's clan is deliberately a witness, not
an employer. The current battle hides teammate fifth-best thresholds and
individual contribution details for that reason.

Therefore:

- Core clan creation, capacity, invites, moderation, Discord linking, battle
  information, aggregate history, and share assets remain free.
- There is no “Clan Supporter subscription” at launch.
- A later Clan Patron Commission is a one-time clan-owned visual entitlement
  under Patronage.
- One complete payment activates it for the clan. Do not build split payments
  or a clan wallet initially.
- Clan ownership is attached to immutable clan ID, not the payer's membership.
- The product can expand preset heraldry and public presentation, but never
  capacity, permissions, matchmaking, Energy, Score, Depth, rewards, member
  telemetry, or visibility into another member's private performance.
- Purchase discovery stays in Shop. The clan screen may render an already-owned
  theme but must not solicit payment.

---

## 7. Low-cost cosmetic production system

Use one **Theme Recipe** manifest to generate coordinated products across the
existing render/data slots. A recipe should contain palette, gradient,
line/particle behavior, material parameters, glyph family, motion profile, and
reduced-motion fallback. It should never alter collision geometry, target
silhouette, hazard language, or board contrast thresholds.

### 7.1 Immediately producible systems

1. **Palette and material colorways** — authored color ramps, roughness,
   emissive accents, and dynasty-compatible palettes on owned variants.
2. **Parameterized trails** — palette, width envelope, decay, noise, spark
   density, and reduced-motion equivalent. Geometry and opacity bounds remain
   gameplay-safe.
3. **Glyph libraries** — reusable Genome-derived symbol families for badges,
   emblems, block-adjacent identity art, and patron marks.
4. **Banner recipes** — gradients, procedural patterns, borders, and a central
   emblem. These scale cleanly across profile, leaderboard, clan, and share
   cards.
5. **Board accents** — controlled grid-edge, undertray, and ambient-particle
   palettes. Food, portal, snake head, blocked cells, and danger states retain
   their required contrast and shape.
6. **Title treatments** — typography color, frame, separator, and subtle motion
   presets; titles themselves remain readable text.
7. **Portal and banking flourishes** — arrival/departure particles and bank
   celebration treatments that do not conceal timing, exit shape, or hazards.
8. **Food presentation skins** — surface/material variations inside a fixed
   objective silhouette and luminance envelope. Never make paid food easier to
   see than free food.
9. **Result/share presentation** — frames, backgrounds, animated signatures,
   and clip outros that live around the result rather than interrupting it.

### 7.2 Product assembly

- A €1.99 item can expose one recipe component in one slot.
- A €3.99–€6.99 Atelier theme can coordinate two or three slots.
- A Keeper drop can be one focused component with a tenure-compatible variant.
- A Season can distribute a coherent recipe across free and paid lanes.
- A Patron Pack can combine the full recipe, bespoke patron mark, share assets,
  and lineage presentation without new gameplay code.

Build accessibility validation into the recipe schema: minimum contrast,
maximum particle density, reduced-motion behavior, color-vision checks, and a
competitive-safe fallback. Cosmetics should be visible in gameplay, profiles,
leaderboards, clans, settlement cards, Results, replays, and shares where those
surfaces already exist; visibility does not justify adding a new mandatory
surface.

---

## 8. Pricing and packaging principles

1. **Direct gross EUR prices.** No premium currency and no balance to strand.
2. **Permanent catalog.** Additions are monthly; products do not rotate or
   become scarce. Publication dates may be shown as history, not urgency.
3. **Stable price bands.** Suggested Atelier bands are €1.99 for a simple
   component, €3.99 for richer/animated expression, and €6.99 for a coordinated
   theme. Validate production value before refining exact allocation.
4. **One clear subscription.** Keeper at €3.99/month or €34.99/year [H], with
   plain gross-price and renewal terms. Grandfather existing paid terms if a
   future increase occurs; give at least 30 days' notice.
5. **Pay the difference.** Nested Patron tiers and bundles compute server-side
   owned-component credit so nobody buys the same component twice. This is an
   ownership adjustment, not a sale or countdown discount.
6. **Explicit contents.** Every bundle enumerates exact items. Never mix an
   earnable item with a money-only item, and never make an earnable cosmetic
   purchasable.
7. **No personalized pricing.** Regional price books may later map one product
   version to stable local gross prices. Do not vary by engagement, losses,
   wealth, spend, or inferred willingness.
8. **EUR-only launch.** Regional pricing is not necessary for the first
   commercial release; do not let it delay correct ownership/refund plumbing.
9. **No “value” theater.** Do not invent crossed-out component totals, anchor
   prices, percentage savings, or artificial urgency.

---

## 9. Commerce architecture and data requirements

### 9.1 Target model

Keep Stripe as payment processor but make Supabase the server-authoritative
ownership ledger. Recommended bounded schema:

- `commerce_products`: stable product key, constitutional archetype, state,
  copy/version, tax category, giftability, and publication date. No rotation
  deadline.
- `commerce_prices`: provider, environment, currency, gross amount, Stripe
  price ID, effective dates, and region. A product version never silently
  changes material contents.
- `commerce_product_components`: exact entitlement keys and quantities; only
  appearance, continuity, season ownership, or patronage types are permitted.
- `commerce_orders` and `commerce_order_lines`: player purchaser, provider
  session/payment IDs, consent/copy version, tax/amount/currency, recipient or
  clan subject, state, refund/dispute totals, and timestamps.
- `entitlements`: `subject_type` (`player` or later `clan`), subject ID,
  entitlement key/type, source order line, acquisition state, acquired time,
  and subscription access window where applicable. Permanent cosmetic grants
  also reference the entitlement source in `player_cosmetics`.
- `subscriptions`: evolve the existing premium row to Keeper without losing
  event history; resolve access through entitlements rather than a general
  `has_premium` boolean.
- `gift_claims`: sender, recipient handle/invite token, exact product version,
  claim/expiry-of-link state, fraud hold, and idempotency key. The purchased
  entitlement itself does not expire.
- `season_ownership` and `season_progress`: permanent product ownership
  separate from play-fed progress; late purchase grants all already-crossed
  paid rungs idempotently.
- `entitlement_adjustments`: append-only operator/refund/reconciliation audit,
  never a silent delete.

### 9.2 Required transaction behavior

- Checkout receives only a stable product/price version and optional validated
  recipient; price and contents resolve server-side.
- Webhook processing is insert-first, signature-checked, event-ordered,
  idempotent, and the only path that activates paid ownership.
- Order creation, payment transition, entitlement grant, bundle credit, and
  gift claim use unique keys and atomic transactions.
- A client cannot choose entitlement contents, amount, subject, or upgrade
  credit.
- Restore recomputes current ownership from the authenticated account and
  provider ledger; it does not trust local storage.
- Refunds/disputes transition orders and reconcile only the paid entitlement
  under a published policy. They never touch earned cosmetics, DNA,
  progression, Records, or unrelated Keeper deliveries.
- Cancellation and lapse stop prospective Keeper access/deliveries; they do
  not remove previously delivered cosmetics or permanent history.
- Clan entitlement purchase rechecks membership/authority at Checkout and
  attaches ownership to clan ID in the webhook transaction. Payer departure
  does not transfer it to another clan.
- GDPR export includes subscriptions, orders, line items, entitlements,
  cosmetics and sources, gifts, refunds/disputes, and season ownership. Account
  erasure preserves legally required accounting through existing anonymization
  rules.
- A future native client can ingest Apple/Google receipt events into the same
  order/entitlement ledger. Web ownership is canonical for launch; do not build
  unused multi-platform complexity now.

### 9.3 Enforcement in code

- Replace permissive reward payloads with an allow-listed `EntitlementKind`
  whose TypeScript and SQL constraints cannot express Energy, DNA, Yield,
  Score, Depth, variants, genes, attempts, or progression rates.
- Keep product definitions versioned and reviewed in source for launch; a
  remote admin catalog may come later, but may not bypass constitutional type
  checks.
- Add automated tests that scan all sellable components and fail if an earned
  cosmetic ID appears in a paid product or a gameplay-bearing field is added.
- Keep `hasPremium` only as a compatibility wrapper while surfaces migrate to
  named entitlements (`keeper_active`, `archive_full`, `loadout_extra`, and so
  on). Do not let one boolean become an undocumented privilege tier.
- Store commercial UI placement metadata nowhere. Rule 7 determines placement
  in code; a remote campaign tool must not be able to inject offers into run or
  Results.

### 9.4 Intentionally absent

No premium wallet, consumable balance, store rotation engine, randomized reward
service, offer-targeting engine, clan wallet, split tender, marketplace,
trading, resale, or creator revenue share is needed for the planned catalog.

---

## 10. Telemetry and decision gates

Measure commerce only after consent and only around deliberate commercial
actions:

- Shop visits entered by the player, product detail views, checkout starts,
  completed purchases, failures, cancellations, refunds, disputes, restores,
  gift sends/claims, and tier upgrades.
- Keeper conversion among retained players, tenure, lapse reason, delivery
  claim/use, retention by payer status, and archive/loadout usage.
- Atelier ownership and equip/showcase rates by recipe component—not “offer
  impressions” injected elsewhere.
- Season free-lane engagement, late-purchase retroactive grant rate, completion
  time, and abandonment without expiry pressure.
- Patron purchase satisfaction, refund rate, long-term use, and qualitative
  interviews.
- Monetization sentiment, support contacts, refund/cancel friction, and whether
  non-payers report feeling second-class.

Do not instrument “likelihood to pay,” frustration/loss triggers, whale
segments, individualized price elasticity, commercial prompts per session, or
revenue optimization tied to deaths and failed runs.

Release gates:

1. **Founding Keeper:** sandbox fulfillment/refund/restore perfect; all promised
   contents finished; legal/support ready.
2. **Keeper:** at least one self-sustaining launch clan, readable week-four
   retention, three months of completed drops, and free analytics boundary
   corrected.
3. **Atelier/gifting:** entitlement ledger stable in production; refund and gift
   fraud runbooks rehearsed.
4. **Season:** permanent progress and retroactive fulfillment proven on old and
   new accounts.
5. **Patron/Clan Commission:** retained enthusiasts or clans demonstrate demand;
   no new social-pressure or power complaint.

---

## 11. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Paid information becomes competitive advantage | Critical | Make all tactical analytics and Workbench accuracy free; audit current Premium Stats gate before live |
| Cosmetic visibility harms board readability | High | Theme recipe contrast/motion bounds, reduced-motion fallback, fixture checks at long snake/high density, no silhouette changes |
| Subscription overpromises recurring value | High | Delay Keeper until three months of inventory and delivery operations exist; lapse contract on purchase screen |
| Patron prices create “whale shop” perception | High | Label patronage honestly, permanent catalog, exact contents, no power, no pressure, publish development/support rationale, measure sentiment with refunds |
| Clan purchase creates authority or coercion | Critical | Appearance-only clan entitlement, no clan prompt, no performance data, no extra role/capacity; Rule 8 review before implementation |
| Entitlement/refund inconsistency | Critical | Generic append-only ledger, event idempotency, atomic grants, automated reconciliation and sandbox lifecycle tests |
| Gift fraud/chargebacks/minors | High | Registered purchaser, exact recipient, risk hold, rate limits, one-time claims, no wallets/trading, adult recurring consent and support procedure |
| Catalog scope overwhelms a solo developer | High | Recipe-driven cosmetics, 6–12-item first Atelier, one monthly addition cadence, no rotation, no bespoke paid gameplay |
| Legal exposure from randomized rewards | Critical | No paid RNG. Any future reconsideration requires constitutional amendment plus disclosed odds, duplicate protection, visible guarantee progress, and hard pity whose maximum attempts match the advertised rarity |
| Regional/cross-platform scope delays launch | Medium | EUR web launch first; stable region price books and provider adapters only when a real platform requires them |
| Free players feel deliberately constrained | High | Generous normal-use limits, strong earned items in every slot, all actionable information free, permanent free Records/PBs/lineage |
| Existing Premium state conflicts with strategy | High | Rename/reprice before live; remove false/inert claims; migrate identifiers and preserve any sandbox history without treating it as live ownership |

Two repository issues should be scheduled with commerce but are not silently
fixed by this strategy document:

- `/api/premium/stats` currently paywalls actionable gameplay information.
- The clan Discord route still contains legacy `officer` authorization language
  even though migration 048 removed the role. That is a clan contract cleanup,
  not a reason to reintroduce officers through a paid package.

---

## 12. Concrete implementation plan

### Release A — commercial correctness and Founding Keeper

1. Rename player-facing Premium to Keeper, remove false/inert perk claims, and
   correct the analytics boundary. Keep Stripe in sandbox.
2. Introduce the generic product/order/entitlement schema and an append-only
   audit path. Preserve and bridge existing subscription/event history.
3. Implement source-versioned Founding Keeper catalog data with exact contents,
   one-time Checkout, atomic webhook fulfillment, restore, refund/dispute
   reconciliation, and GDPR export.
4. Produce one coordinated theme using the existing cosmetic slots plus the
   permanent founding/Chronicle marks. Validate game visibility and reduced
   motion.
5. Add Shop ownership state, purchase detail, consent, completion, restore, and
   support surfaces. No commercial surface in run or Results.
6. Add unit, SQL integration, webhook replay/order, duplicate event,
   wrong-price, wrong-subject, refund, dispute, restore, deletion/export,
   accessibility, and end-to-end sandbox tests.
7. Run a complete test purchase and refund with the launch checklist. Only then
   switch the single Founding product to live mode.

This is the smallest commercially meaningful release: one honest product and
correct ownership infrastructure. A larger catalog before this foundation
would multiply liabilities, not revenue.

### Release B — Keeper and the first Atelier shelf

1. Migrate the subscription name and prices to Keeper; add named entitlement
   resolution and the explicit lapse contract.
2. Queue at least three monthly deliveries before sale.
3. Add full archive/presentation, extra cosmetic loadouts, and owned-variant
   colorways without changing actionable information.
4. Publish 6–12 permanent Atelier products generated from two or three theme
   recipes.
5. Add gifting only after order/refund operations are stable.

### Release C — permanent Seasons and Patronage depth

1. Implement permanent season ownership, free/paid lanes, retroactive grants,
   and no-expiry progress.
2. Fulfill the first Season entitlement already owned by Founding Keepers.
3. Add nested Patron Packs with server-side pay-the-difference upgrades.
4. Evaluate a Clan Patron Commission only after the population and Rule 8
   gates. Keep paid gameplay and clan management rejected.

---

## 13. Final direction

Build a **permanent patronage economy around the artifacts the game already
creates**: snakes, lineages, runs, histories, clan identity, and shareable
moments. Launch one Founding Keeper product on a correct entitlement ledger;
then earn the right to add Keeper, a permanent Atelier, and non-expiring
Chronicle Seasons.

Do not turn the Workbench into a premium calculator, clans into paid management
software, or Training into paid content. Those ideas would monetize the exact
mastery and belonging that make SupaSnake distinctive. The strongest overall
business direction is a broad permanent catalog with high patron depth and very
low pressure, not a broad set of monetized mechanics.
