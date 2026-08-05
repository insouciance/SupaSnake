-- ###########################################################################
-- ## MIGRATION 069 — NOT APPLIED TO ANY DATABASE BY THIS WORK PACKAGE.     ##
-- ## Written and replayed only against an isolated local Supabase stack.   ##
-- ## Release order is DEPLOY THE APP FIRST, THEN APPLY THIS. The app       ##
-- ## degrades to "no snake cosmetics" while the RPCs are absent, so a      ##
-- ## deploy that precedes this file is a quiet no-op, never a 500.         ##
-- ## Rollout contract: `snake-cosmetic-loadout` in                         ##
-- ## .github/workflows/deploy-production.yml. A deploy carrying this file  ##
-- ## without that contract halts, by design (doctrine FM-10).              ##
-- ###########################################################################

-- Migration 069: the server-held snake cosmetic loadout (LF-B, Track A)
--
-- Authority: docs/PRODUCT_CONSTITUTION.md §10.2 (Keeper), §10.3 (the earned
-- shelf), §10.4 (the never-sold list — variants are never sold), R4, R6, R7,
-- R11; docs/ENGINEERING_DOCTRINE.md FM-1, FM-6, FM-10, FM-12.
--
-- WHAT THIS IS, STATED EXACTLY
--
-- The chamber snake and the in-run snake must be the same creature. Before
-- this file the concept branch proved the rendering by sharing a module
-- constant (`EQUIPPED_LOADOUT`), which is correct on screen and wrong in
-- principle: a client-owned loadout is the first cosmetic a player can grant
-- themselves. This migration moves that fact to the server, where the rest of
-- identity already lives.
--
-- WHY NO NEW TABLE
--
-- `player_loadout` (022) already IS a per-player slot→cosmetic map with the
-- exact shape this needs, `player_cosmetics` (022) already IS the ownership
-- inventory, and `cosmetic_definitions` (022) already IS the catalog. A second
-- table keyed by player and slot would be two authorities for one fact —
-- doctrine FM-1, the failure this project has paid for three times. So 069
-- adds slots to the vocabulary the existing substrate already speaks, and
-- adds the two read RPCs that make the equipped set answerable in ONE place.
--
-- THE SLOT VOCABULARY LIVES IN FOUR PLACES AND THAT IS INHERENT
--
-- Two CHECK constraints (declarative integrity), one RPC guard, and one
-- TypeScript constant. A CHECK cannot call a function without making the
-- constraint un-restorable by pg_restore in the wrong order and un-revalidated
-- when the function changes, so the duplication is not removable — it is made
-- MECHANICAL instead: `src/shared/game/cosmeticSlots.ts` is the single authored
-- list, and `cosmeticSlots.migration.test.ts` reads THIS FILE and fails the
-- build if any of the four lists drifts from it. Parity by test, in the
-- pattern the Constitution checklist already uses for the length fold.
--
-- WHAT IS NOT HERE
--
-- No food-skin ITEM. The `food_skin` slot is scaffolded — the vocabulary and
-- the storage accept it — and the catalog is deliberately empty, because the
-- egg and cube assets have not been judged as cosmetics yet. An empty category
-- renders as an empty category; it never renders as a promise.
--
-- No supporter-only ITEM either, and that is a deliberate reading of R4/§10.5.
-- The `supporter_only` column and every code path that locks on it ship here,
-- because the menu must be able to show a locked item honestly the day the
-- Atelier opens. Seeding one now would advertise a purchase that has no
-- storefront, no price, and no grant path — a false claim. Zero rows carry it.
--
-- R6/R15: nothing here writes a player-owned row downward. Unequip deletes a
-- SELECTION row from `player_loadout`; the item stays owned in
-- `player_cosmetics`, which this file never deletes from.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The slot vocabulary gains the three snake-anatomy slots
--
--    'face'      — shades and anything else worn over the eyes
--    'crown'     — braids, and anything else worn on top of the head
--    'food_skin' — scaffold only; no definition may exist yet (§3 asserts it)
--
--    022 declared these CHECKs inline and unnamed, so Postgres named them
--    <table>_<column>_check. Extension is the 022:282 / 035:28 idiom: drop by
--    that name, re-add the FULL new list. Never a second constraint alongside.
--
--    `player_loadout_position_valid` (022:338) is untouched on purpose: it
--    reads `slot <> 'badge' AND position = 1`, which already gives every new
--    slot exactly one position, which is what a snake has.
-- ---------------------------------------------------------------------------

