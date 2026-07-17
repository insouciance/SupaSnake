-- 012: Aim systems meta-progression
-- The aim telegraph becomes a player-selected system (pulse/vector/
-- sequence/radar/apex) unlocked by existing stats. Only the SELECTION is
-- stored; unlock state derives from players.high_score /
-- total_games_played / breeds_completed and MAX(collected_snakes.generation)
-- - no new tracking columns.

ALTER TABLE player_settings
  ADD COLUMN IF NOT EXISTS aim_system TEXT NOT NULL DEFAULT 'pulse';

-- Constrain to the five known systems (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_settings_aim_system_check'
  ) THEN
    ALTER TABLE player_settings
      ADD CONSTRAINT player_settings_aim_system_check
      CHECK (aim_system IN ('pulse', 'vector', 'sequence', 'radar', 'apex'));
  END IF;
END $$;
