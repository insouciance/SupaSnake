# SupaSnake — Program Plan (re-arranged 2026-08-06, owner-codified)

Supersedes the five-wave plan of 2026-08-05 evening. Wave 1 (rules train 03d185a)
and the INK & AMBER design release (59fb580) are LIVE. Wave 2 completes with the
in-flight train: #95 (mobile hotfix + governor floor) → deploy with migration 069
(24 flags, hash e60cd71e…d158017, snake-cosmetic-loadout contract, app-first order).

Engine Trust block (ET-0..5, docs/ENGINE_ARCHITECTURE_REVIEW.md) does not run as
its own program — it DISSOLVES into the waves below. Two findings drove the
re-arrangement: (1) CE-5 and ET-0 are one observability package; (2) rules bumps
degrade active runs until CE-6's rules-version pinning lands, so CE-6 MUST precede
ET-2's bump.

## Wave 3 — MEASUREMENT (start immediately after the Wave-2 deploy verifies)
One train, no rules, no migration (unless CE-5's dashboards want a table — avoid).
- CE-5: Sentry in engine/reducer/continuity (zero today), settlement-age/recovery
  dashboards, typed telemetry per rejection site
- Dilation measurement (server-side, per active segment, client-untrusted) — feeds
  the leaderboard-epoch ruling
- Governor tier telemetry surfacing (breadcrumbs → queryable)
- ET-0: input-to-effect latency histogram (?debug=input extension), death
  forensics log (α-at-last-input, distance, coyote-zone counter ≤60ms post-tick),
  tick-jitter overlay in ?perf
- Rider: #35 flaky player-evolution rail spec fix
THEN: **the unified data week** → one owner ruling session covering: difficulty
(rung-0), CYBER carry attribution + 1.72x Yield spread, decision latency,
dilation tolerance band (epoch policy), coyote window size (ET-2 input),
governor tier distribution (worker-migration trigger check).

## Wave 4 — FEEL (build lane; runs while concept lane awaits owner judgment)
- ET-1 arrival easing: front-loaded head arrival (α≈0.45 + settle), A/B on dev
  fixture, OWNER FEEL APPROVAL before production
- ET-3 React out of the hot path: dismantle per-tick syncState (~20 setStates,
  game/page.tsx:3392-3413) → interpolation buffer + transient store + leaf
  subscriptions; behavior-neutral; before/after jitter numbers; governor expected
  dormant afterward
- ET-4 rAF fixed-timestep accumulator (after ET-3; prior-art brief; sim-gate
  byte-identical journals under stalls; soak; 1-tick-per-frame catch-up cap,
  uniform slow-down beyond)
- Concept lane in parallel (dev server, owner judges): DROP redesign concept
  (one judgeable whole: F3/F5 geometry, DECLINE at candidate level, synergy
  highlights #30, LOCK-IN second tap, Split Bet confirm, frame+blur, foil
  verdict embedded); Workbench slot-first concept; Results restructure concept;
  camera surveyor session → owner quotes canonical parameters (ET-5 prep);
  NEON DYNASTY BOARD THEMES concept (owner directive 2026-08-06: three neon
  identities on one geometry/groove system — cyan→CYBER, sol-orange→PRIMAL,
  dark-neon→COSMIC proposed; supersedes stone-slab material story for the
  board; VOID naming forbidden; readability absolute; production ships in
  Wave 6 alongside the camera if approved)

## Wave 5 — RULES & INTEGRITY (the one rules train, made safe by its own order)
- CE-6 FIRST (migration 070 + rollout contract): rules-version pinning for open
  runs (FM-12 — open runs replay under start version across bumps), quarantine
  operator exit, expire_stale terminal-with-facts race, clan RPC anon guard,
  player_ladders grant gap, strandedTerminalRun.ts:6 comment
- THEN ET-2 coyote tick: min(40ms, 0.25·tick) fatal-boundary grace (window
  ratified from Wave-3 data), journaled + replay-validated, sim-gate suite,
  SNAKE_RULES_VERSION bump — now painless for active runs thanks to CE-6
- Same Constitution session: D3 REPLAY-routing amendment ruling (§5/§12.2) and
  ET-2's §13-style row

## Wave 6 — DECISION SURFACES (ships the owner's judgments)
- DROP redesign production (approved concept, lands on post-ET-3 page)
- ET-5 canonical camera — RATIFIED 2026-08-07: az=+0.0 pitch=28.0 fit=1.00
  target=+0.0,+0.0 fov=44 (far/near 0.68; owner chose with the meter visible —
  informed trade vs the 0.70 old-camera reference; revisit only on far-row
  death-forensics evidence). Production: pin constants, four-wall sim fairness
  gate, OrbitControls removed from live board, viewpoint recorded
  Constitution-side; free camera stays replays/chamber

## Wave 7 — B-LANE SURFACES (inherits everything)
- Workbench slot-first production; Results restructure (Score → Victory Lap →
  payout facts → actions; cuts per 2026-08-05 triage; barcode stays); Daily Take
  → floating home element (D2); Codex/Workbench rune restyle + floating "i"
- 90s grammar folds in per the consequential audit (Results/Workbench/runes/
  Daily-Take-token styling ride these WPs, not separate ones)

## DESIGN PRODUCTION LANE — the 90s program (owner pre-approved 2026-08-07)
Authority: docs/design/SNAKE_CHARACTER_STYLE_GUIDE.md (character law),
docs/design/NINETIES_STYLE_CONSEQUENTIAL_REDESIGN.md (106-surface audit, WP
catalog 90S-0..10+H, 12 tensions), concept branch concept/board-neon-themes @
9f63939 (round-3 final, all gates green — THE ratified composition; production
= port at quality, not re-design). Runs as the B-lane parallel to Waves 4-5
engine work. Order (visibility × IP, audit-derived, sequencing-corrected):
1. **90S-T Ruling batch** (S): the audit's 12 tensions to the owner in one
   session with recommendations (T-2 purple = logo-only; T-4 keep focus-blur;
   T-3 promote line-free-fields to law; …). Gates items that depend on rulings;
   nothing else blocks on it.
2. **ET-5 camera production** — **LANDED** `e2a49b4` (PR #98, 2026-08-07):
   pinned az0/pitch28/fit1.00/fov44, four-wall fairness gate, OrbitControls off
   the live board. It had to precede board-adjacent art and it did — the
   composition's groove depth, inter-cube gap and ink weight are all
   framing-dependent reads, and they are now judged at the angle the game is
   actually played at.
3. **90S-A The Composition** (L, IN BUILD): port concept/board-neon-themes to production
   + **90S-B The HUD Skin** (M, owner directive 2026-08-07): visual-only 90s
   rework of the cockpit HUD (trays/chips/gauges — chunky ink, cel fills,
   T-ruling grammar; zero behavior change), stacked on 90S-A's branch,
   SAME DEPLOY TRAIN — the game screen ships coherent within one viewport.
   — snake (cube law, face-keyed tones, cosmetics restyle, head-facing),
   board (carved panels, themes, line-free seams), tray-frame removal,
   chamber continuity. The LF-A of this program.
   90S-A's own state: PR against main on `feat/90s-a-composition`, gated by
   `NEXT_PUBLIC_NINETIES_COMPOSITION` — manifest 24 → 25 flags, hash
   `127f659c…e93d4a`, NO migration, and the `rollback` e2e leg builds and runs
   the INK & AMBER board so the off path is tested rather than inferred. Two
   things it deliberately does NOT carry, both recorded in code: the guide's
   shades and braids stay `default_owned` but UNEQUIPPED (the concept
   auto-equipped them so the character could be reviewed; equipping them for a
   player who has not chosen them writes to `player_loadout`, which is a
   migration and its own owner decision), and the non-instanced `SnakeModel`
   path still mounts no cosmetics — which is why the round-3 sparse-snake shots
   show a bare head and why this port's do too. Both belong to 90S-10.
4. **90S-1 The Mark** (M/L): REBUILD the logo as an original production
   vector (owner 2026-08-07: LOGO.jpg is the MODEL, never the asset — "you
   certainly shouldn't implement that JPG") — chunky comic letterforms,
   yellow→orange gradient, purple burst as drawn polygon; whole icon family
   (hero/favicon/PWA-maskable/og/notification) derives from the rebuilt SVG;
   simplified small-mark variant if the burst muds below ~64px (owner
   reviews); home hero at the locked size/position; side-by-side
   rebuild-vs-model comparison for owner fidelity judgment.
5. **90S-10 Cosmetic Renderer & Atelier** (L): the invisible-identity fix —
   trail/board_accent/emblem slots get renderers, badges read their glyph.
   PLUS default-equip migration for the guide shades/braids (owner agreed
   2026-08-07: 90S-A ships with bare-head default; the equip default is this
   package's migration) —
   Highest commercial value in the audit; pairs with runway mode (#42) and
   supporter-item seeding when the owner calls them.
6. **90S-2 Chrome Law** (L) → **90S-4 Pickups** (M) → **90S-3 Extraction** (L)
   → 90S-5 Instruments → 90S-7 Effects → 90S-8 Room → 90S-6 Collection →
   90S-9 Outward Artifacts → 90S-H Housekeeping — per audit order; DROP
   styling stays inside Wave 6's redesign, Results/Workbench inside Wave 7.
Every WP: concept-fidelity check against round-3 screenshots, doctrine gates,
release records. Deploy trains as packages complete (owner's standing goal:
all waves to production).

## Parked (owner's word to start)
Gene-boost audit (#10) · supporter-item seeding (Atelier grant path) · org
transfer · engine-in-worker (trigger: tier telemetry) · checkpoint trust
boundary · repo-weight cleanup (~71MB, rides any train) · leaderboard-epoch
ruling (after data week) · lab collection cards · per-Dynasty art inflection ·
A′/D1 Side Door follow-up

## Standing constraints
Deterministic core untouched except ET-2's journaled rule; deploys only from
main via the gated workflow with exact-filename expected_migrations; concept-first
for anything the owner judges visually; doctrine prior-art gate on system-shaped
WPs; release record per deploy; exit-code discipline everywhere.
