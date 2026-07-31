-- =============================================================================
-- Migration 064: one atomic favorite per player and dynasty
-- =============================================================================
--
-- A favorite is a server-backed identity preference. The collection route used
-- to update one collected_snakes row directly, which meant two tabs (or two
-- fast requests) could leave multiple CYBER, PRIMAL, or COSMIC favorites. The
-- setup cockpit needs a stronger contract: one chosen representative per
-- dynasty, while an explicit unfavorite still clears only the named snake.
--
-- The RPC derives ownership and dynasty from collected_snakes ->
-- snake_variants. No caller supplies a dynasty. An advisory transaction lock
-- on player + derived dynasty serializes requests that target different rows,
-- and row locks make the exact set being replaced stable until commit.
--
-- This migration first normalizes historical duplicates deterministically.
-- Equipped, higher-generation, then newer specimens win. Runtime changes must
-- use set_dynasty_favorite; collected_snakes writes are already revoked from
-- anon/authenticated by migration 030. A table trigger remains deliberately
-- compatible with the outgoing service-role writer during promotion: a direct
-- single-row `is_favorited = TRUE` update releases the previous same-dynasty
-- favorite before it completes, so the rolling boundary cannot recreate the
-- duplicate state this migration repairs.
-- =============================================================================

BEGIN;

-- Keep an outgoing writer from landing between the historical cleanup and the
-- invariant trigger becoming visible. The lock is held only for this migration
-- transaction and permits reads while serializing collected_snakes writes.
LOCK TABLE collected_snakes IN SHARE ROW EXCLUSIVE MODE;

WITH ranked_favorites AS (
  SELECT
    cs.id,
    ROW_NUMBER() OVER (
      PARTITION BY cs.player_id, sv.dynasty_id
      ORDER BY
        cs.is_equipped DESC NULLS LAST,
        cs.generation DESC NULLS LAST,
        cs.acquired_at DESC NULLS LAST,
        cs.id ASC
    ) AS favorite_rank
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.is_favorited = TRUE
)
UPDATE collected_snakes cs
SET is_favorited = FALSE
FROM ranked_favorites ranked
WHERE ranked.id = cs.id
  AND ranked.favorite_rank > 1;

CREATE OR REPLACE FUNCTION public.enforce_single_dynasty_favorite()
RETURNS TRIGGER AS $$
DECLARE
  v_dynasty_id UUID;
BEGIN
  IF NEW.is_favorited IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  SELECT sv.dynasty_id
  INTO v_dynasty_id
  FROM snake_variants sv
  WHERE sv.id = NEW.snake_variant_id;

  IF v_dynasty_id IS NULL THEN
    RAISE EXCEPTION 'Favorite snake variant is not in the catalog';
  END IF;

  -- This is the same serialization key used by set_dynasty_favorite. It makes
  -- the invariant cover both the incoming RPC and the outgoing direct writer.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.player_id::TEXT || ':' || v_dynasty_id::TEXT, 0)
  );

  UPDATE collected_snakes cs
  SET is_favorited = FALSE
  FROM snake_variants sv
  WHERE cs.snake_variant_id = sv.id
    AND cs.player_id = NEW.player_id
    AND sv.dynasty_id = v_dynasty_id
    AND cs.id IS DISTINCT FROM NEW.id
    AND cs.is_favorited = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.enforce_single_dynasty_favorite() IS
  'Database invariant and rolling-release bridge: a direct favorite write atomically releases any previous favorite in the same player dynasty.';

REVOKE EXECUTE ON FUNCTION public.enforce_single_dynasty_favorite() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_single_dynasty_favorite() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_single_dynasty_favorite() FROM authenticated;

DROP TRIGGER IF EXISTS trg_single_dynasty_favorite ON collected_snakes;
CREATE TRIGGER trg_single_dynasty_favorite
BEFORE INSERT OR UPDATE OF is_favorited, player_id, snake_variant_id
ON collected_snakes
FOR EACH ROW
WHEN (NEW.is_favorited = TRUE)
EXECUTE FUNCTION public.enforce_single_dynasty_favorite();

CREATE INDEX IF NOT EXISTS idx_collected_favorited_player
  ON collected_snakes(player_id)
  WHERE is_favorited = TRUE;

