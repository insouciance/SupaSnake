# SupaSnake — Player Identity v1
## Handles, Player Cards, Records, Chronicle, Clan Communities & The Analyst

**Version:** 1.1
**Date:** 2026-07-30
**Status:** APPROVED — Identity v1 remains the substrate; the owner-approved
Career Spine (`CAREER_SPINE.md`, Constitution v1.7) supersedes the public Legacy
Score headline, Chronicle order, clan-contribution visibility, recognition,
attention, and client-persistence rules below where they conflict.
**Companion docs:** `GAME_DESIGN_V2.md` (the game these identities are earned in), `systems/CLAN_DUELS_spec.md`, migrations 019–021 (mastery, gauntlet, seasons — the systems this doc makes *visible*)
**Current-rules notice (2026-07-29):** Product Constitution v1.5 §10 and
`ENERGY_COMMITMENT_AND_CLAN_BATTLES.md` supersede this document's historical
Energy-commerce statement. Energy and recovery are never sold.
**Competitive notice (2026-07-31):** Constitution v1.7 supersedes privacy-by-
suppression and equal-honor-only clan language below. SupaSnake welcomes
competition; earned progression and strong play are visible prestige, while
payment remains unable to buy competitive power or proof.
**Career notice (2026-07-30):** all progress, receipts, attention, pursuits,
lineage history, and seen state are server-authoritative. None persists in any
browser storage. Rewards auto-secure; Daily Take is the only collect.

---

## 1. First-Principles Critique of Current Identity

Five structural failures, verified by codebase audit. As with GDv2's critique,
these are not bugs of sloppiness — they are the natural state of a game that
built its systems before its people. A game meant to be played for years needs
players who *are someone* in it.

**1.1 Nobody has a name.**
`players.username` exists in the schema and is written by exactly zero code
paths. Every player renders as `Player 3f2a1b` (the JS leaderboard's
hex-fallback) or `Anonymous` (five separate `COALESCE(username,'Anonymous')`
sites in SQL RPCs, including `get_anomaly_board` and the clan contributor
lists). The single most basic act of identity formation — choosing what other
players call you — is impossible. Everything downstream of a name (rivalry,
recognition, reputation) is therefore also impossible.

**1.2 Email is the identity of record.**
For registered players the only unique, human-readable identifier is their
email address — which can never be shown to anyone. The settings page doubles
as the de-facto profile, styled in legacy gray outside the arcade design
system, and its career stats query a non-existent `currency_type` column so
"DNA Earned" renders 0 forever (real bug; fixed in I1 — the column is
`resource_type`). The message this sends: *you are a login, not a player.*

**1.3 Cosmetics are dead strings.**
The Season 1 track awards `solstice_trail_1`, the Gauntlet's Heraldry branch
unlocks banner frames, mastery rungs grant emblems and animated trails — and
every one of them is a string ID in a claims table that nothing reads. There
is no inventory, no equip flow, no render path. Players are "earning" rewards
that do not exist anywhere they or anyone else can see. This is worse than
having no cosmetics: it teaches players that earning is meaningless.

**1.4 Clans are spreadsheets, not communities.**
The clan system (007/011/020) is mechanically deep — duels, ELO, research,
the Gauntlet's ban/pick — and socially empty. No clan has a visual identity
(heraldry research unlocks cosmetics with no pixels). There is no roster
screen, no officer UI, and the invites schema from 007 has never had a
surface. There is nowhere to talk. A clan you cannot see and cannot speak in
is a scoring bucket.

**1.5 Stats exist; stories don't.**
Telemetry is rich — per-run dynasty, build, extraction outcome, full economy
breakdown — but it is presented (where presented at all) as lifetime totals.
No personal-best timeline, no "the week you hit M10", no rivalry memory, no
record of the season you were champion. Careers accumulate; chronicles are
authored. We have the former and none of the latter. Worse, the run itself is
opaque in hindsight: we don't even record *how a run ended* (no death cause,
no positional events), so no future system can narrate it.

---

## 2. Design Pillars

Each pillar carries its research provenance. Three parallel research passes
(attachment mechanics across Destiny 2 / League of Legends / Rocket League /
OSRS / CS2 / Overwatch; Discord platform capabilities verified against 2026
APIs; AI-in-games player sentiment) ground every decision below.

1. **Worn, not buried.** Identity must render *in context* — the kill screen,
   the leaderboard row, the scouting report — not in a stats tab nobody
   opens. Destiny 2's worn titles ("Flawless" floating over a Guardian's head
   in the Tower) and CS2's tenure medals work because everyone *else* sees
   them at the moment of judgment. SupaSnake gets one universal **Player
   Card** rendered at every competitive surface (§4).
2. **Snake as avatar.** Your avatar is the portrait of a snake you collected,
   in a dynasty-colored frame. This ties the collection game to identity
   (your Gen 8 PRIMAL *is* you), carries zero user-upload moderation risk,
   and gives frames a prestige ladder (frames upgrade with mastery). No
   uploaded images, ever.
