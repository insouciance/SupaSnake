/**
 * Strains - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md section 1-2)
 *
 * The five cross-dynasty tag families and every strain-tier tuning
 * constant shared between the client engine, the server validator, and
 * the UI. This module has ZERO imports by design: genes.ts, splices.ts,
 * genome.ts, lineage.ts and traits.ts all import from here, so anything
 * defined here must never look back at them.
 *
 * Taxonomy discipline (inherited from mutations.ts):
 * - [E] effects are pure functions of (food index, activation index) and
 *   are recomputed exactly by the server.
 * - [P] effects change survival/spawn rules inside the engine only.
 * - [BT] bounded-trust effects are client-claimed accumulators clamped by
 *   the hard caps below (the COSMIC-combo model) - a rejected or absent
 *   claim never lowers the deterministic recompute, an inflated claim is
 *   clamped, so claims are payout-non-increasing beyond their cap.
 */

export type StrainId = 'AURUM' | 'VOLT' | 'FERAL' | 'FLUX' | 'UMBRA';

export interface StrainDef {
  id: StrainId;
  name: string;
  /** One-line identity - readable on the strain meter tooltip. */
  identity: string;
  /** Body-tint hex for segment bands, HUD pips, choice-card chips. */
  color: string;
}

export const STRAINS: Record<StrainId, StrainDef> = {
  AURUM: {
    id: 'AURUM',
    name: 'Aurum',
    identity: 'Greed — DNA value manipulation',
    color: '#f5c542',
  },
  VOLT: {
    id: 'VOLT',
    name: 'Volt',
    identity: 'Tempo — tick speed, cadence, windows',
    color: '#42e0f5',
  },
  FERAL: {
    id: 'FERAL',
    name: 'Feral',
    identity: 'Body — length as a resource',
    color: '#5ff542',
  },
  FLUX: {
    id: 'FLUX',
    name: 'Flux',
    identity: 'Space — walls, wrap, portals, pull',
    color: '#a642f5',
  },
  UMBRA: {
    id: 'UMBRA',
    name: 'Umbra',
    identity: 'Risk — death-defiance and wagers',
    color: '#f54263',
  },
};

/** All strain ids in canonical (display) order. */
export const STRAIN_IDS: readonly StrainId[] = [
  'AURUM',
  'VOLT',
  'FERAL',
  'FLUX',
  'UMBRA',
] as const;

/** Player-facing names for the three activation tiers. */
export const STRAIN_TIER_NAMES: Record<
  StrainId,
  { minor: string; expression: string; apex: string }
> = {
  AURUM: { minor: 'Gilt', expression: 'Gilded Wake', apex: 'Midas Vein' },
  VOLT: { minor: 'Tempo', expression: 'Arc Lightning', apex: 'Overclocked Reality' },
  FERAL: { minor: 'Thick Hide', expression: 'Molt', apex: 'Ouroboros' },
  FLUX: { minor: 'Warp Skin', expression: 'Rift Aura', apex: 'Singularity' },
  UMBRA: { minor: 'Shadow Skin', expression: 'Phantom Coil', apex: 'Second Sun' },
};

export function isStrainId(value: unknown): value is StrainId {
  return typeof value === 'string' && value in STRAINS;
}

/** Points per strain (heirloom/lineage spawn points, live run counts...). */
export type StrainPoints = Partial<Record<StrainId, number>>;

// =============================================================================
// THRESHOLDS (section 1)
// =============================================================================

/** Strain tier: 0 none, 1 minor passive, 2 expression, 3 apex. */
export type StrainTier = 0 | 1 | 2 | 3;

export const STRAIN_THRESHOLDS = {
  /** Points for the minor passive - any point source counts. */
  minor: 2,
  /** Points for the Expression - additionally needs >=2 in-run genes. */
  expression: 3,
  /** Points for the Apex - additionally needs >=3 in-run genes. */
  apex: 4,
  /** In-run gene gates: spawn momentum can never substitute for picks. */
  expressionMinGenes: 2,
  apexMinGenes: 3,
  /**
   * Max spawn-source points per strain (heirloom + lineage combined).
   * Spawning with a minor passive is the payoff of dedicated breeding;
   * spawning closer than one pick from an Expression is impossible.
   */
  maxSpawnPoints: 2,
} as const;

