-- Migration 029: Buildcraft: The Genome - core (BUILDCRAFT_GENOME_DESIGN.md)
--
-- 1. game_sessions.run_seed: the server-issued offer seed. Gene offers are
--    derived from counter-based streams of this seed (offerGravity.ts), so
--    the server can re-derive any offer k independently - offer legality
--    becomes verifiable instead of trusted. Stamped at session start; the
--    engine only runs genome behavior when it received one (capability
--    handshake - never the client feature flag alone).
--
-- 2. game_sessions.genome: the validator-ACCEPTED genome record as one
--    JSONB blob (the 014 mutations-blob pattern; raw claims never land):
--    {
--      "v": 1,
--      "picks": [{ "id": "gold_trail", "atFood": 17 }, ...],  -- raw picks
--      "splices": [{ "id": "splice_dragon_hoard", "atFood": 40 }],  -- derived
--      "surges": [{ "strain": "AURUM", "atFood": 55 }],
--      "infuses": [{ "atFood": 31 }],
--      "revive": { "kind": "second_sun", "atFood": 62 } | null,
--      "claims": { "aurumWakeDna": 84, ... },   -- post-clamp
--      "strainCounts": { "AURUM": 3 },
--      "expressions": { "AURUM": 40 },          -- strain -> activation food
--      "apexes": {}
--    }
--    The wire-compat mutations blob (014) keeps being written alongside for
--    >= 1 release; old sessions carry only mutations and validate unchanged.
--
-- 3. gene_definitions / splice_definitions: display catalogs for the codex
--    and UI. The TypeScript modules (genes.ts / splices.ts) remain the
--    VALIDATION authority (the 018 trait_definitions discipline: catalog
--    for reads, TS for math) - keep both in lockstep.

-- ---------------------------------------------------------------------------
-- 1 + 2. Session columns
-- ---------------------------------------------------------------------------

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS run_seed UUID,
  ADD COLUMN IF NOT EXISTS genome JSONB;

COMMENT ON COLUMN game_sessions.run_seed IS
  'Genome: server-issued offer seed (counter-based deterministic offer streams). NULL = legacy (pre-genome) run.';
COMMENT ON COLUMN game_sessions.genome IS
  'Genome: validator-accepted record {v, picks, splices, surges, infuses, revive, claims, strainCounts, expressions, apexes}; NULL for legacy runs.';

-- ---------------------------------------------------------------------------
-- 3. Catalogs (public read - display data, never validation authority)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gene_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('E', 'P', 'EP')),
  -- 1-2 strain tags (dual-tag genes grant a point to each)
  strains TEXT[] NOT NULL CHECK (
    array_length(strains, 1) BETWEEN 1 AND 2
    AND strains <@ ARRAY['AURUM','VOLT','FERAL','FLUX','UMBRA']::TEXT[]
  ),
  effect TEXT NOT NULL,
  cost TEXT NOT NULL,
  economics TEXT NOT NULL CHECK (economics IN ('pure', 'path', 'none')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gene_definitions IS
  'Genome gene catalog (display/codex). Source of truth for math: src/shared/game/genes.ts - keep in lockstep.';

CREATE TABLE IF NOT EXISTS splice_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gene_a TEXT NOT NULL REFERENCES gene_definitions(id),
  gene_b TEXT NOT NULL REFERENCES gene_definitions(id),
  effect TEXT NOT NULL,
  cost TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (gene_a <> gene_b)
);

-- One recipe per unordered pair
CREATE UNIQUE INDEX IF NOT EXISTS splice_definitions_pair_idx
  ON splice_definitions (LEAST(gene_a, gene_b), GREATEST(gene_a, gene_b));

COMMENT ON TABLE splice_definitions IS
  'Genome splice recipes (display/codex). Source of truth for fusion: src/shared/game/splices.ts - keep in lockstep.';

ALTER TABLE gene_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE splice_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gene_definitions_public_read" ON gene_definitions;
CREATE POLICY "gene_definitions_public_read" ON gene_definitions
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "splice_definitions_public_read" ON splice_definitions;
CREATE POLICY "splice_definitions_public_read" ON splice_definitions
  FOR SELECT USING (TRUE);

-- ---------------------------------------------------------------------------
-- Seeds (ON CONFLICT DO NOTHING - idempotent; mirrors genes.ts / splices.ts)
-- ---------------------------------------------------------------------------

