# Clan Duels — System Spec (v1, locked design)

Weekly head-to-head clan competition where DNA-per-energy efficiency decides wins.
Skill dominates: score caps prevent purchased-energy volume from buying victories.

## Rules

- **Cadence:** ISO weeks — Monday 00:00 UTC to the next Monday 00:00 UTC
  (`duel_week_start()` = `date_trunc('week', now() AT TIME ZONE 'UTC')`).
- **Matchmaking:** each week, all clans with >= 1 member are sorted by rating and
  paired adjacently (1-2, 3-4, ...). An odd clan out gets a **bye** (`clan_b IS NULL`,
  status `bye`): no rating change, no bonus.
- **One matchup per clan per week** (`UNIQUE(week_start, clan_a)` / `(week_start, clan_b)`).

## Scoring

Clan score for a week = **sum over the clan's top 10 contributors** of each member's
**best 30 runs** (by `dna_earned`) inside `[week_start, week_start + 7d)`.

- Only completed sessions count: `ended_at IS NOT NULL AND dna_earned > 0`.
- Caps: best-30-runs-per-member + top-10-members keep grinding/energy purchases from
  outscoring efficient play; a skilled member's great runs beat a whale's many mediocre ones.
- Implemented in SQL (`clan_week_scores(p_week_start)`) with `row_number()` windows over
  `game_sessions` joined via `clan_members -> players (user_id) -> game_sessions (player_id)`.
- **Live scores** are computed on read (never cached); final scores are frozen into
  `clan_duels.score_a/score_b` at settlement.

## Rating (ELO-ish)

- Start **1000**, K = **32**.
- `expected(winner) = 1 / (1 + 10^((R_loser - R_winner) / 400))`
- Winner takes `ROUND(K * (1 - expected))` points from the loser; `duel_wins`/`duel_losses`
  are incremented; the transfer is stored in `clan_duels.rating_delta`.
- **Ties split:** no rating change, no bonus, no win/loss recorded.
- TS mirror for UI projections: `src/lib/clan/elo.ts` (`projectedRatingChange`).

## Duel-Win DNA Bonus

- Winning clan earns a **+5% clan-wide DNA multiplier for the NEXT week**.
- Source of truth: SQL `clan_duel_bonus(p_player_id)` → `1.05` if the player's clan won
  the previous ISO week's settled duel, else `1.0`.
- Applied via the existing multiplier stack (`src/lib/server/dnaMultipliers.ts`):
  `total = streak x dynasty x setBonus x clanDuel`. RPC failures are non-fatal (fallback x1).

## Lazy Settlement (no cron)

`settle_and_pair_duels()` — idempotent, `SECURITY DEFINER`:

1. Takes `pg_advisory_xact_lock(hashtext('clan_duels_settle'))` (prevents double-settlement).
2. Settles every `active` duel whose week has ended: final scores, winner, ELO transfer,
   record update, `status = 'settled'`.
3. Pairs the current week if it has no rows yet.
4. Re-running does nothing new.

Invoked opportunistically:
- `get_clan_duel(p_clan_id)` (called by `GET /api/clan/duel`) always settles+pairs first.
- `clan_duel_bonus()` settles only if the player's clan has an unsettled previous-week
  duel (keeps the game-end reward path cheap).

Clans created after the week was paired sit out until next Monday (`duel: null` in the API).

## Surfaces

- **Migration:** `supabase/migrations/011_clan_duels.sql` (clans.rating/duel_wins/duel_losses,
  `clan_duels` table, scoring + settlement + read RPCs, RLS read-only for players).
- **API:** `GET /api/clan/duel` (Bearer auth; 404 when not in a clan) →
  `{ duel { weekStart, status, isBye, opponent, myScore, theirScore, endsAt, myTopContributors }, rating, record, lastWeek }`.
- **UI:** "THIS WEEK'S DUEL" panel on `/clan` (`src/components/clan/DuelPanel.tsx`):
  live score bars (venom-orange vs strike-red), countdown, projected rating change,
  top-contributor list, record + rating chip, bye state, last-week banner with
  +5% DNA bonus indicator.

## Evolution Notes (toward Territory Wars)

- `clan_duels` generalizes to N-clan brackets: keep `week_start` keying, replace pairing
  with group assignment; scoring function is already per-clan and reusable.
- Rating is the seeding backbone for leagues/divisions later; ELO can gain per-division
  K-factors without schema change.
- Territory Wars can layer map control on top: each week's duel outcome claims/holds
  territory nodes; `rating_delta` and `winner` history provide the persistence spine.
- Contributor data (`clan_top_contributors`) is ready for member-level rewards (MVP-of-week).
