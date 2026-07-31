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
-- anon/authenticated by migration 030.
-- =============================================================================

BEGIN;

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
  'Atomically selects at most one collected-snake favorite per player/dynasty; dynasty and ownership are server-derived.';

REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_dynasty_favorite(UUID, UUID, BOOLEAN) TO service_role;

COMMIT;