ALTER TABLE cosmetic_definitions DROP CONSTRAINT IF EXISTS cosmetic_definitions_slot_check;
ALTER TABLE cosmetic_definitions
  ADD CONSTRAINT cosmetic_definitions_slot_check
  CHECK (slot IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem', 'face', 'crown', 'food_skin'));

ALTER TABLE player_loadout DROP CONSTRAINT IF EXISTS player_loadout_slot_check;
ALTER TABLE player_loadout
  ADD CONSTRAINT player_loadout_slot_check
  CHECK (slot IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem', 'face', 'crown', 'food_skin'));

-- ---------------------------------------------------------------------------
-- 2. Two catalog columns the menu cannot be honest without
--
--    `default_owned` generalises a magic string. 022:497 hardcoded
--    `p_cosmetic_id <> 'banner_hatchery_standard'` to mean "everyone owns the
--    default banner". That is a per-item fact living in a function body; the
--    two free launch cosmetics need the same fact, and a third literal in the
--    same IF is how the list becomes wrong. It becomes a column, backfilled
--    to preserve the existing behaviour exactly.
--
--    `supporter_only` is a DISPLAY fact, not an entitlement. Entitlement stays
--    exactly where it is: a row in `player_cosmetics`. A lapsed Keeper keeps
--    every item they were granted (§10.2 lapse contract, R6), so equip must
--    never re-ask `has_premium()` — it asks ownership, as it always has. This
--    column only tells the menu which un-owned item to mark and route to the
--    store instead of offering.
-- ---------------------------------------------------------------------------

ALTER TABLE cosmetic_definitions
  ADD COLUMN IF NOT EXISTS default_owned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cosmetic_definitions
  ADD COLUMN IF NOT EXISTS supporter_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN cosmetic_definitions.default_owned IS
  'LF-B. TRUE when every player owns this item without a player_cosmetics row. '
  'Replaces the hardcoded banner_hatchery_standard branch in equip_cosmetic. '
  'Set it only for items that are free to everyone forever: it is checked '
  'INSTEAD of ownership, never in addition to it.';

COMMENT ON COLUMN cosmetic_definitions.supporter_only IS
  'LF-B. Presentation only: the cosmetics menu marks an un-owned TRUE item as '
  'supporter content and routes the tap to /shop instead of equipping it '
  '(Constitution R7 — the store is reached by navigation). It grants nothing '
  'and gates nothing; equip_cosmetic still decides on ownership alone, so a '
  'lapsed subscriber keeps everything they were granted (§10.2, R6). No row '
  'carries TRUE as of this migration.';

-- The behaviour 022:497 encoded, now stated as data.
UPDATE cosmetic_definitions SET default_owned = TRUE
WHERE id = 'banner_hatchery_standard' AND default_owned = FALSE;

-- ---------------------------------------------------------------------------
-- 3. The launch catalog: shades and braids, both free to everyone
--
--    Constitution decision 13 (§10.2): no slot may be money-exclusive in kind
--    — every slot has strong earned entries beside the bought ones. These ARE
--    those entries, and at launch they are the only entries, so the rule holds
--    trivially and keeps holding when the Atelier adds beside them.
--
--    `render.component` is the client's registry key, deliberately NOT the row
--    id: the id follows the 022 slot-prefix convention, the component follows
--    the concept branch's React registry. A client build that does not know a
--    component renders nothing for that slot rather than throwing — forward
--    tolerance, doctrine FM-12, so a catalog addition never has to be deployed
--    in lockstep with a client.
-- ---------------------------------------------------------------------------

INSERT INTO cosmetic_definitions (id, name, slot, rarity, default_owned, render) VALUES
  ('face_shades_deadpan', 'Deadpan Shades', 'face', 'uncommon', TRUE,
   '{"kind":"snake_cosmetic","component":"shades_deadpan","occludes":["eyes"]}'),
  ('crown_braids_amber',  'Amber Braids',   'crown', 'uncommon', TRUE,
   '{"kind":"snake_cosmetic","component":"braids_amber","occludes":[]}')
ON CONFLICT (id) DO NOTHING;

-- The scaffold is empty and this asserts it stays empty in THIS file, so a
-- later edit cannot quietly ship a food skin under 069's reviewed contract.
DO $$
DECLARE
  v_food_skins INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_food_skins FROM cosmetic_definitions WHERE slot = 'food_skin';
  IF v_food_skins <> 0 THEN
    RAISE EXCEPTION 'MIGRATION_069_FOOD_SKIN_SCAFFOLD_MUST_BE_EMPTY: found % definitions', v_food_skins;
  END IF;
  RAISE NOTICE 'Migration 069: % snake cosmetic definitions now in the catalog (face + crown), 0 food skins by design.',
    (SELECT COUNT(*) FROM cosmetic_definitions WHERE slot IN ('face', 'crown'));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. read_snake_loadout — the ONE authority for "what is this snake wearing"
--
--    The chamber reads it to render the portrait. The game reads it to render
--    the head on the board. Neither derives it, and there is no second
--    computation to disagree with (doctrine FM-1). This is the whole content
--    of the chamber=game law: not a synchronisation, a single answer.
--
--    Shape is exactly the client's CosmeticLoadout: slot → component key or
--    null, every snake slot always present. An absent slot and an unequipped
--    slot are the same fact and must not be two shapes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION read_snake_loadout(p_player_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'face',      (SELECT cd.render->>'component'
                    FROM player_loadout pl
                    JOIN cosmetic_definitions cd ON cd.id = pl.cosmetic_id
                   WHERE pl.player_id = p_player_id AND pl.slot = 'face'),
    'crown',     (SELECT cd.render->>'component'
                    FROM player_loadout pl
                    JOIN cosmetic_definitions cd ON cd.id = pl.cosmetic_id
                   WHERE pl.player_id = p_player_id AND pl.slot = 'crown'),
    'food_skin', (SELECT cd.render->>'component'
                    FROM player_loadout pl
                    JOIN cosmetic_definitions cd ON cd.id = pl.cosmetic_id
                   WHERE pl.player_id = p_player_id AND pl.slot = 'food_skin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION read_snake_loadout(UUID) IS
  'LF-B. The equipped snake cosmetics as slot→component-key, every snake slot '
  'present, null where nothing is worn. Read by BOTH the home chamber and the '
  'run render path so the two can never disagree (chamber = game law). A NULL '
  'player id returns all-null rather than raising: a signed-out visitor sees '
  'the bare specimen, which is a legitimate answer, not an error.';

-- ---------------------------------------------------------------------------
-- 5. read_snake_cosmetic_catalog — what the menu browses
--
--    Returns the loadout by CALLING §4, never by recomputing it, so the menu's
--    idea of "equipped" is the same row the renderer reads.
--
--    `owned` is ownership, full stop: a player_cosmetics row OR default_owned.
--    `supporter_only` rides along untouched so the client can mark and route
--    without a second query. Items are ordered by slot then id so the menu's
--    category order is server-stable and does not depend on planner whim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION read_snake_cosmetic_catalog(p_player_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'loadout', read_snake_loadout(p_player_id),
    'items', COALESCE(
      (SELECT jsonb_agg(item ORDER BY item->>'slot', item->>'id')
         FROM (
           SELECT jsonb_build_object(
                    'id',            cd.id,
                    'slot',          cd.slot,
                    'component',     cd.render->>'component',
                    'name',          cd.name,
                    'rarity',        cd.rarity,
                    'supporterOnly', cd.supporter_only,
                    'owned',         cd.default_owned OR EXISTS (
                                       SELECT 1 FROM player_cosmetics pc
                                        WHERE pc.player_id = p_player_id
                                          AND pc.cosmetic_id = cd.id
                                     ),
                    'equipped',      EXISTS (
                                       SELECT 1 FROM player_loadout pl
                                        WHERE pl.player_id = p_player_id
                                          AND pl.slot = cd.slot
                                          AND pl.cosmetic_id = cd.id
                                     )
                  ) AS item
             FROM cosmetic_definitions cd
            WHERE cd.slot IN ('face', 'crown', 'food_skin')
         ) items),
      '[]'::JSONB)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION read_snake_cosmetic_catalog(UUID) IS
  'LF-B. Every snake cosmetic with this player''s owned/equipped state, plus '
  'the equipped loadout read through read_snake_loadout rather than recomputed. '
  'Feeds the home cosmetics menu. Never returns a price and never returns an '
  'entitlement — a locked item is marked, and the tap is the client''s to route '
  'to /shop (Constitution R7).';

-- ---------------------------------------------------------------------------
-- 6. equip_cosmetic, re-created — the snake slots, and three defects closed
--
--    022's body is preserved verb for verb except:
--      a. the slot guard learns the three new slots (see the §0 note on why
--         this list is duplicated and how it is held);
--      b. the `banner_hatchery_standard` literal becomes `default_owned`,
--         which is behaviour-identical after §2's backfill;
--      c. `SET search_path = public` is added. 022:520 terminated the body
--         with a bare `SECURITY DEFINER` and no search_path, which is the one
--         hardening every other RPC in this schema has. A SECURITY DEFINER
--         function without a pinned search_path is resolvable by the caller's
--         path; this closes it.
--
--    CREATE OR REPLACE preserves existing privileges, so §7 restates every
--    grant and revoke — this file alone describes who may call it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION equip_cosmetic(
  p_player_id UUID,
  p_slot TEXT,
  p_position INTEGER,
  p_cosmetic_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_def cosmetic_definitions%ROWTYPE;
BEGIN
  IF p_slot NOT IN ('title', 'banner', 'badge', 'trail', 'board_accent', 'emblem', 'face', 'crown', 'food_skin')
     OR p_position IS NULL
     OR (p_slot = 'badge' AND p_position NOT BETWEEN 1 AND 3)
     OR (p_slot <> 'badge' AND p_position <> 1) THEN
    RETURN jsonb_build_object('error', 'invalid_slot');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RETURN jsonb_build_object('error', 'player_not_found');
  END IF;

  -- NULL = unequip the position. The item stays owned; only the selection
  -- goes. constitution-allow: owned-row-downward  player_loadout holds a
  -- SELECTION, not an earned thing — the inventory row in player_cosmetics is
  -- the owned fact and is never touched here, so unequipping loses nothing a
  -- player earned and R6 is not in play.
  IF p_cosmetic_id IS NULL THEN
    DELETE FROM player_loadout
    WHERE player_id = p_player_id AND slot = p_slot AND position = p_position;
    RETURN jsonb_build_object('success', true, 'equipped', NULL);
  END IF;

  SELECT * INTO v_def FROM cosmetic_definitions WHERE id = p_cosmetic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_owned');
  END IF;
  IF v_def.slot <> p_slot THEN
    RETURN jsonb_build_object('error', 'slot_mismatch');
  END IF;

  -- Ownership. `default_owned` items are owned by everyone by definition;
  -- everything else needs the inventory row. supporter_only is NOT consulted:
  -- what a player owns, a player wears, subscription or not (§10.2, R6).
  IF NOT v_def.default_owned AND NOT EXISTS (
    SELECT 1 FROM player_cosmetics
    WHERE player_id = p_player_id AND cosmetic_id = p_cosmetic_id
  ) THEN
    RETURN jsonb_build_object('error', 'not_owned');
  END IF;

  -- A badge is worn once - curation means 3 DIFFERENT badges
  IF p_slot = 'badge' AND EXISTS (
    SELECT 1 FROM player_loadout
    WHERE player_id = p_player_id AND slot = 'badge'
      AND position <> p_position AND cosmetic_id = p_cosmetic_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_equipped');
  END IF;

  INSERT INTO player_loadout (player_id, slot, position, cosmetic_id, updated_at)
  VALUES (p_player_id, p_slot, p_position, p_cosmetic_id, NOW())
  ON CONFLICT (player_id, slot, position)
  DO UPDATE SET cosmetic_id = EXCLUDED.cosmetic_id, updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'equipped', p_cosmetic_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION equip_cosmetic(UUID, TEXT, INTEGER, TEXT) IS
  'LF-B (re-created from 022). Equips or unequips one loadout position after '
  'checking slot validity, definition existence, slot match and ownership. '
  'Now also serves the snake slots face/crown/food_skin, resolves ownership '
  'through cosmetic_definitions.default_owned instead of a hardcoded banner '
  'id, and pins search_path.';

-- ---------------------------------------------------------------------------
-- 7. PRIVILEGES
--
--    THE ACL IS ASSERTED, NOT ASSUMED. The CLI applies these files as
--    `postgres`, whose default ACL for a new public table gives anon and
--    authenticated only `Dxtm` — so locally a bare `REVOKE ... FROM PUBLIC`
--    looks sufficient. Applied by `supabase_admin`, as hosted Supabase may,
--    the same table is born with an EXPLICIT `arwdDxtm` grant to those roles
--    that a PUBLIC revoke does not touch. Naming the roles removes the
--    dependence on the grantor. `REVOKE ALL` then grant back exactly one verb,
--    never a verb-by-verb revoke, for the same reason.
--
--    022 gave `player_cosmetics` and `player_loadout` own-row SELECT POLICIES
--    and no matching table GRANT. A policy without a grant is decorative — the
--    privilege check runs before the policy — so those own-row reads have been
--    unreachable since 022. Latent until now because every read went through
--    the service role; the cosmetics menu is the first surface that would want
--    the direct read. Closed here for both tables, in the 067 shape.
--    (`player_ladders` (057) carries the identical defect and is NOT fixed
--    here: it belongs to the CE-6 migration, which owns that surface.)
--
--    `authenticated` only, never `anon`, for player-keyed tables: Supabase
--    anonymous sign-in IS the authenticated role with is_anonymous = true, so
--    anonymous players keep their read without opening the tables to the
--    unauthenticated key.
-- ---------------------------------------------------------------------------

REVOKE ALL ON player_cosmetics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON player_cosmetics TO authenticated;

REVOKE ALL ON player_loadout FROM PUBLIC, anon, authenticated;
GRANT SELECT ON player_loadout TO authenticated;

-- The catalog is public reference data and was already granted in 022; it is
-- restated so this file alone describes the reachable surface after 069.
REVOKE ALL ON cosmetic_definitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON cosmetic_definitions TO anon, authenticated;

REVOKE ALL ON FUNCTION read_snake_loadout(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION read_snake_cosmetic_catalog(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION equip_cosmetic(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION read_snake_loadout(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION read_snake_cosmetic_catalog(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION equip_cosmetic(UUID, TEXT, INTEGER, TEXT) TO service_role;

-- 022:1190 granted EXECUTE on equip_cosmetic to `authenticated` for PostgREST
-- parity. Every caller is and always was the service role behind
-- /api/player/cosmetics/equip, which authenticates the bearer token and
-- resolves the player id itself. The browser-role grant is therefore an
-- unused path by which a client could pass ANY p_player_id to a SECURITY
-- DEFINER writer. It is revoked above and deliberately not restored.

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN-NOTE (forward-only; this repo ships no .down.sql)
--
-- To undo 069 by hand, in this order:
--
--   DELETE FROM player_loadout WHERE slot IN ('face', 'crown', 'food_skin');
--   DELETE FROM player_cosmetics WHERE cosmetic_id IN
--     ('face_shades_deadpan', 'crown_braids_amber');
--   DELETE FROM cosmetic_definitions WHERE id IN
--     ('face_shades_deadpan', 'crown_braids_amber');
--   DROP FUNCTION IF EXISTS read_snake_cosmetic_catalog(UUID);
--   DROP FUNCTION IF EXISTS read_snake_loadout(UUID);
--   ALTER TABLE cosmetic_definitions DROP COLUMN IF EXISTS supporter_only;
--   ALTER TABLE cosmetic_definitions DROP COLUMN IF EXISTS default_owned;
--   -- then re-add the 022 six-slot CHECKs and re-create equip_cosmetic from
--   -- the 022 body (which restores the banner_hatchery_standard literal and
--   -- loses the search_path pin — undo it only with that trade understood).
--
-- The app tolerates the RPCs being absent, so a code rollback alone is the
-- fast path and needs none of the above.
-- ---------------------------------------------------------------------------