3. **Records, not achievements.** The prestige spine is LoL-Challenges-style:
   ~20 tiered records across categories, tier tokens, capstone titles, one
   Legacy Score, and a *curation cap* — you wear 3 badges, chosen, exactly as
   LoL caps token display at 3. The 18 legacy achievements (003) survive as a
   DNA faucet but retire as a display surface (§6.6). Effort-gated, never
   bought: Rocket League's decade of goal-explosion prestige and OSRS's
   untradeable capes are the models; the collection log with first-acquired
   dates is OSRS's collection log directly.
4. **Career = Chronicle.** Careers are presented as story: a PB timeline,
   season chapters, first-acquisition dates, rivalry records — public at
   `/p/[handle]`. Tenure is unbuyable (CS2 medals): the Founder marker and
   account-age records can never be acquired later, at any price.
5. **Clans as communities.** Clan identity becomes visible (banner, emblem,
   colors — making Heraldry research real), the roster becomes a wall of
   Player Cards, and *Discord is the chat layer*. Verified platform facts
   shape this hard: `guilds.join` auto-join works; a bot can provision
   per-clan channels + roles in one official server; webhooks push game
   events; Linked Roles gate Discord roles on game stats (max 5 metadata
   fields); `widget.json` exposes online presence. Embedded in-page chat and
   browser Rich Presence are **impossible** — we design routes *around* them
   rather than shipping a doomed in-house chat (see §10.3 on dead surfaces).
6. **The Analyst, not a chatbot.** 85% of surveyed players react negatively
   to generic conversational game AI. Nobody wants to chat with their snake.
   What players love is *being seen*: deterministic, testable fact
   computation narrated by an LLM into short, sharp artifacts — a post-run
   insight, a seasonal playstyle archetype, a Wrapped-style season Recall.
   The AI never invents a number, never chats, never touches the economy
   (§9). Overwatch's prosocial endorsement lesson applies: celebrate what
   players did, never rank their worth.

---

## 3. The Handle System

### 3.1 Format & uniqueness

- **Format:** `^[A-Za-z0-9_]{3,16}$` — enforced by a CHECK constraint on
  `players.handle`. ASCII-only is a deliberate anti-abuse choice: it kills
  the entire Unicode-confusable impersonation class at the type level.
- **Uniqueness:** case-insensitive, via `UNIQUE INDEX ON lower(handle)`.
  `Souci`, `souci`, and `SOUCI` are one identity. Display preserves the
  owner's chosen casing.
- The unique index is the race arbiter: two concurrent claims of the same
  handle resolve by index collision, not by application-level locking.

### 3.2 Guests: derived names, zero writes

Unregistered players get a stable generated name **derived in the identity
view, never written**: `handler-NNNN`, where `NNNN` is the last 4 hex digits
of `players.id` interpreted as an integer, mod 10000, zero-padded (e.g.
`handler-0417`). Properties: deterministic (same guest, same name, every
surface), no storage, no claim ceremony needed, and visually unmistakable
from a real handle (real handles cannot contain `-`). Collisions between
guests are cosmetically acceptable; guests are not uniquely addressable and
`/p/[handle]` never resolves a `handler-NNNN` name.

### 3.3 Claim moments

Two ceremonies, both optional-but-prompted:

1. **First extraction game-over.** The first time a player *banks* a run
   (their first genuinely proud moment), the game-over screen offers the
   claim: "That run deserves a name on it." One input, live availability
   check, done. Shown at most once per device until claimed or dismissed
   twice.
2. **Account upgrade.** The guest→registered upgrade flow gains a handle
   step between credentials and confirmation. Registered players without a
   handle see a persistent (dismissable) prompt on the profile page.

A claim is never *required*. The game is fully playable as `handler-0417` —
the name is a want, not a wall.

### 3.4 Change rules

| Rule | Value |
|------|-------|
| First claim | Free, no cooldown |
| Subsequent changes | 30-day cooldown (`handle_changed_at` + `handle_changes` counter) |
| Cost | Free (no DNA cost — names are identity, not economy) |
| Old handle | Released immediately on change (no squatting hold in v1) |

### 3.5 Denylist & normalization

A `reserved_handles` table with two kinds, both checked against the
**leet-normalized** candidate (lowercase; strip `_`; map `0→o 1→i 3→e 4→a
5→s 7→t 8→b $→s @→a`):

- **`reserved`** — exact match after normalization. Seed: `admin`, `mod`,
  `moderator`, `staff`, `support`, `system`, `supasnake`, `official`,
  `anonymous`, `handler`, dynasty names, `analyst`.
- **`profanity`** — substring match after normalization. Seeded with a
  standard denylist; extendable by migration without code changes.

`claim_handle` RPC rejects with distinct error codes (`HANDLE_TAKEN`,
`HANDLE_RESERVED`, `HANDLE_COOLDOWN`, `HANDLE_INVALID`) so the UI can be
precise.

### 3.6 Admin rename path

Abuse that survives the filter is handled by `admin_rename_handle`
(service-role only): resets the offender's handle to NULL (they render as
`handler-NNNN` again), records the event, and waives the 30-day cooldown for
their next claim (the *victim of a reset* shouldn't be locked out of
re-naming; repeat offenders are an account-standing problem, not a cooldown
problem).

