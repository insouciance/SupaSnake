-- 026: Aim systems v2 - the crosshair era
-- The five v1 aim systems (pulse/vector/sequence/radar/apex, migration 012)
-- are replaced by four: deadeye/gridlock/pathline/firefly. Stored
-- selections are remapped TIER-ALIGNED so nobody lands on a system above
-- their unlock tier:
--   pulse    (always)              -> deadeye  (always)
--   vector   (hs >= 15)            -> gridlock (hs >= 15)
--   sequence (25 games or breed)   -> pathline (hs >= 30 or 25 games)
--   radar    (hs >= 30)            -> pathline
--   apex     (hs >= 50 or gen 5)   -> pathline
-- Remaining edges (e.g. a breeds-only sequence pick) are handled by the
-- /api/player GET fallback, which serves the default for any stored pick
-- the player has not unlocked - safe in both mixed deploy states.

-- Drop the v1 CHECK FIRST: the remap UPDATEs below write v2 ids, which the
-- old constraint (five v1 ids only) would reject (23514).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_settings_aim_system_check'
  ) THEN
    ALTER TABLE player_settings
      DROP CONSTRAINT player_settings_aim_system_check;
  END IF;
END $$;

-- Remap stored selections (each UPDATE is idempotent: its WHERE matches
-- only v1 values, which cease to exist after the first run)
UPDATE player_settings SET aim_system = 'deadeye' WHERE aim_system = 'pulse';
UPDATE player_settings SET aim_system = 'gridlock' WHERE aim_system = 'vector';
UPDATE player_settings SET aim_system = 'pathline'
  WHERE aim_system IN ('sequence', 'radar', 'apex');

-- Safety net: anything unexpected resolves to the default so the new
-- CHECK below can validate every row
UPDATE player_settings SET aim_system = 'deadeye'
  WHERE aim_system NOT IN ('deadeye', 'gridlock', 'pathline', 'firefly');

-- Recreate the CHECK with the v2 ids
ALTER TABLE player_settings
  ADD CONSTRAINT player_settings_aim_system_check
  CHECK (aim_system IN ('deadeye', 'gridlock', 'pathline', 'firefly'));

-- New rows start on the always-unlocked default
ALTER TABLE player_settings
  ALTER COLUMN aim_system SET DEFAULT 'deadeye';
