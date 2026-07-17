# QA Checklist (for Josef)

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