---

## 4. The Player Card

One component, one read path, every surface. The Player Card is the pillar-1
delivery vehicle: if a piece of identity doesn't render on the card, it
doesn't exist.

### 4.1 Composition

| Element | Source |
|---------|--------|
| **Handle** | `players.handle`, else derived `handler-NNNN` |
| **Title** | Equipped `title`-slot cosmetic (may be empty — no default title) |
| **Avatar** | Snake portrait: favorited snake → else equipped snake → else newest collected, rendered in a dynasty-colored frame; frame treatment upgrades with that dynasty's mastery (M0–2 plain, M3–6 inlaid, M7–9 gilt, M10 animated) |
| **Banner** | Equipped `banner`-slot cosmetic (default: "Hatchery Standard", common, granted to all) |
| **Badges ×3** | The player's 3 *curated* badges (§6.5) — never auto-filled |
| **Clan tag** | `[TAG]` from `clans.tag`, in the clan's primary color once I3 lands |
| **Founder/tenure marker** | Founder ring on the avatar frame if `players.created_at < 2026-07-20` (Season 1 start); tenure years elsewhere via the Veterancy records |
| **Mastery summary** | Three dynasty pips showing mastery level (e.g. P7 / C4 / K2) |

All of it reads from **`player_identity_view`** — the single canonical
identity read path (public-safe by construction: no email, no ids beyond
what routes need). Every `COALESCE(username,'Anonymous')` RPC site and the
leaderboard route are re-declared onto this view in I1.

### 4.2 Render variants

- **`row`** — one-line: avatar chip, handle, title (dimmed), clan tag, top
  badge. Used in dense lists (leaderboards, contributor tables).
- **`card`** — the standard card: banner background, avatar + frame, handle,
  title, 3 badges, clan tag, mastery pips. Used at moments of judgment.
- **`full`** — the profile header: card plus founder/tenure detail, three
  curated provenance-labelled proofs, and equipped-cosmetic showcase. Legacy
  Score remains an internal/historical aggregate, not the public headline.

### 4.3 Surfaces (launch set)

Leaderboard rows (`row`), anomaly board rows (`row`), game-over screen —
yours and, in duels context, your opponent's (`card`), gauntlet scouting
report (`card` per roster member), clan roster (`card` grid), clan
contributor lists (`row`), public profile `/p/[handle]` (`full`), own
profile/career page (`full`). Adding a competitive surface without a Player
Card on it is a design defect from I1 onward.

---

## 5. Cosmetics

### 5.1 Slots

Six equipment slots on `player_loadout` (badge slot has positions 1–3):

`title` · `banner` · `badge` (×3) · `trail` (in-run body trail) ·
`board_accent` (in-run board skin) · `emblem` (card + in-run flourish)

Clan heraldry is deliberately **not** a player slot — it stays clan-scoped
and renders from `clan_research` (banner frame `heraldry_1`, victory fanfare
`heraldry_2`, counted-run board frame `heraldry_3`, animated clan title
`heraldry_4`).

### 5.2 Rarity ladder

`common → uncommon → rare → epic → legendary`. Rarity is visual language
only (border/glow treatment) — cosmetics never carry stats (GDv2 pillar 4).
Legendary treatments (animated borders, tier glyphs) are **reserved for
earned items forever** (§5.6).

### 5.3 Seed catalog — Season 1 "Solstice" (8 items, migration 021)

Season-exclusive, never returns (time-locked scarcity — Destiny/RL model).
All tagged `season_seq = 1`.

| ID | Slot | Rarity | Source (track level) |
|----|------|--------|---------------------|
| `solstice_trail_1` | trail | rare | L1 |
| `solstice_badge` | badge | rare | L3 |
| `solstice_board_accent` | board_accent | rare | L8 |
| `solstice_trail_2` | trail | epic | L12 |
| `solstice_emblem` | emblem | epic | L18 |
| `solstice_trail_3` | trail | epic | L22 |
| `solstice_banner` | banner | legendary | L28 |
| `solstice_sovereign` | title | legendary | L30 — the season capstone title, worn as "Solstice Sovereign" |

### 5.4 Seed catalog — Mastery rungs (24 items: 8 per dynasty × 3)

Backfilled from `player_mastery` at I1; granted forward by the re-declared
`grant_mastery_xp`. IDs follow `mastery_<dynasty>_<item>`; the table shows
PRIMAL — CYBER and COSMIC mirror it exactly (`levelForXp` in
`src/shared/game/mastery.ts` is the source of truth for rung levels; the
cosmetic seed must match `MASTERY_UNLOCK_TRACK` rung-for-rung).

| Rung | ID (PRIMAL) | Slot | Rarity |
|-----:|-------------|------|--------|
| M1 | `mastery_primal_emblem_1` | emblem | common |
| M2 | `mastery_primal_trail_1` | trail | common |
| M4 | `mastery_primal_board_accent` | board_accent | uncommon |
| M5 | `mastery_primal_trail_2` | trail | uncommon |
| M7 | `mastery_primal_emblem_2` | emblem | rare |
| M8 | `mastery_primal_trail_3` (animated) | trail | epic |
| M10 | `mastery_primal_sovereign_emblem` (animated) | emblem | legendary |
| M10 | `title_primal_sovereign` — "Primal Sovereign" | title | legendary |

