-- Migration 014: Game Design v2 Phase 2 - Mutation Food
--
-- game_sessions.mutations records the sanitized mutation state of a run as
-- one JSONB blob written by the session-end validator:
--   {
--     "picks": [{ "id": "gold_trail", "atFood": 17 }, ...],  -- pick order
--     "phoenixTriggeredAtFood": 25 | null,
--     "cosmic": { "comboDnaBonus": 120,
--                 "comboScoreBonus": 120,
--                 "maxChain": 6 } | null
--   }
-- NULL for mutation-free non-COSMIC runs. The server stores only what the
-- validator ACCEPTED (post legality/cadence bounds + bounded-trust clamps),
-- never the raw claim - the raw claim's audit trail is validation_errors.

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS mutations JSONB;

COMMENT ON COLUMN game_sessions.mutations IS
  'Design v2 Phase 2: sanitized mutation record {picks, phoenixTriggeredAtFood, cosmic} accepted by the validator; NULL when the run had none.';
