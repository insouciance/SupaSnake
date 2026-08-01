-- Two-connection invariant proof for migration 064. Isolated local Supabase
-- only; the harness rejects every non-loopback database URL before this runs.

\set ON_ERROR_STOP on

\if :{?dblink_conn}
\else
DO $$
BEGIN
  RAISE EXCEPTION
    'dblink_conn is required for the isolated favorite concurrency test';
END;
$$;
\endif

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.test_hold_legacy_favorite(
  p_player_id UUID,
  p_snake_id UUID,
  p_seconds DOUBLE PRECISION
) RETURNS VOID AS $$
BEGIN
  UPDATE collected_snakes
  SET is_favorited = TRUE
  WHERE id = p_snake_id AND player_id = p_player_id;
  PERFORM pg_sleep(p_seconds);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.test_hold_rpc_favorite(
  p_player_id UUID,
  p_snake_id UUID,
  p_seconds DOUBLE PRECISION
) RETURNS VOID AS $$
BEGIN
  PERFORM set_dynasty_favorite(p_player_id, p_snake_id, TRUE);
  PERFORM pg_sleep(p_seconds);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
  v_user UUID := '06400000-0000-0000-0000-000000000101';
  v_player UUID;
  v_variant UUID;
BEGIN
  DELETE FROM auth.users WHERE id = v_user;
  INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
  VALUES (
    v_user, 'authenticated', 'authenticated',
    'favorite-race-064@example.test', NOW(), NOW()
  );
  SELECT id INTO v_player FROM players WHERE user_id = v_user;
  UPDATE players
  SET username = 'favrace064', handle = 'favrace064'
  WHERE id = v_player;
  SELECT sv.id INTO v_variant
  FROM snake_variants sv
  JOIN dynasties d ON d.id = sv.dynasty_id
  WHERE d.name = 'CYBER'
  ORDER BY sv.sort_order, sv.id
  LIMIT 1;
  IF v_player IS NULL OR v_variant IS NULL THEN
    RAISE EXCEPTION 'favorite concurrency fixture could not be provisioned';
  END IF;
  INSERT INTO collected_snakes(
    id, player_id, snake_variant_id, generation, acquired_method,
    is_equipped, is_favorited
  ) VALUES
    ('06400000-0000-0000-0000-000000000111', v_player, v_variant, 1, 'unlock', TRUE, FALSE),
    ('06400000-0000-0000-0000-000000000112', v_player, v_variant, 2, 'bred', FALSE, FALSE);
END;
$$;

SELECT extensions.dblink_connect('favorite_legacy_a', :'dblink_conn');
SELECT extensions.dblink_send_query(
  'favorite_legacy_a',
  $query$
    SELECT public.test_hold_legacy_favorite(
      (SELECT id FROM players
       WHERE user_id = '06400000-0000-0000-0000-000000000101'),
      '06400000-0000-0000-0000-000000000111', 2
    )::TEXT
  $query$
);
SELECT pg_sleep(0.25);
SELECT set_dynasty_favorite(
  (SELECT id FROM players
   WHERE user_id = '06400000-0000-0000-0000-000000000101'),
  '06400000-0000-0000-0000-000000000112', TRUE
);
SELECT result
FROM extensions.dblink_get_result('favorite_legacy_a') AS remote(result TEXT);
SELECT extensions.dblink_disconnect('favorite_legacy_a');

DO $$
DECLARE
  v_player UUID;
BEGIN
  SELECT id INTO v_player FROM players
  WHERE user_id = '06400000-0000-0000-0000-000000000101';
  IF (SELECT COUNT(*) FROM collected_snakes
      WHERE player_id = v_player AND is_favorited) <> 1
     OR NOT (SELECT is_favorited FROM collected_snakes
             WHERE id = '06400000-0000-0000-0000-000000000112') THEN
    RAISE EXCEPTION 'RPC did not serialize behind the outgoing direct writer';
  END IF;
END;
$$;

-- Reverse the writer order as well: an incoming RPC holding the shared
-- advisory key cannot race with the outgoing direct-row route.
UPDATE collected_snakes
SET is_favorited = FALSE
WHERE id IN (
  '06400000-0000-0000-0000-000000000111',
  '06400000-0000-0000-0000-000000000112'
);
SELECT extensions.dblink_connect('favorite_rpc_a', :'dblink_conn');
SELECT extensions.dblink_send_query(
  'favorite_rpc_a',
  $query$
    SELECT public.test_hold_rpc_favorite(
      (SELECT id FROM players
       WHERE user_id = '06400000-0000-0000-0000-000000000101'),
      '06400000-0000-0000-0000-000000000111', 2
    )::TEXT
  $query$
);
SELECT pg_sleep(0.25);
UPDATE collected_snakes
SET is_favorited = TRUE
WHERE id = '06400000-0000-0000-0000-000000000112'
  AND player_id = (
    SELECT id FROM players
    WHERE user_id = '06400000-0000-0000-0000-000000000101'
  );
SELECT result
FROM extensions.dblink_get_result('favorite_rpc_a') AS remote(result TEXT);
SELECT extensions.dblink_disconnect('favorite_rpc_a');

DO $$
DECLARE
  v_player UUID;
BEGIN
  SELECT id INTO v_player FROM players
  WHERE user_id = '06400000-0000-0000-0000-000000000101';
  IF (SELECT COUNT(*) FROM collected_snakes
      WHERE player_id = v_player AND is_favorited) <> 1
     OR NOT (SELECT is_favorited FROM collected_snakes
             WHERE id = '06400000-0000-0000-0000-000000000112') THEN
    RAISE EXCEPTION 'outgoing direct writer did not serialize behind the RPC';
  END IF;
END;
$$;

DROP FUNCTION public.test_hold_legacy_favorite(UUID, UUID, DOUBLE PRECISION);
DROP FUNCTION public.test_hold_rpc_favorite(UUID, UUID, DOUBLE PRECISION);
