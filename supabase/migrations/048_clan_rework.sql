-- ############################################################################
-- ##                                                                        ##
-- ##  MIGRATION 048 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ##                                                                        ##
-- ##  WP-1.02 wrote and reviewed this file and deliberately did NOT run     ##
-- ##  `supabase db push`, `db reset`, `link` or `start`. It is committed    ##
-- ##  as the schema half of the change; applying it to staging and then     ##
-- ##  production is an owner decision, taken with the release runbook       ##
-- ##  (docs/ops/RELEASE_RUNBOOK.md) in hand.                                ##
-- ##                                                                        ##
-- ############################################################################
--
-- Migration 048: The clan rework — a witness, not an institution
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §9.1 (what clans are for), §9.2 (the
-- design: cap 12, the clan of one, founding, invite links, additive display),
-- §9.3 (degradation at scale; the population-gated layers), §9.4 (symmetry —
-- self-referential primary, pairing as a layer, rivalry memory), §9.5 (why the
-- Hunt can never become pressure to spend), §12.2 (the caps), and Rules 5, 6,
-- 8 and 11. Finding F-7 (docs/ops/CONSTITUTION_BUILD_LOG.md) is closed here.
--
-- WHAT CHANGES
--
--   1. THE CAP IS 12 (§9.2, §12.2). `clans.max_members` moves from a default
--      of 50 with a CHECK of 20–50 to a default of 12 with a CHECK of 1–12.
--      The 20 floor — never enforced anywhere, and flatly against "the clan of
--      one is a first-class citizen" — goes with it. NO MEMBERSHIP IS REMOVED:
--      a grandfathered clan over 12 keeps every member and simply cannot grow.
--
--   2. TENURE SURVIVES LEAVING (F-7, Rule 6). `clan_members` is CURRENT
--      membership and stays that way, but leaving now writes the span into
--      `clan_membership_history` first. Tenure — which Rule 6 names in the
--      same breath as records and lineage — is therefore permanent, and
--      leaving is a membership ending rather than an erasure of history.
--      `clan_tenure_since()` answers "since when" across any number of
--      leave/rejoin cycles.
--
--   3. THE GRADED-CONTRIBUTION COLUMNS ARE GONE (Rule 8). `clan_members`
--      loses `weekly_contribution` and `total_contribution`; `clans` loses
--      `weekly_score` and `total_score`; `add_clan_contribution()` and
--      `reset_weekly_clan_scores()` are dropped. They are the pre-Constitution
--      grading instruments — the columns a "minimum weekly DNA" cut line would
--      have been built on — and §12.2 caps public numbers at two besides. What
--      a member gives a clan is Depth, which WP-1.01 already sums additively.
--
--   4. THERE IS NO OFFICER (Rule 8, §9.2). The `officer` role is converted to
--      `member`, the CHECK narrows to `owner | member`, and
--      `set_clan_member_role()` is DROPPED. See section 5 for the full
--      argument; the short version is that the acceptance criterion for this
--      work package is structural — no endpoint, no column, no affordance —
--      and a promotable rank is an affordance.
--
--   5. FOUNDING AND JOINING ARE RPCs (Rule 11). `found_clan` makes a clan of
--      one in a single transaction, with preset heraldry and its invite code.
--      `join_clan_by_code` is the ONLY way into someone else's clan (§9.2:
--      "invite links are the only recruitment surface"), and it enforces the
--      cap in SQL rather than in a route that could be bypassed.
--
--   6. PAIRED WEEKS REPLACE DUELS (§9.4). `clan_week_pairings`,
--      `clan_rivalry_memory` and `clan_laurels` ride the Serpent week WP-1.01
--      already settles. The primary weekly outcome stays self-referential;
--      pairing is a layer that happens only when a symmetric rival exists.
--      Outcomes pay laurels and Chronicle entries. They pay NOTHING ELSE, and
--      there is no statement in this file through which they could.
--
--   7. NOTHING GATED IS DELETED (§9.3, §12.1 slot 7). `clan_duels`,
--      `gauntlet_picks`, `clan_research`, `clan_tithes` and the season
--      champion rows are untouched. The Gauntlet and the playoffs are hidden
--      by `NEXT_PUBLIC_CLAN_GAUNTLET` / `NEXT_PUBLIC_CLAN_PLAYOFFS`, both
--      defaulted off. Hiding a layer must never cost the state behind it.
--
-- WHY NOTHING HERE CAN GRADE A CLAN OR BILL ONE (Rule 8, §9.5)
--
--   The reviewer's three questions have structural answers in this file:
--
--     "Can any member's reward change because of another member's number?"
--        No path in this migration writes `players.dna`, `total_dna_earned`,
--        `economy_transactions`, a cosmetic, an entitlement or a charge. Grep
--        it: those identifiers do not appear. Pairing pays a laurel row and a
--        Chronicle row, both of which are records.
--
--     "Can money change any clan number?"
--        The only inputs to any clan number here are `serpent_week_clans.depth`
--        (itself a sum of `game_sessions.yield_dna`) and `clans.member_count`.
--        Neither reads an entitlement, a subscription or a purchase.
--
--     "Does any UI give an officer a mechanical reason to evaluate a member?"
--        There is no officer. There is no per-member evaluative column left on
--        `clan_members` at all — after section 4 the table holds a clan id, an
--        auth id, a role of two values and two timestamps.
--
-- DOWN-NOTE (forward-only)
--
--   This migration is forward-only. Three of its changes are destructive by
--   design and are NOT reversible by re-running anything: the four
--   contribution/score columns, `add_clan_contribution`,
--   `reset_weekly_clan_scores` and `set_clan_member_role` are removed because
--   Rule 8 forbids them existing, not because they were in the way.
--
--   To roll the FEATURE back, unset `NEXT_PUBLIC_CLAN_V2` — the flag is the
--   rollback path and `clan.flagOff.test.ts` exercises it. The gated layers
--   roll back the same way, through their own flags, with their state intact.
--
--   To roll the ADDITIVE SCHEMA back (only ever correct before any clan has
--   been founded or any week paired, since a settled laurel is an earned thing
--   and Rule 6 forbids destroying it):
--
--     DROP FUNCTION IF EXISTS settle_clan_week_pairings(UUID);
--     DROP FUNCTION IF EXISTS clan_rivalry_streak(UUID, UUID);
--     DROP FUNCTION IF EXISTS apply_clan_week_pairings(UUID, JSONB);
--     DROP FUNCTION IF EXISTS rotate_clan_invite_code(UUID);
--     DROP FUNCTION IF EXISTS set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS transfer_clan_ownership(UUID, UUID);
--     DROP FUNCTION IF EXISTS remove_clan_member(UUID, UUID);
--     DROP FUNCTION IF EXISTS leave_clan(UUID);
--     DROP FUNCTION IF EXISTS join_clan_by_code(UUID, TEXT);
--     DROP FUNCTION IF EXISTS found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
--     DROP FUNCTION IF EXISTS clan_tenure_since(UUID, UUID);
--     DROP FUNCTION IF EXISTS generate_clan_invite_code();
--     DROP TABLE IF EXISTS clan_laurels;
--     DROP TABLE IF EXISTS clan_rivalry_memory;
--     DROP TABLE IF EXISTS clan_week_pairings;
--     DROP TABLE IF EXISTS clan_membership_history;
--     ALTER TABLE clans DROP COLUMN IF EXISTS invite_code,
--                       DROP COLUMN IF EXISTS invite_code_rotated_at,
--                       DROP COLUMN IF EXISTS disbanded_at;
--     ALTER TABLE serpent_chronicle_entries DROP COLUMN IF EXISTS rival_clan_id;
--
--   The cap, the officer removal and the column drops are not on that list on
--   purpose. Reversing them would reintroduce a Rule 8 violation.