CREATE OR REPLACE FUNCTION public.set_dynasty_favorite(
  p_player_id UUID,
  p_snake_id UUID,
  p_favorited BOOLEAN
) RETURNS JSONB AS $$
DECLARE
  v_dynasty_id UUID;
  v_replaced_snake_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_player_id IS NULL OR p_snake_id IS NULL OR p_favorited IS NULL THEN
    RAISE EXCEPTION 'Favorite player, snake, and state are required'
      USING ERRCODE = '22023';
  END IF;

  -- First derive the lock key entirely from server-owned relations. This read
  -- intentionally takes no row lock: taking different target-row locks before
  -- the shared advisory lock would allow an A<->B deadlock between two tabs.
  SELECT sv.dynasty_id
  INTO v_dynasty_id
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.id = p_snake_id
    AND cs.player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not owned by player';
  END IF;

  -- Different dynasties remain independent. Every writer for this player's
  -- same dynasty queues here, even when each request names a different snake.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_player_id::TEXT || ':' || v_dynasty_id::TEXT, 0)
  );

  -- Revalidate ownership after entering the serialized section, then hold the
  -- target stable against retirement/downgrade until this transaction commits.
  PERFORM 1
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.id = p_snake_id
    AND cs.player_id = p_player_id
    AND sv.dynasty_id = v_dynasty_id
  FOR UPDATE OF cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake not owned by player';
  END IF;

  IF p_favorited THEN
    -- Lock and remember the exact historical/current favorites this choice
    -- replaces. The ordered subquery gives every concurrent path the same row
    -- lock order; the advisory lock also covers the zero-existing-row case.
    SELECT COALESCE(
      ARRAY_AGG(candidate.id ORDER BY candidate.id),
      ARRAY[]::UUID[]
    )
    INTO v_replaced_snake_ids
    FROM (
      SELECT cs.id
      FROM collected_snakes cs
      JOIN snake_variants sv ON sv.id = cs.snake_variant_id
      WHERE cs.player_id = p_player_id
        AND sv.dynasty_id = v_dynasty_id
        AND cs.id <> p_snake_id
        AND cs.is_favorited = TRUE
      ORDER BY cs.id
      FOR UPDATE OF cs
    ) AS candidate;

    -- RELEASE before CLAIM. This is intentionally two ordered statements so
    -- observers never receive an ambiguous replacement receipt.
    UPDATE collected_snakes
    SET is_favorited = FALSE
    WHERE id = ANY(v_replaced_snake_ids);

    UPDATE collected_snakes
    SET is_favorited = TRUE
    WHERE id = p_snake_id
      AND player_id = p_player_id
      AND is_favorited IS DISTINCT FROM TRUE;
  ELSE
    -- Unfavorite means exactly what the player asked: clear this row only.
    -- Other dynasties, and any independently chosen favorite, are untouched.
    UPDATE collected_snakes
    SET is_favorited = FALSE
    WHERE id = p_snake_id
      AND player_id = p_player_id
      AND is_favorited IS DISTINCT FROM FALSE;
  END IF;

  RETURN jsonb_build_object(
    'snake_id', p_snake_id,
    'favorited', p_favorited,
    'favorite_snake_id', CASE WHEN p_favorited THEN p_snake_id ELSE NULL END,
    'replaced_snake_ids', to_jsonb(v_replaced_snake_ids)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) IS
  'Atomically selects one collected-snake favorite per player/dynasty with a reconciliation receipt; dynasty and ownership are server-derived and the table trigger enforces the invariant for every writer.';

REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) TO service_role;

-- Public health never infers a release boundary from a successful `players`
-- query. This service-only, read-only capability proves the three cohesive UX
-- bridge contracts that must exist together before the incoming artifact can
-- be promoted.
CREATE OR REPLACE FUNCTION public.get_cohesive_release_capability()
RETURNS JSONB AS $$
DECLARE
  v_founding_ready BOOLEAN;
  v_continuity_ready BOOLEAN;
  v_favorite_ready BOOLEAN;
BEGIN
  v_founding_ready :=
    to_regprocedure('public.found_clan(uuid,text,text,text,text,text,text)') IS NOT NULL
    AND to_regprocedure('public.found_clan(uuid,text,text,text,text,text,text,integer)') IS NOT NULL;

  SELECT COUNT(*) = 3
  INTO v_continuity_ready
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'game_sessions'
    AND column_name IN (
      'start_request_id',
      'continuity_phase',
      'continuity_checkpoint'
    );

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'collected_snakes'
      AND trigger_row.tgname = 'trg_single_dynasty_favorite'
      AND trigger_row.tgenabled <> 'D'
      AND NOT trigger_row.tgisinternal
  ) AND to_regprocedure(
    'public.set_dynasty_favorite(uuid,uuid,boolean)'
  ) IS NOT NULL
  INTO v_favorite_ready;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_founding_ready AND v_continuity_ready AND v_favorite_ready
        THEN 'ready'
      ELSE 'invalid'
    END,
    'version', 1,
    'foundingBridgeVersion', CASE WHEN v_founding_ready THEN 1 ELSE 0 END,
    'continuityVersion', CASE WHEN v_continuity_ready THEN 1 ELSE 0 END,
    'favoriteInvariantVersion', CASE WHEN v_favorite_ready THEN 1 ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_cohesive_release_capability() IS
  'Read-only deployment capability for the quoted-founding bridge, run continuity columns, and database-enforced dynasty favorite invariant.';

REVOKE EXECUTE ON FUNCTION public.get_cohesive_release_capability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cohesive_release_capability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cohesive_release_capability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohesive_release_capability() TO service_role;

COMMIT;