INSERT INTO gene_definitions (id, name, kind, strains, effect, cost, economics) VALUES
  -- Launch Ten (retagged mutations - ids unchanged)
  ('gold_trail', 'Gold Trail', 'E', ARRAY['AURUM'], 'Every 5th food after pickup is golden: ×3 value', 'Exit portals despawn 30 ticks sooner', 'pure'),
  ('overgrowth', 'Overgrowth', 'EP', ARRAY['FERAL'], 'Food +20% DNA', 'Snake grows +2 extra segments per food', 'pure'),
  ('wall_rush', 'Wall Rush', 'P', ARRAY['FLUX'], 'Walls no longer kill — you slide along them', 'Food −10% DNA for the rest of the run', 'pure'),
  ('shed', 'Shed', 'EP', ARRAY['FERAL'], 'Every 25 foods, tail resets to length 8', 'Food −10% DNA for the rest of the run', 'pure'),
  ('mirror_wager', 'Mirror Wager', 'E', ARRAY['UMBRA'], 'Banked multiplier ×1.25 → ×1.50', 'Death salvage ×0.60 → ×0.30', 'pure'),
  ('magnet_pulse', 'Magnet Pulse', 'P', ARRAY['FLUX'], 'Food within 2 cells is pulled toward you', 'Exit portal interval +4 foods', 'none'),
  ('time_dilation', 'Time Dilation', 'EP', ARRAY['VOLT'], 'Speed −1 tier (slower world)', 'Food −20% DNA', 'pure'),
  ('splitter', 'Splitter', 'EP', ARRAY['VOLT'], 'Food spawns in pairs — collect faster', 'Each food worth 70%', 'pure'),
  ('phoenix', 'Phoenix', 'P', ARRAY['UMBRA'], 'Survive one death (reborn at length 8, rewound 3 cells)', 'On trigger, lose all mutation economic bonuses', 'none'),
  ('compound_interest', 'Compound Interest', 'E', ARRAY['AURUM'], 'Banked bonus +0.05 per gene held (cap +0.30)', 'Only the pick slot it occupies', 'pure'),
  -- Mastery genes (retagged)
  ('deep_roots', 'Deep Roots', 'EP', ARRAY['FERAL'], '+1 DNA per food for every 25 foods survived since pickup', 'Exit portals despawn 10 ticks sooner', 'pure'),
  ('ancient_grove', 'Ancient Grove', 'E', ARRAY['AURUM','FERAL'], 'Foods after 40 pay +25% DNA', 'Foods up to 40 pay −10%', 'pure'),
  ('tectonic_patience', 'Tectonic Patience', 'EP', ARRAY['FLUX'], 'Exit portals linger 30 ticks longer', 'Food −10% DNA for the rest of the run', 'pure'),
  ('redline_dividend', 'Redline Dividend', 'E', ARRAY['VOLT'], 'Foods at max overclock (20+) pay +30% DNA', 'Foods below max tier pay −10%', 'pure'),
  ('afterburner', 'Afterburner', 'EP', ARRAY['VOLT','AURUM'], 'Every 10th food after pickup pays ×2 DNA', 'Exit portals despawn 20 ticks sooner', 'pure'),
  ('overclock_harvest', 'Overclock Harvest', 'E', ARRAY['UMBRA'], 'Banked multiplier ×1.25 → ×1.40', 'Death salvage ×0.60 → ×0.45', 'pure'),
  ('starweaver', 'Starweaver', 'P', ARRAY['VOLT'], 'Constellation groups spawn 4 foods', 'Chain window 2 ticks shorter', 'none'),
  ('gravity_well', 'Gravity Well', 'EP', ARRAY['FLUX'], 'Food within 3 cells drifts toward you', 'Food −10% DNA for the rest of the run', 'pure'),
  ('event_horizon', 'Event Horizon', 'P', ARRAY['FLUX'], 'Open (wrap) phases last 25 ticks longer', 'Closed (killing) phases last 15 ticks longer', 'none'),
  -- Season 1 seasonal genes (retagged)
  ('solstice_engine', 'Solstice Engine', 'EP', ARRAY['AURUM','VOLT'], 'Every 4th food after pickup pays ×2 DNA', 'Exit portal interval +2 foods', 'pure'),
  ('glacial_reserve', 'Glacial Reserve', 'EP', ARRAY['FERAL'], 'Food +1% DNA per food survived since pickup (caps at +30%)', 'Exit portals despawn 20 ticks sooner', 'pure'),
  ('midnight_oil', 'Midnight Oil', 'E', ARRAY['AURUM'], 'First 15 foods after pickup +35% DNA', 'Foods beyond the window −5% for the rest of the run', 'pure'),
  -- New base genes (9)
  ('loan_shark', 'Loan Shark', 'E', ARRAY['AURUM'], 'First 10 foods after pickup +100% DNA', 'Foods 11–30 after pickup −20%', 'pure'),
  ('tithe', 'Tithe', 'E', ARRAY['AURUM'], 'Every 10th food after pickup +20 flat DNA', 'Every food −1 flat (never below 1)', 'pure'),
  ('static_charge', 'Static Charge', 'EP', ARRAY['VOLT'], 'A food eaten after ≥8 ticks of fasting pays ×2', 'Portal windows 10 ticks shorter', 'path'),
  ('slipstream', 'Slipstream', 'P', ARRAY['VOLT'], 'Input grace — turns buffer one tick earlier', 'Food −5% DNA', 'pure'),
  ('bulk_up', 'Bulk Up', 'EP', ARRAY['FERAL'], '+3 extra segments per food; +2 flat DNA per 10 segments of length', 'The length itself', 'pure'),
  ('serpentine', 'Serpentine', 'P', ARRAY['FERAL'], 'Your last 5 tail segments no longer kill on contact', 'Food −5% DNA', 'pure'),
  ('pocket_rift', 'Pocket Rift', 'P', ARRAY['FLUX'], 'Once per 20 foods, a wall hit teleports you to the opposite wall', 'Exit portal interval +2 foods', 'none'),
  ('grave_robber', 'Grave Robber', 'E', ARRAY['UMBRA'], 'If your previous run ended in death, food +10% this run', 'Only the slot — and the death you already paid', 'pure'),
  ('last_gasp', 'Last Gasp', 'E', ARRAY['UMBRA'], 'Foods eaten at length ≥30 pay +15%', 'Foods at length <30 pay −5%', 'pure'),
  -- M10 dynasty signature genes (3)
  ('heartwood', 'Heartwood', 'EP', ARRAY['FERAL'], 'Each Shed/Molt event drops one golden food (30 flat DNA)', 'Food −5% DNA', 'path'),
  ('zenith_protocol', 'Zenith Protocol', 'E', ARRAY['VOLT'], 'Foods at max overclock (20+) pay +4 flat DNA', 'Foods below max tier −5%', 'pure'),
  ('constellation_crown', 'Constellation Crown', 'EP', ARRAY['FLUX'], 'Constellation combo cap ×2.4 → ×2.8', 'Chain window one tick shorter', 'path')
