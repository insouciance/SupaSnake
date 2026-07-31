-- Local integration contract for migration 064.
-- Run only against an isolated `supabase db reset` database:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/064_atomic_dynasty_favorites.sql

BEGIN;

DO $$
DECLARE
  v_user UUID := '06400000-0000-0000-0000-000000000001';
  v_other_user UUID := '06400000-0000-0000-0000-000000000002';
  v_player UUID;
  v_other_player UUID;
  v_cyber_variant UUID;
  v_primal_variant UUID;
  v_old_cyber UUID := '06400000-0000-0000-0000-000000000011';
  v_older_cyber UUID := '06400000-0000-0000-0000-000000000012';
  v_new_cyber UUID := '06400000-0000-0000-0000-000000000013';
  v_primal UUID := '06400000-0000-0000-0000-000000000014';
  v_other_snake UUID := '06400000-0000-0000-0000-000000000015';
  v_result JSONB;
  v_count INTEGER;
BEGIN
  SELECT sv.id INTO v_cyber_variant
  FROM snake_variants sv
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE d.name = 'CYBER'
  ORDER BY sv.sort_order, sv.id
  LIMIT 1;

  SELECT sv.id INTO v_primal_variant
  FROM snake_variants sv
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE d.name = 'PRIMAL'
  ORDER BY sv.sort_order, sv.id
  LIMIT 1;

  IF v_cyber_variant IS NULL OR v_primal_variant IS NULL THEN
    RAISE EXCEPTION '064 test requires seeded CYBER and PRIMAL variants';
  END IF;

  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES
    (v_user, 'authenticated', 'authenticated', 'favorite-064@example.test', NOW(), NOW()),
    (v_other_user, 'authenticated', 'authenticated', 'favorite-other-064@example.test', NOW(), NOW());

  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  SELECT id INTO v_other_player FROM players WHERE user_id = v_other_user;
  UPDATE players SET username = 'favorite_064', handle = 'favorite_064'
   WHERE id = v_player;
  UPDATE players SET username = 'fav_other_064', handle = 'fav_other_064'
   WHERE id = v_other_player;

  -- Seed one current favorite plus another historical specimen. Migration 064
  -- has already run in this test database, so its invariant trigger correctly
  -- prevents recreating the pre-migration duplicate state.
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method,
    is_equipped, is_favorited
  ) VALUES
    (v_old_cyber, v_player, v_cyber_variant, 2, 'bred', FALSE, FALSE),
    (v_older_cyber, v_player, v_cyber_variant, 4, 'bred', FALSE, TRUE),
    (v_new_cyber, v_player, v_cyber_variant, 11, 'bred', TRUE, FALSE),
    (v_primal, v_player, v_primal_variant, 7, 'bred', FALSE, TRUE),
    (v_other_snake, v_other_player, v_cyber_variant, 1, 'tutorial', TRUE, FALSE);

  v_result := set_dynasty_favorite(v_player, v_new_cyber, TRUE);

  IF (v_result ->> 'snake_id')::UUID <> v_new_cyber
     OR (v_result ->> 'favorite_snake_id')::UUID <> v_new_cyber
     OR (v_result ->> 'favorited')::BOOLEAN IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'favorite receipt does not name the selected snake: %', v_result;
  END IF;
  IF jsonb_array_length(v_result -> 'replaced_snake_ids') <> 1
     OR NOT (v_result -> 'replaced_snake_ids' ? v_older_cyber::TEXT) THEN
    RAISE EXCEPTION 'favorite receipt omitted replaced historical rows: %', v_result;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.player_id = v_player
    AND sv.dynasty_id = (
      SELECT dynasty_id FROM snake_variants WHERE id = v_cyber_variant
    )
    AND cs.is_favorited = TRUE;
  IF v_count <> 1 OR NOT (
    SELECT is_favorited FROM collected_snakes WHERE id = v_new_cyber
  ) THEN
    RAISE EXCEPTION 'CYBER did not converge to exactly the selected favorite';
  END IF;
  IF NOT (SELECT is_favorited FROM collected_snakes WHERE id = v_primal) THEN
    RAISE EXCEPTION 'selecting CYBER changed the PRIMAL favorite';
  END IF;

  -- Emulate the already-loaded outgoing production route. It updates only the
  -- requested row through service role instead of calling the new RPC. The
  -- trigger must preserve the invariant while leaving other dynasties alone.
  UPDATE collected_snakes
  SET is_favorited = TRUE
  WHERE id = v_old_cyber
    AND player_id = v_player;

  SELECT COUNT(*) INTO v_count
  FROM collected_snakes cs
  JOIN snake_variants sv ON sv.id = cs.snake_variant_id
  WHERE cs.player_id = v_player
    AND sv.dynasty_id = (
      SELECT dynasty_id FROM snake_variants WHERE id = v_cyber_variant
    )
    AND cs.is_favorited = TRUE;
  IF v_count <> 1
     OR NOT (SELECT is_favorited FROM collected_snakes WHERE id = v_old_cyber)
     OR (SELECT is_favorited FROM collected_snakes WHERE id = v_new_cyber)
     OR NOT (SELECT is_favorited FROM collected_snakes WHERE id = v_primal) THEN
    RAISE EXCEPTION 'outgoing direct writer broke the per-dynasty favorite invariant';
  END IF;

  -- Restore the selected favorite through that same legacy write shape so the
  -- unfavorite contract below continues from the intended specimen.
  UPDATE collected_snakes
  SET is_favorited = TRUE
  WHERE id = v_new_cyber
    AND player_id = v_player;

  v_result := set_dynasty_favorite(v_player, v_new_cyber, FALSE);
  IF (v_result ->> 'favorited')::BOOLEAN IS DISTINCT FROM FALSE
     OR v_result ->> 'favorite_snake_id' IS NOT NULL
     OR jsonb_array_length(v_result -> 'replaced_snake_ids') <> 0 THEN
    RAISE EXCEPTION 'unfavorite receipt is not narrow: %', v_result;
  END IF;
  IF (SELECT is_favorited FROM collected_snakes WHERE id = v_new_cyber)
     OR NOT (SELECT is_favorited FROM collected_snakes WHERE id = v_primal) THEN
    RAISE EXCEPTION 'unfavorite changed more than the named snake';
  END IF;

  BEGIN
    PERFORM set_dynasty_favorite(v_player, v_other_snake, TRUE);
    RAISE EXCEPTION 'foreign snake favorite unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'foreign snake favorite unexpectedly succeeded' THEN RAISE; END IF;
    IF POSITION('Snake not owned by player' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  IF has_function_privilege(
    'authenticated',
    'public.set_dynasty_favorite(uuid,uuid,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute service-only favorite RPC';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.set_dynasty_favorite(uuid,uuid,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute favorite RPC';
  END IF;

  v_result := get_cohesive_release_capability();
  IF v_result ->> 'status' <> 'ready'
     OR (v_result ->> 'version')::INTEGER <> 1
     OR (v_result ->> 'foundingBridgeVersion')::INTEGER <> 1
     OR (v_result ->> 'continuityVersion')::INTEGER <> 1
     OR (v_result ->> 'favoriteInvariantVersion')::INTEGER <> 1 THEN
    RAISE EXCEPTION 'cohesive release capability is incomplete: %', v_result;
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.get_cohesive_release_capability()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.get_cohesive_release_capability()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'cohesive release capability privilege boundary is wrong';
  END IF;
END;
$$;

ROLLBACK;