(M3/M6/M9 are mutation rungs — no cosmetic.) CYBER M10 title: **"Cyber
Sovereign"**; COSMIC: **"Cosmic Sovereign"**.

### 5.5 Generated catalogs

- **Record-tier badges** — every record × tier auto-generates a badge def
  `record_<record_id>_t<1..5>` with rarity mapped from tier (Bronze→common,
  Silver→uncommon, Gold→rare, Diamond→epic, Apex→legendary). ~105 defs at
  launch (21 records × 5); generated, not hand-seeded.
- **Capstone titles** — 6, one per record category (§6.4), legendary.
- **Archetype badges** — 8 per season, `archetype_<id>_s<seq>`, epic,
  granted at season end (§9.6). Season-stamped: your Season 1 "The Surgeon"
  badge is forever a Season 1 artifact.
- **Founder** — `badge_founder` ("Founding Handler"), legendary, one-time
  backfill to accounts created before 2026-07-20. Never grantable again.

### 5.6 The earned-only rule

**The shop never sells prestige cosmetics. Ever.** Nothing in §5.3–5.5 —
nor anything sharing their visual language — is purchasable. If taste
cosmetics (palettes, non-tier trails) are ever sold, they must be visually
distinct from earned tiers: no tier glyphs, no rarity borders above rare's
treatment, no animation (animated = legendary = earned, always). CS2 medals
and OSRS capes retain meaning for a decade because money has never touched
them; one violation poisons the entire spine retroactively.

---

## 6. Records

The prestige spine (migration 023). ~21 records across 6 categories, each
with 5 tiers — **Bronze / Silver / Gold / Diamond / Apex** — worth tier
points **{5, 10, 20, 35, 60}** (cumulative: a Gold record has banked
5+10+20 = 35 points). Every record is computable from telemetry that exists
at I2 time — no record waits on new instrumentation.

### 6.1 Launch record definitions

Thresholds are tuned against GDv2 §4/§9 economy anchors: elite banked run
≈ 4,470 DNA (full stack), elite hour ≈ 13,400 DNA, mid-skill hour ≈ 3,000,
M10 = 175,000 banked XP, collection = 30 variants. Apex tiers are
deliberately long-tail (LoL Challenges: the top tier is a *years* statement).

**Extraction** — capstone title: **"Extractor Prime"**

| Record | Measures | B / S / G / D / Apex |
|--------|----------|----------------------|
| **The Vault** | Lifetime DNA banked (extracted runs) | 5,000 / 25,000 / 100,000 / 400,000 / 1,000,000 |
| **High Water** | Best single-run banked payout | 500 / 1,200 / 2,500 / 4,500 / 6,500 |
| **Clean Getaways** | Total extractions | 10 / 50 / 250 / 1,000 / 2,500 |
| **Cold Blood** | Deep extractions (banked at ≥63 foods — the ≥3-portals proof from contract math) | 1 / 10 / 50 / 200 / 500 |

**Dynasty Depth** (per-dynasty ×3) — capstone title: **"Apex Handler"**

| Record | Measures | Tiers (mastery level via `level_for_xp`) |
|--------|----------|------------------------------------------|
| **Primal Depth** | PRIMAL mastery XP | M2 / M4 / M6 / M8 / M10 (= 3,000 / 14,000 / 41,000 / 92,000 / 175,000 XP) |
| **Cyber Depth** | CYBER mastery XP | same |
| **Cosmic Depth** | COSMIC mastery XP | same |

**Collection** — capstone title: **"Grand Curator"**

| Record | Measures | B / S / G / D / Apex |
|--------|----------|----------------------|
| **The Menagerie** | Distinct variants collected (of 30) | 5 / 12 / 20 / 26 / 30 |
| **Bloodline** | Highest prestige generation bred | 2 / 3 / 5 / 8 / 12 |
| **Geneflow** | Total breeds performed | 5 / 20 / 50 / 150 / 400 |

**Gauntlet** — capstone title: **"Warmaster"**

| Record | Measures | B / S / G / D / Apex |
|--------|----------|----------------------|
| **On the Wall** | Counted gauntlet runs (scored windows) | 10 / 50 / 200 / 600 / 1,500 |
| **Campaigner** | Distinct duel/gauntlet weeks participated | 2 / 6 / 15 / 30 / 60 |
| **Benefactor** | Lifetime DNA tithed to clan research (capped 500/wk) | 500 / 2,500 / 8,000 / 20,000 / 50,000 |

**Veterancy** — capstone title: **"Old Guard"**

| Record | Measures | B / S / G / D / Apex |
|--------|----------|----------------------|
| **Tenure** | Account age (days) | 30 / 90 / 365 / 730 / 1,461 |
| **Unbroken** | Longest login streak (days) | 7 / 14 / 30 / 60 / 120 |
| **Mileage** | Total earning runs completed | 50 / 250 / 1,000 / 3,000 / 8,000 |