ON CONFLICT (id) DO NOTHING;

INSERT INTO splice_definitions (id, name, gene_a, gene_b, effect, cost) VALUES
  ('splice_dragon_hoard', 'Dragon Hoard', 'gold_trail', 'compound_interest', 'Every 5th food ×3 +5 flat; bank +0.05 per gene held', 'Exit portals despawn 30 ticks sooner'),
  ('splice_regenesis', 'Regenesis', 'overgrowth', 'shed', 'Food +20%; every 20 foods the tail resets to 8 and each shed segment pays 1 flat DNA', 'Food −10% DNA'),
  ('splice_styx_contract', 'Styx Contract', 'mirror_wager', 'phoenix', 'Bank ×1.50, survive one death — the revive keeps your benefits', 'Salvage locked at ×0.30'),
  ('splice_gravity_bubble', 'Gravity Bubble', 'time_dilation', 'magnet_pulse', 'Speed −1 tier AND pull radius 3', 'Food −25% DNA'),
  ('splice_ricochet', 'Ricochet', 'wall_rush', 'splitter', 'Wall-slide; food in pairs; foods eaten while sliding +50%', 'Each food worth 80%'),
  ('splice_comet_tail', 'Comet Tail', 'gold_trail', 'afterburner', 'Every 5th food ×3, every 10th ×2 — aligned 10ths pay ×6', 'Exit portals despawn 40 ticks sooner'),
  ('splice_old_growth', 'Old Growth', 'deep_roots', 'glacial_reserve', 'Ramp caps at +45%; +1 flat DNA per 20 foods after fusion', 'Exit portals despawn 25 ticks sooner'),
  ('splice_all_in', 'All In', 'compound_interest', 'mirror_wager', 'Bank +0.15 per gene held', 'Salvage ×0.20'),
  ('splice_black_magnet', 'Black Magnet', 'magnet_pulse', 'gravity_well', 'Pull radius 4', 'Food −15%; exit portal interval +4 foods'),
  ('splice_molted_rebirth', 'Molted Rebirth', 'shed', 'phoenix', 'Shed cycle; survive one death keeping your food multipliers', 'Food −10% DNA')
ON CONFLICT (id) DO NOTHING;
