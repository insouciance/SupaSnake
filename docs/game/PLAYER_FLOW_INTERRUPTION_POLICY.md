# SupaSnake Player Flow & Interruption Policy

Status: master product direction and FTUE v2 implementation record
Supersedes: previous onboarding, starter-selection, popup, and player-flow plans

## Product contract

SupaSnake protects a motivated player's path into gameplay. Gameplay has priority over every meta system, and new systems are discovered after the player has enough context to value them.

The default interaction model is player-pulled, not system-pushed:

1. Gameplay
2. Results
3. Rewards
4. Lab
5. Additional snakes
6. Contracts
7. Collections
8. Long-term progression

Automatic interruption is reserved for legal obligations, destructive confirmation, critical blocking failures, or a deliberately scoped FTUE teaching moment. A feature badge and an automatic modal must never advertise the same content.

## Reference guest journey

With `NEXT_PUBLIC_FTUE_V2=true`, the authoritative journey is:

1. Home renders with Launch unobscured by consent UI.
2. One Launch action authenticates anonymously when necessary.
3. The server atomically creates or repairs the player, grants and equips the catalog's active PRIMAL starter only when the player owns no snake, and returns onboarding state.
4. The launch flow creates the run before navigation.
5. The board opens held in a Ready state with only “Swipe or press an arrow to move.”
6. A deliberate safe direction starts the simulation.
7. Results explain earned rewards and offer optional next actions.

The existing deliberate-direction resume gate and the reserved HUD/board layout are part of this contract. They are not parallel onboarding work: FTUE v2 consumes them so first movement is intentional and the board does not shift beneath the player.

## Overlay audit

| Flow | Previous trigger | Decision | FTUE v2 behavior |
| --- | --- | --- | --- |
| Starter selection | Automatic when collection was empty | Remove | Atomic bootstrap grants/equips PRIMAL; starter browsing remains an optional Lab activity. |
| Home-to-game preflight | Launch navigated before auth/bootstrap, then game required Play | Remove | Explicit launch state machine waits for auth, bootstrap, and run creation before one navigation. |
| Direct-game missing-snake fallback | Blocking “choose in Lab” CTA after failed/incomplete setup | Replace | Treat as a critical setup failure and return to Home Retry; Lab never becomes the repair path. |
| Daily Contracts board | Automatic once per day when offers or claims existed | Replace | Persistent numeric/exclamation notification and optional mission entry; never auto-opens. |
| Home progression hint | Automatic FTUE overlay | Replace | First results explain DNA and offer an optional Lab CTA. |
| Guest save-progress chip | Automatic before first completed run | Defer | Account remains reachable, but save-progress promotion appears only after the first result as a notification or explicit CTA. |
| Offline rewards | Automatic global Welcome Back modal | Replace | Notification center item; claiming is player-initiated. Nothing surfaces before the first completed run. |
| Identity/handle claim | Automatic after first banked extraction | Replace | Notification plus explicit Player Card action. |
| Lab account upgrade | Automatic after first unlock | Replace | Subtle success toast/notification; account creation remains optional. |
| Results | Automatic at the end of a run | Keep | It is the required boundary between gameplay and rewards and contains only contextual, player-chosen next actions. |
| In-run gene/mutation/portal/infusion/surge choices | Triggered by gameplay rules | Keep as strategic modal | These are consequential gameplay decisions, not meta-system promotion. A dominant centered dialog owns the frozen arena, focus, and input; non-terminal choices return to deliberate tactical hold. |
| First portal EXTRACT label | Once-per-device in-run visual teaching moment | Keep | It is nonblocking, contextual, and teaches the required extraction action without opening an overlay. |
| Pause menu | Explicit player action | Replace | Pause immediately enters a board-visible tactical hold with no redundant modal or Resume button. Accepted movement resumes; Abandon Run is a secondary destructive action with confirmation. |
| Cookie consent | Legal requirement | Keep and contain | It reserves its measured layout height, respects safe areas, and never overlaps Launch. |
| Lost registered session notice | Identity-continuity risk | Keep | Prevents silently replacing durable progress with a new anonymous identity. |
| Lost anonymous progress confirmation | Destructive progress-loss boundary | Keep | Explicit confirmation is required before abandoning an unrecoverable local identity. |
| Account deletion, purchase/unlock, reroll | Explicit destructive or economic action | Keep | Confirmation protects irreversible or currency-spending choices. |
| Age gate | Explicit signup/legal flow | Keep | Legal requirement, never placed in front of guest gameplay. |
| Critical run/session recovery | Blocking technical failure | Keep | Only shown when play cannot continue safely; Retry stays in context. |
| Explicit Lab details, breeding picker/reveal, Contracts, Season | Player opens the feature | Keep | These are player-pulled overlays or destination screens. |
| Achievement/Codex feedback | In-run discovery | Keep as toast | Nonblocking, time-limited feedback with no forced action. |

Legacy `StarterSelection`, `SaveProgressBanner`, and generic `OverlayHint`
components remain available for rollback or reuse, but FTUE v2 does not mount
them automatically. Their presence in the source tree is not an active player
interruption.

## Central notification contract

All discoverable meta systems use one notification model:

- `hidden`, `exclamation`, and numeric presentation
- menu, tab, and icon attachment points
- a single source of truth for live updates
- explicit clearing on the destination/action that resolves the item
- persistence only for UI discovery state, never authoritative player progress
- reduced-motion-aware animation and an accessible text label

