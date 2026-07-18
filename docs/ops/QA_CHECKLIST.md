# QA Checklist (for Josef)

# 🎮 THE PLAYTEST — Design v2 Phases 1+2 (prod is FROZEN for your session)

No deploys will happen while you test. Say "done testing" and Phase 3 ships.
Design rationale: docs/game/GAME_DESIGN_V2.md · Play at https://supasnake.com

## The Player Journey (your testing lens)

Test as the player, stage by stage. At each stage ask: what do I FEEL —
and is it what we intend? Rate each stage 1-5 for feel and note anything
that breaks the spell.

| Stage | When | Intended feeling |
|---|---|---|
| 1. First Contact | 0-30s | "This is a real game, not a website." Awe-lite. |
| 2. First Run | 1-5min | "I get it — and I want to be better at it." |
| 3. The Fork | 5-20min | "This dynasty is MINE." Identity forming. |
| 4. The Build | every run | Anticipation: "what will THIS run become?" |
| 5. The Ritual | daily | Purposeful return — goals, not chores. |
| 6. The Investment | multi-day | Roots: collection, streak, (soon) clan+traits. |
| 7. The Season | weekly | "This week is DIFFERENT." Rhythm + spectacle. |

---

## Stage 1 — First Contact (fresh eyes: use an incognito window)

- [ ] supasnake.com loads into the Specimen Chamber: your snake, coiled,
      breathing, eyes visible, FULLY in frame (try narrow window too)
- [ ] Entrance choreography: chamber fades in → wordmark → counters →
      mission line → LAUNCH rises last with a glow pulse
- [ ] One obvious action (LAUNCH); icon rail right edge (desktop) with
      hover labels; account chip shows GUEST
- [ ] Consent banner appears once, feels native (not a cookie-law slab);
      Reject All works and persists
- [ ] Starter selection: three dynasty cards (procedural art + ruleset
      identity line), pick one → confirm → you land in the game
- FEEL: does the first 30 seconds say "premium game"? What's the weakest
  element on the screen?

## Stage 2 — First Run (desktop, keyboard)

- [ ] Pre-game overlay: equipped snake + Gen, one-line ruleset explainer,
      aim-system chips (locked ones show unlock hints), EARN|FREE toggle
      (EARN shows ⚡1), FLICK|D-PAD hidden on desktop, camera hint
- [ ] Arrow keys/WASD move; **rapid S-turn test**: while moving right, tap
      UP then LEFT as fast as you can — BOTH turns must execute on
      consecutive cells (this is the buffered-input skill mechanic)
- [ ] Camera: starts 70° above, aligned to a board side; drag to rotate →
      releases SNAP magnetically to the next side; zoom is clamped; whole
      board always fits; reset button (bottom-right) restores default
- [ ] The arena sits IN the world (void/glow family), not pasted on it;
      food is a clean emissive block (no rings/beams)
- [ ] HUD: score, DNA counter ticking per food, energy, and the BANK chip
      showing live "bank +25% / crash 60%" values
- [ ] Die on purpose: death sequence → CRASHED screen shows salvaged 60%,
      streak line, Play Again / Lab / Home all present and clickable
- FEEL: is death fair? Do you immediately want another run?

## Stage 3 — The Fork (dynasty identity; needs ~500 DNA for the 2nd dynasty)

- [ ] Play your starter dynasty 2-3 earning runs, bank at least one via
      the portal (first portal ~15 foods; it pulses before vanishing)
- [ ] EXTRACTED screen: +25% framing feels like a win; DNA lands on the
      home counter afterwards
- [ ] Earn ~500 DNA → Lab → unlock a common of the OTHER dynasty → equip
      → the game page theme + snake change to match
- [ ] **PRIMAL**: constant speed; watch per-food DNA grow (the counter
      accelerates in value late-run) — long runs feel compounding?
- [ ] **CYBER**: speed visibly ramps ~every 5 foods with the multiplier —
      is tier 3-4 genuinely scary AND worth it?
- [ ] The push-or-bank moment: at a juicy total with the portal on board —
      do you actually hesitate? (That hesitation is the design working.)
- FEEL: after both, do you have a favorite? Could you describe each
  dynasty's personality in one word?