BEGIN;

-- ===========================================================================
-- 1. SNAPSHOT — the Rule 6 tripwire (pattern: migrations 041, 042, 044, 046)
-- ===========================================================================
--
-- Everything a player owns that this migration could conceivably move is
-- captured first. Section 14 compares and aborts the whole transaction if a
-- single value moved down or a single row vanished.
--
-- Memberships are snapshotted by (clan, player, joined_at): the strongest
-- available statement of "this exact tenure existed before the migration". If
-- one of them is missing afterwards, F-7 was fixed by destroying the thing it
-- was about, and production must never see that.

CREATE TEMP TABLE clan_pre_migration_members ON COMMIT DROP AS
SELECT clan_id, player_id, joined_at, role
FROM clan_members;

CREATE TEMP TABLE clan_pre_migration_clans ON COMMIT DROP AS
SELECT
  id,
  COALESCE(member_count, 0)    AS member_count,
  COALESCE(lifetime_depth, 0)  AS lifetime_depth,
  COALESCE(best_week_depth, 0) AS best_week_depth
FROM clans;

CREATE TEMP TABLE clan_pre_migration_players ON COMMIT DROP AS
SELECT
  id,
  COALESCE(dna, 0)              AS dna,
  COALESCE(total_dna_earned, 0) AS total_dna_earned,
  COALESCE(lifetime_depth, 0)   AS lifetime_depth,
  COALESCE(best_week_depth, 0)  AS best_week_depth
FROM players;

-- The gated layers' state, so "hidden but preserved" is a checked claim and
-- not a promise in a comment.
CREATE TEMP TABLE clan_pre_migration_duels ON COMMIT DROP AS
SELECT id FROM clan_duels;

-- ===========================================================================
-- 2. The cap is 12 (§9.2, §12.2)
-- ===========================================================================
--
-- The old CHECK was `max_members >= 20 AND max_members <= 50`, which made a
-- clan of one structurally impossible to describe even though matchmaking
-- already accepted one. Both bounds move.
--
-- Existing rows are rewritten to 12 rather than clamped per-clan, because a
-- cap that varies per clan is a cap nobody can reason about. A clan that
-- somehow holds more than 12 members today keeps ALL of them — the constraint
-- is on `max_members`, never on `member_count`, and no member row is touched.

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clan_member_limits;

ALTER TABLE clans ALTER COLUMN max_members SET DEFAULT 12;

UPDATE clans SET max_members = 12 WHERE max_members IS DISTINCT FROM 12;

ALTER TABLE clans ADD CONSTRAINT clan_member_limits
  CHECK (max_members >= 1 AND max_members <= 12);

COMMENT ON COLUMN clans.max_members IS
  'Constitution §9.2/§12.2: 1-12, soft-full at 6. There is no minimum: a clan of one is a first-class citizen.';

DO $$
DECLARE
  v_over INT;
BEGIN
  SELECT COUNT(*) INTO v_over FROM clans WHERE member_count > 12;
  IF v_over > 0 THEN
    RAISE NOTICE
      'Migration 048: % clan(s) hold more than 12 members. Every membership is preserved; they simply cannot grow. (Rule 6 over §12.2 for rows that already exist.)',
      v_over;
  END IF;
END;
$$;

-- Soft-disband: a clan can end without its records ending with it (Rule 6).
-- Nothing in this migration ever DELETEs a `clans` row, because the row is the
-- foreign key that `serpent_week_clans`, `serpent_chronicle_entries` and
-- `clan_laurels` hang their permanent history from.
ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS disbanded_at TIMESTAMPTZ;

COMMENT ON COLUMN clans.disbanded_at IS
  'Set when the last member leaves. The clan stops appearing in the directory and stops being paired; its Depth records, laurels and Chronicle entries remain readable forever (Rule 6).';

CREATE INDEX IF NOT EXISTS idx_clans_alive
  ON clans (id) WHERE disbanded_at IS NULL;

-- ===========================================================================
-- 3. Tenure survives leaving — closing F-7 (Rule 6)
-- ===========================================================================
--
-- The finding: `clan/route.ts:476` hard-deleted the `clan_members` row on
-- leave, and `joined_at` — clan tenure — went with it. Rule 6 names tenure in
-- its own list of permanent things.
--
-- The fix keeps `clan_members` meaning exactly what every existing reader
-- already assumes (CURRENT membership — the serpent panel, the RLS policies,
-- and the 011/020/024 RPCs all depend on that) and moves the permanence into
-- a companion table of closed spans. Leaving writes the span, THEN ends the
-- membership, inside one transaction: there is no ordering in which the
-- history is lost.
--
-- No backfill: every membership that exists right now is still open, so it has
-- no span to record yet. The first row appears the first time someone leaves.

CREATE TABLE IF NOT EXISTS clan_membership_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id    UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  -- auth.users id, matching `clan_members.player_id`. See the COMMENT in
  -- section 12 for why this id-space is what it is.
  player_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL,
  left_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'left' | 'removed' | 'disbanded'. Recorded because the three read
  -- differently in a Chronicle; never read by any computation.
  ended_by   TEXT NOT NULL DEFAULT 'left',

  CONSTRAINT clan_membership_span CHECK (left_at >= joined_at),
  CONSTRAINT clan_membership_ended_by CHECK (ended_by IN ('left', 'removed', 'disbanded')),
  -- One span per (clan, player, start). Re-running a leave cannot fork history.
  CONSTRAINT clan_membership_unique_span UNIQUE (clan_id, player_id, joined_at)
);