/** Tier for a raw point count, ignoring the in-run gene gates. */
export function strainTierForPoints(points: number): StrainTier {
  if (points >= STRAIN_THRESHOLDS.apex) return 3;
  if (points >= STRAIN_THRESHOLDS.expression) return 2;
  if (points >= STRAIN_THRESHOLDS.minor) return 1;
  return 0;
}

/**
 * Tier with the in-run gene gates applied (section 1): Expression needs
 * >=2 genes of the strain picked this run, Apex needs >=3. Points beyond
 * a gated tier do NOT overflow past the gate.
 */
export function strainTier(points: number, inRunGenes: number): StrainTier {
  const raw = strainTierForPoints(points);
  if (raw >= 3 && inRunGenes >= STRAIN_THRESHOLDS.apexMinGenes) return 3;
  if (raw >= 2 && inRunGenes >= STRAIN_THRESHOLDS.expressionMinGenes) return 2;
  if (raw >= 1) return 1;
  return 0;
}

/** Clamp spawn-source points to the per-strain cap. */
export function capSpawnPoints(points: StrainPoints): StrainPoints {
  const capped: StrainPoints = {};
  for (const strain of STRAIN_IDS) {
    const value = points[strain] ?? 0;
    if (value > 0) {
      capped[strain] = Math.min(STRAIN_THRESHOLDS.maxSpawnPoints, value);
    }
  }
  return capped;
}

// =============================================================================
// ECONOMIC TUNING (section 2) - [E] exact-recompute + [BT] claim caps
// =============================================================================

export const STRAIN_ECONOMICS = {
  // --- AURUM ---------------------------------------------------------------
  /** Minor "Gilt": food +5% from activation onward (benefit). */
  giltFoodBonus: 1.05,
  /** Expression "Gilded Wake" [BT]: flat DNA per gilded cell re-traversed. */
  aurumWakeCellFlat: 2,
  /** Gilded Wake claim cap: bonus <= this ratio of the deterministic recompute. */
  aurumWakeMaxBonusRatio: 0.25,
  /** Apex "Midas Vein" [BT]: claim cap ratio of the recompute since apex. */
  midasMaxBonusRatio: 0.6,
  /** Midas Vein cost: salvage delta (a cost - persists through revives). */
  midasSalvageDelta: -0.1,
  // --- VOLT ----------------------------------------------------------------
  /**
   * Expression "Arc Lightning" cost: food x0.85 while active. Arced foods
   * are auto-collected at FULL deterministic value (they increment the
   * food count, so the server recompute captures them exactly); the
   * aggregate -15% is the deterministic price of the reach. This keeps
   * the effect free of any per-arc claim (no under-reporting vector).
   */
  arcLightningFoodPenalty: 0.85,
  /** Apex "Overclocked Reality": food +30% from apex onward (benefit). */
  overclockedRealityFoodBonus: 1.3,
  // --- FERAL ---------------------------------------------------------------
  /** Expression "Molt" [BT]: flat DNA per molt-food eaten (separate spawns). */
  moltFoodFlat: 5,
  /** Molt-foods dropped per molt event (claim cap = events x this x flat). */
  moltFoodsPerEvent: 6,
  /** Apex "Ouroboros" [BT]: flat DNA per tail-tip bite. */
  ouroborosBiteFlat: 30,
  /** Ouroboros claim cap: bites <= floor(foods since apex / this). */
  ouroborosFoodsPerBite: 5,
  /** Ouroboros cost: food x0.9 while active (cost - persists). */
  ouroborosFoodPenalty: 0.9,
  // --- FLUX ----------------------------------------------------------------
  /** Expression "Rift Aura" cost: food x0.9 while active (cost - persists). */
  riftAuraFoodPenalty: 0.9,
  /** Apex "Singularity": +10 flat per pull event (deterministic count). */
  singularityEveryFoods: 25,
  singularityFlat: 10,
  // --- UMBRA ---------------------------------------------------------------
  /** Minor "Shadow Skin": salvage +0.05 (benefit - voided by Phoenix). */
  shadowSkinSalvageDelta: 0.05,
  /** Apex "Second Sun": bank -0.10 while active (cost - persists). */
  secondSunBankDelta: -0.1,
  /** Second Sun: salvage +0.10 (benefit). */
  secondSunSalvageDelta: 0.1,
  /**
   * Second Sun [BT]: flat DNA paid once on a reported trigger. Capped at
   * exactly this value and only accepted when the UMBRA apex is reachable
   * from the accepted picks - a bounded (<=150) audited claim.
   */
  secondSunTriggerFlat: 150,
  // --- INFUSE (section 6) --------------------------------------------------
  /** Per accepted infuse: bank +0.05, salvage -0.05 (additive deltas). */
  infuseBankDelta: 0.05,
  infuseSalvageDelta: -0.05,
  // --- GENOME-ERA RETUNES + GLOBAL CLAMPS (sections 3.1, 10) ---------------
  /** Compound Interest retune under genome: +0.05 per gene held... */
  compoundInterestPerHeld: 0.05,
  /** ...capped at +0.30 total. */
  compoundInterestCap: 0.3,
  /** Hard outcome clamps - applied after ALL shaping, before the floor. */
  bankClamp: 1.75,
  salvageClamp: 0.9,
  /**
   * Global claims clamp: the SUM of all bounded-trust claims may never
   * exceed this ratio of the DETERMINISTIC recompute. (Deterministic
   * gene effects are exact and unforgeable - clamping them would punish
   * honest builds like Loan Shark windows; only the claim surface needs
   * an aggregate backstop.) Individual BT caps bind first in practice;
   * this binding while they pass is a cheat signal - flag, don't hide.
   */
  genomeClaimsCapRatio: 0.35,
} as const;