Feature code publishes semantic items (for example `contracts`, `offline-rewards`, `lab-discovery`, `save-progress`, or `identity`) rather than rendering an automatic modal. The notification center is an optional inbox, and destination badges derive from the same records.

## Authoritative bootstrap invariants

`bootstrap_player(user_id)` is the only FTUE v2 bootstrap operation. It must:

- serialize calls for the same user;
- create a missing player and settings row idempotently;
- resolve the starter from active catalog data (`PRIMAL` + `is_starter`), never a hard-coded UUID;
- grant exactly one starter only when the player owns no snake;
- preserve an existing equipped snake and selected dynasty;
- repair a missing/broken active snake from existing ownership before granting anything;
- normalize equipment to exactly one owned snake;
- return the equipped snake and server-derived first-run state;
- be executable only by the service role.

The migration backfill invokes this operation for existing player rows, then adds a partial uniqueness constraint so future writes cannot produce multiple equipped snakes.

## Launch state machine

```text
idle → authenticating → bootstrapping → loading-run → board-ready
  ↑                                                   │
  └──────────────── retry ← failed ←──────────────────┘
```

Only one transition chain may run at a time. Errors remain on Home with an actionable Retry. Initialization never redirects to the Lab. The route handoff contains transient run initialization only; it is not player progress and is consumed once by the game page.

## Rollout phases

1. Bootstrap RPC/API and Primal defaults
2. Existing-player repair/backfill
3. One-click launch and board handoff
4. Consent layout containment
5. First-run overlay policy
6. Central notification system
7. Voluntary Lab improvements
8. Automated incognito, input, accessibility, and responsive verification
9. Canary with `NEXT_PUBLIC_FTUE_V2=true`, followed by production rollout and kill-switch monitoring

Production rollout completed on 2026-07-23 in the required order. Migration
`037_ftue_v2_player_flow.sql` was reviewed, validated against an isolated copy
of hosted migrations 001–036, applied to hosted Supabase, and invariant-checked
before the application flag was enabled. The FTUE application release
(`f86f8ae`) was then verified on a protected canary and promoted as Vercel
deployment `dpl_76p6GsNbsrp7S6qgVH3RFxm68GLc`. On 2026-07-24, Run Cockpit &
Arena v1 (`7ce2ade`) was layered onto that verified player flow and promoted as
deployment `dpl_5WdZhdbqF5RcgiSmuUPtiEk8WstX`. Its peripheral telemetry and
reserved pause/decision/input docks introduce no new automatic interruption
and never cover the board. The final hosted migration dry-run was a no-op;
migration `037` remained live and byte-aligned with the reviewed bootstrap
implementation.

Later on 2026-07-24, the compact cockpit refinement (`5431e8a`, final release
`fc0fea4`) was verified as protected canary
`dpl_3raqVivFqkbEXvuWy4WUvx1RAgz6` and promoted unchanged to production. It
preserves routine board protection while recognizing one deliberate exception:
gene, mutation, portal, infusion, and surge decisions are core play, so they
command attention in a centered modal over an atomically frozen arena. Pause
itself is now a board-visible tactical hold rather than a modal. The first
canary also exposed and blocked a direct-route guest race; session start now
invokes the same atomic `bootstrap_player` repair before any gameplay write.

`NEXT_PUBLIC_FTUE_V2=true` and `NEXT_PUBLIC_HUD_COCKPIT_V1=true` are now
Production environment defaults for future builds. Disabling only the cockpit
flag restores the prior HUD while retaining FTUE v2. Deployment
`dpl_5WdZhdbqF5RcgiSmuUPtiEk8WstX` is the immediate Run Cockpit v1 rollback;
`dpl_76p6GsNbsrp7S6qgVH3RFxm68GLc` remains the pre-cockpit rollback. An omitted
or false FTUE value still selects its coherent rollback path, and deployment
`dpl_ADggGtqUnAkWJ5j3rYZdg7bdQHZ4` remains the pre-FTUE rollback artifact.

## Verification gates

- Repeated and concurrent bootstrap calls produce one grant and one equipped snake.
- A direct authenticated guest session start repairs a missing player through
  the same idempotent bootstrap before rate, Energy, or session writes.
- Existing ownership, equipped choice, dynasty, resources, and progress are preserved.
- A fresh guest reaches a held board with one Launch action and PRIMAL equipped.
- The first safe keyboard, D-pad, or flick direction starts movement; no timer advances beforehand.
- No Lab, Contracts, collection, account, offline-reward, or optional tutorial modal appears before the first result.
- Consent and Launch bounding boxes never overlap in supported portrait or landscape viewports.
- Focus order follows visual order, all interactive targets meet the 44px minimum, and status updates are announced without stealing focus.
- The full existing gameplay suite remains green, including pause/resume, Genome, session validation, reward authority, and HUD layout coverage.

## Adjacent improvements admitted by this policy

Changes discovered during implementation may be included when they directly reduce interruption or inconsistent state: atomic equip with dynasty synchronization, unlock-and-equip, Play with this Snake, a clear Lab-to-Home path, reduced-motion badges, and replacing Cyber onboarding fallbacks with Primal. New progression scope, economy tuning, catalog redesign, or gameplay-rule changes remain outside this plan.