CREATE INDEX IF NOT EXISTS idx_clan_membership_history_player
  ON clan_membership_history (player_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_clan_membership_history_clan
  ON clan_membership_history (clan_id, joined_at);

COMMENT ON TABLE clan_membership_history IS
  'Closed membership spans. Written before a membership ends so clan tenure (Rule 6) survives leaving, being removed, or the clan disbanding. Insert-only: service_role has SELECT and INSERT and nothing else.';

/**
 * Since when has this player belonged to this clan?
 *
 * The earliest start across every span they have ever held there plus the
 * membership they hold now. Leaving and rejoining therefore RESTORES tenure
 * rather than restarting it — which is the whole point of Rule 6 naming
 * tenure, and the behaviour `clan.tenure.test.ts` pins.
 */
CREATE OR REPLACE FUNCTION clan_tenure_since(p_clan_id UUID, p_player_id UUID)
RETURNS TIMESTAMPTZ
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT MIN(joined_at) FROM (
    SELECT joined_at FROM clan_members
      WHERE clan_id = p_clan_id AND player_id = p_player_id
    UNION ALL
    SELECT joined_at FROM clan_membership_history
      WHERE clan_id = p_clan_id AND player_id = p_player_id
  ) AS spans;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION clan_tenure_since(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION clan_tenure_since(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION clan_tenure_since(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION clan_tenure_since(UUID, UUID) TO service_role;

-- ===========================================================================
-- 4. The graded-contribution columns are removed (Rule 8)
-- ===========================================================================
--
-- WP-1.01 found these still standing and filed them as Rule 8 debt. They are
-- removed rather than neutralised, and the choice is deliberate: a column that
-- exists is a column a surface can render, and the specific shape Rule 8
-- forbids — "no reward thresholds, no pass/fail bars, no intra-clan reward
-- mathematics" — is exactly what `weekly_contribution DESC` with an index on
-- it was for. `idx_clan_members_contribution` was a leaderboard of your own
-- clanmates waiting for a query.
--
-- Nothing in `src/` reads them: `add_clan_contribution` has no caller,
-- `reset_weekly_clan_scores` has no caller and no cron, and the only reader of
-- the columns was the roster payload this work package rewrites.
--
-- What replaces them is already live: `serpent_week_players.depth`, summed
-- additively into `serpent_week_clans.depth` by WP-1.01, displayed as
-- "Sans_Souci fed 2,315 segments" with no bar next to it.

DROP INDEX IF EXISTS idx_clan_members_contribution;
DROP INDEX IF EXISTS idx_clans_weekly_score;

DROP FUNCTION IF EXISTS add_clan_contribution(UUID, INT);
DROP FUNCTION IF EXISTS reset_weekly_clan_scores();

ALTER TABLE clan_members
  DROP COLUMN IF EXISTS weekly_contribution,
  DROP COLUMN IF EXISTS total_contribution;

ALTER TABLE clans
  DROP COLUMN IF EXISTS weekly_score,
  DROP COLUMN IF EXISTS total_score;

-- ===========================================================================
-- 5. There is no officer (Rule 8, §9.2)
-- ===========================================================================
--
-- §9.2 permits plain roster management and forbids "a stat-gated tool, a
-- minimum-Depth field, or any officer lever keyed to output". WP-1.02's
-- acceptance criterion is the stronger one — NO OFFICER LEVER EXISTS — and
-- that is a structural claim, so it gets a structural answer.
--
-- The reasoning: `set_clan_member_role` did not itself read a member's
-- output. But a rank that an owner grants and revokes at will is the
-- affordance that makes evaluation feel available, and the first feature
-- request against it is always "how do I decide who deserves it?" — which is
-- the bar Rule 8 exists to prevent anyone from drawing. Two roles remain:
-- `owner` (the person who founded it, or was handed it) and `member`. The
-- owner can remove someone and can hand the clan over. Neither act reads a
-- number about the person, and neither has a rank to dangle.
--
-- Existing officers become members. That is a permission change, not a
-- confiscation of an earned thing: no record, cosmetic, tenure, lineage or
-- history moves, and `clan_membership_history` is not written because nobody
-- left anything.

UPDATE clan_members SET role = 'member' WHERE role = 'officer';

ALTER TABLE clan_members DROP CONSTRAINT IF EXISTS valid_clan_role;
ALTER TABLE clan_members ADD CONSTRAINT valid_clan_role
  CHECK (role IN ('owner', 'member'));

COMMENT ON COLUMN clan_members.role IS
  'owner | member. Constitution Rule 8: there is no officer rank and no lever keyed to a member''s output. The owner may remove a member and may transfer the clan; nothing else in the schema distinguishes them.';

-- The lever itself.
DROP FUNCTION IF EXISTS set_clan_member_role(UUID, UUID, TEXT);

-- The RLS policies that named the rank. Invites are now owner-authored only,
-- and in practice not authored at all: `join_clan_by_code` replaced them.
DROP POLICY IF EXISTS clan_invites_select ON clan_invites;
CREATE POLICY clan_invites_select ON clan_invites
  FOR SELECT TO authenticated
  USING (
    player_id = auth.uid() OR
    invited_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_invites.clan_id
        AND cm.player_id = auth.uid()
        AND cm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS clan_invites_insert ON clan_invites;
CREATE POLICY clan_invites_insert ON clan_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clan_members cm
      WHERE cm.clan_id = clan_invites.clan_id
        AND cm.player_id = auth.uid()
        AND cm.role = 'owner'
    )
  );

-- ===========================================================================
-- 6. Invite codes — the only recruitment surface (§9.2, §11.3, Rule 14)
-- ===========================================================================
--
-- "Invite links are the only recruitment surface … the invite is the
-- acquisition artifact." One code per clan, rotatable by the owner, and a URL
-- built from it (`/clan/join/<code>`) so the artifact satisfies Rule 14.
--
-- The alphabet drops I, O, 0 and 1 so a code survives being read aloud in a
-- Discord voice channel, which is where these actually travel.

ALTER TABLE clans
  ADD COLUMN IF NOT EXISTS invite_code TEXT,
  ADD COLUMN IF NOT EXISTS invite_code_rotated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION generate_clan_invite_code()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     TEXT;
  v_source   TEXT;
  v_attempt  INT := 0;
  i          INT;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := '';
    v_source := replace(gen_random_uuid()::TEXT, '-', '');
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(decode(substr(v_source, i * 2 - 1, 2), 'hex'), 0) % 32) + 1,
        1
      );
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM clans WHERE invite_code = v_code);
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'generate_clan_invite_code could not find a free code in % attempts', v_attempt;
    END IF;
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION generate_clan_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_clan_invite_code() FROM anon;
REVOKE ALL ON FUNCTION generate_clan_invite_code() FROM authenticated;
GRANT EXECUTE ON FUNCTION generate_clan_invite_code() TO service_role;

-- Backfill, then make the column total. Every clan that exists gets a code so
-- no clan is unshareable.
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN SELECT id FROM clans WHERE invite_code IS NULL LOOP
    UPDATE clans
    SET invite_code = generate_clan_invite_code(),
        invite_code_rotated_at = NOW()
    WHERE id = v_row.id;
  END LOOP;
END;
$$;

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_invite_code_unique;
ALTER TABLE clans ADD CONSTRAINT clans_invite_code_unique UNIQUE (invite_code);

ALTER TABLE clans DROP CONSTRAINT IF EXISTS clans_invite_code_format;
ALTER TABLE clans ADD CONSTRAINT clans_invite_code_format
  CHECK (invite_code IS NULL OR invite_code ~ '^[A-HJ-NP-Z2-9]{8}$');

COMMENT ON COLUMN clans.invite_code IS
  'Constitution §9.2/§11.3: invite links are the only recruitment surface. Rotatable by the owner; the previous code stops working the moment it rotates.';

-- ===========================================================================
-- 7. found_clan — the clan of one, in one transaction (§9.2)
-- ===========================================================================
--
-- "Founding is one tap plus a name." Name, optional tag, preset heraldry. The
-- clan exists with exactly one member, holds records from its first week, and
-- is paired the moment a symmetric rival exists — none of which needs a second
-- person to arrive first.
--
-- Preset heraldry is applied HERE rather than through `update_clan_identity`
-- (migration 024), which gates edits behind the `heraldry_1` research node. That
-- node lives in the Gauntlet, and the Gauntlet is behind a population gate that
-- will not open for a long time (§9.3). Identity is not a reward for reaching a
-- population threshold, so founding sets it directly and `set_clan_heraldry`
-- (section 11) lets the owner change it afterwards without the research gate.