// =============================================================================
// PHYSICAL TUNING (section 2) - engine-side [P]
// =============================================================================

export const STRAIN_PHYSICS = {
  // --- AURUM ---------------------------------------------------------------
  /** Gilded Wake: cell lifetime in ticks. */
  gildedCellLifetimeTicks: 60,
  /** Gilded Wake: live gilded-cell hard cap (FIFO expiry). */
  gildedMaxCells: 120,
  /** Gilded Wake cost: exit portals despawn this many ticks sooner. */
  aurumWakePortalTicksPenalty: 15,
  /** Midas Vein: a food within this many ticks of the previous is golden. */
  midasWindowTicks: 3,
  // --- VOLT ----------------------------------------------------------------
  /** Minor "Tempo": world slower by this many ms/tick (PRIMAL/COSMIC). */
  tempoSlowMs: 10,
  /** Tempo on CYBER: speed as if this many foods earlier. */
  tempoCyberFoodOffset: 3,
  /** Arc Lightning: arc radius (Chebyshev) around the eaten food. */
  arcRadius: 3,
  /** Arc Lightning: max foods consumed per arc. */
  arcMaxPerEat: 2,
  /** Overclocked Reality: tick interval x this factor (faster world). */
  overclockedRealityTickFactor: 0.75,
  /** Overclocked Reality cost: portal windows this many ticks shorter. */
  overclockedPortalTicksPenalty: 20,
  // --- FERAL ---------------------------------------------------------------
  /** Thick Hide (minor): tail segments lost instead of dying, once per run. */
  thickHideSegmentLoss: 5,
  /** Molt: every this many foods after activation, tail resets... */
  moltEveryFoods: 20,
  /**
   * ...to this length - which is ALSO the minimum body length while Molt
   * is active. A weaker reset than Shed's 8 is Molt's cost: the shed
   * segments pay flat DNA, but the snake can never get truly short again.
   */
  moltResetLength: 12,
  /** Ouroboros: segments consumed per tail-tip bite. */
  ouroborosSegmentsPerBite: 3,
  // --- FLUX ----------------------------------------------------------------
  /** Warp Skin (minor): one free edge-wrap per this many foods. */
  warpSkinRechargeFoods: 30,
  /** Rift Aura cost: exit portal interval +2 foods. */
  riftAuraPortalIntervalPenalty: 2,
  /** Singularity: board food pulled to within this radius of the head. */
  singularityPullRadius: 4,
  /** Singularity cost: exit portal interval +3 foods. */
  singularityPortalIntervalPenalty: 3,
  // --- UMBRA ---------------------------------------------------------------
  /** Phantom Coil: ticks of tail-phase after every eat. */
  phantomCoilTicks: 3,
  /** Phantom Coil cost: portal windows this many ticks shorter. */
  phantomPortalTicksPenalty: 10,
  // --- INFUSE (section 6) --------------------------------------------------
  /** Infuse: tail segments paid per infuse. */
  infuseSegmentCost: 4,
  /** Infuse: minimum snake length to be offered the option. */
  infuseMinLength: 8,
  /** Infuse: hard cap per run. */
  infuseMaxPerRun: 3,
  /** Infuse: next portal interval +2 foods per infuse. */
  infusePortalIntervalPenalty: 2,
} as const;