## Stage 4 — The Build (mutations; every run)

- [ ] ~Every 20 foods a violet double-helix appears (distinct from food,
      despawns with urgency flicker)
- [ ] Eating it HOLDS the game with a choice-of-2 overlay: readable icon +
      name + one-line effect/cost; pick via 1/2 keys or tap; Esc declines
- [ ] Held mutations show as HUD chips (hover for tooltips); game-over
      lists your build
- [ ] Try across runs: Gold Trail (your tail becomes pickups — chase
      yourself), Phoenix (survive one death — chips dim when spent),
      Time Dilation (slower but cheaper food), Magnet (nearby food pulls),
      Mirror Wager (bank ×1.5 / crash ×0.3 — pure nerve), Overgrowth,
      Shed, Wall Rush (wall-slide!), Splitter, Compound Interest
- [ ] Bank chip updates with mutation economics (Wager/Hoarder-style
      shifts visible before you commit)
- FEEL: is the choice moment the best 3 seconds of the run? Any mutation
  that's always-take or never-take (balance flags)? Do two consecutive
  runs feel like different stories?

## Stage 5 — The Ritual (contracts + energy + free play)

- [ ] Contracts board opens (auto once/day, or via the mission line):
      3 offers, pick 2 (e.g. "Banker: bank 3 extractions", "Deep Run",
      "Nerve: pass 3 portals, bank the 4th")
- [ ] Progress bars advance from real runs; completed → claim → DNA/energy
      visibly credited
- [ ] Mission line rotates: contracts state / next-goal / streak; beacon
      dot when claimable; tapping opens the board
- [ ] Burn your energy to 0 → the wall is an INVITATION: "keep practicing
      in Free Play or wait M:SS"
- [ ] FREE PLAY: no energy consumed, watermark chip in HUD, game-over says
      "Practice Run — would have banked X", Play Again is free
- FEEL: do contracts make you play DIFFERENTLY (that's their job)? Does
  free play remove the resentment of the energy wall?

## Stage 6 — The Investment (multi-day systems, current state)

- [ ] Streak line correct (day N); tomorrow it increments
- [ ] Collection: unlock progress, set-bonus hint, rarity card treatments
      (legendary pulses gold), unlock shimmer moment
- [ ] Breeding: two same-dynasty snakes → offspring reveal (Gen prestige
      only — confirm NO stat % anywhere)
- [ ] Clan: create/join → THIS WEEK'S DUEL card (opponent, live scores,
      countdown) — number-comparison v1; the Gauntlet lands in Phase 4