CREATE OR REPLACE FUNCTION found_clan(
  p_user_id         UUID,
  p_name            TEXT,
  p_tag             TEXT DEFAULT NULL,
  p_banner_id       TEXT DEFAULT NULL,
  p_emblem_id       TEXT DEFAULT NULL,
  p_color_primary   TEXT DEFAULT NULL,
  p_color_secondary TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name  TEXT;
  v_tag   TEXT;
  v_base  TEXT;
  v_code  TEXT;
  v_clan  clans%ROWTYPE;
  v_suffix INT := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 3 OR char_length(v_name) > 20
     OR v_name !~ '^[A-Za-z0-9][A-Za-z0-9 ''\-]*[A-Za-z0-9]$'
     OR v_name ~ '\s\s' THEN
    RETURN jsonb_build_object('error', 'invalid_name');
  END IF;

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  -- Tag: taken as given, or derived from the name. Collisions are resolved
  -- here rather than bounced back to the founder, because §9.2 says founding
  -- is one tap plus a name and a tag clash is not the founder's problem.
  v_base := upper(regexp_replace(COALESCE(NULLIF(btrim(p_tag), ''), v_name), '[^A-Za-z0-9]', '', 'g'));
  IF char_length(v_base) < 2 THEN
    v_base := 'CLAN';
  END IF;
  v_tag := substr(v_base, 1, 6);
  WHILE EXISTS (SELECT 1 FROM clans WHERE tag = v_tag) LOOP
    v_suffix := v_suffix + 1;
    IF v_suffix > 99 THEN
      RETURN jsonb_build_object('error', 'tag_unavailable');
    END IF;
    v_tag := substr(v_base, 1, 6 - char_length(v_suffix::TEXT)) || v_suffix::TEXT;
  END LOOP;

  IF p_banner_id IS NOT NULL AND p_banner_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_banner');
  END IF;
  IF p_emblem_id IS NOT NULL AND p_emblem_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_emblem');
  END IF;
  IF (p_color_primary IS NOT NULL AND p_color_primary !~ '^#[0-9a-fA-F]{6}$')
     OR (p_color_secondary IS NOT NULL AND p_color_secondary !~ '^#[0-9a-fA-F]{6}$') THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;

  v_code := generate_clan_invite_code();

  INSERT INTO clans (
    name, tag, description, owner_id, member_count, max_members,
    banner_id, emblem_id, color_primary, color_secondary,
    invite_code, invite_code_rotated_at
  )
  VALUES (
    v_name, v_tag, '', p_user_id, 1, 12,
    p_banner_id, p_emblem_id, p_color_primary, p_color_secondary,
    v_code, NOW()
  )
  RETURNING * INTO v_clan;

  INSERT INTO clan_members (clan_id, player_id, role)
  VALUES (v_clan.id, p_user_id, 'owner');

  RETURN jsonb_build_object(
    'clan_id', v_clan.id,
    'name', v_clan.name,
    'tag', v_clan.tag,
    'invite_code', v_clan.invite_code,
    'member_count', 1,
    'max_members', v_clan.max_members
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION found_clan(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ===========================================================================
-- 8. join_clan_by_code — the cap, enforced in SQL (§9.2, §12.2, Rule 11)
-- ===========================================================================
--
-- `FOR UPDATE` on the clan row is what makes the cap real. Twelve people
-- pasting the same link at the same second serialize on that lock, and the
-- thirteenth is refused by a count read inside the same transaction that
-- inserts — not by a `member_count` column that a concurrent join could have
-- made stale.

CREATE OR REPLACE FUNCTION join_clan_by_code(p_user_id UUID, p_code TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clan    clans%ROWTYPE;
  v_members INT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_code IS NULL OR upper(btrim(p_code)) !~ '^[A-HJ-NP-Z2-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'invalid_code');
  END IF;

  IF EXISTS (SELECT 1 FROM clan_members WHERE player_id = p_user_id) THEN
    RETURN jsonb_build_object('error', 'already_in_clan');
  END IF;

  SELECT * INTO v_clan FROM clans
   WHERE invite_code = upper(btrim(p_code))
   FOR UPDATE;

  IF v_clan.id IS NULL THEN
    RETURN jsonb_build_object('error', 'clan_not_found');
  END IF;
  IF v_clan.disbanded_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'clan_disbanded');
  END IF;

  SELECT COUNT(*) INTO v_members FROM clan_members WHERE clan_id = v_clan.id;
  IF v_members >= v_clan.max_members THEN
    RETURN jsonb_build_object('error', 'clan_full');
  END IF;

  INSERT INTO clan_members (clan_id, player_id, role)
  VALUES (v_clan.id, p_user_id, 'member');

  UPDATE clans
  SET member_count = v_members + 1, updated_at = NOW()
  WHERE id = v_clan.id;

  -- Any invite this player was holding is answered by the act of joining.
  UPDATE clan_invites
  SET status = 'accepted'
  WHERE player_id = p_user_id AND clan_id = v_clan.id AND status = 'pending';

  RETURN jsonb_build_object(
    'clan_id', v_clan.id,
    'name', v_clan.name,
    'tag', v_clan.tag,
    'member_count', v_members + 1,
    'max_members', v_clan.max_members
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION join_clan_by_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION join_clan_by_code(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION join_clan_by_code(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION join_clan_by_code(UUID, TEXT) TO service_role;

-- ===========================================================================
-- 9. leave_clan / remove_clan_member — F-7's fix, both directions
-- ===========================================================================
--
-- Leaving archives the span and THEN ends the membership. The order is the
-- fix: an interrupted transaction rolls both back together, so there is no
-- window in which the membership is gone and the tenure was never written.
--
-- The owner of a clan with other members must hand it over first — otherwise
-- the invite code, the heraldry and the roster have no one behind them. The
-- owner of a clan of ONE simply disbands it: the clan row survives with
-- `disbanded_at` set, and every Depth row, laurel and Chronicle entry the clan
-- ever earned stays exactly where it is (Rule 6). "Leaving or merging clans
-- carries your personal Depth history with you; clan records stay with the
-- clan" (§9.2) is true because neither side is deleted.

CREATE OR REPLACE FUNCTION leave_clan(p_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member    clan_members%ROWTYPE;
  v_remaining INT;
  v_disbanded BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_member FROM clan_members WHERE player_id = p_user_id;
  IF v_member.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;

  PERFORM 1 FROM clans WHERE id = v_member.clan_id FOR UPDATE;

  SELECT COUNT(*) INTO v_remaining
  FROM clan_members WHERE clan_id = v_member.clan_id;

  IF v_member.role = 'owner' AND v_remaining > 1 THEN
    RETURN jsonb_build_object('error', 'owner_must_transfer');
  END IF;

  -- Tenure first, always.
  INSERT INTO clan_membership_history (clan_id, player_id, joined_at, left_at, ended_by)
  VALUES (
    v_member.clan_id,
    p_user_id,
    v_member.joined_at,
    NOW(),
    CASE WHEN v_remaining = 1 THEN 'disbanded' ELSE 'left' END
  )
  ON CONFLICT (clan_id, player_id, joined_at) DO NOTHING;

  -- constitution-allow: owned-row-downward  ends a CURRENT membership after clan_membership_history has recorded the span; tenure is preserved, not destroyed (F-7)
  DELETE FROM clan_members WHERE player_id = p_user_id AND clan_id = v_member.clan_id;

  IF v_remaining = 1 THEN
    UPDATE clans
    SET member_count = 0,
        disbanded_at = COALESCE(disbanded_at, NOW()),
        updated_at = NOW()
    WHERE id = v_member.clan_id;
    v_disbanded := TRUE;
  ELSE
    UPDATE clans
    SET member_count = GREATEST(v_remaining - 1, 0), updated_at = NOW()
    WHERE id = v_member.clan_id;
  END IF;

  RETURN jsonb_build_object(
    'clan_id', v_member.clan_id,
    'disbanded', v_disbanded,
    'tenure_since', clan_tenure_since(v_member.clan_id, p_user_id)
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION leave_clan(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION leave_clan(UUID) FROM anon;
REVOKE ALL ON FUNCTION leave_clan(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION leave_clan(UUID) TO service_role;

/**
 * Removal — plain roster management (§9.2), owner only.
 *
 * It takes a target and nothing else. There is no reason parameter, no
 * threshold, no "below minimum Depth" precondition and no number of the
 * target's anywhere in the signature or the body. That is what makes it
 * roster management rather than an officer lever: the schema gives the owner
 * no measurement to justify it with.
 */
CREATE OR REPLACE FUNCTION remove_clan_member(p_user_id UUID, p_target_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
  v_remaining INT;
BEGIN
  IF p_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;
  IF p_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'use_leave');
  END IF;

  SELECT * INTO v_caller FROM clan_members WHERE player_id = p_user_id;
  IF v_caller.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_caller.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  PERFORM 1 FROM clans WHERE id = v_caller.clan_id FOR UPDATE;

  SELECT * INTO v_target FROM clan_members
   WHERE player_id = p_target_user_id AND clan_id = v_caller.clan_id;
  IF v_target.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'target_not_in_clan');
  END IF;

  INSERT INTO clan_membership_history (clan_id, player_id, joined_at, left_at, ended_by)
  VALUES (v_target.clan_id, p_target_user_id, v_target.joined_at, NOW(), 'removed')
  ON CONFLICT (clan_id, player_id, joined_at) DO NOTHING;

  -- constitution-allow: owned-row-downward  ends a CURRENT membership after clan_membership_history has recorded the span; tenure is preserved, not destroyed (F-7)
  DELETE FROM clan_members
   WHERE player_id = p_target_user_id AND clan_id = v_caller.clan_id;

  SELECT COUNT(*) INTO v_remaining FROM clan_members WHERE clan_id = v_caller.clan_id;
  UPDATE clans SET member_count = v_remaining, updated_at = NOW() WHERE id = v_caller.clan_id;

  RETURN jsonb_build_object('clan_id', v_caller.clan_id, 'member_count', v_remaining);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION remove_clan_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION remove_clan_member(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION remove_clan_member(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION remove_clan_member(UUID, UUID) TO service_role;

-- ===========================================================================
-- 10. transfer_clan_ownership — so an owner can leave (§9.2, Rule 5)
-- ===========================================================================
--
-- Without this, the owner of a clan is trapped in it, which would make
-- absence destructive in the one direction Rule 5 did not anticipate. The
-- transfer is unconditional: any current member may receive it, and nothing
-- about their Depth, tenure or attendance is consulted.

CREATE OR REPLACE FUNCTION transfer_clan_ownership(p_user_id UUID, p_target_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller clan_members%ROWTYPE;
  v_target clan_members%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_target_user_id IS NULL OR p_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_caller FROM clan_members WHERE player_id = p_user_id;
  IF v_caller.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_caller.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_target FROM clan_members
   WHERE player_id = p_target_user_id AND clan_id = v_caller.clan_id;
  IF v_target.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'target_not_in_clan');
  END IF;

  UPDATE clan_members SET role = 'member'
   WHERE clan_id = v_caller.clan_id AND player_id = p_user_id;
  UPDATE clan_members SET role = 'owner'
   WHERE clan_id = v_caller.clan_id AND player_id = p_target_user_id;
  UPDATE clans SET owner_id = p_target_user_id, updated_at = NOW()
   WHERE id = v_caller.clan_id;

  RETURN jsonb_build_object('clan_id', v_caller.clan_id, 'owner_id', p_target_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION transfer_clan_ownership(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION transfer_clan_ownership(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION transfer_clan_ownership(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION transfer_clan_ownership(UUID, UUID) TO service_role;

-- ===========================================================================
-- 11. set_clan_heraldry / rotate_clan_invite_code — identity, ungated
-- ===========================================================================

CREATE OR REPLACE FUNCTION set_clan_heraldry(
  p_user_id         UUID,
  p_banner_id       TEXT DEFAULT NULL,
  p_emblem_id       TEXT DEFAULT NULL,
  p_color_primary   TEXT DEFAULT NULL,
  p_color_secondary TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member clan_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM clan_members WHERE player_id = p_user_id;
  IF v_member.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_member.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF p_banner_id IS NOT NULL AND p_banner_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_banner');
  END IF;
  IF p_emblem_id IS NOT NULL AND p_emblem_id !~ '^[a-z0-9_]{1,32}$' THEN
    RETURN jsonb_build_object('error', 'invalid_emblem');
  END IF;
  IF (p_color_primary IS NOT NULL AND p_color_primary !~ '^#[0-9a-fA-F]{6}$')
     OR (p_color_secondary IS NOT NULL AND p_color_secondary !~ '^#[0-9a-fA-F]{6}$') THEN
    RETURN jsonb_build_object('error', 'invalid_color');
  END IF;

  UPDATE clans
  SET banner_id       = COALESCE(p_banner_id, banner_id),
      emblem_id       = COALESCE(p_emblem_id, emblem_id),
      color_primary   = COALESCE(p_color_primary, color_primary),
      color_secondary = COALESCE(p_color_secondary, color_secondary),
      updated_at      = NOW()
  WHERE id = v_member.clan_id;

  RETURN jsonb_build_object('clan_id', v_member.clan_id);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_clan_heraldry(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION rotate_clan_invite_code(p_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member clan_members%ROWTYPE;
  v_code   TEXT;
BEGIN
  SELECT * INTO v_member FROM clan_members WHERE player_id = p_user_id;
  IF v_member.clan_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_in_clan');
  END IF;
  IF v_member.role <> 'owner' THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  v_code := generate_clan_invite_code();
  UPDATE clans
  SET invite_code = v_code, invite_code_rotated_at = NOW(), updated_at = NOW()
  WHERE id = v_member.clan_id;

  RETURN jsonb_build_object('clan_id', v_member.clan_id, 'invite_code', v_code);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION rotate_clan_invite_code(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION rotate_clan_invite_code(UUID) FROM anon;
REVOKE ALL ON FUNCTION rotate_clan_invite_code(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION rotate_clan_invite_code(UUID) TO service_role;

-- ===========================================================================
-- 12. The id-space of clan_members.player_id — recorded, not changed
-- ===========================================================================
--
-- WP-1.01 found that `clan_members.player_id` holds an `auth.users` id, not a
-- `players.id`, so every path bridges through `players.user_id`. WP-1.02 was
-- given discretion to normalise it "if you judge it safe".
--
-- JUDGEMENT: NOT SAFE INSIDE THIS WORK PACKAGE. The column is load-bearing for
-- four RLS policies that compare it directly to `auth.uid()` (which returns an
-- auth id), for a dozen SECURITY DEFINER functions across migrations 011, 020,
-- 023 and 024 — several of them inside the layers this work package is hiding
-- but must not break — and for the guest/registered split, since a guest has a
-- `players` row and no auth identity at all. Normalising means rewriting all of
-- them in one migration, in a work package whose acceptance is about Rule 8,
-- and getting one policy wrong would silently open a clan's roster to writes.
-- A migration that "preserves every membership exactly and asserts it" is the
-- easy half; the hard half is the twelve call sites, and they belong to the
-- packages that own them.
--
-- What is safe, and what this section does, is to make the id-space impossible
-- to get wrong by accident: it is written into the schema, so the next reader
-- does not have to infer it from a join.

COMMENT ON COLUMN clan_members.player_id IS
  'auth.users id, NOT players.id. Named player_id by migration 007; renaming it is a cross-package change (four RLS policies compare it to auth.uid(), and RPCs in 011/020/023/024 read it). Bridge via players.user_id.';

COMMENT ON COLUMN clan_membership_history.player_id IS
  'auth.users id, matching clan_members.player_id. Bridge via players.user_id.';

-- ===========================================================================
-- 13. Paired weeks, rivalry memory and laurels (§9.4)
-- ===========================================================================
--
-- The shipped duel system ran its own weekly calendar (`clan_duels`, keyed on
-- its own `week_start`), its own Elo (`clans.rating`), and paid the winning
-- clan a ×1.05 DNA week — the exploit WP-0.02 deleted. Pairing is folded onto
-- the Serpent week instead: one weekly surface (§12.2), one Depth number
-- (§6.2), and an outcome that pays records.
--
-- `clan_duels` and everything hanging off it is LEFT ALONE. It is the
-- Gauntlet's state (§12.1 slot 7 — "opened, not built"), and the Gauntlet is
-- hidden behind a flag rather than deleted.

CREATE TABLE IF NOT EXISTS clan_week_pairings (
  week_id       UUID NOT NULL REFERENCES serpent_weeks(id) ON DELETE CASCADE,
  -- Canonical ordering: clan_a_id < clan_b_id, so an unordered pair has
  -- exactly one row and "who was listed first" carries no meaning.
  clan_a_id     UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_b_id     UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  size_band     INT  NOT NULL,
  activity_band INT  NOT NULL,
  -- True when this pair continued a standing rivalry rather than being drawn
  -- fresh. §9.4: "Pairing prefers the standing rival while both clans remain
  -- in-band" — sports leagues run on derbies.
  standing_rival BOOLEAN NOT NULL DEFAULT FALSE,
  paired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Filled by settlement, from serpent_week_clans. Never by a client.
  depth_a       BIGINT,
  depth_b       BIGINT,
  outcome       TEXT,
  settled_at    TIMESTAMPTZ,

  PRIMARY KEY (week_id, clan_a_id, clan_b_id),
  CONSTRAINT clan_pairing_ordered CHECK (clan_a_id < clan_b_id),
  CONSTRAINT clan_pairing_outcome CHECK (outcome IS NULL OR outcome IN ('a', 'b', 'draw')),
  CONSTRAINT clan_pairing_depths CHECK (
    (depth_a IS NULL AND depth_b IS NULL) OR (depth_a >= 0 AND depth_b >= 0)
  )
);

-- A clan is in at most ONE pairing per week, on either side. Two partial
-- unique indexes are the schema's way of saying "no clan fights twice".
CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_week_pairings_a
  ON clan_week_pairings (week_id, clan_a_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_week_pairings_b
  ON clan_week_pairings (week_id, clan_b_id);
CREATE INDEX IF NOT EXISTS idx_clan_week_pairings_clan_a
  ON clan_week_pairings (clan_a_id, week_id);
CREATE INDEX IF NOT EXISTS idx_clan_week_pairings_clan_b
  ON clan_week_pairings (clan_b_id, week_id);

COMMENT ON TABLE clan_week_pairings IS
  'Constitution §9.4: the rival LAYER on a Serpent week. A clan with no symmetric rival simply has no row, which is not a failure state — the primary weekly outcome is self-referential and resolves either way.';

/**
 * Rivalry memory (§9.4).
 *
 * NAME NOTE (gate finding, 2026-07-26). This table was originally written as
 * `clan_rivalries`, which collides with the duel-derived VIEW of that name
 * created by migration 020 (`CREATE OR REPLACE VIEW clan_rivalries`). Because
 * a relation of that name already exists, `CREATE TABLE IF NOT EXISTS` was a
 * silent no-op and the very next statement — `CREATE INDEX ... ON
 * clan_rivalries` — aborted the whole migration with SQLSTATE 42809, "cannot
 * create index on relation ... this operation is not supported for views".
 * The failure was invisible to the shape tests, which read this file as text
 * and never read 020. Renaming the new table is the fix that honours point 7
 * of this header: the gated Gauntlet's view keeps its name and its state.
 *
 * Every column here is a RECOMPUTE over the settled
 * rows of `clan_week_pairings`, never an accumulator, so re-settling a week
 * converges instead of compounding — the same argument that makes WP-1.01's
 * Serpent settlement idempotent.
 */
CREATE TABLE IF NOT EXISTS clan_rivalry_memory (
  clan_low_id     UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  clan_high_id    UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  meetings        INT  NOT NULL DEFAULT 0 CHECK (meetings >= 0),
  wins_low        INT  NOT NULL DEFAULT 0 CHECK (wins_low >= 0),
  wins_high       INT  NOT NULL DEFAULT 0 CHECK (wins_high >= 0),
  draws           INT  NOT NULL DEFAULT 0 CHECK (draws >= 0),
  streak_clan_id  UUID REFERENCES clans(id) ON DELETE SET NULL,
  streak_length   INT  NOT NULL DEFAULT 0 CHECK (streak_length >= 0),
  closest_margin  BIGINT NOT NULL DEFAULT 0 CHECK (closest_margin >= 0),
  largest_margin  BIGINT NOT NULL DEFAULT 0 CHECK (largest_margin >= 0),
  first_paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_week_id    UUID REFERENCES serpent_weeks(id) ON DELETE SET NULL,
  last_paired_at  TIMESTAMPTZ,
  -- §9.4: "Either clan may decline continuation at a season boundary,
  -- silently, no forfeit recorded." Silently is the operative word: the
  -- declining clan is not named to the other side, and no outcome is written.
  declined_at     TIMESTAMPTZ,
  declined_by     UUID REFERENCES clans(id) ON DELETE SET NULL,

  PRIMARY KEY (clan_low_id, clan_high_id),
  CONSTRAINT clan_rivalry_ordered CHECK (clan_low_id < clan_high_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_rivalry_memory_low  ON clan_rivalry_memory (clan_low_id);
CREATE INDEX IF NOT EXISTS idx_clan_rivalry_memory_high ON clan_rivalry_memory (clan_high_id);

/**
 * Laurels (§9.4: "Paired outcomes pay heraldic laurels and Chronicle
 * entries — never economy").
 *
 * A laurel is a record. It is insert-only: `service_role` is granted SELECT
 * and INSERT on this table and nothing else, so there is no privilege in the
 * system through which a laurel could be taken back (Rule 6). It has no
 * numeric value, feeds no computation, and cannot be bought — no purchase
 * path can reach `clan_week_pairings`, which is the only thing that writes it.
 */
CREATE TABLE IF NOT EXISTS clan_laurels (
  clan_id       UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  week_id       UUID NOT NULL REFERENCES serpent_weeks(id) ON DELETE CASCADE,
  rival_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (clan_id, week_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_laurels_clan ON clan_laurels (clan_id, awarded_at DESC);

-- The Chronicle learns one more kind (WP-1.01 wrote the table; §9.4 asks for
-- the entry). `rival_clan_id` is additive and nullable, so every existing row
-- and every existing reader is unaffected.
ALTER TABLE serpent_chronicle_entries
  ADD COLUMN IF NOT EXISTS rival_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL;

ALTER TABLE serpent_chronicle_entries DROP CONSTRAINT IF EXISTS serpent_chronicle_kind;
ALTER TABLE serpent_chronicle_entries ADD CONSTRAINT serpent_chronicle_kind
  CHECK (kind IN ('personal_best_week', 'clan_best_week', 'clan_rivalry_week'));

ALTER TABLE serpent_chronicle_entries DROP CONSTRAINT IF EXISTS serpent_chronicle_subject;
ALTER TABLE serpent_chronicle_entries ADD CONSTRAINT serpent_chronicle_subject
  CHECK (
    (kind = 'personal_best_week' AND player_id IS NOT NULL) OR
    (kind = 'clan_best_week'     AND clan_id   IS NOT NULL) OR
    (kind = 'clan_rivalry_week'  AND clan_id   IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_serpent_chronicle_rivalry
  ON serpent_chronicle_entries (week_id, clan_id, kind)
  WHERE clan_id IS NOT NULL AND kind = 'clan_rivalry_week';

-- ---------------------------------------------------------------------------
-- apply_clan_week_pairings — write the week's pairing, once
-- ---------------------------------------------------------------------------
--
-- The caller (`src/lib/server/clanHunt.ts`) computes the pairing with the pure
-- fold in `src/lib/clan/pairing.ts`: bands from `member_count` and trailing
-- four-week activity, standing rivals honoured first, everyone else in
-- lexicographic order. Deterministic, so re-running produces the same pairs.
--
-- ON CONFLICT DO NOTHING everywhere: the FIRST pairing of a week is the
-- pairing of that week. A clan that grew mid-week does not get re-matched, and
-- a second caller cannot move anyone's rival out from under them.

CREATE OR REPLACE FUNCTION apply_clan_week_pairings(p_week_id UUID, p_pairs JSONB)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week    serpent_weeks%ROWTYPE;
  v_written INT := 0;
BEGIN
  SELECT * INTO v_week FROM serpent_weeks w WHERE w.id = p_week_id FOR UPDATE;
  IF v_week.id IS NULL THEN
    RAISE EXCEPTION 'apply_clan_week_pairings: unknown week %', p_week_id;
  END IF;

  WITH incoming AS (
    SELECT
      (entry->>'clan_a_id')::UUID                       AS clan_a_id,
      (entry->>'clan_b_id')::UUID                       AS clan_b_id,
      COALESCE((entry->>'size_band')::INT, 0)           AS size_band,
      COALESCE((entry->>'activity_band')::INT, 0)       AS activity_band,
      COALESCE((entry->>'standing_rival')::BOOLEAN, FALSE) AS standing_rival
    FROM jsonb_array_elements(COALESCE(p_pairs, '[]'::JSONB)) AS entry
  ),
  valid AS (
    SELECT i.* FROM incoming i
    JOIN clans ca ON ca.id = i.clan_a_id AND ca.disbanded_at IS NULL
    JOIN clans cb ON cb.id = i.clan_b_id AND cb.disbanded_at IS NULL
    WHERE i.clan_a_id < i.clan_b_id
  ),
  written AS (
    INSERT INTO clan_week_pairings
      (week_id, clan_a_id, clan_b_id, size_band, activity_band, standing_rival)
    SELECT p_week_id, clan_a_id, clan_b_id, size_band, activity_band, standing_rival
    FROM valid
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_written FROM written;

  RETURN jsonb_build_object('week_id', p_week_id, 'paired', v_written);
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION apply_clan_week_pairings(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_clan_week_pairings(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION apply_clan_week_pairings(UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION apply_clan_week_pairings(UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- clan_rivalry_streak — the current run, walked from the most recent week
-- ---------------------------------------------------------------------------
--
-- The plpgsql mirror of `foldRivalryMemory`'s streak arm in
-- `src/lib/clan/pairing.ts`, kept small and literal on purpose: a window
-- function that computes "consecutive identical outcomes from the newest
-- backwards" is three nested subqueries, and nobody would be able to review it.
-- A draw ends a streak, so the answer is (NULL, 0).

CREATE OR REPLACE FUNCTION clan_rivalry_streak(p_low UUID, p_high UUID)
RETURNS TABLE (streak_clan_id UUID, streak_length INT)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row    RECORD;
  v_target TEXT := NULL;
  v_count  INT := 0;
BEGIN
  FOR v_row IN
    SELECT p.outcome
    FROM clan_week_pairings p
    WHERE p.clan_a_id = p_low AND p.clan_b_id = p_high AND p.settled_at IS NOT NULL
    ORDER BY p.settled_at DESC, p.week_id DESC
  LOOP
    IF v_target IS NULL THEN
      EXIT WHEN v_row.outcome IS NULL OR v_row.outcome = 'draw';
      v_target := v_row.outcome;
      v_count := 1;
    ELSIF v_row.outcome = v_target THEN
      v_count := v_count + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  IF v_target IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 0;
  ELSE
    RETURN QUERY SELECT CASE WHEN v_target = 'a' THEN p_low ELSE p_high END, v_count;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

REVOKE ALL ON FUNCTION clan_rivalry_streak(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION clan_rivalry_streak(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION clan_rivalry_streak(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION clan_rivalry_streak(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- settle_clan_week_pairings — read Depth, write records, pay nothing
-- ---------------------------------------------------------------------------
--
-- Runs after `apply_serpent_week_settlement` (WP-1.01) has written
-- `serpent_week_clans` for the week. Every number it stores is a function of
-- rows that already exist, so it is idempotent by the same construction:
--
--   depth_a/depth_b   read from serpent_week_clans (0 when a clan has no row —
--                     a quiet week is a quiet week, never a forfeit);
--   outcome           a comparison of those two;
--   laurels           INSERT ... ON CONFLICT DO NOTHING, one per (clan, week);
--   Chronicle         INSERT ... ON CONFLICT DO NOTHING, uniquely indexed;
--   rivalry memory    a full RECOMPUTE over every settled pairing of the pair.
--
-- WHAT IT CANNOT DO: there is no INSERT into economy_transactions, no UPDATE
-- of players.dna, total_dna_earned, energy or any cosmetic, entitlement or
-- premium table, and no statement that reads one. §9.4's "never economy" and
-- Rule 8's "no intra-clan reward mathematics" are enforced by there being no
-- statement here through which either could happen.

CREATE OR REPLACE FUNCTION settle_clan_week_pairings(p_week_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week      serpent_weeks%ROWTYPE;
  v_settled   INT := 0;
  v_laurels   INT := 0;
  v_chronicle INT := 0;
BEGIN
  SELECT * INTO v_week FROM serpent_weeks w WHERE w.id = p_week_id FOR UPDATE;
  IF v_week.id IS NULL THEN
    RAISE EXCEPTION 'settle_clan_week_pairings: unknown week %', p_week_id;
  END IF;

  -- ---- depths and outcome ------------------------------------------------
  WITH scored AS (
    SELECT
      p.clan_a_id,
      p.clan_b_id,
      COALESCE(sa.depth, 0) AS depth_a,
      COALESCE(sb.depth, 0) AS depth_b
    FROM clan_week_pairings p
    LEFT JOIN serpent_week_clans sa
           ON sa.week_id = p.week_id AND sa.clan_id = p.clan_a_id
    LEFT JOIN serpent_week_clans sb
           ON sb.week_id = p.week_id AND sb.clan_id = p.clan_b_id
    WHERE p.week_id = p_week_id
  ),
  updated AS (
    UPDATE clan_week_pairings p
    SET depth_a    = s.depth_a,
        depth_b    = s.depth_b,
        outcome    = CASE
                       WHEN s.depth_a > s.depth_b THEN 'a'
                       WHEN s.depth_b > s.depth_a THEN 'b'
                       ELSE 'draw'
                     END,
        settled_at = COALESCE(p.settled_at, NOW())
    FROM scored s
    WHERE p.week_id = p_week_id
      AND p.clan_a_id = s.clan_a_id
      AND p.clan_b_id = s.clan_b_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_settled FROM updated;

  -- ---- laurels: the winner of a decided week, once ------------------------
  WITH awards AS (
    SELECT
      CASE WHEN p.outcome = 'a' THEN p.clan_a_id ELSE p.clan_b_id END AS clan_id,
      CASE WHEN p.outcome = 'a' THEN p.clan_b_id ELSE p.clan_a_id END AS rival_clan_id
    FROM clan_week_pairings p
    WHERE p.week_id = p_week_id
      AND p.outcome IN ('a', 'b')
      -- A week both clans sat out is not a victory over anybody.
      AND GREATEST(COALESCE(p.depth_a, 0), COALESCE(p.depth_b, 0)) > 0
  ),
  inserted AS (
    INSERT INTO clan_laurels (clan_id, week_id, rival_clan_id)
    SELECT clan_id, p_week_id, rival_clan_id FROM awards
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_laurels FROM inserted;

  -- ---- Chronicle: both sides get the entry, winner and loser alike --------
  WITH sides AS (
    SELECT p.clan_a_id AS clan_id, p.clan_b_id AS rival_clan_id,
           COALESCE(p.depth_a, 0) AS depth, COALESCE(p.depth_b, 0) AS rival_depth
    FROM clan_week_pairings p
    WHERE p.week_id = p_week_id AND p.settled_at IS NOT NULL
    UNION ALL
    SELECT p.clan_b_id, p.clan_a_id,
           COALESCE(p.depth_b, 0), COALESCE(p.depth_a, 0)
    FROM clan_week_pairings p
    WHERE p.week_id = p_week_id AND p.settled_at IS NOT NULL
  ),
  entries AS (
    INSERT INTO serpent_chronicle_entries
      (week_id, kind, clan_id, rival_clan_id, depth, previous_depth)
    SELECT p_week_id, 'clan_rivalry_week', clan_id, rival_clan_id, depth, rival_depth
    FROM sides
    WHERE depth > 0 OR rival_depth > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_chronicle FROM entries;

  -- ---- rivalry memory: a recompute, never an increment --------------------
  INSERT INTO clan_rivalry_memory AS r (
    clan_low_id, clan_high_id, meetings, wins_low, wins_high, draws,
    streak_clan_id, streak_length, closest_margin, largest_margin,
    first_paired_at, last_week_id, last_paired_at
  )
  SELECT
    t.clan_a_id,
    t.clan_b_id,
    t.meetings,
    t.wins_low,
    t.wins_high,
    t.draws,
    streak.streak_clan_id,
    streak.streak_length,
    t.closest_margin,
    t.largest_margin,
    t.first_paired_at,
    p_week_id,
    NOW()
  FROM (
    SELECT
      h.clan_a_id,
      h.clan_b_id,
      COUNT(*)::INT                                              AS meetings,
      COUNT(*) FILTER (WHERE h.outcome = 'a')::INT               AS wins_low,
      COUNT(*) FILTER (WHERE h.outcome = 'b')::INT               AS wins_high,
      COUNT(*) FILTER (WHERE h.outcome = 'draw')::INT            AS draws,
      MIN(ABS(COALESCE(h.depth_a, 0) - COALESCE(h.depth_b, 0)))  AS closest_margin,
      MAX(ABS(COALESCE(h.depth_a, 0) - COALESCE(h.depth_b, 0)))  AS largest_margin,
      MIN(h.paired_at)                                           AS first_paired_at
    FROM clan_week_pairings h
    WHERE h.settled_at IS NOT NULL
      AND (h.clan_a_id, h.clan_b_id) IN (
        SELECT c.clan_a_id, c.clan_b_id FROM clan_week_pairings c WHERE c.week_id = p_week_id
      )
    GROUP BY h.clan_a_id, h.clan_b_id
  ) AS t
  CROSS JOIN LATERAL clan_rivalry_streak(t.clan_a_id, t.clan_b_id) AS streak
  ON CONFLICT (clan_low_id, clan_high_id) DO UPDATE SET
    meetings        = EXCLUDED.meetings,
    wins_low        = EXCLUDED.wins_low,
    wins_high       = EXCLUDED.wins_high,
    draws           = EXCLUDED.draws,
    streak_clan_id  = EXCLUDED.streak_clan_id,
    streak_length   = EXCLUDED.streak_length,
    closest_margin  = EXCLUDED.closest_margin,
    largest_margin  = EXCLUDED.largest_margin,
    first_paired_at = LEAST(r.first_paired_at, EXCLUDED.first_paired_at),
    last_week_id    = EXCLUDED.last_week_id,
    last_paired_at  = EXCLUDED.last_paired_at;

  RETURN jsonb_build_object(
    'week_id', p_week_id,
    'settled', v_settled,
    'laurels', v_laurels,
    'chronicle_entries', v_chronicle
  );
END;
$$ LANGUAGE plpgsql VOLATILE;

REVOKE ALL ON FUNCTION settle_clan_week_pairings(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION settle_clan_week_pairings(UUID) FROM anon;
REVOKE ALL ON FUNCTION settle_clan_week_pairings(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION settle_clan_week_pairings(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Row-level security for the new tables
-- ---------------------------------------------------------------------------
--
-- RLS on, no policy for anon or authenticated. Every player read goes through
-- `GET /api/clan/hunt`, which runs on the service role and applies WP-0.06's
-- cohort filter. `clan_laurels` and `clan_membership_history` are granted
-- SELECT and INSERT only: there is no privilege in the system that can delete
-- a laurel or a tenure span.

ALTER TABLE clan_membership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_week_pairings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_rivalry_memory          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clan_laurels            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON clan_membership_history FROM anon, authenticated;
REVOKE ALL ON clan_week_pairings      FROM anon, authenticated;
REVOKE ALL ON clan_rivalry_memory          FROM anon, authenticated;
REVOKE ALL ON clan_laurels            FROM anon, authenticated;

GRANT SELECT, INSERT         ON clan_membership_history TO service_role;
GRANT SELECT, INSERT, UPDATE ON clan_week_pairings      TO service_role;
GRANT SELECT, INSERT, UPDATE ON clan_rivalry_memory          TO service_role;
GRANT SELECT, INSERT         ON clan_laurels            TO service_role;

-- ===========================================================================
-- 14. THE TRIPWIRE — abort if anything a player owns moved (Rules 5, 6)
-- ===========================================================================
--
-- Four claims, checked rather than asserted in prose:
--
--   1. every membership that existed still exists, with the same start;
--   2. no clan's carried Depth moved down, and no clan row vanished;
--   3. no player's Depth moved down, and no player's DNA moved AT ALL — not
--      down and not up. Rule 8 says clans never bill and never pay, so a clan
--      migration that hands anybody currency is as wrong as one that takes it.
--      `IS DISTINCT FROM` is the check that makes "this migration pays nobody"
--      a thing the database refuses to let through rather than a promise;
--   4. the gated layers' state is intact — `clan_duels` still holds every row
--      it held, which is what "hidden, not deleted" has to mean.

DO $$
DECLARE
  v_bad INT;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM clan_pre_migration_members pre
  LEFT JOIN clan_members now_m
    ON now_m.clan_id = pre.clan_id
   AND now_m.player_id = pre.player_id
   AND now_m.joined_at = pre.joined_at
  WHERE now_m.clan_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 048 aborted: % membership(s) lost or re-dated (Rule 6: tenure is permanent)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM clan_pre_migration_clans pre
  LEFT JOIN clans now_c ON now_c.id = pre.id
  WHERE now_c.id IS NULL
     OR COALESCE(now_c.member_count, 0)    < pre.member_count
     OR COALESCE(now_c.lifetime_depth, 0)  < pre.lifetime_depth
     OR COALESCE(now_c.best_week_depth, 0) < pre.best_week_depth;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 048 aborted: % clan row(s) vanished or moved downward (Rule 6)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM clan_pre_migration_players pre
  LEFT JOIN players now_p ON now_p.id = pre.id
  WHERE now_p.id IS NULL
     OR COALESCE(now_p.dna, 0)              IS DISTINCT FROM pre.dna
     OR COALESCE(now_p.total_dna_earned, 0) IS DISTINCT FROM pre.total_dna_earned
     OR COALESCE(now_p.lifetime_depth, 0)   < pre.lifetime_depth
     OR COALESCE(now_p.best_week_depth, 0)  < pre.best_week_depth;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 048 aborted: % player row(s) vanished, lost Depth, or had DNA moved — a clan migration neither bills nor pays (Rules 6, 8)', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad
  FROM clan_pre_migration_duels pre
  LEFT JOIN clan_duels now_d ON now_d.id = pre.id
  WHERE now_d.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 048 aborted: % gated-layer duel row(s) disappeared — hiding a layer must not delete its state (§12.1)', v_bad;
  END IF;

  RAISE NOTICE 'Migration 048: clan rework applied; no membership, clan or player-owned value moved.';
END;
$$;

COMMIT;