**Legacy** (seasonal) — capstone title: **"Perennial"**

| Record | Measures | B / S / G / D / Apex |
|--------|----------|----------------------|
| **Stormchaser** | Distinct anomaly weeks with ≥1 board run | 2 / 8 / 20 / 40 / 80 |
| **Board Presence** | Weekly anomaly-board top-10 finishes | 1 / 5 / 15 / 40 / 100 |
| **Chronicler** | Cumulative season-track levels reached | 10 / 30 / 75 / 150 / 300 |
| **Dynast of Seasons** | Seasons with the track completed (L30) | 1 / 2 / 4 / 7 / 12 |
| **Crowned** | Season championships (rostered member of the champion clan at settlement) | 1 / 2 / 3 / 4 / 5 |

21 records; maximum tier points per record = 130; **Legacy Score maximum at
launch = 2,730** (grows as future seasons add records — the score is
open-ended by design, like OSRS total level).

### 6.2 Legacy Score

`players.legacy_score` = sum of banked tier points across all records. It remains
an internal/historical compatibility aggregate and may remain Linked-Roles
metadata until that contract is versioned. Constitution v1.6 retires it from the
public `full` card: understandable curated proof replaces an opaque third public
number. It buys nothing, multiplies nothing, and is never an input to any economy
or matchmaking formula.

### 6.3 Computation model

`refresh_player_records(player_id)` — idempotent recompute-from-aggregates
(never incremental event-counting, so it is self-healing after any backfill
or bug): reads session aggregates, mastery XP, collection, gauntlet
participation, tithes ledger, streaks, anomaly boards, season claims;
upserts `player_records`; recomputes `legacy_score`; grants any newly
reached tier's badge cosmetic. Called non-fatally at session end and
rate-limited (≥10 min) on profile view. A wrong threshold is a data fix +
one recompute, never a migration of corrupted counters.

### 6.4 Capstones

Each category's capstone **title** unlocks when every record in the category
reaches **Diamond**; it upgrades to its animated treatment when every record
reaches **Apex**. Titles are cosmetics in the `title` slot — one worn at a
time, chosen, per pillar 3's curation principle.

### 6.5 Badge curation (pick-3)

Record-tier badges, archetype badges, the Solstice badge, and the Founder
badge all compete for exactly **3 worn slots**. No auto-equip, no "latest
first" — LoL's constraint is the design: choosing which three things
represent you *is* the identity expression. The full cabinet lives in the
Chronicle.

### 6.6 The 18 legacy achievements

The 003 achievement tables, checker, and DNA/energy rewards are **kept
untouched** (they are a live faucet; touching them risks double-grants).
What retires is their *display surface*: the achievements panel folds into
the Chronicle as a "Early Career" collapsible, and no new achievement is
ever authored. Records supersede them for everything forward-looking. Note
the deliberate upgrade: achievements paid DNA for attendance-shaped goals;
records pay *nothing* — prestige is the reward, which is why it stays
prestigious (GDv2 pillar: no daily-login-shaped faucets).

---

## 7. The Chronicle

The career surface: own view at `/profile` (rebuilt into the arcade design
system), public read-only at **`/p/[handle]`** (no-auth route, `s-maxage`
cached, serves only `player_identity_view` + Chronicle aggregates — nothing
private).

### 7.1 Sections (top to bottom)

1. **Header** — `full` Player Card, founder/tenure, and three curated proofs.
2. **Private Career Pulse** (own view only) — quiet three-pillar snapshot,
   one optional server-held pursuit, recent meaningful moments, private Clan
   Energy Battle state, and one destination. It is absent from public profiles.
3. **PB timeline** — weekly `MAX(score)` line per dynasty since account
   creation, annotated with record-tier moments ("Gold — High Water") and
   mastery level-ups. This is the "you are improving" graph.
4. **Lineage dossiers** — active branch first; immutable retired/refunded
   passports visibly historical and never equip-capable.
5. **Records cabinet** — all 21 records with tier progress bars, grouped by
   category; capstone progress ring per category.
6. **Collection log** — every variant with `acquired_at` first-acquired
   date (OSRS collection log); missing variants shown as silhouettes.
7. **Season chapters** — one chapter per season: track level reached,
   archetype earned, anomaly best finishes, gauntlet weeks, championship
   banner if Crowned. Season Recall card (§9.2) embeds here.
8. **Clan history** — current Energy Battle honors, aggregate battle history,
   and rivalry memory; no teammate attempt or contribution detail.
9. **Early Career** — the collapsed legacy-achievements panel (§6.6).

### 7.2 Empty states (anti-dead-surface)

A new player's Chronicle must read as *beginning*, not *absence* — the
classic dead-social-surface failure is a page of zeros that teaches players
never to return. Rules:

