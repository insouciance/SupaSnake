# QA Checklist (for Josef)

Living document — I keep this updated as work lands. Items marked ⚠️ are
things only you can do; everything else is my verification backlog that
you can spot-check when back.

_Last updated: 2026-07-16 (afternoon)_

## ⚠️ Needs you (blockers for 100% completion)

- [ ] **Resend**: paste a Resend API key (full access) into the chat or `.env`
      as `RESEND_API_KEY`. With supasnake.com DNS on Vercel, I can then create
      the sending domain, add the DNS records, and configure Supabase SMTP
      myself — except the final "save" in the Supabase dashboard SMTP form
      (dashboard-only; I'll give you the exact values).
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

## 🎨 UI design rework (in progress — deploys when done)

Direction: "the UI is the game's world" — the game scene's void/glow/motion
language + the original styleguide's arcade identity, unified across every
screen (the Lab's forked look is being reunified). Mascot returns as brand
anchor; emoji icons replaced with a custom SVG set; SUPASNAKE wordmark
replaces leftover "OG Snake" text; proper font loading. Review the new look
on prod when I deploy it and tell me what to push further.

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