- [ ] Account: GUEST chip → save progress → instant account ("Progress
      Saved!"), chip becomes your avatar; sign out/in keeps everything
- FEEL: is there always a visible "next thing worth wanting"?

## Stage 7 — The Season (weekly anomaly + season track + playoffs)

- [ ] Pre-game overlay: an ANOMALY chip sits between EARN and FREE PLAY
      (only after migration 021 + Monday 2026-07-20); selecting it opens
      the board panel — this week's modifier (name + one-line effect),
      rotation countdown, your best, top 10
- [ ] Run the anomaly (costs 1⚡ like EARN): the HUD shows an
      "ANOMALY · <name>" chip; the modifier is FELT —
      **Meteor Shower**: food burns up after ~60 ticks and respawns,
      **Gold Rush**: DNA counter runs visibly hotter but portals are rarer,
      **Blackout**: the world fades to void beyond ~6 cells of your head,
      **Twin Exits**: two portals share one window, bank line reads +15%
- [ ] Bank one: normal DNA lands (streak/contracts count), and your score
      appears on the anomaly board (pre-game panel + the leaderboard
      page's ANOMALY tab) — but NOT on the weekly dynasty boards
- [ ] "Anomaly Tourist" contract: pick it on the contracts board, finish
      one anomaly run (bank or crash), claim 400 DNA + 150 season XP
- [ ] Season track: the home mission line rotates "Season 1 — Solstice ·
      week N" (beacon when a milestone is ready) → tapping opens the track:
      level/XP bar fed by contract claims, milestones claim cosmetics +
      trait-reroll tokens (token count visibly increments; spend one in
      the Lab reroll flow to close the loop)
- [ ] Seasonal mutations: Solstice Engine / Glacial Reserve / Midnight
      Oil appear in mutation offers (any mode) — do they read as offers
      with costs, per the house grammar?
- [ ] Clan page (playoff weeks — season weeks 6-7): the Season Playoffs
      panel shows the top-8 bracket (seeds, live scores, winner glow);
      week 7 is the championship week — two semifinals, champion = the
      higher-scoring winner; afterwards the champions banner persists
- [ ] Gauntlet war room: Anomaly Doctrine is now PICKABLE once
      protocols_1 is researched (was "coming with Seasons") — picking it
      counts anomaly runs ×1.20 in the duel score
- FEEL: does Monday feel like a fresh event? Is the anomaly a reason to
  come back mid-week, and the track a reason to keep contracts daily?

## Stage 8 — The Name (identity: handles, cards, cosmetics — needs migration 022)

- [ ] Fresh guest (incognito): bank one run — the game-over screen shows
      YOUR Player Card with a muted `handler-NNNN` name and offers the
      claim: "That run deserves a name on it." Dismiss it twice — it
      stops asking (settings still offers it)
- [ ] Claim a handle: type as you go — the availability line answers live
      (green Available / red reason). Try a TAKEN one (make a second
      account claim `Souci` first), a RESERVED one (`admin`,
      `supasnake`, `Handler`), and leet-disguised profanity
      (`5h17head`) — each rejected with precise copy, never a generic
      error
- [ ] Claim a clean one → toast "You are <name> now"; the card on
      game-over, the leaderboard rows, and clan contributor lists all
      show it (no more `Player 3f2a1b` / `Anonymous` anywhere you can
      reach)
- [ ] Try changing it immediately (settings → Identity → Change handle):
      the 30-day cooldown message shows the next-change date — first
      claim was free, changes wait
- [ ] Settings → Identity: your full card (snake portrait avatar in a
      dynasty frame — the frame upgrades with that dynasty's mastery),
      equip grid: claim a season-track cosmetic, equip the title /
      banner / a badge — the card updates instantly; badges cap at 3
      WORN (a 4th asks you to unequip one)
- [ ] Empty slots read as invitations ("Your first emblem lands at
      mastery M1"), never as zeros or empty grids
- [ ] Founder check: your pre-Season-1 account shows the gold ring on the
      avatar + "Founding Handler" badge in inventory; a fresh account
      created today has NEITHER (it can never be earned again)
- [ ] Leaderboard: rows are identity rows — avatar chip, handle, dimmed
      title, [TAG], top badge; unclaimed players read as muted
      handler-NNNN
- [ ] Gauntlet scouting (clan page, during a duel week): the opponent
      roster renders as identity rows with mastery pips — do you get a
      read on WHO you're facing, not just numbers?
- [ ] Upgrade flow: guest → create account → the success screen offers
      "Claim your handle" — claim from right there
- FEEL: after claiming, does the game feel like it knows YOU? Would you
  recognize a rival's name next week?

## 📱 Mobile pass (repeat the spine of Stages 1-5 on your phone)

- [ ] Chamber + board fully in frame portrait; bottom rail reachable;
      no overlay pile-ups (one modal at a time)
- [ ] **Flick controls**: flick anywhere — cyan edge pulse = queued, rose
      = rejected; chained flicks without lifting; same-direction U-turn =
      flick, tiny stall, flick again; queued-arrows chip shows your buffer
- [ ] FLICK|D-PAD toggle works; D-pad fully on screen incl. DOWN
- [ ] Add ?debug=input to the game URL: overlay shows recognized flicks,
      queue, rejections + reasons, timings
- FEEL: can you IMAGINE getting good at flick? (26px threshold and 90ms
  stall are tunable — say faster/slower.)

## Cross-cutting vibe checks

- [ ] Audio: synth SFX for collect/death/click/breeding — right volume?
      annoying after 10 runs?
- [ ] Palette: cyan/blue-grey world coherent everywhere? CYBER dynasty
      cyan vs UI accent cyan — muddled or fine?
- [ ] Any screen that still smells like a website?
- [ ] Any dead end (a screen you couldn't leave without browser-back)?

---
_Report anything as loose notes — I'll translate into fixes/tuning._


Living document — I keep this updated as work lands. Items marked ⚠️ are
things only you can do; everything else is my verification backlog that
you can spot-check when back.

_Last updated: 2026-07-16 (afternoon)_

## ⚠️ Needs you (blockers for 100% completion)

- [x] **Resend: DONE** (2026-07-17) — supasnake.com verified in Resend (EU),
      Supabase SMTP configured via Management API (smtp.resend.com, sender
      noreply@supasnake.com), test password-reset email DELIVERED to
      bllj@pm.me. Decision still open: instant account creation stays ON
      (recommended) vs re-enabling confirmation emails now that delivery
      works — say the word to flip it.
- [ ] **supasnake.io (IONOS)**: either point its nameservers at Vercel
      (ns1.vercel-dns.com / ns2.vercel-dns.com) so I can manage it, or set an
      IONOS redirect supasnake.io → supasnake.com. Not launch-blocking.
- [ ] **supasnake.com renewal**: expires Aug 28, 2026 — confirm auto-renew is
      on in Vercel → Domains.
- [ ] **Supabase Pro decision**: free tier auto-pauses after ~1 week idle
      (likely cause of the historical "lost progress"). Before real players:
      upgrade to Pro ($25/mo) or accept the pause risk during soft launch.
- [ ] **Sentry token hygiene** (optional): the user token you pasted works; if
      you want, rotate it and I'll swap in a scoped org token.

## 🎮 Play-test when you're back (production: https://supasnake.com)

- [ ] Visual smoke of the 3D game: three r185 + Bloom (desktop) — colors,
      glow, no artifacts; 60fps feel on your machine
- [ ] New-player flow: anonymous start → starter selection → play → DNA
      earned → unlock a 500-DNA variant in the Lab → equip it → play again
      (theme/stats follow the equipped snake)
- [ ] Breeding: two same-dynasty snakes → breed → Gen 2 offspring appears,
      DNA deducted (300 for two Gen-1 parents)
- [ ] Daily reward modal appears on Day 2 + streak counter increments
      (I'll have DB date-nudge instructions ready for same-day testing)
- [ ] Shop test purchase with Stripe test card 4242 4242 4242 4242 (sandbox):
      energy credited after checkout, purchase visible in Stripe dashboard
- [ ] Consent banner: reject → no PostHog requests in devtools Network tab;
      accept → events flow (check PostHog Live Events)
- [ ] Account upgrade prompt: anonymous → attach email → sign out → sign in →
      progress intact. Also: anonymous users see "Save your progress" banner;
      shop Buy buttons become "Create an account to purchase" while anonymous
- [ ] Reward outbox: kill the tab exactly at death → reopen → run's DNA
      credited on next load (replay); re-submitting an ended session gets 409,
      no double DNA
- [ ] Welcome-back gate: sign in with email → clear site data → revisit →
      "Welcome back — sign in to restore progress" appears instead of a
      silent fresh anonymous account
- [ ] Sentry: wired (instrumentation + global error boundary + sourcemaps).
      Check https://modusopus.sentry.io → project supasnake receives events
      after the next prod deploy (trigger: any console error page / I'll
      verify server-side too)
- [ ] Purchase path: sandbox checkout with 4242... card → energy/DNA granted
      exactly once (idempotent webhook), purchase_history row exists; refund
      in Stripe dashboard → recorded + Sentry alert (no auto-clawback)

## 📱 Mobile fixes to verify on your phone (deployed)

- [ ] Full gameboard visible and centered in portrait (camera now fits the
      board to the aspect ratio)
- [ ] D-pad DOWN button reachable and clickable (dynamic viewport height +
      safe-area inset — was hidden behind browser chrome)
- [ ] No page scroll-bounce during play

## 🎨 UI design rework (DEPLOYED — review on prod)

Direction: "the UI is the game's world" — the game scene's void/glow/motion
language + the original styleguide's arcade identity, unified across every
screen. What shipped: design token system (dynasty/rarity colors, glow
scale, motion keyframes), next/font loading, SVG icon set (all emoji gone),
mascot hero on home/auth, SUPASNAKE branding, reunified Lab with
rarity-escalating card glow + unlock shimmer, restaged breeding reveal,
glowing game overlays/HUD, podium leaderboard, native-feeling consent/age
surfaces, staggered entrance motion everywhere, reduced-motion support.

- [ ] Walk every screen on desktop + phone; note anything to push further
      (more/less glow, spacing, copy tone, celebration intensity)
- [ ] Home first impression: does it pass the "this feels different" test?

## 🌌 THE BIG ONE — game-menu experience (deploying now)

Judge on desktop AND phone at supasnake.com:

- [ ] **The Specimen Chamber**: landing is now a live 3D scene — YOUR equipped
      snake as the hero character (undulating, dynasty-lit, camera drift).
      Framing/lighting knobs are named constants in SpecimenChamber.tsx —
      tell me what to tune
- [ ] **Game-menu IA**: one LAUNCH plate, rotating mission line (daily beacon
      → tap claims), ambient DNA/energy counters, no dashboard panels
- [ ] **Icon rail navigation** (right edge desktop / bottom floating mobile,
      labels on hover, You node = account) — replaced the web navbar app-wide
- [ ] **Flick controls on your phone**: flick anywhere; cyan edge pulse =
      queued, rose = rejected; queued-arrows chip; chained flicks; stall
      then flick again for same-direction U-turns; FLICK/D-PAD toggle on
      the pre-game screen; add ?debug=input to see the instrumentation.
      Feel tunables: threshold 26px / stall 90ms
- [ ] **Camera**: 70° side-aligned default, magnetic snap, auto-fit, reset
- [ ] **Aim systems** on pre-game screen (locked ones show unlock hints)
- [ ] Block food + restyled voxel snake + Radar's rose danger tint
- [ ] Known minor: the "Play to earn DNA" hint chip may sit near the mobile
      bottom rail until dismissed (will reposition on your word)

## 🆕 Previous wave (deployed 2026-07-17)

- [ ] **Your login works now**: bllj@proton.me was stuck unconfirmed (the
      localhost-link bug) — admin-confirmed. Try signing in.
- [ ] **Auth journey**: as a guest with progress, /signup now UPGRADES your
      account (progress attached) instead of creating an empty new one;
      after upgrading, the "save your progress" prompts disappear
      immediately (stale-token bug fixed); game-over screen has a save-
      progress CTA for guests
- [ ] **Input feel (your report)**: fast successive arrow moves — S-turns
      (UP→LEFT quickly) now execute both turns; try rapid zigzags
- [ ] **Clan Duels**: create/join a clan → clan page shows THIS WEEK'S DUEL
      (opponent, live scores, countdown, top contributors). Second test
      clan needed for a real pairing; winner gets +5% DNA next week
- [ ] Progress persistence audit: PASSED — nothing progress-like stored
      locally (full storage table in the audit report); all mutations
      server-side through API/RPCs
- 🔄 Board/aim redesign (void assimilation + pro aim telegraph) in flight —
      will need your visual judgment on prod when it lands

## 📌 Incidents / notes from autonomous work

- **Guest play was broken in production** (fresh Supabase project has anonymous
  sign-ins disabled by default) — found by e2e, fixed via Management API
  2026-07-16. Worth a manual confirm: incognito → supasnake.com → Play as
  Guest works.
- Known bug (has expected-fail e2e coverage): /login doesn't render "Invalid
  login credentials" — form unmounts mid-request. Fix queued.
- One e2e flake: engagement spec "breeding lab renders parent slots"
  occasionally times out in full-suite runs, passes standalone.

## ✅ Environment (done today, for reference)

- Supabase: fresh `supasnake` project (eu-central-1), migrations 001–009,
  30 variants seeded, stale projects deleted
- Vercel: prod live at supasnake.com (+ supasnake.vercel.app), env complete
- Stripe: dedicated "Supa Snake sandbox" account — 5 products/prices,
  webhook → supasnake.com, all keys in env
- PostHog: EU project "SupaSnake", key live
- Sentry: org modusopus / project supasnake, DSN + build token set
- GitHub: modvsopvs/SupaSnake, branches pushed