- Sections with no data render a single-line forward-looking prompt ("Your
  first banked run starts your timeline"), never an empty grid or a 0-count.
- The collection log always renders (silhouettes are content — they are the
  want-list).
- Season chapters before the account existed simply don't render; no
  "missed" framing.
- The public `/p/[handle]` of a player with <5 earning runs renders header +
  collection log only.

---

## 8. Clan Identity & Discord

### 8.1 Clan visual identity (migration 024)

`clans` gains `banner_id`, `emblem_id`, `color_primary`, `color_secondary`.
`update_clan_identity` RPC: caller must be owner/officer (RLS on `clans`
stays owner-only — officers mutate *through the RPC*), and each element
gates on Heraldry research: banner customization on `heraldry_1`, emblem on
`heraldry_1`, board frame rendering in counted runs on `heraldry_3`,
animated clan title on `heraldry_4` (`heraldry_2`'s victory fanfare plays at
duel settlement). The research tree (020) finally buys pixels.

### 8.2 Roster, officers, invites

- **Roster UI**: grid of `card` Player Cards with role chips
  (owner/officer/member), curated proof, and mastery pips. It exposes no weekly
  output, contribution, absence, Energy, generation, attempt count, threshold,
  or intra-clan rank. This is the clan's face — a wall of identities, not a
  manager dashboard.
- **`set_clan_member_role`** (promote/demote, owner-only for officer
  changes; owners transfer via existing ownership path).
- **`respond_clan_invite`** — the 007 invites schema
  (pending/accepted/declined/expired, 7-day expiry, officer-created) gets
  its first UI: invite by handle, inbox on the clan page, accept/decline.

### 8.3 Discord — both models (LOCKED user decision, both ship in I3)

**Model A — Official server, per-clan spaces.** One official SupaSnake
guild. Player clicks Connect → OAuth (`identify` + `guilds.join` +
`role_connections.write`, HMAC-signed state) → server exchanges the code,
**encrypts tokens AES-256-GCM at the app layer** (`DISCORD_TOKEN_ENC_KEY`;
pgsodium rejected — deprecated on Supabase and keeps decryption in-DB),
stores in `discord_links` (deny-all RLS; service-role access only) →
auto-joins the player to the official guild → pushes Linked-Roles metadata.
The bot provisions each clan a **private channel + role** via plain REST
(no discord.js): clan members get the role on link; channel visibility rides
the role. Capacity guard at **400 clans** (channel headroom below Discord's
500-channel guild cap); past it, new clans get Model B guidance.

**Model B — Clan-owned server.** A clan leader invites the bot (Manage
Channels + Manage Roles + Create Instant Invite) into the clan's own guild
and links it (`discord_clan_links` stores guild/channel/role ids). The same
webhook event feed and role sync run against the clan's guild. Clans that
outgrow a channel — or predate SupaSnake — keep their home.

**No in-app chat is built.** Discord *is* the social layer (pillar 5, §10.3).

### 8.4 Event feed & Linked Roles

`discord_event_outbox` — because settlement is lazy in-SQL (no cron exists
today), producers (settlement SQL, session route) enqueue; a 5-minute Vercel
cron `/api/discord/dispatch` (this adds the repo's first `vercel.json`) plus
opportunistic drains consume; dead-letter after 5 attempts. Event types:

| Event | Posted when |
|-------|-------------|
| `duel_settled` | Weekly settlement — score, winner, ELO delta |
| `gauntlet_unlock` | Clan research node completes |
| `mastery_levelup` | A member reaches M5+ (M1–4 are too chatty) |
| `season_champion` | Championship decided — @everyone in the champion's channel |
| `member_joined` | Invite accepted |

Constitution v1.6 replaces stale duel/research/champion operational copy with
current Energy Battle outcomes, equal honors, rare Mastery milestones, and
voluntary verified artifacts. Automatic posts never compare members or reveal
private attempt facts; they are rate-limited and non-commercial.

**Linked Roles metadata** (Discord max 5 — we use exactly 5):
`mastery_level` (highest dynasty level), `legacy_score`,
`gauntlet_champion` (boolean), `founder` (boolean), `extraction_count`.
Server owners build role gates like "Mastery 5+" or "Founder" natively in
Discord.

**Presence**: the clan page embeds the official guild's `widget.json`
online-presence (Model A) or the clan guild's (Model B) — the "someone's
home" signal an in-app roster can't fake.

### 8.5 Privacy

Tokens app-layer encrypted (AES-256-GCM), `discord_links` under deny-all
RLS, refresh-failure degrades to unlink-with-notice, **30-day sweep**
deletes stale grants (unlinked or refresh-dead), unlink revokes the token at
Discord and deletes the row. We store no message content, ever; the bot
never reads channels.

---

## 9. The Analyst

Deterministic facts, narrated. `src/lib/analyst/facts.ts` computes typed
fact sheets in pure TypeScript — this is the tested, load-bearing logic. The
LLM's only job is turning a fact sheet into 2–3 sentences + ≤2 tips. It
never sees raw tables, never computes, never chats.

The Analyst is not part of Results progression recognition. A run insight is an
optional separate review or Chronicle artifact; asynchronous narration never
delays or reflows the authoritative impact receipt.

### 9.1 Model & SDK (LOCKED user decision: OpenAI)

Official `openai` SDK, structured outputs via `zodResponseFormat`.
**`gpt-5-mini`** for all volume artifacts; **`gpt-5`** only for the season
Recall (the one shareable, once-per-season artifact worth flagship prose).
No key / budget exceeded / parse failure ⇒ **templated fallback renderer**
over the same fact sheet — every artifact works end-to-end without a key.
Kill switch: `ANALYST_ENABLED`.

### 9.2 The five artifacts

| Artifact | Trigger | Model | Token cap (in/out) | Cache key |
|----------|---------|-------|--------------------|-----------|
| **Run insight card** | Game-over, on demand ("the one thing that cost you this run") | gpt-5-mini | 700 / 250 | session id |
| **Seasonal archetype** | Season-end cron (also mid-season refresh at week 4) | gpt-5-mini | 900 / 300 | player + season |
| **Weekly digest** | Monday cron; in-game card + opt-in Resend email | gpt-5-mini | 1,200 / 400 | player + week |
| **Season Recall** | Season-end cron — shareable Wrapped-style card | **gpt-5** | 2,000 / 600 | player + season |
| **Gauntlet scouting brief** | On demand from the scouting screen, Mon–Wed | gpt-5-mini | 1,000 / 350 | clan pair + week |

### 9.3 Cost bounds

`ai_insights` cache (unique dedup index on kind+scope+owner — a cached
artifact is never regenerated), per-kind token caps above,
`ai_usage_daily` **circuit breaker** (env `ANALYST_DAILY_TOKEN_BUDGET`,
default 2,000,000 tokens/day — trips to templated fallback, never errors),
per-player rate limits (run insights ≤10/day, scouting ≤4/week).

### 9.4 Injection rules

Static system prompt; all player-controlled strings (handles, clan names)
enter as fenced inert JSON data, never interpolated into instructions;
handles are already regex-constrained at the type level; output is
zod-validated and passed through a URL/mention denylist; single-turn, no
tools, no conversation state. There is nothing to jailbreak *into* — the
Analyst has no capabilities beyond emitting validated JSON.

### 9.5 Run-event capture (lands in I1 so data accrues before I4)

`game_sessions.run_events JSONB` + `game_sessions.death_cause`. The engine
emits a compact discrete-event array — `{t, e, ...}` where `t` = tick and
`e` = event code: `f` food (with food index), `p` portal
(spawn/pass/enter), `b` bank, `m` mutation pick (id), `w` near-wall episode
(entered/left the 1-cell wall margin), `x` terminal (`death_cause`:
`wall | self | timeout | extracted`). Bounds: **≤600 events, ≤32KB** (~25
bytes/event); server validates monotonic ticks and event counts against the
already-validated run facts. **Run events never influence payouts, records,
or leaderboards** — display and Analyst input only. 90-day pruning;
`death_cause` kept forever (it feeds Chronicle and archetypes).

### 9.6 The archetype set (8)

Detection is deterministic scoring in `facts.ts` over the season's earning
runs: compute every axis score, assign the highest above its floor; ties
break by the priority order below; fewer than 20 earning runs ⇒ **"The
Hatchling"** (unranked, not a badge). The archetype is narrated by the LLM
but *chosen* by code — the badge grant is pure TS.

| # | Archetype | Fantasy | Detection heuristic (season aggregates) |
|---|-----------|---------|------------------------------------------|
| 1 | **The Surgeon** | Clinical extraction | Extraction rate ≥ 65% AND median banking portal ≤ 2nd portal |
| 2 | **The Daredevil** | Greed as art | Mean portals passed per run ≥ 2.5 OR ≥ 40% of potential DNA lost to salvage |
| 3 | **The Loyalist** | One dynasty, mastered | ≥ 80% of earning runs in a single dynasty |
| 4 | **The Polymath** | Fluent in all three | Every dynasty ≥ 20% of runs AND every mastery ≥ M3 |
| 5 | **The Alchemist** | Build maximalist | Mean mutations held ≥ 2.5 AND ≥ 70% of offers accepted |
| 6 | **The Purist** | The snake, unassisted | Mean mutations held ≤ 0.5 across ≥ 20 runs |
| 7 | **The Redliner** | Lives at tier 4 | ≥ 30% of CYBER runs reach tier 4 (≥20 foods) AND ≥ 5 banked from tier 4 |
| 8 | **The Metronome** | Relentless rhythm | Played ≥ 5 days/week on ≥ 60% of season weeks AND contract completion ≥ 80% |

Priority (specific beats general): Redliner > Purist > Alchemist > Surgeon >
Daredevil > Polymath > Loyalist > Metronome. Each grants the epic
season-stamped badge `archetype_<id>_s<seq>` (§5.5) — the artifact doubles
as wearable identity, closing the loop between being seen and being shown.

---

## 10. Economy & Integrity Analysis

### 10.1 Nothing here touches payouts

Identity v1 adds **zero** DNA/energy faucets and zero sinks. Records grant
tier points and badges — no DNA (deliberate contrast with the legacy
achievements, §6.6). Handles are free. Cosmetics are grants, not purchases.
The Analyst reads `game_sessions`, never writes economy tables; run events
are structurally barred from payout math (§9.5). The account-multiplier
stack, ruleset payouts, and server-recompute pipeline from GDv2 are
untouched byte-for-byte. Audit surface: migrations 022–025 contain no
`economy_transactions` writes except none — a reviewer can grep for it.

### 10.2 Anti-P2W statement

Money may buy only Constitution-compliant identity, content, and organization
products; it cannot buy Energy, recovery, DNA, Yield, or clan power. Money can
never buy:
a handle change ahead of cooldown, any record tier, Legacy Score, any item
in the prestige catalog, mastery, tenure, or the Founder marker. Tenure and
founder status are *unbuyable at any price forever* — that is what makes
them worth wearing (CS2 medals). The richest player can be *visible*, never
*decorated*.

### 10.3 Deliberately NOT built

- **No in-app chat.** An in-house chat with our population would be a room
  of empty channels — the deadliest social anti-pattern (a visible ghost
  town teaches players the game is dead). Discord is a better chat than we
  will ever build, our players already live there, and both integration
  models (§8.3) make it feel native. We spend our complexity budget on what
  Discord *can't* do: identity, records, chronicle.
- **No friend lists / DMs in v1.** Same rationale at the pair level: a
  friends tab with 0 friends is anti-marketing. Rivalry emerges from clans
  and boards first; a friends graph is worth building only after those
  surfaces demonstrably have traffic.
- **No user-uploaded images.** Snake-portrait avatars (pillar 2) — zero
  moderation exposure, infinite on-brand variety.
- **No chatbot.** §2.6. The Analyst has five artifacts and no reply box.

---

## 11. Phasing

Sequenced after Phase 0 (finish GDv2 4B: Seasons/Anomaly UI, apply 021 —
time-critical, Season 1 starts 2026-07-20). Per phase: full battery (tsc /
jest / build) green, deploy, QA checklist journey stage appended. New
dependency: `openai` (I4 only); Discord REST and Resend via plain `fetch`.

| Phase | Migration | Deliverables |
|-------|-----------|--------------|
| **I1 — Identity Core** | **022** | `players.handle` + `claim_handle` (denylist, cooldown, race-safe) + `reserved_handles`; `cosmetic_definitions` seeded (§5.3–5.5) + `player_cosmetics` + `player_loadout` (backfilled from battle-pass claims + mastery; `claim_season_tier`/`grant_mastery_xp` re-declared to grant inventory forward); **`player_identity_view`** + all 5 `Anonymous` RPC sites and the leaderboard route re-declared onto it; `PlayerCard` component (row/card/full) on all §4.3 surfaces; claim moments (game-over + upgrade flow); `run_events` + `death_cause` capture (§9.5); `currency_type`→`resource_type` stats fix |
| **I2 — Records & Chronicle** | **023** | `record_definitions` (21 seeded, §6.1) + `player_records` + `players.legacy_score` + `refresh_player_records`; record-tier badge generation; capstone titles; achievements display retirement; `/p/[handle]` public profile + Chronicle (PB timeline, records cabinet, collection log, season chapters, `clan_rating_history` appended at settlement, empty states per §7.2) |
| **I3 — Clan & Discord** | **024** | Clan identity columns + `update_clan_identity` (heraldry-gated) + `set_clan_member_role` + `respond_clan_invite` + roster UI; `discord_links` (AES-256-GCM, deny-all RLS) + `discord_clan_links` + `discord_event_outbox` + dispatch cron (first `vercel.json`); OAuth link/callback/status/unlink routes; both integration models; Linked Roles (5 fields); widget presence; 400-clan guard; 30-day sweep |
| **I4 — The Analyst** | **025** | `ai_insights` + `ai_usage_daily`; `facts.ts` fact sheets + archetype detection (§9.6); OpenAI narration + templated fallback; the five artifacts + their routes/crons; archetype badge grants; Resend digest opt-in |

**User-action items** (tracked in QA_CHECKLIST.md): I3 — create the Discord
application/bot/official server, set OAuth + Linked-Roles URLs, invite the
bot with Manage Channels + Manage Roles + Create Instant Invite, provide
`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` /
`DISCORD_GUILD_ID` (agent generates `DISCORD_TOKEN_ENC_KEY` / `CRON_SECRET`).
I4 — provide `OPENAI_API_KEY`. Per phase: `supabase db push` to prod.

**Top risks & mitigations:** (1) SQL function re-declaration drift across
022–024 → migration regex tests assert exact signatures + apply-order
runbook; (2) handle abuse → ASCII CHECK, leet-normalized denylist, cooldown,
admin rename; (3) Discord caps/leaks → 400-clan guard, app-layer encryption
+ deny-all RLS, refresh-failure degradation, 30-day sweep; (4) AI
cost/injection → cache dedup, per-kind caps, daily breaker, kill switch,
deterministic fallback; (5) identity-view performance → PK/index joins
only, 10k-synthetic-player load test, documented materialized-view escape
hatch.
