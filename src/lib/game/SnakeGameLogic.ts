/**
 * Snake Game Logic - Core Game Engine
 * Pure game logic decoupled from rendering
 *
 * Design v2: dynasty rulesets drive speed and scoring (injected via
 * GameOptions.ruleset / setRuleset), and runs can end two ways - death or
 * extraction through a periodically spawning exit portal. All payout math
 * is delegated to the shared ruleset module so the server can recompute
 * it exactly from the raw food count.
 *
 * Design v2 Phase 2 adds:
 * - Mutation food (GAME_DESIGN_V2.md section 5): a rare timed pickup that
 *   opens a choice-of-2 "choice hold" - the engine freezes (tick() no-ops,
 *   inputs are inactive) without entering the pause state, so the pause
 *   menu never renders over the choice overlay. [P]hysical effects live
 *   here; [E]conomic effects flow through the shared foodValueModifier so
 *   the server recompute stays exact.
 * - COSMIC (DYNASTY_COSMIC, rewritten in WP-3.13): a permanent torus - every
 *   edge wraps, always - and constellations of scattered stars on a window,
 *   where every star the window closes on CALCIFIES into a terrain block on
 *   its own cell. The dynasty's pressure comes from what the player fails to
 *   collect, and the debris is theirs to place.
 *
 * RNG discipline: the injectable rng drives EVERY stochastic decision the
 * engine makes - exit/mutation cadence rolls, mutation offers, exit,
 * mutation AND food tile placement, constellation glyphs. There is no
 * `Math.random()` call in this file; `this.rng` defaults to it, and that
 * default is the only place the global source is reached.
 *
 * Food placement used to be the one exception, on the argument that
 * "placement affects where things are, never what they pay" (finding F-12).
 * That argument is wrong for replay: where the food is decides where the
 * player must steer, so two runs on one seed diverged on the first wave and
 * a challenge link could not put two players on the same board
 * (Constitution §11.3 - "drops the visitor onto the *same seed*"). Seed a
 * run via `options.rng` and the whole run is reproducible.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  FOOD_BASE_SCORE,
  RULESETS,
  type DynastyName,
  type DynastyRuleset,
} from '@/shared/game/rulesets';
import {
  StatefulRng,
  type StatefulRngSnapshot,
} from '@/shared/game/statefulRng';
import {
  ladderCadence,
  ladderHoldBase,
  ladderInfuseGrowth,
  ladderParams,
  resolveLadderRung,
} from '@/shared/game/ladder';
import {
  MUTATION_PHYSICS,
  MUTATION_POOL,
  MUTATION_SPAWN,
  foodValueFlatBonus,
  foodValueModifier,
  rollMutationOffer,
  type MutationId,
  type MutationPick,
} from '@/shared/game/mutations';
import {
  TRAIT_PHYSICS,
  traitFoodValueModifier,
  type TraitId,
} from '@/shared/game/traits';
import {
  ANOMALY_ECONOMICS,
  ANOMALY_PHYSICS,
  anomalyFoodValueModifier,
  type AnomalyId,
} from '@/shared/game/anomalies';
import {
  NEAR_WALL_MIN_MS,
  RUN_EVENTS_MAX,
  type RunDeathCause,
  type RunEvent,
  type RunEventRecord,
} from '@/shared/game/runEvents';
import { isMutationId } from '@/shared/game/mutations';
import {
  blocksDueAt,
  cellKey,
  formingTicksForSeconds,
  nextTerrainCells,
  ringOf,
  type TerrainBlock,
  type TerrainSource,
} from '@/shared/game/terrain';
import {
  blockedGrid,
  chooseFoodCell,
  chooseSurvivableTargetCell,
  markBlocked,
} from '@/shared/game/foodPlacement';
import {
  PORTAL_SCHEDULE_LIMIT,
  portalIntervalTax,
  // Imported from `portals.ts` rather than through `rulesets.ts`'s re-export:
  // the re-export is typed against the full `ExtractionConfig`, and the cadence
  // this engine rolls from is the ladder-shifted `PortalCadence`. Same
  // function, the structural type it was written for.
  rollExitInterval,
  portalStream,
  portalTaxFactsAt,
  type PortalCadence,
  type PortalTaxSources,
} from '@/shared/game/portals';
import {
  baseGrowthForFood,
  resolveGrowthProfile,
  type GrowthProfile,
  type GrowthProfileId,
} from '@/shared/game/growth';
import { rollGeneOfferInterval } from '@/shared/game/geneCadence';
import {
  GENE_ECONOMICS,
  GENE_PHYSICS,
  GENE_POOL,
  GENOME_SPAWN,
  geneFoodValueFlatBonus,
  geneFoodValueModifier,
  geneStrains,
  type GeneId,
  type GenePick,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  SPLICE_ECONOMICS,
  SPLICE_PHYSICS,
  fusedSlotCount,
  type SpliceId,
} from '@/shared/game/splices';
import {
  STRAIN_ECONOMICS,
  STRAIN_PHYSICS,
  STRAIN_IDS,
  fortressFiresAt,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import {
  fortressEventDna,
  fusePicks,
  genomeFoodValueFlatBonus,
  genomeFoodValueModifier,
  strainActivations,
  strainTierAtFood,
  tithePerFoodFloor,
  type FusedView,
  type GenomeClaims,
  type GenomeRevive,
  type LengthLossEvent,
  type LengthTrace,
  type PressureGrowthEvent,
  type ShedEvent,
  type StrainActivations,
  type StrainSurge,
} from '@/shared/game/genome';
import {
  boardPressureSnapshot,
  type BoardPressureSnapshot,
} from '@/shared/game/pressure';
import {
  pityForecast,
  rollGeneOffer,
  type LineageBias,
  type OfferTraceEntry,
} from '@/shared/game/offerGravity';
import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  GENOME_V2_STRAIN_THRESHOLDS,
  genomeV2FtueFromPresentation,
  genomeV2RunRecord,
  genomeV2StrainPoints,
  genomeV2Yield,
  genomeV2YieldFloor,
  projectGenomeV2Ladders,
  type GenomeRulesVersion,
  type GenomeV2FtueCapability,
  type GenomeV2FtuePresentation,
  type GenomeV2RecodePreview,
  type GenomeV2RunRecord,
  type GenomeV2SlotIndex,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import {
  GenomeV2Runtime,
  enclosedGenomeV2Cells,
  genomeV2CircuitRoute,
  genomeV2PhaseRoute,
  shortestGenomeV2Route,
  type GenomeV2RuntimeSnapshot,
} from './genomeV2Runtime';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Input modality changes only buffer depth, never movement rules. Keyboard
 * keeps the shipped three-turn planning queue; a continuous mobile flick
 * gesture is capped at the two unresolved turns an intentional L-turn needs.
 */
export type DirectionInputSource = 'standard' | 'flick';

/**
 * Optional real-input timing supplied by the UI adapter. The deterministic
 * engine never reads a clock of its own: tests and replays can provide the
 * same facts, while callers without a real-time loop retain the exact shipped
 * queue behavior.
 */
export interface DirectionInputTiming {
  /** Monotonic event timestamp, used only to recognize one rapid flick phrase. */
  inputTimeMs?: number;
  /** Time until the next scheduled movement tick when the input arrived. */
  nextTickInMs?: number;
  /** Stable id for all commands emitted by one pointer-down gesture. */
  gestureId?: number;
}

/**
 * Outcome of a setDirection call. Purely informational (additive): the
 * engine's queue semantics are unchanged, but callers that care (touch
 * feedback, debug instrumentation) can react to why an input did or did
 * not enter the buffer.
 */
export type SetDirectionResult =
  'accepted' | 'duplicate' | 'reversal' | 'micro_u' | 'queue_full' | 'inactive';

interface QueuedDirection {
  direction: Direction;
  source: DirectionInputSource;
  timing?: DirectionInputTiming;
}

interface RecentFlickTurn {
  from: Direction;
  to: Direction;
  inputTimeMs: number;
  gestureId?: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

/** How a run ended: crashed into something, or left through the exit portal. */
export type EndReason = 'died' | 'extracted';

export interface GameState {
  snake: Position[];
  /** Primary food cell (= foods[0]) - kept for renderer/store compatibility. */
  food: Position;
  /**
   * All live food cells. One food normally; Splitter adds a second;
   * COSMIC spawns a scattered constellation. A new wave spawns when every
   * food of the current one is eaten - or, on COSMIC, when the window
   * closes and the survivors calcify.
   */
  foods: Position[];
  /**
   * Terrain (WP-3.03): occupied, lethal cells. A block forms as a floor decal
   * (harmless, passable) and solidifies only once its cell is clear of the
   * snake - which is what makes the overlap case structurally impossible.
   */
  terrain: TerrainBlock[];
  direction: Direction;
  /** Display points (ruleset-multiplied) - no longer the food count. */
  score: number;
  /** Raw DNA total (pre bank/salvage multiplier - the server applies that). */
  dnaCollected: number;
  /** Raw foods eaten this run - the fact the server recomputes from. */
  foodEaten: number;
  /** Exit portal cell, when one is live. */
  exitTile: Position | null;
  /**
   * Second exit portal (Twin Exits anomaly only): spawns with exitTile as
   * a pair sharing one despawn window; entering either banks the run.
   */
  exitTile2: Position | null;
  /** Ticks until the live exit portal despawns. */
  exitTicksRemaining: number;
  /**
   * Meteor Shower anomaly: ticks until the live food wave burns up and
   * respawns elsewhere. 0 outside the anomaly.
   */
  foodTicksRemaining: number;
  /** Food count at which the next exit portal spawns. */
  nextExitAtFood: number;
  /** True once the run ended through the exit portal. */
  extracted: boolean;
  /** Mutation food cell, when one is live. */
  mutationTile: Position | null;
  /** Ticks until the live mutation food despawns. */
  mutationTicksRemaining: number;
  /** Food count at which the next mutation food spawns. */
  nextMutationAtFood: number;
  /** Genes (mutations) held this run, in raw pick order (wire format). */
  heldMutations: GenePick[];
  /**
   * The live choice-of-2 offer. While non-null the engine is in "choice
   * hold": tick() no-ops and direction input is inactive, but this is NOT
   * the pause state - the pause menu must not render.
   */
  pendingChoice: [GeneId, GeneId] | null;
  /** Canonical reducer state for a rules-version-2 run; null for v1/legacy. */
  genomeV2: GenomeV2State | null;
  // --- GENOME (Buildcraft: The Genome) - all inert in legacy mode ----------
  /** Live strain points (heirloom + genes + surges). */
  strainCounts: StrainPoints;
  /** Strain -> live tier (1 minor / 2 expression / 3 apex). */
  strainTiers: Partial<Record<StrainId, number>>;
  /** Fused splices, in fusion order (display; server re-derives). */
  fusedSplices: { id: SpliceId; atFood: number }[];
  /** AURUM Gilded Wake trail cells with per-cell remaining ticks. */
  gildedCells: { x: number; z: number; ticks: number }[];
  /** Committed infuses, in order. */
  infuses: { atFood: number }[];
  /** Strain surges granted by infusing at the gene cap. */
  surges: StrainSurge[];
  /** Where the live choice offer came from. */
  choiceSource: 'gene_food' | 'infuse' | null;
  /**
   * The strain the pity rule would force into slot 1 of the next offer if
   * the live offer is PASSED, or null. Presentation only - it lets the PASS
   * affordance state what passing actually buys instead of promising
   * something generic. Recomputed on every roll; null outside a hold.
   */
  pendingChoicePity: StrainId | null;
  /**
   * Portal-choice hold (genome runs): stepping onto the exit portal
   * freezes the engine (like the gene choice hold) until the player
   * resolves BANK or INFUSE. Null when no portal decision is pending.
   */
  pendingPortalChoice: {
    canInfuse: boolean;
    /** V2-only server-authored capability facts. Omitted on v1 paths. */
    canContinue?: boolean;
    canMutate?: boolean;
    continueLockedReason?: string | null;
    mutateLockedReason?: string | null;
    continueCapability?: GenomeV2FtueCapability;
    portalGenomeCapability?: GenomeV2FtueCapability;
  } | null;
  /** Surge-strain choice hold (infusing while at the gene cap). */
  pendingSurgeChoice: boolean;
  /** The run's one revive, once fired (generalizes phoenixTriggeredAtFood). */
  revive: GenomeRevive | null;
  /** Bounded-trust claim accumulators (display + end-of-run claim). */
  genomeClaims: GenomeClaims;
  /** Historical wire compatibility; new runs never append length losses. */
  lossEvents: LengthLossEvent[];
  /** Rule-15 growth charged by physical survival/tail-bite events. */
  pressureEvents: PressureGrowthEvent[];
  /** FERAL Thick Hide: one self-collision pardon per run. */
  thickHideAvailable: boolean;
  /** FLUX Warp Skin: free-wrap charge state. */
  warpSkinCharged: boolean;
  /** Pocket Rift: wall-teleport charge state. */
  pocketRiftCharged: boolean;
  /** UMBRA Phantom Coil: ticks of tail-phase remaining. */
  phantomTicksRemaining: number;
  /** Post-revive self/body-wall phase; length and terrain remain intact. */
  revivePhaseTicksRemaining: number;
  /** True while a held Phoenix can still absorb one death. */
  phoenixAvailable: boolean;
  /** Food count at the Phoenix trigger, null if never triggered. */
  phoenixTriggeredAtFood: number | null;
  /** True while Iron Scales can absorb one board-boundary/terrain hit. */
  ironScalesAvailable: boolean;
  /**
   * COSMIC: hue (0..glyphCount-1) of the live constellation, else null.
   * Cosmetic since WP-3.13 - it identifies the wave, it never gates a bonus.
   */
  constellationGlyph: number | null;
  /**
   * COSMIC: ticks left before the live constellation's uncollected stars
   * calcify. 0 outside COSMIC.
   *
   * This is the number the whole dynasty turns on, so it is state rather
   * than a private field: a window the player cannot see is a punishment
   * they cannot have chosen, and the abandonment being CHOSEN is the entire
   * fairness argument (DYNASTY_COSMIC §4).
   */
  constellationTicksRemaining: number;
  /** COSMIC: what `constellationTicksRemaining` started at, so a renderer
   *  can draw the window as a depleting bar rather than a bare count. */
  constellationWindowTicks: number;
  isPlaying: boolean;
  isGameOver: boolean;
  isPaused: boolean;
  /** Tactical holds spent this run (choice holds never count - Rule 1). */
  holdsUsed: number;
  /** Tactical holds this run has earned, including its length bonuses. */
  holdBudget: number;
  isDeathSequence: boolean;
  startTime: number | null;
  deathPosition: Position | null;
}

/**
 * Why the board is being held.
 *
 * `'tactical'` is the player choosing to stop and think - a real resource,
 * metered against the run's hold budget. `'decision'` is the board being
 * held around one of the run's OWN decisions (a gene offer, a portal, a
 * surge, or the re-arm immediately after one resolves); Inviolable Rule 1
 * protects those, so they are always free.
 */
export type HoldKind = 'tactical' | 'decision';

/** Payload of the 'gameOver' event - one event for both endings. */
export interface GameOverData {
  score: number;
  dnaCollected: number;
  foodEaten: number;
  extracted: boolean;
  endReason: EndReason;
  deathPosition: Position | null;
  /** Genes held at run end, in raw pick order (server validates these). */
  mutations: GenePick[];
  /**
   * How the run ended (Identity v1 section 9.5): wall/self for deaths,
   * 'extracted' for banked runs. Display + Analyst input only - never a
   * payout claim.
   */
  deathCause: RunDeathCause | null;
  /** Food count at the Phoenix trigger (honest-client analytics + payout). */
  phoenixTriggeredAtFood: number | null;
  /**
   * Genome payload (null in legacy mode): the raw picks ride in
   * `mutations` above (wire compat); this carries the genome-only claims
   * and facts. Everything here is either re-derived or clamped
   * server-side - nothing is trusted.
   */
  genome: GameOverGenome | null;
  /** Canonical v2 run record. Absent on every legacy/v1 payload. */
  genomeV2?: GenomeV2RunRecord;
}

/** The genome block of the end-of-run payload. */
export interface GameOverGenome {
  infuses: { atFood: number }[];
  surges: StrainSurge[];
  revive: GenomeRevive | null;
  claims: GenomeClaims;
  pressureEvents: PressureGrowthEvent[];
  /** Legacy-only compatibility field; new runs do not append losses. */
  lossEvents: LengthLossEvent[];
  offerTrace: OfferTraceEntry[];
  /** Display facts (server re-derives its own): */
  fusedSplices: { id: SpliceId; atFood: number }[];
  strainCounts: StrainPoints;
  strainTiers: Partial<Record<StrainId, number>>;
}

type GameEvent =
  | 'gameStart'
  | 'gameOver'
  | 'foodCollected'
  | 'tick'
  | 'pause'
  | 'resume'
  | 'deathSequence'
  | 'deathSequenceComplete'
  | 'exitSpawned'
  | 'exitDespawned'
  | 'foodDespawned'
  | 'extracted'
  | 'mutationSpawned'
  | 'mutationDespawned'
  | 'mutationChoice'
  | 'mutationPicked'
  | 'mutationDeclined'
  | 'phoenixTriggered'
  | 'ironScalesTriggered'
  /** COSMIC: the live constellation's survivors have calcified. */
  | 'constellationCalcified'
  // Genome events (never fire in legacy mode)
  | 'portalChoice'
  | 'infused'
  | 'surgeChoice'
  | 'surged'
  | 'spliceFused'
  | 'expressionActivated'
  | 'gildedPaid'
  | 'arcCollected'
  | 'ouroborosBite'
  | 'thickHideTriggered'
  | 'warpSkinTriggered'
  | 'pocketRiftTriggered'
  | 'petrified'
  | 'reviveTriggered'
  | 'genomeV2Event';
type EventCallback = (data?: unknown) => void;

interface GameOptions {
  gridSize?: number;
  initialLength?: number;
  /**
   * The run's growth profile id (WP-3.02), as stamped by the server into
   * `run_context`. Absent or unrecognised resolves to `baseline`, which is
   * byte-identical to the shipped game. Never derive this from a
   * `NEXT_PUBLIC_*` flag - the server recomputes length from the stamp, so a
   * locally-chosen profile would diverge on every food.
   */
  growthProfileId?: GrowthProfileId;
  /**
   * The D2 ladder rung (WP-3.12), as stamped by the server into `run_context`.
   * Absent or unrecognised resolves to rung 0, which is byte-identical to the
   * shipped game. Never derive this from a `NEXT_PUBLIC_*` flag - the server
   * recomputes the run's lengths, doors and salvage from the stamp, so a
   * locally-chosen rung would diverge from the settlement.
   */
  ladderRung?: number;
  initialSpeed?: number;
  /**
   * Dynasty ruleset driving speed + scoring. Defaults to COSMIC. The page
   * swaps in the equipped snake's ruleset via setRuleset once the
   * collection resolves (always before a run starts).
   */
  ruleset?: DynastyRuleset;
  /**
   * Random source for cadence rolls, mutation offers/placement, and
   * constellation glyphs (injectable for deterministic tests). Never used
   * for scoring.
   */
  rng?: () => number;
  /**
   * Server-issued seed for a recoverable ordinary run. Unlike an injected
   * opaque function, this stream can be checkpointed and resumed exactly.
   * `rng` remains available for focused tests and authored Training runs;
   * callers must not provide both.
   */
  simulationSeed?: string;
  /**
   * The equipped snake's traits (Design v2 Phase 3A). Usually injected via
   * setTraits once the session-start response arrives - the server reads
   * them from the snake row, so this is display/physics config, never a
   * payout claim (the end-of-run payload does not carry traits).
   */
  traits?: TraitId[];
  /**
   * The player's unlocked mutation offer pool (Design v2 section 7.1:
   * base ten + this dynasty's mastery unlocks). Injected from the
   * session-start response via setMutationPool - like traits, this is
   * OFFER config only, never a payout claim: the server recomputes the
   * player's actual pool from player_mastery and rejects out-of-pool
   * picks regardless of what the engine offered.
   */
  mutationPool?: MutationId[];
  /**
   * The weekly anomaly modifier (Design v2 Phase 4B, section 7.2), or
   * null/omitted outside anomaly runs. Injected from the session-start
   * response via setAnomaly - like traits, it is physics/economy config
   * the server independently re-derives from the session row, never a
   * payout claim.
   */
  anomaly?: AnomalyId | null;
  /**
   * Genome capability (Buildcraft: The Genome). The engine runs genome
   * behavior ONLY when the server start response supplied a runSeed -
   * never on the client feature flag alone (mid-deploy safety). All
   * fields are server-derived config, never payout claims.
   */
  genome?: GenomeEngineConfig | null;
}

/**
 * A deterministic board opening supplied by a driven mode such as Training.
 * The normal game still owns its canonical centered opening through start().
 */
export interface DrivenStartState {
  snake: Position[];
  direction: Direction;
  foods: Position[];
}

/** Server-issued genome capability + run-start context. */
export interface GenomeEngineConfig {
  /** Missing is deliberately v1 for historical sessions and old clients. */
  rulesVersion?: GenomeRulesVersion;
  /** The session's offer seed (stored on the session row). */
  runSeed: string;
  /**
   * Optional server-authored opening reducer state for rules v2. The engine
   * rejects a Dynasty mismatch instead of trusting a client-selected state.
   */
  reducerState?: GenomeV2State;
  /** Curated v2 pool. V1 continues to read `genePool` below unchanged. */
  v2GenePool?: GenomeV2ActiveGeneId[];
  /** Exact server-authored v2 capability/progress presentation. */
  ftuePresentation?: GenomeV2FtuePresentation;
  /** Starting strain points (heirloom traits + lineage, server-derived). */
  heirloom?: StrainPoints;
  /** Server-derived Signal/anomaly offer tilt for v2. */
  offerTiltStrain?: StrainId | null;
  /** The unlocked gene offer pool (server-composed). */
  genePool?: GeneId[];
  /** Lineage offer bias (strength 0+ lineages). */
  lineage?: LineageBias | null;
  /** Anomaly strain week: +weight on this strain's genes in offers. */
  anomalyStrain?: StrainId | null;
  /**
   * Suppressed strains: Expressions/Apexes are disabled; the minor remains.
   * Server-composed - the Gauntlet's strain ban UNIONED with the world
   * condition's dampening clause (WP-2.10b), so the engine sees one list and
   * the validator recomputes from the same one.
   */
  suppressedStrains?: StrainId[];
  /**
   * The world condition's per-strain strain-threshold shift (WP-2.10b).
   *
   * Server-derived from the run's condition and handed over at start, exactly
   * like `suppressedStrains` and `anomalyStrain`. The engine never derives it:
   * if it did, the tiers it displays and the tiers the payout recomputes would
   * be two calculations that merely agree today.
   */
  strainThresholdDelta?: Readonly<Partial<Record<StrainId, number>>>;
  /** Server fact: the previous earned run ended in death (Grave Robber). */
  prevRunDied?: boolean;
  /** FTUE gating (server-derived from banked-run count). */
  ftue?: {
    strainTagsUnlocked?: boolean;
    expressionsUnlocked: boolean;
    infuseUnlocked: boolean;
    spawnPointsUnlocked?: boolean;
    splicesUnlocked: boolean;
    apexesUnlocked: boolean;
  };
}

export type GenomeV2OfferResolution =
  | {
      action: 'choose';
      offerId: string;
      candidateIndex: 0 | 1;
      replacementSlot?: GenomeV2SlotIndex;
    }
  | {
      action: 'decline';
      offerId: string;
      pinCandidateIndex?: 0 | 1;
    };

export type GenomeV2PortalResolution =
  | { action: 'bank'; portalId: string }
  | {
      action: 'continue';
      portalId: string;
      activateMirror?: boolean;
    }
  | {
      action: 'mutate';
      portalId: string;
      candidateIndex: 0 | 1;
      /** Open locus for INFUSE, occupied locus for a final confirmed Recode. */
      replacementSlot?: GenomeV2SlotIndex;
    };

export interface GenomeV2OverclockResolution {
  source: 'volt_apex' | 'zenith_protocol';
  /** Replay supplies the stable identity; live callers omit it. */
  activationId?: string;
}

export const SNAKE_CHECKPOINT_VERSION = 1 as const;
export const DEATH_SEQUENCE_DURATION_MS = 800;
/**
 * Immutable gameplay/content contract carried by every resumable run.
 *
 * Engine serialization and product rules change on different cadences.  A
 * checkpoint may therefore be structurally readable while belonging to rules
 * this deployment must not continue.  Bump this value whenever a change can
 * alter deterministic board evolution or the meaning of persisted state.
 */
export const SNAKE_RULES_VERSION = 'snake-rules-2026-07-31.2' as const;

/**
 * Compact, deterministic evidence for every player-authored state change.
 * Turns are recorded when they are actually consumed by a movement tick, not
 * when a keyboard/touch heuristic first queues them. That keeps device input
 * timing out of the authority contract while preserving the exact physics.
 */
export type SnakeReplayAction =
  | { tick: number; kind: 'turn'; direction: Direction }
  | { tick: number; kind: 'pause'; hold: HoldKind }
  | { tick: number; kind: 'resume' }
  | { tick: number; kind: 'mutation'; choice: 0 | 1 | 'decline' }
  | { tick: number; kind: 'portal'; choice: 'bank' | 'pass' | 'infuse' }
  | { tick: number; kind: 'surge'; strain: StrainId }
  | {
      tick: number;
      kind: 'genome_v2_offer';
      offerId: string;
      choice: 0 | 1 | 'decline';
      pinCandidate?: 0 | 1;
      slot?: GenomeV2SlotIndex;
    }
  | {
      tick: number;
      kind: 'genome_v2_portal';
      portalId: string;
      choice: 'bank' | 'continue' | 'infuse' | 'recode';
      candidate?: 0 | 1;
      slot?: GenomeV2SlotIndex;
      activateMirror?: boolean;
    }
  | {
      tick: number;
      kind: 'genome_v2_target';
      targetId: string;
      choice: 'ordinary' | 'gilded';
    }
  | {
      tick: number;
      kind: 'genome_v2_overclock';
      source: 'volt_apex' | 'zenith_protocol';
      activationId: string;
    };

export interface SnakeReplayTrace {
  ticks: number;
  actions: SnakeReplayAction[];
}

/**
 * Bounded terminal suffix anchored to the last server-accepted checkpoint.
 * Unlike a cumulative trace, this remains safely below browser keepalive
 * payload limits even in a very long run.
 */
export interface SnakeTerminalReplayProof {
  fromTick: number;
  toTick: number;
  actionOffset: number;
  actions: SnakeReplayAction[];
  /**
   * Cumulative play-clock elapsed at the terminal boundary. A restored engine
   * carries the accepted checkpoint value forward, so time spent offline is
   * absent. The server treats this as a bounded proposal, never raw authority.
   * Optional only so already-open pre-cutover tabs can finish conservatively.
   */
  activeElapsedMs?: number;
}

/**
 * Complete continuation state at a resolved simulation boundary.
 *
 * This object becomes resumable only after the server validates its immutable
 * run binding, live-state shape, time/rate bounds, and monotonic progress, then
 * stores it under the current exclusive lease. A client export is a transport
 * proposal, never payout proof. The queue and gesture history are intentionally
 * absent: a resumed run is held and requires a fresh, deliberate direction.
 */
export interface SnakeCheckpointV1 {
  version: typeof SNAKE_CHECKPOINT_VERSION;
  engineVersion: 'snake-engine-v1';
  rulesVersion: typeof SNAKE_RULES_VERSION;
  rng: StatefulRngSnapshot;
  config: {
    gridSize: number;
    initialLength: number;
    ruleset: DynastyName;
    traits: TraitId[];
    mutationPool: MutationId[];
    anomaly: AnomalyId | null;
    genome: GenomeEngineConfig | null;
    growthProfileId: GrowthProfileId;
    ladderRung: number;
  };
  state: GameState;
  privateState: {
    speed: number;
    portalIndex: number;
    portalsMet: number;
    fusedView: FusedView;
    activations: StrainActivations | null;
    lengthTrace: LengthTrace;
    petrified: number;
    ouroborosBites: number;
    drivenRun: boolean;
    offerIndex: number;
    offerTrace: Array<OfferTraceEntry & { resolved: boolean }>;
    recentOffers: GeneId[][];
    ticksSinceAnyEat: number;
    slidThisTick: boolean;
    warpSkinLastRecharge: number;
    pocketRiftLastRecharge: number;
    lastSingularityPullAtFood: number;
    /** One same-tick free hold earned by resolving a real engine decision. */
    decisionHoldEntitled: boolean;
    runEvents: RunEvent[];
    runEventsTruncated: boolean;
    elapsedMs: number;
    replay: SnakeReplayTrace;
    /** Additive and optional so every historical v1 checkpoint still reads. */
    genomeV2Runtime?: GenomeV2RuntimeSnapshot | null;
  };
}

function checkpointClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checkpointInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`Invalid checkpoint ${label}`);
  }
  return value as number;
}

const OPPOSITES: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

/** Wall Rush slide preference: try the clockwise perpendicular first. */
const CLOCKWISE: Record<Direction, Direction> = {
  UP: 'RIGHT',
  RIGHT: 'DOWN',
  DOWN: 'LEFT',
  LEFT: 'UP',
};

/**
 * SnakeGameLogic Class
 * Handles all game mechanics
 */
export class SnakeGameLogic {
  private state: GameState;
  private gridSize: number;
  private initialLength: number;
  private speed: number;
  private ruleset: DynastyRuleset;
  private rng: () => number;
  private replayableRng: StatefulRng | null = null;
  /**
   * Reused occupancy grid for food placement - see `waveBlockedGrid`. Held on
   * the instance so a wave costs no allocation; sized lazily because
   * `gridSize` can be overridden per run.
   */
  private blockedScratch: Uint8Array | null = null;
  /**
   * The same grid with COSMIC's scatter exclusions written into it. Separate
   * because the exclusions are a PREFERENCE: when a full board leaves the
   * spaced grid with nowhere to place a star, the placer falls back to the
   * real one rather than dropping the star.
   */
  private spacedScratch: Uint8Array | null = null;
  /**
   * How far the seeded portal schedule has been walked, and how many doors it
   * has produced. They differ only in the theoretical merge case documented on
   * `advancePortalSchedule`; `portalsMet` is what the carry reads.
   */
  private portalIndex = 0;
  private portalsMet = 0;
  private traits: TraitId[];
  private mutationPool: MutationId[];
  private anomaly: AnomalyId | null;
  /** Genome capability - non-null only when the server issued a runSeed. */
  private genome: GenomeEngineConfig | null;
  /** Reducer/event adapter, present only for an explicitly stamped v2 run. */
  private genomeV2Runtime: GenomeV2Runtime | null = null;
  /**
   * The run's growth profile (WP-3.02), server-stamped into `run_context`.
   * NEVER read from a build-time flag: `computeLengthTrace` recomputes with
   * the stamped profile, so a client that chose its own would diverge on
   * every length and invalidate an honest run.
   */
  private growth: GrowthProfile;
  /**
   * The run's D2 ladder rung (WP-3.12), server-stamped into `run_context`.
   *
   * Same discipline as `growth`, and for the same reason: the rung moves the
   * portal schedule, the infuse growth and the salvage floor, all three of
   * which the settlement recomputes from the stamp. A client that chose its own
   * rung would play a different game from the one it gets paid for.
   *
   * Rung 0 until the server says otherwise, and rung 0 is the shipped game.
   */
  private ladderRung: number = 0;
  /** Derived fused view of heldMutations - recomputed on every pick. */
  private fusedView: FusedView = { loose: [], splices: [] };
  /** Derived strain activations - recomputed on pick/surge. */
  private activations: StrainActivations | null = null;
  /**
   * THE LIVE LENGTH TRACE (WP-2.05).
   *
   * The same structure `computeLengthTrace` produces server-side, but built
   * as the run happens: `lengthAtEat[n]` is snapshotted BEFORE food n's
   * growth, and every shed records its event as it fires. The engine feeds
   * the shared per-food functions from THIS, so the arguments it passes are
   * the arguments the server will pass when it recomputes the same run.
   *
   * Before this existed the engine passed the live array length (one longer
   * than the model, because the head is unshifted before pricing) and an
   * EMPTY shed-event list - the two argument bugs behind the divergences the
   * first playtest surfaced.
   */
  private lengthTrace: LengthTrace = {
    lengthAtEat: [0],
    shedEvents: [],
    petrifyEvents: [],
  };
  /**
   * Segments Fortress has turned to stone this run (WP-3.11).
   *
   * They left `state.snake` and they never left the snake's LENGTH - see
   * `modelledLength()`. Kept as a running count rather than derived from
   * `petrifyEvents` on every read because it is consulted once per tick.
   */
  private petrified = 0;
  /**
   * Ouroboros bites taken this run.
   *
   * Counted explicitly because cadence is about physical bite events, not
   * their fixed +2 growth price. Settlement proves the same cadence from the
   * ordered `pressureEvents` list.
   */
  private ouroborosBites = 0;
  /**
   * True while the run was opened from an authored board (Training). Such
   * runs are scripted teaching, not scored play, so they are exempt from
   * the tactical-hold budget.
   */
  private drivenRun = false;
  /** Offer stream counter (cadence + infuse offers share it). */
  private offerIndex = 0;
  /**
   * Offer trace shipped in the genome payload (advisory verification).
   *
   * `resolved` is engine-internal and never leaves this class. The wire
   * shape is exactly `OfferTraceEntry`, where `picked: null` means "the
   * player took neither" - the shipped contract `sanitizeOfferTrace`, the
   * server's `verifyOfferTrace` replay and the e2e all depend on.
   *
   * The flag exists because an OPEN offer also has `picked: null`, so dying
   * mid-decision is indistinguishable from a pass on the wire. Both sides
   * agree either way, so pity replay is unaffected and the wire needs no
   * change - but the engine should not have to guess, and any future
   * counter that tries to count passes would otherwise be quietly wrong.
   */
  private offerTrace: (OfferTraceEntry & { resolved: boolean })[] = [];
  /** The last two offers (pity window input). */
  private recentOffers: GeneId[][] = [];
  /** Ticks since ANY eat (Midas window / Static Charge fasting). */
  private ticksSinceAnyEat = 1_000_000;
  /** True when this tick's move resolved via a Wall Rush slide (Ricochet). */
  private slidThisTick = false;
  /** Foods eaten at the last Warp Skin / Pocket Rift recharge. */
  private warpSkinLastRecharge = 0;
  private pocketRiftLastRecharge = 0;
  private events: Map<GameEvent, EventCallback[]>;
  /**
   * Buffered direction inputs, consumed one per tick. Buffering (instead of
   * overwriting a single pending direction) is what makes fast multi-turn
   * sequences reliable: pressing UP then LEFT within one tick executes both
   * turns on consecutive ticks instead of losing the first. This is the
   * core skill mechanic - inputs must never silently drop.
   */
  private directionQueue: QueuedDirection[] = [];
  /**
   * One next-slot intention admitted only inside the fractional pre-turn
   * window. It is deliberately outside the executable queue, so keyboard and
   * flick queue depths remain three and two respectively.
   */
  private preTurnIntent: QueuedDirection | null = null;
  /** Last two accepted flick turns, retained only to classify a third. */
  private recentFlickTurns: RecentFlickTurn[] = [];
  /** Food count at the last FLUX-apex Singularity pull, for its cadence. */
  private lastSingularityPullAtFood = 0;
  /**
   * Run-event recorder (Identity v1 section 9.5): a compact discrete
   * event stream - food/portal/bank/mutation/near-wall/terminal - capped
   * at RUN_EVENTS_MAX. Display + Analyst input only: nothing here feeds
   * payout math, and the server re-validates every bound.
   */
  private runEvents: RunEvent[] = [];
  private runEventsTruncated = false;
  /** How the run ended - null until finalizeRun. */
  private deathCause: RunDeathCause | null = null;
  private terminalResult: GameOverData | null = null;
  /** Death cause staged by the collision that started the death sequence. */
  private pendingDeathCause: Exclude<RunDeathCause, 'extracted'> | null = null;
  /** Prevent an old presentation timer from touching a later run. */
  private deathSequenceToken = 0;
  /** Near-wall episode tracking (1-cell wall margin). */
  private nearWallSinceMs: number | null = null;
  /** Server-replayable player decisions plus number of resolved movement ticks. */
  private replayTicks = 0;
  private replayActions: SnakeReplayAction[] = [];
  /** Prevent replaying an accepted trace from recording a second copy. */
  private applyingReplay = false;
  /**
   * Resolving an engine-authored choice grants exactly one same-tick free
   * re-arm. It expires before the next movement tick, so a replay cannot
   * forge unlimited `decision` pauses at otherwise ordinary board states.
   */
  private decisionHoldEntitled = false;
  constructor(options: GameOptions = {}) {
    if (options.rng && options.simulationSeed) {
      throw new Error('Provide rng or simulationSeed, not both');
    }
    this.gridSize = options.gridSize ?? GAME_CONFIG.board.gridSize;
    this.initialLength =
      options.initialLength ?? GAME_CONFIG.snake.initialLength;
    this.ruleset = options.ruleset ?? RULESETS.COSMIC;
    if (options.simulationSeed) {
      this.replayableRng = StatefulRng.fromSeed(options.simulationSeed);
      this.rng = () => this.replayableRng!.next();
    } else {
      this.rng = options.rng ?? Math.random;
    }
    // Traits before createInitialState: the mutation cadence roll (Patient)
    // and the Iron Scales charge both depend on them.
    this.traits = [...(options.traits ?? [])];
    // Empty/omitted pool falls back to the base ten (defensive - the
    // session-start response always sends at least the base pool)
    this.mutationPool =
      options.mutationPool && options.mutationPool.length > 0
        ? [...options.mutationPool]
        : [...MUTATION_POOL];
    this.anomaly = options.anomaly ?? null;
    this.genome = options.genome ?? null;
    this.growth = resolveGrowthProfile(options.growthProfileId);
    // The rung before createInitialState: `nextExitAtFood` is seeded from the
    // ladder-adjusted cadence, so a rung set afterwards would leave the first
    // door standing where rung 0 put it.
    this.ladderRung = resolveLadderRung(options.ladderRung);
    // The profile owns the starting body unless a caller pinned one.
    if (options.initialLength === undefined) {
      this.initialLength = this.growth.initialLength;
    }
    this.speed = options.initialSpeed ?? this.ruleset.speedForFood(0);
    this.events = new Map();
    this.clearDirectionalIntent();
    this.genomeV2Runtime = this.createGenomeV2Runtime();

    this.state = this.createInitialState();
  }

  /**
   * Adopt the server-issued simulation seed before the run starts.
   * `beginRun` rewinds this source immediately before creating the opening,
   * so pre-run React configuration order cannot consume a hidden draw.
   */
  setSimulationSeed(seed: string): void {
    if (this.state.isPlaying) return;
    this.replayableRng = StatefulRng.fromSeed(seed);
    this.rng = () => this.replayableRng!.next();
  }

  hasReplayableSimulation(): boolean {
    return this.replayableRng !== null;
  }

  /** Missing rulesVersion remains byte-compatible Genome v1. */
  private genomeActive(): boolean {
    return this.genome !== null && this.genome.rulesVersion !== GENOME_RULES_V2;
  }

  private genomeV2Active(): boolean {
    return this.genome?.rulesVersion === GENOME_RULES_V2;
  }

  private createGenomeV2Runtime(
    snapshot?: GenomeV2RuntimeSnapshot,
    reducerStateOverride?: GenomeV2State
  ): GenomeV2Runtime | null {
    if (!this.genomeV2Active() || !this.genome) return null;
    const reducerState = reducerStateOverride ?? this.genome.reducerState;
    if (!reducerState) {
      if (!this.genome.v2GenePool || this.genome.v2GenePool.length < 2) {
        throw new Error(
          'Fresh Genome v2 runs require a server-frozen gene pool.'
        );
      }
      if (!this.genome.ftuePresentation) {
        throw new Error(
          'Fresh Genome v2 runs require server-authored FTUE facts.'
        );
      }
    }
    const reducerDynasty = reducerState?.dynasty;
    const ftue = this.genome.ftuePresentation
      ? genomeV2FtueFromPresentation(this.genome.ftuePresentation)
      : reducerState?.ftue;
    return new GenomeV2Runtime({
      runSeed: this.genome.runSeed,
      dynasty: reducerDynasty ?? (this.ruleset.id as DynastyName),
      pool: this.genome.v2GenePool,
      ftue,
      startingStrainPoints: this.genome.heirloom,
      offerTiltStrain: this.genome.offerTiltStrain,
      suppressedStrains: this.genome.suppressedStrains,
      strainThresholdDelta: this.genome.strainThresholdDelta,
      externalSecondLife: this.hasTrait('iron_scales') ? 'iron_scales' : null,
      reducerState,
      snapshot,
      onEvent: (event) => this.emit('genomeV2Event', event),
    });
  }

  private syncGenomeV2State(): void {
    const reducer = this.genomeV2Runtime?.getState() ?? null;
    this.state.genomeV2 = reducer;
    if (reducer) {
      this.state.dnaCollected = genomeV2YieldFloor(
        reducer.ledger.bankableYield
      );
      this.state.strainCounts = genomeV2StrainPoints(reducer);
      const ladders = projectGenomeV2Ladders(reducer);
      this.state.strainTiers = Object.fromEntries(
        STRAIN_IDS.map((strain) => {
          const active = ladders[strain].activeTier;
          const semanticTier = active === GENOME_V2_STRAIN_THRESHOLDS.apex
            ? 3
            : active === GENOME_V2_STRAIN_THRESHOLDS.expression
              ? 2
              : active === GENOME_V2_STRAIN_THRESHOLDS.minor
                ? 1
                : 0;
          return [strain, semanticTier];
        })
      );
    }
  }

  private genomeV2OfferPending(): boolean {
    return (
      this.state.genomeV2?.offer !== null &&
      this.state.genomeV2?.offer !== undefined
    );
  }

  /**
   * Swap the genome capability config. Mirrors setTraits: the page
   * constructs the engine on mount, before the session-start response
   * arrives. Refused mid-run - a run is genome or legacy for its whole
   * life, never half of each.
   */
  setGenome(genome: GenomeEngineConfig | null): void {
    if (this.state.isPlaying) return;
    this.genome = genome ? checkpointClone(genome) : null;
    this.genomeV2Runtime = this.createGenomeV2Runtime();
    this.state.strainCounts = this.spawnStrainPoints();
    this.syncGenomeV2State();
  }

  /** The active genome config (or null in legacy mode). */
  getGenome(): GenomeEngineConfig | null {
    return this.genome ? checkpointClone(this.genome) : null;
  }

  /**
   * Adopt the growth profile the SERVER stamped on this run (WP-3.02).
   *
   * Mirrors `setGenome`: the page builds the engine on mount, before the
   * session-start response exists, and configures it when the response
   * arrives. Refused once the run is live, because growth decides the
   * starting body and every subsequent length - changing it mid-run would
   * diverge from `computeLengthTrace`, which folds one profile for the whole
   * run.
   *
   * The argument is whatever the server sent; anything unrecognised resolves
   * to historical `baseline`, so a client that is newer, older or confused
   * still plays a deterministic compatibility curve rather than inventing one.
   */
  setGrowthProfile(id: unknown): void {
    if (this.state.isPlaying) return;
    this.growth = resolveGrowthProfile(id);
    this.initialLength = this.growth.initialLength;
    this.state = this.createInitialState();
  }

  /** The run's growth profile id - what settlement will recompute with. */
  getGrowthProfileId(): GrowthProfileId {
    return this.growth.id;
  }

  /** The length used by pressure thresholds, including petrified segments. */
  getModelledLength(): number {
    return this.modelledLength();
  }

  /**
   * Adopt the D2 ladder rung the SERVER stamped on this run (WP-3.12).
   *
   * Mirrors `setGrowthProfile`: the page builds the engine on mount, before the
   * session-start response exists, and configures it when the response arrives.
   * Refused once the run is live, because the rung decides where the first door
   * stands and how much an infuse grows - changing it mid-run would diverge
   * from the settlement, which folds ONE rung for the whole run.
   *
   * The argument is whatever the server sent; anything unrecognised resolves to
   * rung 0, so a client that is newer, older or confused still plays the
   * shipped game rather than an invented rung.
   */
  setLadderRung(rung: unknown): void {
    if (this.state.isPlaying) return;
    this.ladderRung = resolveLadderRung(rung);
    // Both of these are fixed at state creation, and `refreshHoldBudget` cannot
    // walk the budget back down (it is monotonic by design), so the rung has to
    // rewrite them explicitly. Safe here and only here: the run is not live, so
    // no hold has been spent and no threshold has been crossed.
    this.state.holdBudget = ladderHoldBase(
      this.holdProfile().base,
      this.ladderRung
    );
    if (!this.state.exitTile) {
      this.state.nextExitAtFood = this.exitCadence().firstExitAtFood;
    }
    this.refreshHoldBudget();
  }

  /** The run's ladder rung - what settlement will recompute with. */
  getLadderRung(): number {
    return this.ladderRung;
  }

  /**
   * The portal cadence in force for this run: the dynasty's, shifted by the
   * ladder's "Long Walk" rung.
   *
   * THE ONE READ. Every site that used to reach for
   * `this.ruleset.extraction` for cadence purposes goes through here, so the
   * incremental walk, the legacy roll and the initial `nextExitAtFood` cannot
   * disagree about where the doors stand - and the settlement runs the same
   * `ladderCadence` over the same numbers.
   */
  private exitCadence(): PortalCadence {
    return ladderCadence(this.ruleset.extraction, this.ladderRung);
  }

  /** Spawn strain points (heirloom+lineage, server-derived, pre-capped). */
  private spawnStrainPoints(): StrainPoints {
    return { ...(this.genome?.heirloom ?? {}) };
  }

  /** The active gene offer pool under genome rules. */
  private effectiveGenePool(): GeneId[] {
    const pool = this.genome?.genePool;
    return pool && pool.length > 0 ? pool : GENE_POOL;
  }

  /** Held-gene cap: 6 under genome rules, 4 legacy. */
  private maxHeld(): number {
    return this.genomeActive() ? GENOME_SPAWN.maxHeld : MUTATION_SPAWN.maxHeld;
  }

  /**
   * Occupied offer slots. Raw parent picks remain in the run payload so the
   * server can derive splices, but each derived splice occupies one slot.
   */
  private heldSlotCount(): number {
    return this.genomeActive()
      ? fusedSlotCount(this.fusedView)
      : this.state.heldMutations.length;
  }

  /** Strains represented by genes picked this run (spawn points excluded). */
  private heldGeneStrains(): StrainId[] {
    return Array.from(
      new Set(this.state.heldMutations.flatMap((pick) => geneStrains(pick.id)))
    );
  }

  /** Recompute the fused view + activations + live tiers after a change. */
  private refreshGenomeDerived(): void {
    if (!this.genomeActive()) return;
    this.fusedView =
      this.genome?.ftue?.splicesUnlocked === false
        ? { loose: [...this.state.heldMutations], splices: [] }
        : fusePicks(this.state.heldMutations);
    this.state.fusedSplices = this.fusedView.splices.map((s) => ({
      id: s.spliceId,
      atFood: s.atFood,
    }));
    const before = this.activations;
    // The FTUE tier cap binds the ECONOMY here too (activations feed the
    // per-food math), mirroring the server's capped recompute exactly.
    this.activations = strainActivations(
      this.state.heldMutations,
      this.spawnStrainPoints(),
      this.state.surges,
      this.ftueTierCap() as 0 | 1 | 2 | 3,
      this.genome?.suppressedStrains ?? [],
      this.genome?.strainThresholdDelta ?? {}
    );
    const counts: StrainPoints = {};
    const tiers: Partial<Record<StrainId, number>> = {};
    for (const strain of Object.keys(this.activations) as StrainId[]) {
      const a = this.activations[strain];
      if (a.points > 0) counts[strain] = a.points;
      const gate = this.ftueTierCap();
      const tier = Math.min(gate, strainTierAtFood(a, Number.MAX_SAFE_INTEGER));
      if (tier > 0) tiers[strain] = tier;
      const beforeTier = before
        ? Math.min(
            gate,
            strainTierAtFood(before[strain], Number.MAX_SAFE_INTEGER)
          )
        : 0;
      if (tier > beforeTier && tier >= 1) {
        this.recordRunEvent({
          t: this.runTimeDs(),
          e: 'g',
          id: strain,
          v: tier,
        });
        this.emit('expressionActivated', { strain, tier });
        this.onTierActivated(strain, tier);
      }
    }
    this.state.strainCounts = counts;
    this.state.strainTiers = tiers;
  }

  /** FTUE tier ceiling: expressions/apexes stay invisible until unlocked. */
  private ftueTierCap(): number {
    const ftue = this.genome?.ftue;
    if (!ftue) return 3;
    if (!ftue.expressionsUnlocked) return 1;
    if (!ftue.apexesUnlocked) return 2;
    return 3;
  }

  /** Immediate physical consequences of a strain tier activating. */
  private onTierActivated(strain: StrainId, tier: number): void {
    if (strain === 'VOLT') {
      // Tempo (minor) / Overclocked Reality (apex) reshape the tick rate.
      this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    }
    if (strain === 'FLUX' && tier >= 1) {
      this.state.warpSkinCharged = true;
      this.warpSkinLastRecharge = this.state.foodEaten;
    }
    if (strain === 'FERAL' && tier >= 1) {
      this.state.thickHideAvailable = true;
    }
    if (
      (strain === 'AURUM' && tier >= 2) ||
      (strain === 'UMBRA' && tier >= 2) ||
      (strain === 'VOLT' && tier >= 3)
    ) {
      // Portal-window costs (Gilded Wake -15, Phantom Coil -10,
      // Overclocked -20) clamp a live portal down, like gold_trail does.
      if (this.state.exitTile) {
        this.state.exitTicksRemaining = Math.min(
          this.state.exitTicksRemaining,
          this.effectiveExitDespawnTicks()
        );
      }
    }
  }

  /** Live tier of a strain at the current food count (0-3, FTUE-capped). */
  private strainTierNow(strain: StrainId): number {
    if (!this.genomeActive() || !this.activations) return 0;
    return Math.min(
      this.ftueTierCap(),
      strainTierAtFood(this.activations[strain], this.state.foodEaten + 0.5)
    );
  }

  /** Dynasty-specific voluntary hold profile; decision holds remain free. */
  private holdProfile(): {
    base: number;
    bonusAtLengths: readonly number[];
    bonusPerThreshold: number;
  } {
    if (this.ruleset.id === 'COSMIC') {
      return GAME_CONFIG.session.holds.cosmic;
    }
    return {
      base: GAME_CONFIG.session.holds.base,
      bonusAtLengths: GAME_CONFIG.session.holds.bonusAtLengths,
      bonusPerThreshold: 1,
    };
  }

  private createInitialState(): GameState {
    return {
      snake: [],
      food: { x: 0, y: 0, z: 0 },
      foods: [],
      terrain: [],
      direction: 'RIGHT',
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      exitTile: null,
      exitTile2: null,
      exitTicksRemaining: 0,
      foodTicksRemaining: 0,
      nextExitAtFood: this.exitCadence().firstExitAtFood,
      extracted: false,
      mutationTile: null,
      mutationTicksRemaining: 0,
      nextMutationAtFood: this.genomeV2Active()
        ? Number.MAX_SAFE_INTEGER
        : this.rollNextMutationInterval(),
      heldMutations: [],
      pendingChoice: null,
      genomeV2: this.genomeV2Runtime?.getState() ?? null,
      strainCounts: this.spawnStrainPoints(),
      strainTiers: {},
      fusedSplices: [],
      gildedCells: [],
      infuses: [],
      surges: [],
      choiceSource: null,
      pendingChoicePity: null,
      pendingPortalChoice: null,
      pendingSurgeChoice: false,
      revive: null,
      genomeClaims: {},
      lossEvents: [],
      pressureEvents: [],
      thickHideAvailable: false,
      warpSkinCharged: false,
      pocketRiftCharged: false,
      phantomTicksRemaining: 0,
      revivePhaseTicksRemaining: 0,
      phoenixAvailable: false,
      phoenixTriggeredAtFood: null,
      ironScalesAvailable: this.hasTrait('iron_scales'),
      constellationGlyph: null,
      constellationTicksRemaining: 0,
      constellationWindowTicks: 0,
      isPlaying: false,
      isGameOver: false,
      isPaused: false,
      holdsUsed: 0,
      // WP-3.12: the ladder's "Short Rope" rung takes one from the OPENING
      // budget, and it has to be applied HERE. `refreshHoldBudget` is
      // deliberately monotonic - it can only ever raise the budget, so that a
      // body which sheds past a threshold keeps what reaching it paid for - and
      // a monotonic function cannot lower the base. The rung belongs at state
      // creation or nowhere.
      holdBudget: ladderHoldBase(this.holdProfile().base, this.ladderRung),
      isDeathSequence: false,
      startTime: null,
      deathPosition: null,
    };
  }

  /**
   * Start or restart the game
   */
  start(): void {
    this.beginRun(null, true);
  }

  /**
   * Build the deterministic opening without starting the run clock. The board
   * may remain on Ready for any length of time; no simulation tick is legal
   * until the server accepts activation and `activatePrepared` is called.
   */
  prepare(): void {
    this.beginRun(null, false);
  }

  /** Begin time only after the prepared→active server acknowledgement. */
  activatePrepared(now = Date.now()): void {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence ||
      this.state.startTime !== null
    ) {
      throw new Error('Only a prepared opening can be activated');
    }
    this.state.startTime = now;
  }

  private beginRun(
    opening: DrivenStartState | null,
    startClock: boolean
  ): void {
    this.deathSequenceToken += 1;
    this.drivenRun = opening !== null;
    // A session seed describes the opening, not the incidental number of
    // pre-run setters React happened to call. Rewind at the single boundary
    // where simulation begins; opaque injected test RNGs retain their existing
    // behavior.
    this.replayableRng?.reset();
    const centerX = Math.floor(this.gridSize / 2);
    const centerZ = Math.floor(this.gridSize / 2);

    const snake: Position[] = [];
    for (let i = 0; i < this.initialLength; i++) {
      snake.push({ x: centerX - i, y: 0, z: centerZ });
    }

    if (this.genomeV2Active()) {
      const reducerDynasty = this.genome?.reducerState?.dynasty;
      if (reducerDynasty && reducerDynasty !== this.ruleset.id) {
        throw new Error(
          'Genome v2 reducer state is not bound to the stamped Dynasty.'
        );
      }
      this.genomeV2Runtime = this.createGenomeV2Runtime();
      this.genomeV2Runtime?.reset();
    } else {
      this.genomeV2Runtime = null;
    }

    this.state = this.createInitialState();
    if (this.genomeV2Runtime) this.syncGenomeV2State();
    this.state.snake = snake;
    this.state.isPlaying = true;
    this.state.startTime = startClock ? Date.now() : null;

    this.clearDirectionalIntent();
    this.lastSingularityPullAtFood = 0;
    this.runEvents = [];
    this.runEventsTruncated = false;
    this.deathCause = null;
    this.terminalResult = null;
    this.pendingDeathCause = null;
    this.nearWallSinceMs = null;
    this.replayTicks = 0;
    this.replayActions = [];
    this.applyingReplay = false;
    this.decisionHoldEntitled = false;
    // Genome derived state
    this.fusedView = { loose: [], splices: [] };
    this.activations = null;
    this.lengthTrace = { lengthAtEat: [0], shedEvents: [], petrifyEvents: [] };
    this.petrified = 0;
    this.ouroborosBites = 0;
    this.offerIndex = 0;
    this.portalIndex = 0;
    this.portalsMet = 0;
    this.offerTrace = [];
    this.recentOffers = [];
    this.ticksSinceAnyEat = 1_000_000;
    this.slidThisTick = false;
    this.warpSkinLastRecharge = 0;
    this.pocketRiftLastRecharge = 0;
    if (this.genomeActive()) {
      this.state.pocketRiftCharged = true;
      this.refreshGenomeDerived();
    }
    // Opening tick interval AFTER the genome derived state exists. This
    // used to be a raw `ruleset.speedForFood(0)` above, which silently
    // dropped any modifier already live at food 0 - a spawned VOLT Tempo
    // (heirloom points alone reach the minor tier) did nothing until the
    // first food re-derived the speed through this same helper.
    this.speed = this.effectiveSpeedForFood(0);
    this.refreshHoldBudget();
    if (!opening || !this.genomeV2Active()) this.spawnFoods();
    if (opening) {
      this.state.snake = opening.snake.map((cell) => ({ ...cell, y: 0 }));
      this.state.direction = opening.direction;
      this.placeFoods(opening.foods.map((cell) => ({ ...cell, y: 0 })));
    }
    this.emit('gameStart');
  }

  /**
   * Start the same engine from an authored board state.
   *
   * Training scenarios need repeatable recovery positions, but they must not
   * fork collision, buffering, dynasty, or movement logic. This method first
   * performs the canonical run reset and then replaces only the opening body,
   * heading, and food wave. Invalid geometry is rejected before any state is
   * changed.
   */
  startDriven(opening: DrivenStartState): void {
    if (opening.snake.length === 0 || opening.foods.length === 0) {
      throw new Error('Driven starts require a snake and at least one food');
    }

    const occupied = new Set<string>();
    for (let index = 0; index < opening.snake.length; index += 1) {
      const cell = opening.snake[index];
      if (!this.isInBounds(cell)) {
        throw new Error('Driven snake cells must be inside the board');
      }
      const key = `${cell.x}:${cell.z}`;
      if (occupied.has(key)) {
        throw new Error('Driven snake cells must be unique');
      }
      occupied.add(key);

      const previous = opening.snake[index - 1];
      if (
        previous &&
        Math.abs(previous.x - cell.x) + Math.abs(previous.z - cell.z) !== 1
      ) {
        throw new Error('Driven snake cells must form one contiguous body');
      }
    }

    if (opening.snake.length > 1) {
      const head = opening.snake[0];
      const neck = opening.snake[1];
      const delta =
        opening.direction === 'UP'
          ? { x: 0, z: -1 }
          : opening.direction === 'DOWN'
            ? { x: 0, z: 1 }
            : opening.direction === 'LEFT'
              ? { x: -1, z: 0 }
              : { x: 1, z: 0 };
      if (neck.x !== head.x - delta.x || neck.z !== head.z - delta.z) {
        throw new Error('Driven snake heading must point away from its neck');
      }
    }

    const foodCells = new Set<string>();
    for (const food of opening.foods) {
      if (!this.isInBounds(food)) {
        throw new Error('Driven food cells must be inside the board');
      }
      const key = `${food.x}:${food.z}`;
      if (occupied.has(key)) {
        throw new Error('Driven food cannot overlap the snake');
      }
      if (foodCells.has(key)) {
        throw new Error('Driven food cells must be unique');
      }
      foodCells.add(key);
    }

    this.beginRun(opening, true);
  }

  /**
   * Swap the active dynasty ruleset. Needed because the page constructs
   * the engine on mount, before the equipped snake's dynasty arrives from
   * the collection API. Takes effect immediately: speed follows the new
   * ruleset's curve at the current food count, and (outside a live run)
   * the first-exit threshold and the constellation state follow the new
   * ruleset.
   */
  setRuleset(ruleset: DynastyRuleset): void {
    this.ruleset = ruleset;
    if (!this.state.isPlaying && this.genomeV2Active()) {
      this.genomeV2Runtime = this.createGenomeV2Runtime();
      this.syncGenomeV2State();
    }
    this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    if (!this.state.isPlaying && !this.state.exitTile) {
      this.state.nextExitAtFood = this.exitCadence().firstExitAtFood;
      this.state.constellationGlyph = null;
      this.state.constellationTicksRemaining = 0;
      this.state.constellationWindowTicks = 0;
    }
  }

  /** The active dynasty ruleset. */
  getRuleset(): DynastyRuleset {
    return this.ruleset;
  }

  /**
   * Swap the equipped snake's traits. Mirrors setRuleset: the page
   * constructs the engine on mount, before the session-start response
   * delivers the server-trusted trait list. Outside a live run the
   * trait-dependent cadence roll (Patient) and the Iron Scales charge are
   * refreshed so the next start() plays under the new traits.
   */
  setTraits(traits: TraitId[]): void {
    this.traits = [...traits];
    if (!this.state.isPlaying) {
      if (!this.state.mutationTile) {
        this.state.nextMutationAtFood = this.genomeV2Active()
          ? Number.MAX_SAFE_INTEGER
          : this.rollNextMutationInterval();
      }
      this.state.ironScalesAvailable = this.hasTrait('iron_scales');
      if (this.genomeV2Active()) {
        this.genomeV2Runtime = this.createGenomeV2Runtime();
        this.syncGenomeV2State();
      }
    }
  }

  /** The equipped snake's traits (immutable copy). */
  getTraits(): TraitId[] {
    return [...this.traits];
  }

  /**
   * Swap the unlocked mutation offer pool (Design v2 section 7.1).
   * Mirrors setTraits: the page constructs the engine on mount, before
   * the session-start response delivers the server-computed pool. Offers
   * already pending are untouched; the next offer draws from the new
   * pool. An empty/invalid pool falls back to the base ten.
   */
  setMutationPool(pool: MutationId[]): void {
    this.mutationPool = pool.length > 0 ? [...pool] : [...MUTATION_POOL];
  }

  /** The active mutation offer pool (immutable copy). */
  getMutationPool(): MutationId[] {
    return [...this.mutationPool];
  }

  /**
   * Swap the weekly anomaly modifier (Design v2 Phase 4B). Mirrors
   * setTraits: the page constructs the engine on mount, before the
   * session-start response confirms the anomaly run. Refused mid-run -
   * an anomaly is a property of the whole run, never of its second half.
   */
  setAnomaly(anomaly: AnomalyId | null): void {
    if (this.state.isPlaying) return;
    this.anomaly = anomaly;
  }

  /** The active anomaly modifier, or null outside anomaly runs. */
  getAnomaly(): AnomalyId | null {
    return this.anomaly;
  }

  /**
   * Get current game state (immutable copy)
   */
  getState(): GameState {
    return {
      ...this.state,
      snake: this.state.snake.map((s) => ({ ...s })),
      food: { ...this.state.food },
      foods: this.state.foods.map((f) => ({ ...f })),
      // Cloned per tick, deliberately: the renderer reads this through zustand,
      // and a stable array reference would never re-render — terrain would be
      // computed, lethal, and still invisible, which is the bug WP-3.05 found.
      terrain: this.state.terrain.map((b) => ({ ...b })),
      exitTile: this.state.exitTile ? { ...this.state.exitTile } : null,
      exitTile2: this.state.exitTile2 ? { ...this.state.exitTile2 } : null,
      mutationTile: this.state.mutationTile
        ? { ...this.state.mutationTile }
        : null,
      heldMutations: this.state.heldMutations.map((m) => ({ ...m })),
      pendingChoice: this.state.pendingChoice
        ? [...this.state.pendingChoice]
        : null,
      genomeV2: this.state.genomeV2
        ? checkpointClone(this.state.genomeV2)
        : null,
      strainCounts: { ...this.state.strainCounts },
      strainTiers: { ...this.state.strainTiers },
      fusedSplices: this.state.fusedSplices.map((s) => ({ ...s })),
      gildedCells: this.state.gildedCells.map((c) => ({ ...c })),
      infuses: this.state.infuses.map((i) => ({ ...i })),
      surges: this.state.surges.map((s) => ({ ...s })),
      pendingPortalChoice: this.state.pendingPortalChoice
        ? checkpointClone(this.state.pendingPortalChoice)
        : null,
      revive: this.state.revive ? { ...this.state.revive } : null,
      genomeClaims: { ...this.state.genomeClaims },
      lossEvents: this.state.lossEvents.map((e) => ({ ...e })),
      pressureEvents: this.state.pressureEvents.map((e) => ({ ...e })),
    };
  }

  /** Export a complete checkpoint proposal at a safe, non-terminal boundary. */
  exportCheckpoint(now = Date.now()): SnakeCheckpointV1 {
    if (!this.replayableRng) {
      throw new Error('This run has no replayable simulation seed');
    }
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence
    ) {
      throw new Error('Only a live resolved run can be checkpointed');
    }
    const startedAt = this.state.startTime ?? now;
    return {
      version: SNAKE_CHECKPOINT_VERSION,
      engineVersion: 'snake-engine-v1',
      rulesVersion: SNAKE_RULES_VERSION,
      rng: this.replayableRng.snapshot(),
      config: {
        gridSize: this.gridSize,
        initialLength: this.initialLength,
        ruleset: this.ruleset.id as DynastyName,
        traits: [...this.traits],
        mutationPool: [...this.mutationPool],
        anomaly: this.anomaly,
        genome: this.genome ? checkpointClone(this.genome) : null,
        growthProfileId: this.growth.id,
        ladderRung: this.ladderRung,
      },
      state: checkpointClone(this.getState()),
      privateState: {
        speed: this.speed,
        portalIndex: this.portalIndex,
        portalsMet: this.portalsMet,
        fusedView: checkpointClone(this.fusedView),
        activations: this.activations
          ? checkpointClone(this.activations)
          : null,
        lengthTrace: checkpointClone(this.lengthTrace),
        petrified: this.petrified,
        ouroborosBites: this.ouroborosBites,
        drivenRun: this.drivenRun,
        offerIndex: this.offerIndex,
        offerTrace: checkpointClone(this.offerTrace),
        recentOffers: checkpointClone(this.recentOffers),
        ticksSinceAnyEat: this.ticksSinceAnyEat,
        slidThisTick: this.slidThisTick,
        warpSkinLastRecharge: this.warpSkinLastRecharge,
        pocketRiftLastRecharge: this.pocketRiftLastRecharge,
        lastSingularityPullAtFood: this.lastSingularityPullAtFood,
        decisionHoldEntitled: this.decisionHoldEntitled,
        runEvents: checkpointClone(this.runEvents),
        runEventsTruncated: this.runEventsTruncated,
        elapsedMs: Math.max(0, Math.floor(now - startedAt)),
        replay: {
          ticks: this.replayTicks,
          actions: checkpointClone(this.replayActions),
        },
        genomeV2Runtime: this.genomeV2Runtime
          ? this.genomeV2Runtime.snapshot()
          : null,
      },
    };
  }

  /**
   * Restore a server-verified checkpoint and hold it for deliberate input.
   * Raw input queues are intentionally discarded; physics/progression state
   * resumes exactly, but an old flick can never fire after reopening.
   */
  restoreCheckpoint(
    checkpoint: SnakeCheckpointV1,
    now = Date.now(),
    options: { replacePreparedOpening?: boolean } = {}
  ): void {
    const canReplacePreparedOpening =
      options.replacePreparedOpening === true &&
      this.state.isPlaying &&
      !this.state.isGameOver &&
      !this.state.isDeathSequence &&
      this.state.foodEaten === 0 &&
      this.state.score === 0 &&
      this.state.dnaCollected === 0;
    if (this.state.isPlaying && !canReplacePreparedOpening) {
      throw new Error('Cannot restore over a live engine');
    }
    if (
      checkpoint?.version !== SNAKE_CHECKPOINT_VERSION ||
      checkpoint.engineVersion !== 'snake-engine-v1' ||
      checkpoint.rulesVersion !== SNAKE_RULES_VERSION ||
      !checkpoint.config ||
      !checkpoint.state ||
      !checkpoint.privateState ||
      !Object.prototype.hasOwnProperty.call(RULESETS, checkpoint.config.ruleset)
    ) {
      throw new Error('Unsupported or malformed snake checkpoint');
    }
    const gridSize = checkpointInteger(
      checkpoint.config.gridSize,
      'gridSize',
      4
    );
    const initialLength = checkpointInteger(
      checkpoint.config.initialLength,
      'initialLength',
      1
    );
    if (
      !Array.isArray(checkpoint.state.snake) ||
      checkpoint.state.snake.length === 0 ||
      checkpoint.state.isGameOver ||
      !checkpoint.state.isPlaying
    ) {
      throw new Error('Checkpoint is not a live run');
    }

    this.gridSize = gridSize;
    this.initialLength = initialLength;
    this.ruleset = RULESETS[checkpoint.config.ruleset];
    this.traits = [...checkpoint.config.traits];
    this.mutationPool = [...checkpoint.config.mutationPool];
    this.anomaly = checkpoint.config.anomaly;
    this.genome = checkpoint.config.genome
      ? checkpointClone(checkpoint.config.genome)
      : null;
    this.growth = resolveGrowthProfile(checkpoint.config.growthProfileId);
    this.ladderRung = resolveLadderRung(checkpoint.config.ladderRung);
    this.replayableRng = StatefulRng.restore(checkpoint.rng);
    this.rng = () => this.replayableRng!.next();

    const genomeV2Snapshot = checkpoint.privateState.genomeV2Runtime;
    if (this.genomeV2Active()) {
      if (!genomeV2Snapshot || !checkpoint.state.genomeV2) {
        throw new Error('Genome v2 checkpoint is missing its reducer runtime.');
      }
      this.genomeV2Runtime = this.createGenomeV2Runtime(
        genomeV2Snapshot,
        checkpoint.state.genomeV2
      );
    } else {
      this.genomeV2Runtime = null;
    }

    this.state = checkpointClone(checkpoint.state);
    if (this.genomeV2Runtime) {
      const restoredReducer = this.genomeV2Runtime.getState();
      if (
        JSON.stringify(this.state.genomeV2) !== JSON.stringify(restoredReducer)
      ) {
        throw new Error('Genome v2 checkpoint reducer state is inconsistent.');
      }
      if (this.state.foodEaten !== restoredReducer.foodCount) {
        throw new Error(
          'Genome v2 checkpoint food count differs from its reducer.'
        );
      }
      if (
        this.state.dnaCollected !==
        genomeV2YieldFloor(restoredReducer.ledger.bankableYield)
      ) {
        throw new Error(
          'Genome v2 checkpoint Yield differs from its bankable ledger.'
        );
      }
      this.state.genomeV2 = restoredReducer;
    } else {
      if (this.state.genomeV2) {
        throw new Error('Legacy checkpoint carries Genome v2 reducer state.');
      }
      this.state.genomeV2 = null;
    }
    this.state.isGameOver = false;
    this.state.isDeathSequence = false;
    this.state.deathPosition = null;
    const elapsedMs = checkpointInteger(
      checkpoint.privateState.elapsedMs,
      'elapsedMs'
    );
    this.state.startTime = now - elapsedMs;

    this.speed = checkpoint.privateState.speed;
    this.portalIndex = checkpointInteger(
      checkpoint.privateState.portalIndex,
      'portalIndex'
    );
    this.portalsMet = checkpointInteger(
      checkpoint.privateState.portalsMet,
      'portalsMet'
    );
    this.fusedView = checkpointClone(checkpoint.privateState.fusedView);
    this.activations = checkpoint.privateState.activations
      ? checkpointClone(checkpoint.privateState.activations)
      : null;
    this.lengthTrace = checkpointClone(checkpoint.privateState.lengthTrace);
    this.petrified = checkpointInteger(
      checkpoint.privateState.petrified,
      'petrified'
    );
    this.ouroborosBites = checkpointInteger(
      checkpoint.privateState.ouroborosBites,
      'ouroborosBites'
    );
    this.drivenRun = checkpoint.privateState.drivenRun === true;
    this.offerIndex = checkpointInteger(
      checkpoint.privateState.offerIndex,
      'offerIndex'
    );
    this.offerTrace = checkpointClone(checkpoint.privateState.offerTrace);
    this.recentOffers = checkpointClone(checkpoint.privateState.recentOffers);
    this.ticksSinceAnyEat = checkpointInteger(
      checkpoint.privateState.ticksSinceAnyEat,
      'ticksSinceAnyEat'
    );
    this.slidThisTick = checkpoint.privateState.slidThisTick === true;
    this.warpSkinLastRecharge = checkpointInteger(
      checkpoint.privateState.warpSkinLastRecharge,
      'warpSkinLastRecharge'
    );
    this.pocketRiftLastRecharge = checkpointInteger(
      checkpoint.privateState.pocketRiftLastRecharge,
      'pocketRiftLastRecharge'
    );
    this.lastSingularityPullAtFood = checkpointInteger(
      checkpoint.privateState.lastSingularityPullAtFood,
      'lastSingularityPullAtFood'
    );
    this.decisionHoldEntitled =
      checkpoint.privateState.decisionHoldEntitled === true;
    this.runEvents = checkpointClone(checkpoint.privateState.runEvents);
    this.runEventsTruncated =
      checkpoint.privateState.runEventsTruncated === true;
    this.replayTicks = checkpointInteger(
      checkpoint.privateState.replay?.ticks,
      'replay ticks'
    );
    if (!Array.isArray(checkpoint.privateState.replay?.actions)) {
      throw new Error('Invalid checkpoint replay actions');
    }
    this.replayActions = checkpointClone(
      checkpoint.privateState.replay.actions
    );
    this.applyingReplay = false;

    this.blockedScratch = null;
    this.spacedScratch = null;
    this.clearDirectionalIntent();
    this.deathCause = null;
    this.terminalResult = null;
    this.pendingDeathCause = null;
    this.nearWallSinceMs = null;
  }

  /** Immutable evidence view used by checkpoint and terminal requests. */
  getReplayTrace(): SnakeReplayTrace {
    return {
      ticks: this.replayTicks,
      actions: checkpointClone(this.replayActions),
    };
  }

  getTerminalResult(): GameOverData | null {
    return this.terminalResult ? checkpointClone(this.terminalResult) : null;
  }

  /**
   * Replay the suffix of a full trace from the currently restored canonical
   * checkpoint. This is deliberately public only as a deterministic engine
   * primitive; the server validates prefix/revision/bounds before calling it.
   */
  applyReplayTrace(trace: SnakeReplayTrace, fromActionIndex: number): void {
    if (
      !Number.isSafeInteger(trace?.ticks) ||
      trace.ticks < this.replayTicks ||
      !Array.isArray(trace?.actions) ||
      !Number.isSafeInteger(fromActionIndex) ||
      fromActionIndex < 0 ||
      fromActionIndex > trace.actions.length
    ) {
      throw new Error('Invalid replay trace bounds');
    }
    this.applyingReplay = true;
    try {
      for (
        let index = fromActionIndex;
        index < trace.actions.length;
        index += 1
      ) {
        const action = trace.actions[index];
        if (
          !action ||
          !Number.isSafeInteger(action.tick) ||
          action.tick < this.replayTicks ||
          action.tick > trace.ticks
        ) {
          throw new Error('Invalid replay action position');
        }
        while (this.replayTicks < action.tick) {
          if (this.state.isGameOver)
            throw new Error('Replay continues after terminal state');
          this.tick();
        }
        this.applyReplayAction(action);
      }
      while (this.replayTicks < trace.ticks) {
        if (this.state.isGameOver)
          throw new Error('Replay continues after terminal state');
        this.tick();
      }
      if (this.replayTicks !== trace.ticks) {
        throw new Error('Replay did not reach its target tick');
      }
      this.replayActions = checkpointClone(trace.actions);
    } finally {
      this.applyingReplay = false;
    }
  }

  private applyReplayAction(action: SnakeReplayAction): void {
    switch (action.kind) {
      case 'turn': {
        const result = this.setDirection(action.direction, 'standard');
        if (result !== 'accepted')
          throw new Error('Replay contains an illegal turn');
        return;
      }
      case 'pause':
        if (!this.pause(action.hold))
          throw new Error('Replay contains an illegal hold');
        return;
      case 'resume':
        if (!this.state.isPaused)
          throw new Error('Replay resumes a running board');
        this.resume();
        return;
      case 'mutation':
        if (action.choice === 'decline') {
          if (!this.state.pendingChoice)
            throw new Error('Replay declines no offer');
          this.declineMutation();
        } else if (!this.chooseMutation(action.choice)) {
          throw new Error('Replay chooses no offer');
        }
        return;
      case 'portal':
        if (!this.resolvePortalChoice(action.choice)) {
          throw new Error('Replay resolves no portal');
        }
        return;
      case 'surge':
        if (!this.chooseSurge(action.strain)) {
          throw new Error('Replay resolves no surge');
        }
        return;
      case 'genome_v2_offer':
        if (
          !this.resolveGenomeV2Offer(
            action.choice === 'decline'
              ? {
                  action: 'decline',
                  offerId: action.offerId,
                  ...(action.pinCandidate !== undefined
                    ? { pinCandidateIndex: action.pinCandidate }
                    : {}),
                }
              : {
                  action: 'choose',
                  offerId: action.offerId,
                  candidateIndex: action.choice,
                  ...(action.slot !== undefined
                    ? { replacementSlot: action.slot }
                    : {}),
                }
          )
        ) {
          throw new Error('Replay resolves no Genome v2 offer');
        }
        return;
      case 'genome_v2_portal': {
        if (action.choice === 'infuse' || action.choice === 'recode') {
          const occupant =
            action.slot === undefined
              ? undefined
              : this.genomeV2Runtime?.getState().slots[action.slot]?.occupant;
          const expectedChoice = occupant === null ? 'infuse' : 'recode';
          if (occupant === undefined || action.choice !== expectedChoice) {
            throw new Error(
              'Replay Genome v2 portal verb disagrees with its locus.'
            );
          }
        }
        const resolution: GenomeV2PortalResolution =
          action.choice === 'bank'
            ? { action: 'bank', portalId: action.portalId }
            : action.choice === 'continue'
              ? {
                  action: 'continue',
                  portalId: action.portalId,
                  activateMirror: action.activateMirror === true,
                }
              : {
                  action: 'mutate',
                  portalId: action.portalId,
                  candidateIndex: action.candidate ?? 0,
                  ...(action.slot !== undefined
                    ? { replacementSlot: action.slot }
                    : {}),
                };
        if (!this.resolveGenomeV2Portal(resolution)) {
          throw new Error('Replay resolves no Genome v2 portal');
        }
        return;
      }
      case 'genome_v2_target':
        if (!this.resolveGenomeV2TargetChoice(action.targetId, action.choice)) {
          throw new Error('Replay resolves no Genome v2 target choice');
        }
        return;
      case 'genome_v2_overclock':
        if (
          !this.activateGenomeV2Overclock({
            source: action.source,
            activationId: action.activationId,
          })
        ) {
          throw new Error('Replay activates no Genome v2 overclock');
        }
        return;
      default:
        throw new Error('Replay contains an unknown action');
    }
  }

  private recordReplayAction(action: SnakeReplayAction): void {
    if (!this.applyingReplay) this.replayActions.push(checkpointClone(action));
  }

  /**
   * Get current speed (ms per tick)
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Queue a direction change. Keyboard inputs retain the shipped three-turn
   * queue; flick input permits two unresolved turns. Two is enough for an
   * L-turn, while a third direction emitted by the same fast gesture is the
   * accidental U-turn that made tight mobile coils feel unfair. Queued turns
   * apply one per tick, so rapid sequences like UP+LEFT within a single
   * tick execute as an S-turn instead of dropping the first press.
   *
   * Validation is against the direction the snake will be moving when this
   * input takes effect (the last queued direction, falling back to the
   * current heading): 180-degree reversals are rejected there, and exact
   * duplicates are skipped so the buffer never wastes a slot.
   *
   * Returns why the input was accepted or dropped (see SetDirectionResult).
   * The return value is informational only - behavior is identical for
   * callers that ignore it.
   */
  setDirection(
    dir: Direction,
    source: DirectionInputSource = 'standard',
    timing?: DirectionInputTiming
  ): SetDirectionResult {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isPaused ||
      this.state.pendingChoice !== null ||
      this.genomeV2OfferPending() ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return 'inactive';
    }

    return this.enqueueDirection(dir, source, timing);
  }

  /**
   * Validate and queue a direction without consulting the pause flag.
   * Kept separate so a post-pause safety gate can accept the player's first
   * steering command before releasing the engine.
   */
  private enqueueDirection(
    dir: Direction,
    source: DirectionInputSource,
    timing?: DirectionInputTiming
  ): SetDirectionResult {
    const reference =
      this.preTurnIntent?.direction ??
      this.directionQueue[this.directionQueue.length - 1]?.direction ??
      this.state.direction;

    if (dir === reference) return 'duplicate';
    if (dir === OPPOSITES[reference]) return 'reversal';
    const capacity =
      source === 'flick'
        ? GAME_CONFIG.controls.flickQueueDepth
        : GAME_CONFIG.controls.standardQueueDepth;
    const queueIsFull = this.directionQueue.length >= capacity;
    if (
      this.preTurnIntent ||
      (queueIsFull && !this.isInsidePreTurnGrace(timing))
    ) {
      return 'queue_full';
    }

    const input: QueuedDirection = { direction: dir, source, timing };
    if (source === 'flick' && this.isImmediateMobileMicroU(reference, input)) {
      // End the physical phrase here. A later deliberate flick starts from a
      // clean history instead of inheriting the rejected accidental corner.
      this.recentFlickTurns = [];
      return 'micro_u';
    }

    if (queueIsFull) {
      // Not executable yet: reserve exactly the slot this imminent tick will
      // free. The actual queue remains at its two/three-turn hard cap.
      this.preTurnIntent = input;
    } else {
      this.directionQueue.push(input);
    }
    this.rememberAcceptedTurn(reference, input);
    return 'accepted';
  }

  private isInsidePreTurnGrace(timing?: DirectionInputTiming): boolean {
    const nextTickInMs = timing?.nextTickInMs;
    if (!Number.isFinite(nextTickInMs) || (nextTickInMs as number) < 0) {
      return false;
    }
    const baseline = Math.min(
      GAME_CONFIG.controls.preTurnGrace.maxMs,
      this.speed * GAME_CONFIG.controls.preTurnGrace.tickFraction
    );
    // Slipstream finally receives its catalogued full-tick version; the
    // universal control inherits only the deliberately smaller baseline.
    const windowMs = this.hasGene('slipstream') ? this.speed : baseline;
    return (nextTickInMs as number) <= windowMs;
  }

  /**
   * Suppress only a rapid three-corner spiral that would enter the new neck.
   * Timing establishes one physical phrase; turn handedness establishes the
   * micro-U; predicted body geometry establishes that it is self-destructive.
   * Missing any one condition means normal demanding steering wins.
   */
  private isImmediateMobileMicroU(
    reference: Direction,
    candidate: QueuedDirection
  ): boolean {
    const inputTimeMs = candidate.timing?.inputTimeMs;
    if (!Number.isFinite(inputTimeMs) || this.recentFlickTurns.length < 2) {
      return false;
    }

    const [first, second] = this.recentFlickTurns.slice(-2);
    if (first.to !== second.from || second.to !== reference) return false;

    const firstHand = CLOCKWISE[first.from] === first.to ? 1 : -1;
    const secondHand = CLOCKWISE[second.from] === second.to ? 1 : -1;
    const candidateHand = CLOCKWISE[reference] === candidate.direction ? 1 : -1;
    if (firstHand !== secondHand || secondHand !== candidateHand) return false;

    const elapsed = (inputTimeMs as number) - first.inputTimeMs;
    if (elapsed < 0) return false;
    const gestureId = candidate.timing?.gestureId;
    const sameGesture =
      gestureId !== undefined &&
      first.gestureId === gestureId &&
      second.gestureId === gestureId;
    const windowMs = sameGesture
      ? GAME_CONFIG.controls.mobileMicroU.sameGestureWindowMs
      : GAME_CONFIG.controls.mobileMicroU.rapidWindowMs;
    if (elapsed > windowMs) return false;

    return this.predictedTurnHitsRecentNeck(candidate.direction);
  }

  private predictedTurnHitsRecentNeck(candidate: Direction): boolean {
    if (
      this.state.revivePhaseTicksRemaining > 0 ||
      (this.genomeActive() &&
        this.state.phantomTicksRemaining > 0 &&
        this.strainTierNow('UMBRA') >= 2)
    ) {
      return false;
    }

    const body = this.state.snake.map((segment) => ({ ...segment }));
    if (body.length < 2) return false;

    const advancePreview = (direction: Direction): boolean => {
      let next = this.getNextPosition(body[0], direction);
      if (!this.isInBounds(next)) {
        if (!this.ruleset.torus) return false;
        next = this.wrapPosition(next);
      }
      body.unshift(next);
      body.pop();
      return true;
    };

    for (const queued of this.directionQueue) {
      if (!advancePreview(queued.direction)) return false;
    }

    let next = this.getNextPosition(body[0], candidate);
    if (!this.isInBounds(next)) {
      if (!this.ruleset.torus) return false;
      next = this.wrapPosition(next);
    }
    const recentDepth = Math.min(
      GAME_CONFIG.controls.mobileMicroU.recentBodySegments,
      body.length - 1
    );
    for (let index = 1; index <= recentDepth; index += 1) {
      const segment = body[index];
      if (segment.x === next.x && segment.z === next.z) return true;
    }
    return false;
  }

  private rememberAcceptedTurn(from: Direction, input: QueuedDirection): void {
    if (
      input.source !== 'flick' ||
      !Number.isFinite(input.timing?.inputTimeMs)
    ) {
      this.recentFlickTurns = [];
      return;
    }
    this.recentFlickTurns.push({
      from,
      to: input.direction,
      inputTimeMs: input.timing!.inputTimeMs as number,
      ...(input.timing?.gestureId !== undefined
        ? { gestureId: input.timing.gestureId }
        : {}),
    });
    if (this.recentFlickTurns.length > 2) {
      this.recentFlickTurns.splice(0, this.recentFlickTurns.length - 2);
    }
  }

  private promotePreTurnIntent(): void {
    const intent = this.preTurnIntent;
    if (!intent) return;
    const capacity =
      intent.source === 'flick'
        ? GAME_CONFIG.controls.flickQueueDepth
        : GAME_CONFIG.controls.standardQueueDepth;
    if (this.directionQueue.length >= capacity) return;
    this.directionQueue.push(intent);
    this.preTurnIntent = null;
  }

  private clearDirectionalIntent(): void {
    this.directionQueue = [];
    this.preTurnIntent = null;
    this.recentFlickTurns = [];
  }

  /**
   * Atomically release a paused board with a deliberate direction.
   *
   * A legal turn is queued before resume, an exact duplicate deliberately
   * resumes the current heading, and unsafe/rejected commands leave the
   * engine paused. If a rapid follow-up arrives after the first command has
   * already released the board, it falls through to normal input buffering.
   */
  resumeWithDirection(
    dir: Direction,
    source: DirectionInputSource = 'standard',
    timing?: DirectionInputTiming
  ): SetDirectionResult {
    if (!this.state.isPaused) {
      return this.setDirection(dir, source, timing);
    }
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null ||
      this.genomeV2OfferPending() ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return 'inactive';
    }

    const result = this.enqueueDirection(dir, source, timing);
    if (result === 'accepted' || result === 'duplicate') {
      this.resume();
    }
    return result;
  }

  /**
   * Get the currently buffered direction inputs (immutable copy), in the
   * order they will be consumed (one per tick). Read-only view for the
   * renderer's aim telegraph - queued turns are drawn before they execute.
   */
  getQueuedDirections(): Direction[] {
    return this.directionQueue.map((input) => input.direction);
  }

  /**
   * Pause the game. No-op during the mutation choice hold - the choice
   * overlay owns the freeze, and allowing pause underneath would let the
   * pause menu fight the choice UI. Buffered turns are cleared so resuming
   * can never execute an old command before the player's newly planned move.
   *
   * A `'tactical'` hold - the player deliberately stopping the board to
   * think - spends one of the run's holds and is REFUSED once the budget is
   * gone; that refusal is the bound that replaced `session.maxDuration`.
   *
   * A `'decision'` hold is free exactly once after the engine resolves one of
   * its own choices. It is how the page re-arms the
   * resume gate after a gene, portal or surge decision resolves: the run's
   * own decisions are protected by Inviolable Rule 1 and must never cost
   * the player a resource. The engine grants and consumes the entitlement;
   * a caller cannot manufacture one by naming the hold kind.
   *
   * Driven runs (Training) are never metered: a tutorial that runs out of
   * holds teaches nothing, and no Training pause reaches a leaderboard.
   *
   * Returns whether the board is now held, so a caller can keep its resume
   * UI in step with an outcome it does not control.
   */
  pause(kind: HoldKind = 'tactical'): boolean {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null ||
      this.genomeV2OfferPending() ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return false;
    }
    if (kind === 'decision') {
      if (!this.decisionHoldEntitled) return false;
      this.decisionHoldEntitled = false;
    } else {
      this.decisionHoldEntitled = false;
      if (!this.drivenRun) {
        this.refreshHoldBudget();
        if (this.state.holdsUsed >= this.state.holdBudget) return false;
        this.state.holdsUsed += 1;
      }
    }
    this.clearDirectionalIntent();
    this.state.isPaused = true;
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'pause',
      hold: kind,
    });
    this.emit('pause');
    return true;
  }

  /**
   * Grow the hold budget as the body reaches the lengths that make it hard
   * to steer. Earned holds are never taken back, which keeps the budget from
   * ever dropping below what the player has already spent.
   *
   * Reads the MODELLED length (WP-3.11): Fortress moves segments out of the
   * live array, and a hold threshold is a claim about how hard the run is to
   * steer - which petrified stone makes harder, not easier.
   */
  private refreshHoldBudget(): void {
    // WP-3.12: the ladder's "Short Rope" rung takes one from the OPENING
    // budget, never from what a body has already earned - the `Math.max` below
    // is what makes that true, and it is the same guarantee the paragraph above
    // states for earned holds. `ladderHoldBase` floors at 1: a run with no hold
    // at all is a different game, not a harder one.
    const profile = this.holdProfile();
    let budget: number = ladderHoldBase(profile.base, this.ladderRung);
    for (const threshold of profile.bonusAtLengths) {
      if (this.modelledLength() >= threshold) {
        budget += profile.bonusPerThreshold;
      }
    }
    this.state.holdBudget = Math.max(this.state.holdBudget, budget);
  }

  /**
   * Resume the game
   */
  resume(): void {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
    this.recordReplayAction({ tick: this.replayTicks, kind: 'resume' });
    this.emit('resume');
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    if (this.state.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  /**
   * Check if game is paused
   */
  get isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Game tick - advance one step
   */
  tick(): void {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.startTime === null ||
      this.state.isPaused ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null ||
      this.genomeV2OfferPending() ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return;
    }

    // A decision re-arm belongs only to the exact resolution boundary. Once
    // movement advances, it cannot be claimed later as a free tactical hold.
    this.decisionHoldEntitled = false;

    if (this.genomeV2Runtime?.endExpiredOverclock(this.replayTicks)) {
      this.syncGenomeV2State();
      this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    }

    // Consume exactly one buffered input per tick
    const queued = this.directionQueue.shift();
    if (queued) {
      this.state.direction = queued.direction;
      this.recordReplayAction({
        tick: this.replayTicks,
        kind: 'turn',
        direction: queued.direction,
      });
    }
    // Count the attempted movement boundary before resolving its physics so a
    // terminal collision belongs to this trace and can be replayed exactly.
    this.replayTicks += 1;
    // The movement boundary just freed one real queue slot. Promote the
    // fractional-tick intention now; it can execute no earlier than the next
    // tick, exactly as if the player had entered it just after this boundary.
    this.promotePreTurnIntent();
    this.slidThisTick = false;
    // Terrain advances BEFORE the move resolves, so a block that solidifies
    // this tick is lethal on this tick - the player saw it forming and had
    // the whole forming window to leave.
    this.tickTerrain();
    if (this.genomeV2Runtime) {
      this.genomeV2Runtime.expireGoldWindows(this.replayTicks);
      this.syncGenomeV2State();
    }

    const head = this.state.snake[0];
    let newHead = this.getNextPosition(head, this.state.direction);
    let wallHit = this.checkWallCollision(newHead);
    let pendingPhaseGate: {
      targetId: string;
      cells: readonly [{ x: number; z: number }, { x: number; z: number }];
    } | null = null;

    // Every revive grants a short escape phase instead of returning free
    // space. During it the board boundary behaves like a wrap and the body is
    // non-lethal; permanent terrain is deliberately still solid. That keeps
    // Rule 15 intact and prevents a revive from becoming an obstacle eraser.
    if (wallHit && this.state.revivePhaseTicksRemaining > 0) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
    }

    // COSMIC: the board IS a torus (WP-3.13). No phase, no charge, no
    // telegraph - the edge wraps every tick of every run. This is one
    // deleted condition rather than new geometry, and that is the point:
    // the rule the owner could not learn was the toggling, not the wrap.
    if (wallHit && this.ruleset.torus) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
    }

    // FLUX Expression "Rift Aura": all four walls wrap permanently.
    if (wallHit && this.strainTierNow('FLUX') >= 2) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
    }

    // Pocket Rift (gene): a charged wall hit teleports to the opposite
    // wall (a wrap), recharging every 20 foods.
    if (
      wallHit &&
      this.hasMutation('pocket_rift') &&
      this.state.pocketRiftCharged
    ) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
      this.state.pocketRiftCharged = false;
      this.pocketRiftLastRecharge = this.state.foodEaten;
      this.emit('pocketRiftTriggered', { position: { ...newHead } });
    }

    // FLUX Minor "Warp Skin": one free edge-wrap per 30 foods.
    if (
      wallHit &&
      this.strainTierNow('FLUX') >= 1 &&
      this.state.warpSkinCharged
    ) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
      this.state.warpSkinCharged = false;
      this.warpSkinLastRecharge = this.state.foodEaten;
      this.emit('warpSkinTriggered', { position: { ...newHead } });
    }

    // Wall Rush: a wall hit becomes a slide along the wall (clockwise
    // perpendicular preferred, counter-clockwise fallback). A corner or a
    // body-blocked slide still kills - Wall Rush is not a corner pardon.
    const legacyWallRush = this.hasMutation('wall_rush');
    const genomeV2WallRush = this.genomeV2Runtime?.canWallRedirect() === true;
    if (wallHit && (legacyWallRush || genomeV2WallRush)) {
      const slide = this.trySlide(head);
      if (slide) {
        this.state.direction = slide.dir;
        newHead = slide.pos;
        wallHit = false;
        this.slidThisTick = true;
        if (genomeV2WallRush) {
          if (!this.genomeV2Runtime?.recordWallRedirect(this.replayTicks)) {
            throw new Error(
              'Genome v2 Wall Rush reducer rejected a charged live redirect.'
            );
          }
          this.syncGenomeV2State();
        }
      }
    }

    // Phase Gate/Riftline is optional because the player must steer onto the
    // visible entry. Re-check the exit against the live board before using it;
    // geometry that became unsafe since spawn behaves like an ordinary cell.
    if (!wallHit) {
      const gate = this.genomeV2Runtime?.phaseGateAtEntry(newHead);
      const exit = gate?.cells[1];
      if (
        gate &&
        exit &&
        !this.checkWallCollision({ ...exit, y: 0 }) &&
        !this.checkSelfCollision({ ...exit, y: 0 }) &&
        !this.isPositionOnTerrain({ ...exit, y: 0 })
      ) {
        pendingPhaseGate = gate;
        newHead = { ...exit, y: 0 };
      }
    }

    // TERRAIN (WP-3.03): a solid block is lethal to the HEAD. Deliberately
    // after wall-only pardons: Rift Aura, Warp Skin, Pocket Rift and Wall Rush
    // do not apply because a locked cell is not the board edge. Iron Scales is
    // handled below as the broader one-use BOARD-collision pardon.
    const terrainHit =
      !wallHit &&
      (this.state.terrain.some(
        (b) => b.solid && b.x === newHead.x && b.z === newHead.z
      ) ||
        this.isGenomeV2PermanentTerrain(newHead));

    const exitExistedAtTickStart = this.state.exitTile !== null;
    const mutationExistedAtTickStart = this.state.mutationTile !== null;

    // Exit-portal collision checks first: the portal is always in-bounds
    // and never on the snake. Legacy: stepping onto it banks immediately.
    // Genome: stepping onto it opens the BANK / INFUSE choice hold when
    // infusing is possible (PASS = never step in) - the trichotomy.
    // Twin Exits (anomaly): either of the pair triggers the decision.
    if (
      !wallHit &&
      ((this.state.exitTile &&
        newHead.x === this.state.exitTile.x &&
        newHead.z === this.state.exitTile.z) ||
        (this.state.exitTile2 &&
          newHead.x === this.state.exitTile2.x &&
          newHead.z === this.state.exitTile2.z))
    ) {
      this.state.snake.unshift(newHead);
      this.state.snake.pop();
      if (this.genomeV2Active()) {
        this.genomeV2Runtime?.openPortal(this.replayTicks);
        this.syncGenomeV2State();
        const reducer = this.state.genomeV2;
        const continueCapability =
          this.genome?.ftuePresentation?.capabilities.continue;
        const portalGenomeCapability =
          this.genome?.ftuePresentation?.capabilities.portalGenome;
        const continueUnlocked = reducer?.ftue.continueUnlocked === true;
        const portalGenomeUnlocked =
          reducer?.ftue.portalGenomeUnlocked === true;
        const canMutate =
          portalGenomeUnlocked && reducer?.portal?.genomeOffer !== null;
        this.state.pendingPortalChoice = {
          canInfuse: canMutate,
          canContinue: continueUnlocked,
          canMutate,
          continueLockedReason: continueUnlocked
            ? null
            : (continueCapability?.reason ?? null),
          mutateLockedReason: canMutate
            ? null
            : (portalGenomeCapability?.reason ?? null),
          ...(continueCapability
            ? { continueCapability: checkpointClone(continueCapability) }
            : {}),
          ...(portalGenomeCapability
            ? {
                portalGenomeCapability: checkpointClone(portalGenomeCapability),
              }
            : {}),
        };
        this.emit('portalChoice', {
          rulesVersion: GENOME_RULES_V2,
          portal: this.genomeV2Runtime?.getState().portal ?? null,
          ftuePresentation: this.genome?.ftuePresentation
            ? checkpointClone(this.genome.ftuePresentation)
            : null,
        });
        return;
      }
      if (this.genomeActive() && this.portalChoicesUnlocked()) {
        const canInfuse = this.canInfuse();
        this.state.pendingPortalChoice = { canInfuse };
        this.emit('portalChoice', {
          canInfuse,
          infusesUsed: this.state.infuses.length,
        });
        return;
      }
      this.finalizeRun('extracted');
      return;
    }

    // Ouroboros makes exactly one otherwise-lethal cell legal: the current
    // tail tip, while cadence allows a bite. The move must resolve first (so
    // the old tail vacates normally), then its +2 pressure cost is appended.
    const ouroborosBite =
      !wallHit && !terrainHit && this.canOuroborosBite(newHead);
    const selfHit =
      !wallHit &&
      !terrainHit &&
      !ouroborosBite &&
      this.checkSelfCollisionForDeath(newHead);

    if (wallHit || terrainHit || selfHit) {
      // Terrain reports as 'wall' rather than growing `RunDeathCause`, which
      // is a persisted enum (migration 022) - and it is honest: a block is a
      // wall you watched arrive. Iron Scales absorbs a WALL hit and therefore
      // absorbs this one too; that is deliberate, since the trait's promise is
      // "survive one collision with the board" and terrain is the board.
      const collisionCause: Exclude<RunDeathCause, 'extracted' | 'timeout'> =
        wallHit || terrainHit ? 'wall' : 'self';
      // Iron Scales (trait): absorb exactly one BOARD hit per run. The blocked
      // move is consumed but the body stays put; the former recoil returned a
      // head cell to free space and therefore violated Rule 15 even though its
      // raw segment count happened to stay constant.
      // Checked before any revive so the trait save never burns one.
      if ((wallHit || terrainHit) && this.state.ironScalesAvailable) {
        this.triggerIronScales(newHead);
        this.emit('tick');
        return;
      }
      // FERAL Minor "Thick Hide": absorb one SELF collision and charge +8
      // length. The blocked move is cancelled; survival tightens the run.
      if (
        selfHit &&
        this.state.thickHideAvailable &&
        this.strainTierNow('FERAL') >= 1
      ) {
        this.triggerThickHide(newHead);
        this.emit('tick');
        return;
      }
      // One revive per run (hard rule): Styx/Molted (fused), classic
      // Phoenix, or Second Sun (UMBRA apex) - in that priority.
      const reviveKind = this.availableReviveKind();
      if (reviveKind) {
        this.triggerRevive(reviveKind, newHead);
        this.emit('tick');
        return;
      }
      // Start death sequence instead of immediate game over
      this.startDeathSequence(newHead, collisionCause);
      return;
    }

    if (
      pendingPhaseGate &&
      !this.genomeV2Runtime?.usePhaseGate(
        pendingPhaseGate.targetId,
        this.replayTicks
      )
    ) {
      throw new Error(
        'Genome v2 Phase Gate could not commit its previewed route.'
      );
    }
    if (pendingPhaseGate) this.syncGenomeV2State();

    // Mutation food pickup: the helix is not food (no growth, no DNA) -
    // stepping onto it opens the choice-of-2 hold after the move resolves.
    const ateMutation =
      this.state.mutationTile !== null &&
      newHead.x === this.state.mutationTile.x &&
      newHead.z === this.state.mutationTile.z;

    let foodIndex = this.findFoodIndex(newHead);
    if (foodIndex >= 0 && this.genomeV2Runtime) {
      const circuit = this.genomeV2Runtime.advanceCircuitLegAt(newHead);
      if (circuit) {
        // Circuit's relay is visible food geometry but not a food event. Move
        // the same physical target to leg two; this tick therefore resolves as
        // ordinary movement (including its tail pop), and the pair grows once
        // only when the destination is collected.
        this.state.foods[foodIndex] = {
          x: circuit.destination.x,
          y: 0,
          z: circuit.destination.z,
        };
        this.state.food = { ...this.state.foods[0] };
        foodIndex = -1;
      }
    }
    const ateFood = foodIndex >= 0;

    // The body length BEFORE this move resolves. `computeLengthTrace`
    // records exactly this as `lengthAtEat[n]` - before the food's growth -
    // so it is captured before the head goes on rather than read back off
    // the array afterwards, when it is one segment too long.
    //
    // WP-3.11: `modelledLength()`, not `snake.length`. Fortress moves segments
    // out of the live array without shortening the snake, so the live array is
    // no longer the length the model means.
    const lengthBeforeMove = this.modelledLength();

    this.state.snake.unshift(newHead);

    if (ateFood) {
      const collectedPosition = { ...newHead }; // Position where food was eaten
      this.state.foodEaten += 1;
      const n = this.state.foodEaten;
      this.lengthTrace.lengthAtEat[n] = lengthBeforeMove;
      this.recordRunEvent({ t: this.runTimeDs(), e: 'f', n });

      // Per-food value: base x gene modifier x trait modifier, one round
      // per food - mirrors computeRunTotals exactly, on every dynasty.
      //
      // WP-3.13: COSMIC used to multiply a combo in here, and that combo was
      // the ONE payout component the server could not recompute (it depended
      // on tick timing) - so it arrived as a claim and was clamped. Deleting
      // the combo deleted the claim, the clamp and the trust ratio with it.
      // Anomaly [E] modifier (Gold Rush x1.5) folds into the SAME single
      // per-food round - mirroring computeRunTotals exactly, so the
      // HUD's DNA counter matches the server recompute to the digit.
      // Under genome rules the modifier/flat come from the fused-view
      // genome math (mirroring computeGenomeRunTotals); in legacy mode
      // geneFoodValueModifier delegates byte-identically to the mutation
      // math (proven by tests).
      // THE ORDER IS GROWTH -> SHED -> PRICE (WP-2.05), because that is
      // the order `computeGenomeRunTotals` folds in. Food n's own shed
      // events are INPUTS to food n's flat bonus (Regenesis pays per shed
      // segment), so pricing first made that branch unreachable in the
      // engine and forced an out-of-fold payment to stand in for it.

      // Growth beyond the ONE segment the move already added (head unshift,
      // tail not popped). The profile's base is the source of truth and is
      // shared with `computeLengthTrace` - see growth.ts, "one function, both
      // sides". Gene and anomaly extras layer on top, unchanged.
      const extraGrowth =
        baseGrowthForFood(this.growth, n, this.ruleset.id, lengthBeforeMove) -
        1 +
        (this.hasGene('overgrowth')
          ? MUTATION_PHYSICS.overgrowthExtraSegments
          : 0) +
        (this.hasGene('bulk_up') ? GENE_PHYSICS.bulkUpExtraSegments : 0) +
        (this.anomaly === 'overgrown'
          ? ANOMALY_PHYSICS.overgrownExtraSegments
          : 0);
      if (extraGrowth > 0) {
        const tail = this.state.snake[this.state.snake.length - 1];
        for (let i = 0; i < extraGrowth; i++) {
          this.state.snake.push({ ...tail });
        }
      }

      // Terrain is food-indexed, so the arena advances exactly here.
      this.placeDueTerrain();

      // Legacy shed cycles (settled-blob compatibility), then FERAL's
      // Fortress. Both move the live array and record their events BEFORE the
      // food is priced, because both are read out of the length trace by the
      // fold that prices it.
      this.applyShedMoves(n);
      this.applyPetrify(n);

      const { dnaValue, scoreValue } = this.resolveFoodEconomy(n);
      this.state.dnaCollected += dnaValue;
      this.state.score += scoreValue;
      if (this.genomeV2Active()) {
        const genomeGrowth = this.resolveCollectedGenomeV2Target(
          collectedPosition,
          dnaValue
        );
        if (genomeGrowth > 0) this.growTail(genomeGrowth);
      }

      // Genome bonus layers (Midas / Static Charge / Ricochet / Gilded
      // Wake drop) - display + bounded-trust claim accumulators only.
      if (this.genomeActive()) {
        this.applyGenomeEatExtras(n, dnaValue, collectedPosition);
      }
      this.ticksSinceAnyEat = 0;

      // Warp Skin / Pocket Rift recharges (food-count cadence).
      if (this.genomeActive()) {
        if (
          !this.state.warpSkinCharged &&
          this.strainTierNow('FLUX') >= 1 &&
          n - this.warpSkinLastRecharge >= STRAIN_PHYSICS.warpSkinRechargeFoods
        ) {
          this.state.warpSkinCharged = true;
        }
        if (
          !this.state.pocketRiftCharged &&
          this.hasGene('pocket_rift') &&
          n - this.pocketRiftLastRecharge >=
            GENE_PHYSICS.pocketRiftRechargeFoods
        ) {
          this.state.pocketRiftCharged = true;
        }
      }

      this.speed = this.effectiveSpeedForFood(n);
      // The body only ever grows on an eat, so this is the one place a
      // length threshold can newly grant a hold.
      this.refreshHoldBudget();

      // Remove the eaten food, then VOLT Arc Lightning may auto-collect
      // up to 2 more foods within 3 cells (full value, +1 segment each);
      // a new wave spawns only once all are eaten.
      this.state.foods.splice(foodIndex, 1);
      if (this.strainTierNow('VOLT') >= 2 && this.state.foods.length > 0) {
        this.consumeArcFoods(collectedPosition);
      }
      const crownAdvance = this.genomeV2Runtime?.advanceCrownWave(
        this.replayTicks
      );
      if (crownAdvance) this.syncGenomeV2State();
      if (
        this.state.foods.length === 0 &&
        crownAdvance?.outcome === 'perfect' &&
        crownAdvance.crownCell
      ) {
        this.spawnGenomeV2CrownStar(crownAdvance.crownCell);
      } else if (this.state.foods.length === 0) {
        this.spawnFoods();
      } else {
        this.state.food = { ...this.state.foods[0] };
      }

      this.advancePortalSchedule(n);
      this.maybeOpenGenomeV2CadenceOffer();
      // Ascetic (trait): mutation food never spawns - no builds, pure snake
      if (
        !this.genomeV2Active() &&
        !this.state.mutationTile &&
        !ateMutation &&
        !this.hasTrait('ascetic') &&
        this.heldSlotCount() < this.maxHeld() &&
        n >= this.state.nextMutationAtFood
      ) {
        this.spawnMutationFood();
      }
      // FLUX Apex "Singularity": on its own food cadence, the whole board's
      // food is dragged in around the head. Fired here, at the food index the
      // flat DNA is paid on, so the paid event and the physical one are the
      // same event (see `applySingularityPull`).
      this.applySingularityPull(n);

      this.emit('foodCollected', {
        position: collectedPosition,
        score: this.state.score,
        dna: this.state.dnaCollected,
        foodEaten: this.state.foodEaten,
      });
    } else {
      this.state.snake.pop();
      if (ouroborosBite) this.commitOuroborosBite(newHead);
    }

    // Genome pickups on the resolved head cell: AURUM gilded cells - a flat
    // claim, not run food. The molt drops and Heartwood goldens that used to
    // be collected here were retired with Molt (WP-3.11); their successors are
    // paid deterministically inside the fold, so there is nothing to pick up.
    if (this.genomeActive()) {
      this.tryConsumeGildedCell(this.state.snake[0]);
    }

    // Magnet Pulse (mutation, radius 2) / Magnetism (trait, radius 1):
    // nearby food creeps toward the head, one cell per tick. When both are
    // active the larger radius wins - the pull itself never stacks.
    if (
      !this.genomeV2Active() &&
      (this.hasMutation('magnet_pulse') ||
        this.hasMutation('gravity_well') ||
        this.hasTrait('magnetism'))
    ) {
      this.applyMagnetPulse();
    }

    // Mutation pickup resolves after the move: freeze into the choice hold
    if (ateMutation) {
      this.openMutationChoice();
    }

    // Exit-portal lifetime countdown (only for portals that were already
    // live when the tick began, so a fresh spawn gets its full window).
    // Twin Exits: the pair shares one window and despawns together.
    if (this.state.exitTile && exitExistedAtTickStart) {
      this.state.exitTicksRemaining -= 1;
      if (this.state.exitTicksRemaining <= 0) {
        if (this.genomeV2Runtime) {
          if (!this.genomeV2Runtime.getState().portal) {
            this.genomeV2Runtime.openPortal(this.replayTicks, {
              includeGenomeOffer: false,
            });
          }
          this.genomeV2Runtime.expirePortal(this.replayTicks);
          this.syncGenomeV2State();
        }
        this.state.exitTile = null;
        this.state.exitTile2 = null;
        this.state.exitTicksRemaining = 0;
        this.scheduleNextPortalAfterResolve(this.state.foodEaten);
        // Identity v1 section 9.5: a portal that expires unused was
        // PASSED - the greed decision the Analyst narrates.
        this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'pass' });
        this.emit('exitDespawned');
      }
    }

    // Meteor Shower (anomaly): the live food wave burns up after 60 ticks
    // and respawns elsewhere. Foods eaten this tick already resolved above
    // (a fresh wave restarts the clock); the counter only runs while the
    // wave survives untouched.
    if (
      this.anomaly === 'meteor_shower' &&
      !ateFood &&
      this.state.foods.length > 0
    ) {
      this.state.foodTicksRemaining -= 1;
      if (this.state.foodTicksRemaining <= 0) {
        this.expireDisplacedGenomeV2Targets(this.state.foods);
        this.spawnFoods();
        this.emit('foodDespawned');
      }
    }

    // Mutation food lifetime countdown (same fresh-spawn grace as the exit)
    if (this.state.mutationTile && mutationExistedAtTickStart) {
      this.state.mutationTicksRemaining -= 1;
      if (this.state.mutationTicksRemaining <= 0) {
        this.state.mutationTile = null;
        this.state.mutationTicksRemaining = 0;
        this.state.nextMutationAtFood =
          this.state.foodEaten + this.rollNextMutationInterval();
        this.emit('mutationDespawned');
      }
    }

    // Near-wall episode tracking (Identity v1 section 9.5): the 1-cell
    // wall margin, recorded on episode end when >=500ms
    this.trackNearWall(this.state.snake[0]);

    // Genome per-tick upkeep: eat-gap counter (Midas window / Static
    // Charge fasting), gilded-cell expiry, phantom-phase countdown.
    if (this.genomeActive()) {
      if (!ateFood) {
        this.ticksSinceAnyEat = Math.min(this.ticksSinceAnyEat + 1, 1_000_000);
      }
      if (this.state.gildedCells.length > 0) {
        for (const cell of this.state.gildedCells) cell.ticks -= 1;
        this.state.gildedCells = this.state.gildedCells.filter(
          (cell) => cell.ticks > 0
        );
      }
      if (this.state.phantomTicksRemaining > 0) {
        this.state.phantomTicksRemaining -= 1;
      }
      if (ateFood && this.strainTierNow('UMBRA') >= 2) {
        this.state.phantomTicksRemaining = STRAIN_PHYSICS.phantomCoilTicks;
      }
    }
    if (this.state.revivePhaseTicksRemaining > 0) {
      this.state.revivePhaseTicksRemaining -= 1;
    }

    // COSMIC: the constellation window closes, and whatever is left on the
    // board calcifies where it sat. Deliberately AFTER the eat resolves, so a
    // star collected on the closing tick counts as collected - the player who
    // made the route by one tick is not billed for it.
    if (
      this.ruleset.constellation &&
      this.state.constellationTicksRemaining > 0
    ) {
      this.state.constellationTicksRemaining -= 1;
      if (this.state.constellationTicksRemaining <= 0) {
        this.calcifyConstellation();
      }
    }

    // Coilkeeper is an observation of the board *after* the move resolves.
    // That boundary is what makes a completed loop replayable: the exact
    // body/terrain cells that enclosed the region are already committed.
    this.maybeSealGenomeV2Coil();

    this.emit('tick');
  }

  /**
   * Choose one of the two offered mutations (0 or 1). Applies immediate
   * physical side effects, clears the choice hold, and the game resumes on
   * the next tick. Returns false when no choice is pending.
   */
  resolveGenomeV2Offer(resolution: GenomeV2OfferResolution): boolean {
    const runtime = this.genomeV2Runtime;
    const offer = runtime?.getState().offer;
    if (!runtime || !offer || offer.offerId !== resolution.offerId)
      return false;

    if (resolution.action === 'decline') {
      if (
        !runtime.declineOffer(this.replayTicks, {
          pinCandidateIndex: resolution.pinCandidateIndex,
        })
      ) {
        return false;
      }
      this.recordReplayAction({
        tick: this.replayTicks,
        kind: 'genome_v2_offer',
        offerId: resolution.offerId,
        choice: 'decline',
        ...(resolution.pinCandidateIndex !== undefined
          ? { pinCandidate: resolution.pinCandidateIndex }
          : {}),
      });
      this.syncGenomeV2State();
      this.decisionHoldEntitled = true;
      this.emit('mutationDeclined', { rulesVersion: GENOME_RULES_V2 });
      return true;
    }

    const result = runtime.acquireOfferCandidate(
      resolution.candidateIndex,
      this.replayTicks,
      resolution.replacementSlot
    );
    if (!result) return false;
    if (result.growthCharged > 0) this.growTail(result.growthCharged);
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'genome_v2_offer',
      offerId: resolution.offerId,
      choice: resolution.candidateIndex,
      slot: result.slot,
    });
    this.syncGenomeV2State();
    this.applyGenomeV2Acquisition(result.geneId);
    this.decisionHoldEntitled = true;
    this.emit('mutationPicked', {
      id: result.geneId,
      atFood: this.state.foodEaten,
      rulesVersion: GENOME_RULES_V2,
    });
    return true;
  }

  /** Pure portal preview: inspection/back never writes an event or consumes it. */
  inspectGenomeV2PortalCandidate(
    portalId: string,
    candidateIndex: 0 | 1
  ): GenomeV2ActiveGeneId | null {
    const state = this.genomeV2Runtime?.getState();
    if (!state?.portal || state.portal.portalId !== portalId) return null;
    return this.genomeV2Runtime?.inspectPortalCandidate(candidateIndex) ?? null;
  }

  /** Pure Recode consequence preview; it never appends a journal event. */
  previewGenomeV2OfferRecode(
    offerId: string,
    candidateIndex: 0 | 1,
    replacementSlot: GenomeV2SlotIndex
  ): GenomeV2RecodePreview | null {
    const offer = this.genomeV2Runtime?.getState().offer;
    if (!offer || offer.offerId !== offerId) return null;
    return (
      this.genomeV2Runtime?.previewOfferRecode(
        candidateIndex,
        replacementSlot
      ) ?? null
    );
  }

  /** Pure portal Recode preview; inspection/back does not consume the door. */
  previewGenomeV2PortalRecode(
    portalId: string,
    candidateIndex: 0 | 1,
    replacementSlot: GenomeV2SlotIndex
  ): GenomeV2RecodePreview | null {
    const portal = this.genomeV2Runtime?.getState().portal;
    if (!portal || portal.portalId !== portalId) return null;
    return (
      this.genomeV2Runtime?.previewPortalRecode(
        candidateIndex,
        replacementSlot
      ) ?? null
    );
  }

  /**
   * Atomic v2 portal commit. MUTATE previews are pure; only this final method
   * emits INFUSE/Recode, charges body growth, and removes the physical portal.
   */
  resolveGenomeV2Portal(resolution: GenomeV2PortalResolution): boolean {
    const runtime = this.genomeV2Runtime;
    const reducer = runtime?.getState();
    if (
      !runtime ||
      !reducer?.portal ||
      reducer.portal.portalId !== resolution.portalId ||
      this.state.pendingPortalChoice === null
    ) {
      return false;
    }

    if (resolution.action === 'bank') {
      if (!runtime.bankPortal(this.replayTicks)) return false;
      this.recordReplayAction({
        tick: this.replayTicks,
        kind: 'genome_v2_portal',
        portalId: resolution.portalId,
        choice: 'bank',
      });
      this.syncGenomeV2State();
      this.state.pendingPortalChoice = null;
      this.finalizeRun('extracted');
      return true;
    }

    if (resolution.action === 'continue') {
      if (reducer.ftue.continueUnlocked !== true) return false;
      if (
        !runtime.continuePortal(
          this.replayTicks,
          resolution.activateMirror === true
        )
      ) {
        return false;
      }
      this.recordReplayAction({
        tick: this.replayTicks,
        kind: 'genome_v2_portal',
        portalId: resolution.portalId,
        choice: 'continue',
        activateMirror: resolution.activateMirror === true,
      });
      this.syncGenomeV2State();
      this.state.pendingPortalChoice = null;
      this.consumePassedPortal();
      this.decisionHoldEntitled = true;
      return true;
    }

    if (
      reducer.ftue.portalGenomeUnlocked !== true ||
      !reducer.portal.genomeOffer
    ) {
      return false;
    }
    const openSlot = reducer.slots.find(
      (slot) => slot.occupant === null
    )?.index;
    const slot = resolution.replacementSlot ?? openSlot;
    if (slot === undefined) return false;
    const occupant = reducer.slots[slot]?.occupant;
    if (occupant?.kind === 'ash') return false;
    const result = runtime.resolvePortalMutation(
      resolution.candidateIndex,
      this.replayTicks,
      slot
    );
    if (!result) return false;

    this.growTail(result.growthCharged);
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'genome_v2_portal',
      portalId: resolution.portalId,
      choice: result.recoded ? 'recode' : 'infuse',
      candidate: resolution.candidateIndex,
      slot: result.slot,
    });
    this.syncGenomeV2State();
    this.applyGenomeV2Acquisition(result.geneId);
    this.state.pendingPortalChoice = null;
    this.state.exitTile = null;
    this.state.exitTile2 = null;
    this.state.exitTicksRemaining = 0;
    this.scheduleNextPortalAfterResolve(this.state.foodEaten);
    this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'infuse' });
    this.emit('infused', {
      atFood: this.state.foodEaten,
      segmentsGrown: result.growthCharged,
      rulesVersion: GENOME_RULES_V2,
      geneId: result.geneId,
    });
    this.decisionHoldEntitled = true;
    return true;
  }

  private applyGenomeV2Acquisition(geneId: GenomeV2ActiveGeneId): void {
    // A Recode may add OR retire Time Dilation/REDLINE, so speed is refreshed
    // after every atomic acquisition rather than keyed only to the new ID.
    this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    if (geneId === 'phoenix') {
      // One coherent second-life economy: a held Phoenix supersedes the
      // legacy trait pardon instead of stacking behind it.
      this.state.ironScalesAvailable = false;
    }
  }

  /** Explicit Gilded Fork branch; ordinary collection remains the safe default. */
  resolveGenomeV2TargetChoice(
    targetId: string,
    choice: 'ordinary' | 'gilded'
  ): boolean {
    if (
      !this.genomeV2Runtime?.chooseGildedFork(
        targetId,
        choice,
        this.replayTicks
      )
    ) {
      return false;
    }
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'genome_v2_target',
      targetId,
      choice,
    });
    this.syncGenomeV2State();
    return true;
  }

  /** Player-controlled VOLT Apex / CYBER REDLINE activation. */
  activateGenomeV2Overclock(resolution: GenomeV2OverclockResolution): boolean {
    if (
      !this.genomeV2Runtime ||
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.startTime === null ||
      this.state.isPaused ||
      this.state.pendingChoice !== null ||
      this.genomeV2OfferPending() ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return false;
    }
    const activationId = this.genomeV2Runtime.startOverclock(
      this.replayTicks,
      resolution.source,
      resolution.activationId
    );
    if (!activationId) return false;
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'genome_v2_overclock',
      source: resolution.source,
      activationId,
    });
    this.syncGenomeV2State();
    this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    return true;
  }

  chooseMutation(index: 0 | 1): boolean {
    const v2Offer = this.genomeV2Runtime?.getState().offer;
    if (v2Offer) {
      return this.resolveGenomeV2Offer({
        action: 'choose',
        offerId: v2Offer.offerId,
        candidateIndex: index,
      });
    }
    const offer = this.state.pendingChoice;
    if (!offer) return false;
    const id = offer[index];
    if (!id) return false;

    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'mutation',
      choice: index,
    });

    const pick: GenePick = { id, atFood: this.state.foodEaten };
    this.state.pendingChoice = null;
    this.state.choiceSource = null;
    this.state.pendingChoicePity = null;
    if (this.genomeActive()) {
      this.resolveOfferTrace(id);
    }
    this.applyPick(pick);
    this.decisionHoldEntitled = true;

    this.emit('mutationPicked', {
      id,
      atFood: pick.atFood,
      held: this.state.heldMutations.map((m) => ({ ...m })),
    });
    return true;
  }

  /**
   * Grant a gene directly (for testing and driven flows): the same pick
   * pipeline as chooseMutation, without an offer. atFood defaults to the
   * current food count. Mirrors placeFood/placeExit.
   */
  grantMutation(id: GeneId, atFood?: number): void {
    this.applyPick({ id, atFood: atFood ?? this.state.foodEaten });
  }

  /** Shared pick pipeline: hold the gene + immediate physical effects. */
  private applyPick(pick: GenePick): void {
    this.state.heldMutations.push(pick);
    this.recordRunEvent({ t: this.runTimeDs(), e: 'm', id: pick.id });
    if (pick.id === 'phoenix') {
      this.state.phoenixAvailable = true;
    }
    if (this.genomeActive()) {
      const splicesBefore = this.state.fusedSplices.length;
      this.refreshGenomeDerived();
      const fused = this.state.fusedSplices[this.state.fusedSplices.length - 1];
      if (this.state.fusedSplices.length > splicesBefore && fused) {
        this.recordRunEvent({ t: this.runTimeDs(), e: 's', id: fused.id });
        this.emit('spliceFused', { id: fused.id, atFood: fused.atFood });
      }
    }
    if (
      (pick.id === 'gold_trail' ||
        pick.id === 'deep_roots' ||
        pick.id === 'afterburner' ||
        pick.id === 'glacial_reserve' ||
        pick.id === 'static_charge') &&
      this.state.exitTile
    ) {
      // Portal-window COSTS apply to the live portal too: clamp down to
      // the shortened window. (Tectonic Patience deliberately does NOT
      // extend a live portal - its benefit starts with the next spawn.)
      this.state.exitTicksRemaining = Math.min(
        this.state.exitTicksRemaining,
        this.effectiveExitDespawnTicks()
      );
    }
    if (pick.id === 'time_dilation') {
      this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    }
  }

  /** Decline the offer (take neither) - clears the choice hold. */
  declineMutation(): void {
    const v2Offer = this.genomeV2Runtime?.getState().offer;
    if (v2Offer) {
      this.resolveGenomeV2Offer({
        action: 'decline',
        offerId: v2Offer.offerId,
      });
      return;
    }
    if (!this.state.pendingChoice) return;
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'mutation',
      choice: 'decline',
    });
    this.state.pendingChoice = null;
    this.state.choiceSource = null;
    this.state.pendingChoicePity = null;
    if (this.genomeActive()) {
      this.resolveOfferTrace(null);
    }
    this.decisionHoldEntitled = true;
    this.emit('mutationDeclined');
  }

  // ---------------------------------------------------------------------------
  // GENOME: offers, portal trichotomy, infuse, strain physics
  // ---------------------------------------------------------------------------

  /** Record the resolution of the pending offer into the trace. */
  private resolveOfferTrace(picked: GeneId | null): void {
    const entry = this.offerTrace[this.offerTrace.length - 1];
    if (entry && !entry.resolved) {
      entry.picked = picked;
      entry.resolved = true;
    }
  }

  /** Roll a seeded gravity offer and enter the choice hold. */
  private openGeneChoice(source: 'gene_food' | 'infuse'): void {
    const genome = this.genome;
    if (!genome) return;
    const points: StrainPoints = { ...this.state.strainCounts };
    const offer = rollGeneOffer({
      runSeed: genome.runSeed,
      offerIndex: this.offerIndex,
      picks: this.state.heldMutations.map((m) => ({ ...m })),
      pool: this.effectiveGenePool(),
      points,
      recentOffers: this.recentOffers.slice(-2),
      lineage: genome.lineage ?? null,
      anomalyStrain: genome.anomalyStrain ?? null,
    });
    if (!offer) return;
    this.offerTrace.push({
      k: this.offerIndex,
      atFood: this.state.foodEaten,
      picked: null,
      resolved: false,
    });
    this.offerIndex += 1;
    this.recentOffers.push([...offer]);
    if (this.recentOffers.length > 4) this.recentOffers.shift();
    // The pity window counts OFFERS, not picks, so the offer just pushed is
    // already inside the window the next roll will measure. Passing changes
    // neither points nor picks, which is what makes this forecast exact.
    this.state.pendingChoicePity = pityForecast({
      picks: this.state.heldMutations,
      pool: this.effectiveGenePool(),
      points,
      recentOffers: this.recentOffers.slice(-2),
    });
    this.state.pendingChoice = offer;
    this.state.choiceSource = source;
    this.emit('mutationChoice', { options: [...offer], source });
  }

  /** Can the player INFUSE the portal they just stepped on? */
  private canInfuse(): boolean {
    const ftue = this.genome?.ftue;
    if (ftue && !ftue.infuseUnlocked) return false;
    return (
      this.state.infuses.length < STRAIN_PHYSICS.infuseMaxPerRun &&
      // Modelled, not live (WP-3.11): the minimum exists so INFUSE has a body
      // to be denominated in, and petrified stone is still that body.
      this.modelledLength() >= STRAIN_PHYSICS.infuseMinLength
    );
  }

  /** Post-FTUE portals expose the explicit BANK / PASS / INFUSE hold. */
  private portalChoicesUnlocked(): boolean {
    const ftue = this.genome?.ftue;
    return ftue ? ftue.infuseUnlocked : true;
  }

  /**
   * Resolve the portal-choice hold: BANK ends the run through the portal;
   * INFUSE consumes it for build power (4 tail segments, bank +0.05 /
   * salvage -0.05, next portal +2 foods, and a gene offer - or a Strain
   * Surge choice at the gene cap). Returns false when nothing is pending.
   */
  resolvePortalChoice(action: 'bank' | 'pass' | 'infuse'): boolean {
    if (this.genomeV2Active()) {
      const portalId = this.genomeV2Runtime?.getState().portal?.portalId;
      if (!portalId || action === 'infuse') return false;
      return this.resolveGenomeV2Portal(
        action === 'bank'
          ? { action: 'bank', portalId }
          : { action: 'continue', portalId, activateMirror: false }
      );
    }
    const pending = this.state.pendingPortalChoice;
    if (!pending) return false;
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'portal',
      choice: action,
    });
    this.state.pendingPortalChoice = null;
    if (action === 'pass') {
      this.consumePassedPortal();
      this.decisionHoldEntitled = true;
      return true;
    }
    if (action === 'bank' || !pending.canInfuse) {
      this.finalizeRun('extracted');
      return true;
    }
    this.performInfuse();
    this.decisionHoldEntitled = true;
    return true;
  }

  /** PASS consumes this door; the schedule already holds the next one. */
  private consumePassedPortal(): void {
    this.state.exitTile = null;
    this.state.exitTile2 = null;
    this.state.exitTicksRemaining = 0;
    this.scheduleNextPortalAfterResolve(this.state.foodEaten);
    this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'pass' });
    this.emit('exitDespawned', { deliberate: true });
  }

  /** The infuse itself - portal consumed, body paid, power gained. */
  private performInfuse(): void {
    const atFood = this.state.foodEaten;
    this.state.infuses.push({ atFood });
    // Rule 15: the gene is absorbed into the body, so the body GROWS. The
    // old code sliced four segments off the tail, which under a design where
    // length is the difficulty clock was a second reward rather than a cost.
    // Growth is appended at the tail, exactly as food growth is, so every
    // added cell is one the body already occupied - the snake never appears
    // in a cell it did not travel through.
    //
    // WP-3.12: the "Weight of Power" rung adds to this. Read through
    // `ladderInfuseGrowth`, which `computeLengthTrace` also calls - two reads
    // of one function, never two copies of one number.
    const grew = ladderInfuseGrowth(this.ladderRung);
    const tail = this.state.snake[this.state.snake.length - 1];
    for (let i = 0; i < grew; i++) {
      this.state.snake.push({ ...tail });
    }
    // Consume the portal. Under the seeded schedule the next door's food is
    // already fixed; the +2-foods-per-infuse exposure tax is applied when the
    // schedule advances past it, which is where the server applies it too.
    this.state.exitTile = null;
    this.state.exitTile2 = null;
    this.state.exitTicksRemaining = 0;
    this.scheduleNextPortalAfterResolve(atFood);
    this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'infuse' });
    this.recordRunEvent({ t: this.runTimeDs(), e: 'i', n: atFood });
    this.emit('infused', {
      atFood,
      infusesUsed: this.state.infuses.length,
      segmentsGrown: grew,
    });
    // Build power: a gene offer - or a Strain Surge at the gene cap.
    if (this.heldSlotCount() < this.maxHeld()) {
      this.openGeneChoice('infuse');
    } else {
      this.state.pendingSurgeChoice = true;
      this.emit('surgeChoice', {
        strains: this.heldGeneStrains(),
      });
    }
  }

  /**
   * Resolve the Strain Surge choice (infusing at the gene cap): +1 point
   * to the chosen strain. Points from surges count toward thresholds but
   * never toward the in-run gene gates.
   */
  chooseSurge(strain: StrainId): boolean {
    if (!this.state.pendingSurgeChoice) return false;
    if (!this.heldGeneStrains().includes(strain)) return false;
    this.recordReplayAction({
      tick: this.replayTicks,
      kind: 'surge',
      strain,
    });
    this.state.pendingSurgeChoice = false;
    this.decisionHoldEntitled = true;
    this.state.surges.push({ strain, atFood: this.state.foodEaten });
    this.refreshGenomeDerived();
    this.emit('surged', { strain, atFood: this.state.foodEaten });
    return true;
  }

  /** Per-food economy under genome or legacy rules - one round per food. */
  private resolveFoodEconomy(n: number): {
    dnaValue: number;
    scoreValue: number;
  } {
    let mod: number;
    let flat: number;
    if (this.genomeActive() && this.activations) {
      // WP-2.05 - THE ARGUMENTS ARE THE WHOLE FIX.
      //
      // `lengthAt` was `() => this.state.snake.length`: the LIVE array,
      // read after the head was unshifted, so one segment longer than the
      // model on every main-path eat and correct on every arc eat. It now
      // reads the trace, which records the same pre-growth length
      // `computeLengthTrace` does. `last_gasp` compares against a length
      // THRESHOLD and `bulk_up` divides into a length BUCKET, so one
      // segment is the difference between two payouts.
      //
      // The flat bonus was handed `{ lengthAtEat: [], shedEvents: [] }` -
      // an empty trace - so its Regenesis branch could never fire and the
      // engine paid that DNA outside the fold instead. It now receives the
      // live trace, and the out-of-fold payment in `applyShedMoves` is
      // gone. Those two edits are one change.
      const lengthAt = (at: number) => this.lengthAtEat(at);
      mod = genomeFoodValueModifier(
        this.fusedView,
        this.activations,
        n,
        this.state.revive,
        {
          lengthAt,
          prevRunDied: this.genome?.prevRunDied,
        }
      );
      flat = genomeFoodValueFlatBonus(
        this.fusedView,
        this.activations,
        n,
        this.state.revive,
        this.lengthTrace,
        { lengthAt }
      );
    } else {
      mod = geneFoodValueModifier(
        this.state.heldMutations,
        n,
        this.state.phoenixTriggeredAtFood
      );
      flat = geneFoodValueFlatBonus(
        this.state.heldMutations,
        n,
        this.state.phoenixTriggeredAtFood
      );
    }
    mod *=
      traitFoodValueModifier(this.traits, n) *
      anomalyFoodValueModifier(this.anomaly, n);
    const baseDna = this.ruleset.foodDnaValue(n);
    // The per-food floor, from the SAME function the server's fold calls.
    // `hasGene('tithe')` stood here, and it differs in two ways that both
    // reach the payout: it is true on tithe's own food (the shared helper
    // requires `n > tithe.atFood`), and it stays true once tithe is
    // consumed by a fusion (the helper reads the LOOSE view only).
    const floor = this.genomeActive()
      ? tithePerFoodFloor(this.fusedView, n)
      : 0;
    const dnaValue = Math.max(floor, Math.round(baseDna * mod) + flat);
    const scoreValue = Math.round(
      FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n)
    );
    return { dnaValue, scoreValue };
  }

  /** Genome eat-time bonus layers - display + claim accumulators. */
  private applyGenomeEatExtras(
    n: number,
    dnaValue: number,
    position: Position
  ): void {
    const claims = this.state.genomeClaims;
    // AURUM Apex "Midas Vein": a food within 3 ticks of the previous is
    // golden x2 - the bonus half is the bounded-trust claim.
    if (
      this.strainTierNow('AURUM') >= 3 &&
      this.ticksSinceAnyEat <= STRAIN_PHYSICS.midasWindowTicks
    ) {
      this.state.dnaCollected += dnaValue;
      claims.midasDna = (claims.midasDna ?? 0) + dnaValue;
    } else if (
      this.hasGene('static_charge') &&
      this.ticksSinceAnyEat >= GENE_ECONOMICS.staticChargeFastingTicks &&
      this.pickAtFoodOf('static_charge') !== null &&
      n > (this.pickAtFoodOf('static_charge') as number)
    ) {
      // Static Charge: a food eaten after >=8 ticks of fasting pays x2.
      this.state.dnaCollected += dnaValue;
      claims.staticChargeDna = (claims.staticChargeDna ?? 0) + dnaValue;
    }
    // Ricochet (splice): foods eaten while wall-sliding +50%.
    if (
      this.slidThisTick &&
      this.state.fusedSplices.some((s) => s.id === 'splice_ricochet')
    ) {
      const bonus = Math.round(
        dnaValue * SPLICE_ECONOMICS.ricochetSlideBonusRatio
      );
      this.state.dnaCollected += bonus;
      claims.ricochetDna = (claims.ricochetDna ?? 0) + bonus;
    }
    // AURUM Expression "Gilded Wake": the eaten cell turns gilded.
    if (this.strainTierNow('AURUM') >= 2) {
      this.state.gildedCells.push({
        x: position.x,
        z: position.z,
        ticks: STRAIN_PHYSICS.gildedCellLifetimeTicks,
      });
      if (this.state.gildedCells.length > STRAIN_PHYSICS.gildedMaxCells) {
        this.state.gildedCells.shift();
      }
    }
  }

  /**
   * The modelled body length when food `at` was eaten - `lengthAtEat[at]`
   * in `computeLengthTrace`'s terms, which is the length BEFORE that food's
   * growth.
   *
   * A food the trace has not recorded falls back to the live array length.
   * That happens only for a lookup outside the run's own food indices,
   * where the shared functions ask about a food that has not been eaten;
   * the fallback keeps the old behaviour rather than answering 0, which
   * would silently deny `last_gasp` its benefit.
   */
  private lengthAtEat(at: number): number {
    const recorded = this.lengthTrace.lengthAtEat[at];
    return typeof recorded === 'number' ? recorded : this.modelledLength();
  }

  /**
   * The MODELLED body length - what `computeLengthTrace` calls `len`, and the
   * only length any economic rule may read (WP-3.11).
   *
   * Fortress petrifies segments out of `state.snake` without shortening the
   * snake: the stone is still the player's length, it has just stopped
   * following. So the difficulty clock, every length threshold and every
   * length bucket read this, and only the live array itself - drawing,
   * self-collision, the Fortress floor - reads `state.snake.length`.
   */
  private modelledLength(): number {
    return this.state.snake.length + this.petrified;
  }

  /**
   * The authoritative board-pressure vocabulary for diagnostics, placement,
   * and tests. Kept as one snapshot so consumers cannot quietly substitute
   * array length for occupied space once Fortress has moved body into stone.
   */
  getBoardPressure(): BoardPressureSnapshot {
    const v2Terrain = (this.state.genomeV2?.permanentTerrain ?? []).flatMap(
      (fact) =>
        fact.cells.map((cell) => ({
          x: cell.x,
          z: cell.z,
          // Presentation reads the canonical Genome state; this synthetic
          // source exists only to reuse the shared occupancy calculation.
          source: 'ladder' as const,
          formingTicks: 0,
          formingTotal: 0,
          solid: true,
        }))
    );
    return boardPressureSnapshot(
      this.gridSize,
      this.state.snake,
      [...this.state.terrain, ...v2Terrain],
      this.modelledLength()
    );
  }

  /**
   * The run's live length trace - the same structure the server derives
   * with `computeLengthTrace`. Exposed so the fold-parity suite can assert
   * the two are identical food by food, which is the property that keeps
   * the engine's DNA counter and the server's recompute in agreement.
   */
  getLengthTrace(): LengthTrace {
    return {
      lengthAtEat: [...this.lengthTrace.lengthAtEat],
      shedEvents: this.lengthTrace.shedEvents.map((e) => ({ ...e })),
      petrifyEvents: this.lengthTrace.petrifyEvents.map((e) => ({ ...e })),
    };
  }

  /** atFood of a held gene, or null. */
  private pickAtFoodOf(id: GeneId): number | null {
    const pick = this.state.heldMutations.find((m) => m.id === id);
    return pick ? pick.atFood : null;
  }

  /**
   * Legacy shed cycles: loose Shed 25->8, Regenesis 20->8, Molted Rebirth
   * 25->8. Mirrors `computeLengthTrace`'s cycle model.
   *
   * NOTHING REACHABLE STILL DRIVES THIS. Rule 15 retired `shed` from every
   * pool (WP-3.01), which retired both of its splices with it, and WP-3.11
   * replaced FERAL's Molt with Fortress. The cycles survive because a blob
   * settled before the rule still names those genes, and the engine and the
   * server must recompute such a run the same way they always did.
   *
   * This runs BEFORE the food is priced, which is what the fold requires:
   * `genomeFoodValueFlatBonus` pays Regenesis `regenesisFlatPerSegment` per
   * segment shed AT THIS FOOD, reading the events out of the length trace.
   *
   * THE PAYMENT IS NOT HERE. It used to be - `dnaCollected +=
   * regenesisFlatPerSegment * segmentsShed` - because the engine passed an
   * EMPTY shed-event list into the fold and the in-fold branch could never
   * fire. Now the fold is fed the live trace and pays it, so paying it here
   * as well would pay it twice. Do not restore that line without also
   * removing the trace the fold reads.
   */
  private applyShedMoves(n: number): void {
    type Cycle = {
      every: number;
      anchor: number;
      /**
       * The length this cycle resets a body of `current` to.
       * `computeLengthTrace` calls the identical `resetFor` at the identical
       * point, which is what keeps the two in parity.
       */
      resetFor: (current: number) => number;
      source: ShedEvent['source'];
    };
    const cycles: Cycle[] = [];
    const shedPick = this.fusedLoosePick('shed');
    if (shedPick) {
      cycles.push({
        every: MUTATION_PHYSICS.shedEveryFoods,
        anchor: shedPick.atFood,
        resetFor: () => MUTATION_PHYSICS.shedResetLength,
        source: 'shed',
      });
    }
    if (this.genomeActive()) {
      for (const splice of this.state.fusedSplices) {
        if (splice.id === 'splice_regenesis') {
          cycles.push({
            every: SPLICE_ECONOMICS.regenesisShedEveryFoods,
            anchor: splice.atFood,
            resetFor: () => SPLICE_ECONOMICS.regenesisResetLength,
            source: 'regenesis',
          });
        }
        if (splice.id === 'splice_molted_rebirth') {
          cycles.push({
            every: SPLICE_PHYSICS.moltedRebirthShedEveryFoods,
            anchor: splice.atFood,
            resetFor: () => SPLICE_PHYSICS.moltedRebirthResetLength,
            source: 'molted_rebirth',
          });
        }
      }
    }
    for (const cycle of cycles) {
      const since = n - cycle.anchor;
      if (since <= 0 || since % cycle.every !== 0) continue;
      const reset = cycle.resetFor(this.state.snake.length);
      if (this.state.snake.length <= reset) continue;
      const segmentsShed = this.state.snake.length - reset;
      this.state.snake.length = reset;
      if (this.genomeActive()) {
        this.lengthTrace.shedEvents.push({
          atFood: n,
          segmentsShed,
          source: cycle.source,
        });
      }
    }
  }

  /**
   * FERAL Expression "FORTRESS" (WP-3.11) - the replacement for Molt.
   *
   * The oldest `fortressSegments` segments stop following and become terrain.
   * Three things happen and none of them is a shed:
   *
   *   - the LIVE array loses the segments, so the tail the player is steering
   *     gets shorter;
   *   - `this.petrified` gains them, so the MODELLED length - the one the
   *     trace records and the server recomputes - does not move at all;
   *   - the cells they occupied become forming terrain, so free space is
   *     unchanged at the instant of the event and shrinks from then on.
   *
   * That is Rule 15 satisfied by construction rather than by argument: nothing
   * shortens the snake, and the board only ever gets tighter.
   *
   * IT RUNS BEFORE THE FOOD IS PRICED, unlike the molt drops it replaces. Molt
   * paid in pickups, which are board objects and could safely land after the
   * fold; Fortress pays deterministically THROUGH the fold, so its event has
   * to exist in the trace by the time `resolveFoodEconomy` reads it.
   *
   * The block placement leans entirely on `tickTerrain`'s pending state: these
   * cells start under the body, and a block whose forming has finished but
   * whose cell is not yet clear simply waits. That is the case the terrain
   * primitive was built for, so Fortress needs no fairness code of its own.
   */
  private applyPetrify(n: number): void {
    if (!this.genomeActive()) return;
    if (this.strainTierNow('FERAL') < 2) return;
    const expressionAt = this.activations?.FERAL.expressionAt ?? null;
    if (!fortressFiresAt(n, expressionAt, this.state.snake.length)) return;

    const segments = STRAIN_PHYSICS.fortressSegments;
    const removed = this.state.snake.splice(this.state.snake.length - segments);
    this.petrified += segments;
    this.lengthTrace.petrifyEvents.push({
      atFood: n,
      segments,
      dna: fortressEventDna(segments, this.anomaly),
    });

    // Segments are not cells: growth duplicates the tail cell, so a run of
    // petrified segments can be several segments deep on one tile. The DNA is
    // paid per SEGMENT (the fold does that, from the event) and the board gets
    // one block per distinct CELL.
    //
    // No food/portal exclusion here, unlike `placeDueTerrain`. These cells are
    // BODY cells, and nothing else on the board is ever placed on the body, so
    // there is nothing to bury. Skipping a cell would be the worse bug anyway:
    // a segment that petrified without laying stone would GROW free space,
    // which is the one thing Rule 15 forbids.
    this.placeTerrainAt(
      removed,
      STRAIN_PHYSICS.fortressFormingSeconds,
      'fortress'
    );
    this.emit('petrified', {
      atFood: n,
      segments,
      cells: removed.map((cell) => ({ x: cell.x, z: cell.z })),
    });
  }

  /** A pick that is NOT consumed by a fusion (its own cycle still runs). */
  private fusedLoosePick(id: GeneId): GenePick | undefined {
    if (!this.genomeActive()) {
      return this.state.heldMutations.find((m) => m.id === id);
    }
    return this.fusedView.loose.find((m) => m.id === id);
  }

  /** VOLT Arc Lightning: auto-collect up to 2 foods within 3 cells. */
  private consumeArcFoods(origin: Position): void {
    let arcs = 0;
    while (arcs < STRAIN_PHYSICS.arcMaxPerEat && this.state.foods.length > 0) {
      const index = this.state.foods.findIndex(
        (f) =>
          Math.max(Math.abs(f.x - origin.x), Math.abs(f.z - origin.z)) <=
          STRAIN_PHYSICS.arcRadius
      );
      if (index < 0) break;
      const food = this.state.foods[index];
      this.state.foods.splice(index, 1);
      arcs += 1;
      this.state.foodEaten += 1;
      const n = this.state.foodEaten;
      // An arc eat has no head unshift, so the modelled length IS the
      // pre-growth length the model records for this food.
      this.lengthTrace.lengthAtEat[n] = this.modelledLength();
      this.recordRunEvent({ t: this.runTimeDs(), e: 'f', n });
      // Growth -> shed/petrify -> price, the order `computeGenomeRunTotals`
      // folds in: the events of food n are inputs to food n's own flat bonus
      // (Regenesis pays per shed segment, Fortress per petrified one), so
      // they have to have happened before the food is priced.
      // Arc foods do not add a moving head, so they append the FULL growth
      // amount rather than `base - 1`. This must use the same pre-food length
      // as the settlement fold; otherwise PRIMAL's degressive profile would
      // downshift at a different food after an arc.
      const lengthBeforeFood = this.modelledLength();
      const growth =
        baseGrowthForFood(this.growth, n, this.ruleset.id, lengthBeforeFood) +
        (this.hasGene('overgrowth')
          ? MUTATION_PHYSICS.overgrowthExtraSegments
          : 0) +
        (this.hasGene('bulk_up') ? GENE_PHYSICS.bulkUpExtraSegments : 0) +
        (this.anomaly === 'overgrown'
          ? ANOMALY_PHYSICS.overgrownExtraSegments
          : 0);
      const tail = this.state.snake[this.state.snake.length - 1];
      for (let segment = 0; segment < growth; segment += 1) {
        this.state.snake.push({ ...tail });
      }
      this.applyShedMoves(n);
      this.applyPetrify(n);
      const { dnaValue, scoreValue } = this.resolveFoodEconomy(n);
      this.state.dnaCollected += dnaValue;
      this.state.score += scoreValue;
      this.speed = this.effectiveSpeedForFood(n);
      this.refreshHoldBudget();
      this.emit('arcCollected', {
        position: { x: food.x, y: 0, z: food.z },
        foodEaten: n,
        dna: this.state.dnaCollected,
      });
    }
    if (this.state.foods.length > 0) {
      this.state.food = { ...this.state.foods[0] };
    }
  }

  /**
   * Traverse a gilded cell: +2 flat DNA, cell consumed (AURUM claim).
   * A cell dropped THIS tick (ticks still at full lifetime) never pays -
   * the head is standing on the food it just ate; RE-traversal is the
   * mechanic.
   */
  private tryConsumeGildedCell(head: Position | undefined): void {
    if (!head || this.state.gildedCells.length === 0) return;
    const index = this.state.gildedCells.findIndex(
      (c) =>
        c.x === head.x &&
        c.z === head.z &&
        c.ticks < STRAIN_PHYSICS.gildedCellLifetimeTicks
    );
    if (index < 0) return;
    this.state.gildedCells.splice(index, 1);
    this.state.dnaCollected += STRAIN_ECONOMICS.aurumWakeCellFlat;
    const claims = this.state.genomeClaims;
    claims.aurumWakeDna =
      (claims.aurumWakeDna ?? 0) + STRAIN_ECONOMICS.aurumWakeCellFlat;
    this.emit('gildedPaid', {
      position: { ...head },
      total: claims.aurumWakeDna,
    });
  }

  /** Append logical segments at the current tail without moving the body. */
  private growTail(segments: number): void {
    const tail = this.state.snake[this.state.snake.length - 1];
    if (!tail) return;
    for (let index = 0; index < segments; index += 1) {
      this.state.snake.push({ ...tail });
    }
  }

  /** Whether this move may bite the deployed tail tip under the cadence cap. */
  private canOuroborosBite(newHead: Position): boolean {
    if (!this.genomeActive() || this.strainTierNow('FERAL') < 3) return false;
    const tail = this.state.snake[this.state.snake.length - 1];
    if (!tail || tail.x !== newHead.x || tail.z !== newHead.z) return false;
    // Newly grown segments begin stacked on the tail cell. That cell is not a
    // real, vacating TIP until only the last segment occupies it; allowing a
    // bite sooner would leave the head overlapped by its own body.
    const beforeTail = this.state.snake[this.state.snake.length - 2];
    if (beforeTail && beforeTail.x === tail.x && beforeTail.z === tail.z) {
      return false;
    }
    const apexAt = this.activations?.FERAL.apexAt ?? 0;
    const bitesSoFar = this.ouroborosBites;
    const biteCap = Math.floor(
      Math.max(0, this.state.foodEaten - apexAt) /
        STRAIN_ECONOMICS.ouroborosFoodsPerBite
    );
    return bitesSoFar < biteCap;
  }

  /** Commit the bite after the ordinary move has vacated the old tail cell. */
  private commitOuroborosBite(newHead: Position): void {
    this.ouroborosBites += 1;
    this.growTail(STRAIN_PHYSICS.ouroborosGrowthPerBite);
    this.state.pressureEvents.push({
      atFood: this.state.foodEaten,
      source: 'ouroboros',
    });
    this.state.dnaCollected += STRAIN_ECONOMICS.ouroborosBiteFlat;
    const claims = this.state.genomeClaims;
    claims.ouroborosDna =
      (claims.ouroborosDna ?? 0) + STRAIN_ECONOMICS.ouroborosBiteFlat;
    this.emit('ouroborosBite', {
      position: { ...newHead },
      total: claims.ouroborosDna,
    });
  }

  /** FERAL Minor: cancel one self-hit and charge +8 permanent length. */
  private triggerThickHide(collisionPosition: Position): void {
    this.state.thickHideAvailable = false;
    this.growTail(STRAIN_PHYSICS.thickHideGrowth);
    this.state.pressureEvents.push({
      atFood: this.state.foodEaten,
      source: 'thick_hide',
    });
    this.emit('thickHideTriggered', {
      position: { ...this.state.snake[0] },
      collision: { ...collisionPosition },
    });
  }

  /**
   * Self-collision check with the genome survival layers applied:
   * Phantom Coil (UMBRA expression) phases through the whole tail for 3
   * ticks after every eat; Serpentine exempts the last 5 tail segments.
   */
  private checkSelfCollisionForDeath(pos: Position): boolean {
    if (this.state.revivePhaseTicksRemaining > 0) return false;
    if (!this.genomeActive()) return this.checkSelfCollision(pos);
    if (
      this.state.phantomTicksRemaining > 0 &&
      this.strainTierNow('UMBRA') >= 2
    ) {
      return false;
    }
    const safeTail = this.hasGene('serpentine')
      ? GENE_PHYSICS.serpentineSafeTailSegments
      : 0;
    const body =
      safeTail > 0
        ? this.state.snake.slice(
            0,
            Math.max(1, this.state.snake.length - safeTail)
          )
        : this.state.snake;
    return body.some((s) => s.x === pos.x && s.z === pos.z);
  }

  /** The revive that would fire now, honoring one-revive-per-run. */
  private availableReviveKind(): GenomeRevive['kind'] | null {
    if (this.state.revive !== null) return null;
    if (this.genomeV2Active()) {
      const life = this.state.genomeV2?.secondLife;
      return life && !life.consumed ? 'phoenix' : null;
    }
    if (!this.genomeActive()) {
      return this.state.phoenixAvailable ? 'phoenix' : null;
    }
    const splices = new Set(this.state.fusedSplices.map((s) => s.id));
    if (this.state.phoenixAvailable) {
      if (splices.has('splice_styx_contract')) return 'styx';
      if (splices.has('splice_molted_rebirth')) return 'molted';
      return 'phoenix';
    }
    if (this.strainTierNow('UMBRA') >= 3) return 'second_sun';
    return null;
  }

  /**
   * Fire the run's one revive: rewind 3 cells at unchanged length, then grant
   * a short self/body-wall phase. Classic Phoenix voids economic benefits;
   * Styx / Molted Rebirth / Second Sun keep them (their headline). A
   * Second Sun revive pays +150 flat (bounded-trust claim).
   */
  private triggerRevive(
    kind: GenomeRevive['kind'],
    collisionPosition: Position
  ): void {
    this.state.phoenixAvailable = false;
    this.state.revive = { kind, atFood: this.state.foodEaten };
    if (kind === 'phoenix') {
      this.state.phoenixTriggeredAtFood = this.state.foodEaten;
    }
    if (kind === 'second_sun') {
      this.state.dnaCollected += STRAIN_ECONOMICS.secondSunTriggerFlat;
      this.state.genomeClaims.secondSunTriggered = true;
    }
    const genomeV2Phoenix =
      this.genomeV2Active() && kind === 'phoenix'
        ? (this.genomeV2Runtime?.recordPhoenix(this.replayTicks) ?? null)
        : null;
    if (this.genomeV2Active() && kind === 'phoenix' && !genomeV2Phoenix) {
      throw new Error('Genome v2 Phoenix reducer rejected a live revive.');
    }
    this.rebirthBody(genomeV2Phoenix?.effect.rewindSegments);
    if (this.genomeV2Active() && kind === 'phoenix') {
      this.growTail(genomeV2Phoenix!.bodyGrowthDelta);
      this.syncGenomeV2State();
      this.state.revivePhaseTicksRemaining = genomeV2Phoenix!.effect.phaseTicks;
    } else {
      this.state.revivePhaseTicksRemaining = MUTATION_PHYSICS.revivePhaseTicks;
    }
    this.emit('reviveTriggered', {
      kind,
      atFood: this.state.revive.atFood,
      position: { ...this.state.snake[0] },
      collision: { ...collisionPosition },
    });
    if (kind === 'phoenix') {
      this.emit('phoenixTriggered', {
        atFood: this.state.phoenixTriggeredAtFood,
        position: { ...this.state.snake[0] },
        collision: { ...collisionPosition },
      });
    }
  }

  private genomeV2RouteBlockedCells(): Array<{ x: number; z: number }> {
    const permanent = (this.state.genomeV2?.permanentTerrain ?? []).flatMap(
      (fact) => fact.cells
    );
    return [
      ...this.state.snake.slice(1).map((cell) => ({ x: cell.x, z: cell.z })),
      ...this.state.terrain.map((cell) => ({ x: cell.x, z: cell.z })),
      ...permanent.map((cell) => ({ x: cell.x, z: cell.z })),
    ];
  }

  /** Emit one cadence-eligible spawn fact for every real food, including each Star. */
  private registerGenomeV2Targets(foods: Position[]): void {
    const runtime = this.genomeV2Runtime;
    const head = this.state.snake[0];
    if (!runtime || !head) return;
    const currentCrownWave =
      this.ruleset.id === 'COSMIC' &&
      runtime.hasGene('constellation_crown') &&
      foods.length >= 2 &&
      runtime.getState().crownWave === null;
    const currentTargetIds: string[] = [];
    const baseBlocked = this.genomeV2RouteBlockedCells();

    for (let index = 0; index < foods.length; index += 1) {
      const food = foods[index];
      const projection = runtime.projectNextTarget(true);
      const blocked = [
        ...baseBlocked,
        ...foods
          .filter((_, otherIndex) => otherIndex !== index)
          .map((cell) => ({ x: cell.x, z: cell.z })),
        ...this.genomeV2ReservedTargetCells(),
      ];
      const route = shortestGenomeV2Route(
        this.gridSize,
        head,
        food,
        blocked,
        this.ruleset.torus === true
      );
      if (!route) {
        throw new Error('Genome v2 food spawned without a safe target route.');
      }

      let cell = { x: food.x, z: food.z };
      let secondaryCell: { x: number; z: number } | null = null;
      let optionalRouteCells:
        readonly [{ x: number; z: number }, { x: number; z: number }] | null =
        null;
      let shortestSafeMoves = Math.max(0, route.length - 1);

      if (projection.requiresSecondaryCell) {
        const circuit = genomeV2CircuitRoute(
          this.gridSize,
          head,
          food,
          blocked,
          this.ruleset.torus === true
        );
        if (!circuit) {
          throw new Error('Genome v2 Circuit has no legal relay geometry.');
        }
        secondaryCell = { x: food.x, z: food.z };
        cell = { ...circuit.relay };
        shortestSafeMoves = circuit.shortestSafeMoves;
        foods[index] = { ...cell, y: 0 };
      }

      if (projection.requiresOptionalRouteCells) {
        optionalRouteCells = genomeV2PhaseRoute(
          this.gridSize,
          head,
          cell,
          blocked,
          this.ruleset.torus === true
        );
        if (!optionalRouteCells) {
          throw new Error(
            'Genome v2 Phase contract has no legal gate geometry.'
          );
        }
      }

      const spawned = runtime.spawnTarget(this.replayTicks, {
        cell,
        secondaryCell,
        optionalRouteCells,
        speedAtSpawnMs: this.getSpeed(),
        shortestSafeMoves,
        cadenceEligible: true,
        crownRole: currentCrownWave ? 'current' : null,
      });
      currentTargetIds.push(spawned.targetId);
    }

    if (currentCrownWave && currentTargetIds.length >= 2) {
      const futureCell = this.chooseGenomeV2CrownPreviewCell();
      let futureTargetId: string | null = null;
      if (futureCell) {
        const route = shortestGenomeV2Route(
          this.gridSize,
          head,
          futureCell,
          [
            ...baseBlocked,
            ...foods.map((cell) => ({ x: cell.x, z: cell.z })),
            ...this.genomeV2ReservedTargetCells(),
          ],
          true
        );
        const future = runtime.spawnTarget(this.replayTicks, {
          cell: futureCell,
          speedAtSpawnMs: this.getSpeed(),
          shortestSafeMoves: Math.max(0, (route?.length ?? 1) - 1),
          cadenceEligible: false,
          crownRole: 'future',
        });
        futureTargetId = future.targetId;
      }
      if (
        !runtime.openCrownWave(
          this.replayTicks,
          currentTargetIds,
          futureTargetId
        )
      ) {
        throw new Error(
          'Genome v2 Crown wave could not bind its target geometry.'
        );
      }
    }
    if (foods.length > 0) this.state.food = { ...foods[0] };
    this.syncGenomeV2State();
  }

  private genomeV2ReservedTargetCells(): Array<{ x: number; z: number }> {
    return Object.values(this.genomeV2Runtime?.getState().targets ?? {})
      .filter((target) => ['active', 'armed'].includes(target.lifecycle))
      .flatMap((target) => [
        { ...target.cell },
        ...(target.secondaryCell ? [{ ...target.secondaryCell }] : []),
        ...(target.optionalRouteCells
          ? target.optionalRouteCells.map((cell) => ({ ...cell }))
          : []),
      ]);
  }

  private chooseGenomeV2CrownPreviewCell(): { x: number; z: number } | null {
    const head = this.state.snake[0];
    if (!head) return null;
    const blocked = this.waveBlockedGrid();
    for (const food of this.state.foods) {
      markBlocked(blocked, this.gridSize, food.x, food.z);
    }
    for (const cell of this.genomeV2ReservedTargetCells()) {
      markBlocked(blocked, this.gridSize, cell.x, cell.z);
    }
    return chooseSurvivableTargetCell(
      this.gridSize,
      head,
      blocked,
      this.rng,
      this.state.snake.length
    );
  }

  private spawnGenomeV2CrownStar(cell: { x: number; z: number }): void {
    const runtime = this.genomeV2Runtime;
    const head = this.state.snake[0];
    if (!runtime || !head) return;
    const route = shortestGenomeV2Route(
      this.gridSize,
      head,
      cell,
      this.genomeV2RouteBlockedCells(),
      true
    );
    this.state.foods = [{ ...cell, y: 0 }];
    this.state.food = { ...this.state.foods[0] };
    runtime.spawnTarget(this.replayTicks, {
      cell,
      speedAtSpawnMs: this.getSpeed(),
      shortestSafeMoves: Math.max(0, (route?.length ?? 1) - 1),
      cadenceEligible: false,
      crownRole: 'crown',
    });
    const window = this.constellationWindowTicks();
    this.state.constellationWindowTicks = window;
    this.state.constellationTicksRemaining = window;
    this.syncGenomeV2State();
  }

  private expireDisplacedGenomeV2Targets(
    foods: readonly Position[],
    options: { terminal?: boolean } = {}
  ): void {
    const runtime = this.genomeV2Runtime;
    if (!runtime) return;
    for (const food of foods) {
      const target = runtime.targetAt(food);
      if (!target) continue;
      if (target.kind === 'gold_trail' && target.forkChoice === null) {
        runtime.chooseGildedFork(target.targetId, 'ordinary', this.replayTicks);
      }
      const deferredUnits = runtime.collectedUnitsForTargetResolution(
        target.targetId,
        'expired'
      );
      if (deferredUnits > 0) this.applyDeferredGenomeV2FoodUnit();
      const result = runtime.resolveTarget(target.targetId, this.replayTicks, {
        resolution: 'expired',
        movesUsed: Math.max(0, this.replayTicks - target.spawnTick),
        baseYield: 0,
        pressureBps: Math.round(
          this.getBoardPressure().committedOccupancy * 10_000
        ),
      });
      if (result && result.collectedUnits !== deferredUnits) {
        throw new Error(
          'Genome v2 target resolution changed its collected-unit fact.'
        );
      }
      if (result && result.bodyGrowthDelta > 0) {
        this.growTail(result.bodyGrowthDelta);
      }
      if (deferredUnits > 0 && !options.terminal) {
        this.advancePortalSchedule(this.state.foodEaten);
        this.maybeOpenGenomeV2CadenceOffer();
      }
    }
    runtime.failCrownWave(this.replayTicks);
    this.syncGenomeV2State();
  }

  /**
   * Circuit leg one is a collected unit even when the linked route later
   * burns. Its Yield remains zero, but ordinary growth, Score, arena cadence,
   * and replay food count must still match the reducer's canonical foodCount.
   */
  private applyDeferredGenomeV2FoodUnit(): void {
    const lengthBeforeFood = this.modelledLength();
    this.state.foodEaten += 1;
    const n = this.state.foodEaten;
    this.lengthTrace.lengthAtEat[n] = lengthBeforeFood;
    this.recordRunEvent({ t: this.runTimeDs(), e: 'f', n });
    const growth =
      baseGrowthForFood(this.growth, n, this.ruleset.id, lengthBeforeFood) +
      (this.hasGene('bulk_up') ? GENE_PHYSICS.bulkUpExtraSegments : 0) +
      (this.anomaly === 'overgrown'
        ? ANOMALY_PHYSICS.overgrownExtraSegments
        : 0);
    this.growTail(growth);
    this.placeDueTerrain();
    this.applyShedMoves(n);
    this.applyPetrify(n);
    const { scoreValue } = this.resolveFoodEconomy(n);
    this.state.score += scoreValue;
    this.ticksSinceAnyEat = 0;
    this.speed = this.effectiveSpeedForFood(n);
    this.refreshHoldBudget();
  }

  private resolveCollectedGenomeV2Target(
    position: Position,
    dnaValue: number
  ): number {
    const runtime = this.genomeV2Runtime;
    const target = runtime?.targetAt(position);
    if (!runtime || !target) return 0;
    // Gilded Fork's explicit greedy choice may be made while routing. If the
    // player simply collects the ordinary target, that physical choice is
    // recorded canonically before resolution instead of throwing at the eat.
    if (target.kind === 'gold_trail' && target.forkChoice === null) {
      runtime.chooseGildedFork(target.targetId, 'ordinary', this.replayTicks);
    }
    const result = runtime.resolveTarget(target.targetId, this.replayTicks, {
      resolution: 'collected',
      movesUsed: Math.max(0, this.replayTicks - target.spawnTick),
      baseYield: genomeV2Yield(dnaValue),
      pressureBps: Math.round(
        this.getBoardPressure().committedOccupancy * 10_000
      ),
    });
    if (!result) return 0;
    this.syncGenomeV2State();
    // The reducer is the one live economic truth. Score remains independent.
    this.state.dnaCollected = genomeV2YieldFloor(
      this.state.genomeV2?.ledger.bankableYield ?? 0
    );
    return result.bodyGrowthDelta;
  }

  private maybeOpenGenomeV2CadenceOffer(): void {
    const runtime = this.genomeV2Runtime;
    if (!runtime) return;
    const offer = runtime.openCadenceOffer(
      this.replayTicks,
      this.state.foodEaten
    );
    if (!offer) return;
    this.syncGenomeV2State();
    this.emit('mutationChoice', {
      options: [...offer.candidates],
      source: 'cadence',
      offerId: offer.offerId,
      rulesVersion: GENOME_RULES_V2,
    });
  }

  private maybeSealGenomeV2Coil(): void {
    const runtime = this.genomeV2Runtime;
    const reducer = runtime?.getState();
    if (!runtime || !reducer) return;
    const coilReady =
      runtime.hasMechanic('coilkeeper') &&
      reducer.coilCharge >= GENOME_V2_CONFIG.coilkeeper.chargeFoods;
    const heartwood = runtime.hasGene('heartwood');
    const feralTerritory = runtime.hasLadderTier(
      'FERAL',
      GENOME_V2_STRAIN_THRESHOLDS.expression
    );
    if (!coilReady && !heartwood && !feralTerritory) return;
    const occupied = [
      ...this.state.snake.map((cell) => ({ x: cell.x, z: cell.z })),
      ...this.state.terrain.map((cell) => ({ x: cell.x, z: cell.z })),
      ...reducer.permanentTerrain.flatMap((fact) => fact.cells),
    ];
    const protectedCells = [
      ...this.state.foods.map((cell) => ({ x: cell.x, z: cell.z })),
      ...(this.state.exitTile
        ? [{ x: this.state.exitTile.x, z: this.state.exitTile.z }]
        : []),
      ...(this.state.exitTile2
        ? [{ x: this.state.exitTile2.x, z: this.state.exitTile2.z }]
        : []),
      ...(this.state.mutationTile
        ? [{ x: this.state.mutationTile.x, z: this.state.mutationTile.z }]
        : []),
      ...this.genomeV2ReservedTargetCells(),
    ];
    const enclosed = enclosedGenomeV2Cells(
      this.gridSize,
      occupied,
      protectedCells,
      this.ruleset.torus === true
    );
    if (enclosed.length === 0) return;

    if (
      coilReady &&
      enclosed.length >= GENOME_V2_CONFIG.coilkeeper.minimumSealedCells
    ) {
      if (!runtime.recordCoilSeal(this.replayTicks, enclosed)) {
        throw new Error('Genome v2 reducer rejected a live Coil seal.');
      }
      // Recovery geometry is measured after the sealed cells become terrain.
      this.syncGenomeV2State();
    }

    const claimed = new Set(
      reducer.territories.flatMap((territory) =>
        territory.cells.map((cell) => cellKey(cell.x, cell.z))
      )
    );
    const newlyEnclosed = enclosed.filter(
      (cell) => !claimed.has(cellKey(cell.x, cell.z))
    );
    const territoryMinimum = heartwood
      ? GENOME_V2_CONFIG.signatures.heartwoodMinimumCells
      : GENOME_V2_CONFIG.coilkeeper.minimumSealedCells;
    const recoveryExitCount = this.genomeV2RecoveryExitCount();
    if (
      (heartwood || feralTerritory) &&
      newlyEnclosed.length >= territoryMinimum &&
      recoveryExitCount > 0
    ) {
      if (
        !runtime.recordTerritory(this.replayTicks, {
          cells: newlyEnclosed,
          recoveryExitCount,
          source: heartwood ? 'heartwood' : 'feral_ladder',
        })
      ) {
        throw new Error('Genome v2 reducer rejected live territory facts.');
      }
    }
    this.syncGenomeV2State();
  }

  /** Replay-derived proof that a recovered coil leaves at least one safe move. */
  private genomeV2RecoveryExitCount(): number {
    const head = this.state.snake[0];
    if (!head) return 0;
    let exits = 0;
    for (const direction of ['UP', 'RIGHT', 'DOWN', 'LEFT'] as const) {
      let cell = this.getNextPosition(head, direction);
      if (!this.isInBounds(cell)) {
        if (!this.ruleset.torus) continue;
        cell = this.wrapPosition(cell);
      }
      if (!this.checkSelfCollision(cell) && !this.isPositionOnTerrain(cell)) {
        exits += 1;
      }
    }
    return exits;
  }

  /**
   * Spawn all foods for a new wave: one food normally, a pair under Splitter,
   * a SCATTERED constellation on COSMIC.
   *
   * THE OCCUPANCY GRID IS BUILT ONCE PER WAVE, NOT ONCE PER FOOD. That is the
   * shape the owner asked for (2026-07-28: food count must stay "a cheap
   * configuration change", never a rewrite): a wave of N is N placer calls
   * that each exclude what the previous ones placed, with no branch anywhere
   * on the count. Raising `simultaneousFoods` costs one more call and one more
   * `markBlocked`; it does not cost a second code path.
   *
   * COSMIC keeps wave semantics - the constellation IS the wave, and its
   * window is what makes the dynasty - so its size comes from the ruleset and
   * never from the growth profile. The other two get the profile's count,
   * which WP-3.06 returns to one (owner: "what i certainly don't like are the
   * 3 foods on the screen"). Collapsing this to one unconditionally would
   * silently delete a dynasty's identity.
   */
  private spawnFoods(): void {
    const constellation = this.ruleset.constellation;
    const target = Math.max(
      1,
      (constellation
        ? constellation.size +
          // Starweaver (COSMIC M3): one more star to route through, at the
          // cost of a second off the window.
          (this.hasMutation('starweaver')
            ? MUTATION_PHYSICS.starweaverExtraGroupFood
            : 0) -
          // Constellation Crown (COSMIC's signature gene): fewer stars, a
          // longer window - the terraformer's build, clearing waves clean.
          (this.genomeV2Runtime?.hasGene('constellation_crown') === true ||
          this.hasGene('constellation_crown')
            ? GENE_PHYSICS.crownConstellationStarPenalty
            : 0)
        : Math.max(1, this.growth.simultaneousFoods)) +
        (this.hasMutation('splitter') ? 1 : 0)
    );

    if (constellation) {
      this.state.constellationGlyph = Math.floor(
        this.rng() * constellation.glyphCount
      );
    }

    const blocked = this.waveBlockedGrid();
    const head = this.state.snake[0] ?? { x: 0, y: 0, z: 0 };
    // Food search difficulty reads cells already COMMITTED to the body or
    // terrain, not raw segment count. Fortress therefore cannot make a board
    // look roomier by moving six segments from the live array into stone, and
    // stacked growth on one tail cell does not pretend to occupy six cells.
    const occupancy = this.getBoardPressure().committedOccupancy;
    // The region a food sits in must hold the body that comes to get it.
    // Owner, after losing a run to it: "that food was reachable, but you
    // couldn't get out alive - there was no escape path. I had to crash into
    // myself, but I got the food first."
    const escape = this.state.snake.length;
    // COSMIC SCATTERS RATHER THAN CLUSTERS (WP-3.13). The placer's `anchor`
    // parameter exists to keep a group chaseable within `groupRadius` of its
    // first food, and that is the opposite of what a constellation now needs:
    // a pile is not a routing problem. So no anchor is passed, and the
    // separation is expressed the only other way the placer understands - by
    // BLOCKING the neighbourhood of each star before the next one is drawn.
    //
    // Two grids, because the separation is a PREFERENCE rather than a
    // requirement: a late-run board can be too full to honour it, and refusing
    // to place a star at all would be a worse failure than a close pair.
    const spaced = constellation ? this.spacedGrid(blocked) : null;
    const scatter = this.constellationScatterCells();

    const foods: Position[] = [];
    for (let i = 0; i < target; i++) {
      const cell =
        (spaced && i > 0
          ? chooseFoodCell(
              this.gridSize,
              head,
              spaced,
              occupancy,
              this.rng,
              null,
              escape
            )
          : null) ??
        chooseFoodCell(
          this.gridSize,
          head,
          blocked,
          occupancy,
          this.rng,
          null,
          escape
        );
      // `null` means the board holds no free cell at all - the player has
      // filled it. Placing nothing is the honest answer; the wave carries
      // whatever it managed to place.
      if (cell === null) break;
      markBlocked(blocked, this.gridSize, cell.x, cell.z);
      if (spaced) {
        markBlocked(spaced, this.gridSize, cell.x, cell.z);
        this.markScatterZone(spaced, cell.x, cell.z, scatter);
      }
      foods.push({ x: cell.x, y: 0, z: cell.z });
    }
    this.state.foods = foods;
    if (foods.length > 0) this.state.food = { ...foods[0] };
    this.registerGenomeV2Targets(foods);

    // The window opens with the wave and closes on whatever is left.
    if (constellation) {
      const window = this.constellationWindowTicks();
      this.state.constellationWindowTicks = window;
      this.state.constellationTicksRemaining = window;
    }

    // Meteor Shower (anomaly): every fresh wave gets a 60-tick fuse
    this.state.foodTicksRemaining =
      this.anomaly === 'meteor_shower'
        ? ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
        : 0;
  }

  /**
   * The live constellation window in ticks, at the live tick rate.
   *
   * Authored in seconds and converted here rather than stored in ticks, so
   * the window cannot silently shrink if COSMIC's tempo is ever retuned -
   * the exact rot that cost the extraction window three quarters of its real
   * duration as CYBER accelerated.
   */
  private constellationWindowTicks(): number {
    const constellation = this.ruleset.constellation;
    if (!constellation) return 0;
    const seconds =
      constellation.windowSeconds +
      (this.genomeV2Runtime?.hasGene('constellation_crown') === true ||
      this.hasGene('constellation_crown')
        ? GENE_PHYSICS.crownConstellationWindowSeconds
        : 0) -
      (this.hasMutation('starweaver')
        ? MUTATION_PHYSICS.starweaverWindowSecondsPenalty
        : 0);
    return formingTicksForSeconds(Math.max(1, seconds), this.getSpeed());
  }

  /**
   * The minimum toroidal Manhattan separation stars are placed at.
   *
   * Event Horizon (COSMIC M9) widens it: more thinking time, but the route
   * between the stars is longer, so the same window buys less.
   */
  private constellationScatterCells(): number {
    const constellation = this.ruleset.constellation;
    if (!constellation) return 0;
    return (
      constellation.scatterMinCells +
      (this.hasMutation('event_horizon')
        ? MUTATION_PHYSICS.eventHorizonScatterPenalty
        : 0)
    );
  }

  /**
   * THE COSMIC MECHANIC (DYNASTY_COSMIC §2.2): the window closed, so every
   * star still on the board calcifies on its own cell and a fresh
   * constellation appears.
   *
   * RULE 15, and why this is the terrain primitive rather than something new.
   * Debris is ADDED and never removed - no gene, tier, splice, revive or rung
   * clears one - so free space only ever shrinks. `tickTerrain` also refuses
   * to solidify a cell the snake occupies, which is what makes a star that
   * calcifies under the body fair rather than a random death.
   *
   * Exactly ONE block, on the missed star's OWN cell. §2.4 makes that binding
   * rather than convenient: the player is choosing where to build, and a
   * placement they cannot predict is not a choice - it is the death spiral
   * this design exists to avoid.
   */
  private calcifyConstellation(): void {
    const constellation = this.ruleset.constellation;
    if (!constellation) return;
    const missed = this.state.foods;
    this.expireDisplacedGenomeV2Targets(missed);
    this.state.constellationTicksRemaining = 0;
    if (missed.length > 0) {
      this.placeTerrainAt(
        missed,
        constellation.calcifySeconds +
          // Event Horizon (COSMIC M9): the corpse stays crossable longer.
          (this.hasMutation('event_horizon')
            ? MUTATION_PHYSICS.eventHorizonCalcifySecondsBonus
            : 0),
        'cosmic'
      );
      this.emit('constellationCalcified', {
        cells: missed.map((s) => ({ x: s.x, z: s.z })),
      });
    }
    // A fresh constellation immediately: the board is never foodless, and the
    // next window starts from the head the last one left the player with.
    this.spawnFoods();
  }

  /**
   * A copy of the wave's occupancy grid that the SCATTER rule may also write
   * to, leaving the real one untouched.
   *
   * Held on the instance and copied rather than reallocated, for the reason
   * `waveBlockedGrid` gives: `foldParity.test.ts` runs a 400x400 board, and a
   * fresh array per wave throws off gigabytes of garbage across its sweep.
   */
  private spacedGrid(blocked: Uint8Array): Uint8Array {
    if (!this.spacedScratch || this.spacedScratch.length !== blocked.length) {
      this.spacedScratch = new Uint8Array(blocked.length);
    }
    this.spacedScratch.set(blocked);
    return this.spacedScratch;
  }

  /**
   * Block the Manhattan ball of radius `scatter - 1` around a placed star, so
   * the next one cannot land inside it.
   *
   * Manhattan because the snake moves orthogonally, so the radius is literally
   * the tick cost of travelling between two stars - which is the derivation
   * behind COSMIC's re-authored food-rate bound, and the reason the separation
   * is a distance rather than a bounding box.
   *
   * It WRAPS, because the board does. Blocking a square that stops at the edge
   * would let two stars sit one step apart across the seam while reading as
   * nineteen cells apart, and the seam is exactly where the scatter rule is
   * trying to make the route interesting.
   */
  private markScatterZone(
    grid: Uint8Array,
    x: number,
    z: number,
    scatter: number
  ): void {
    const reach = scatter - 1;
    if (reach <= 0) return;
    const wrap = this.ruleset.torus === true;
    for (let dx = -reach; dx <= reach; dx++) {
      const room = reach - Math.abs(dx);
      for (let dz = -room; dz <= room; dz++) {
        const cx = wrap
          ? (((x + dx) % this.gridSize) + this.gridSize) % this.gridSize
          : x + dx;
        const cz = wrap
          ? (((z + dz) % this.gridSize) + this.gridSize) % this.gridSize
          : z + dz;
        markBlocked(grid, this.gridSize, cx, cz);
      }
    }
  }

  /**
   * The wave's occupancy grid: every cell food may not occupy.
   *
   * Cached on the instance and cleared rather than reallocated. At the shipped
   * `gridSize` of 20 that is 400 bytes and the distinction is academic, but
   * `foldParity.test.ts` runs a 400x400 board and allocating per wave there
   * throws off gigabytes of garbage across the sweep.
   *
   * Walk the OBJECTS, never probe every cell: `isPositionOnTerrain` is a scan,
   * so a per-cell probe would be O(gridSize^2 x terrain).
   */
  private waveBlockedGrid(): Uint8Array {
    const cells = Math.max(0, this.gridSize * this.gridSize);
    if (!this.blockedScratch || this.blockedScratch.length !== cells) {
      this.blockedScratch = blockedGrid(this.gridSize);
    } else {
      this.blockedScratch.fill(0);
    }
    const blocked = this.blockedScratch;

    for (const segment of this.state.snake) {
      markBlocked(blocked, this.gridSize, segment.x, segment.z);
    }
    // Terrain is part of the board now: food inside a block is unreachable,
    // and an unreachable food is dead time - the exact cost this wave exists
    // to remove. Exits and the mutation tile must not be buried either.
    for (const block of this.state.terrain) {
      markBlocked(blocked, this.gridSize, block.x, block.z);
    }
    for (const fact of this.state.genomeV2?.permanentTerrain ?? []) {
      for (const cell of fact.cells) {
        markBlocked(blocked, this.gridSize, cell.x, cell.z);
      }
    }
    this.markClosingRing(blocked);
    if (this.state.exitTile) {
      markBlocked(
        blocked,
        this.gridSize,
        this.state.exitTile.x,
        this.state.exitTile.z
      );
    }
    if (this.state.exitTile2) {
      markBlocked(
        blocked,
        this.gridSize,
        this.state.exitTile2.x,
        this.state.exitTile2.z
      );
    }
    if (this.state.mutationTile) {
      markBlocked(
        blocked,
        this.gridSize,
        this.state.mutationTile.x,
        this.state.mutationTile.z
      );
    }
    for (const cell of this.genomeV2ReservedTargetCells()) {
      markBlocked(blocked, this.gridSize, cell.x, cell.z);
    }
    return blocked;
  }

  /**
   * Manhattan distance ON THE TORUS: the shorter of the two ways round each
   * axis. The plain difference would be wrong on COSMIC in the case that
   * matters most - two cells one step apart across the seam read as a board
   * apart - and it is exactly those pairs the scatter rule is measuring.
   */
  private torusManhattan(a: Position, b: Position): number {
    const dx = Math.abs(a.x - b.x);
    const dz = Math.abs(a.z - b.z);
    const wrap = this.ruleset.torus;
    return (
      (wrap ? Math.min(dx, this.gridSize - dx) : dx) +
      (wrap ? Math.min(dz, this.gridSize - dz) : dz)
    );
  }

  /**
   * Block the ring the arena is currently filling from food placement.
   *
   * Owner, on first play of CYBER's arena: *"it's quite tricky if you place
   * food in the outer ring where the blocks are already, because you just
   * crash into a new block if you just happen to be there where the block
   * spawns in that moment - feels unfair."*
   *
   * They are right, and the unfairness is specifically a LURE. The arena is not
   * unfair on its own: blocks telegraph as a harmless forming decal for two
   * seconds and only turn lethal once the cell is clear of the snake, so a
   * player who chooses to be in the ring accepted that. But food is not a
   * choice - it is the one thing on the board the player MUST go to. Putting it
   * inside the closing front turns "you went somewhere dangerous" into "the
   * game sent you somewhere dangerous", which is the difference between a
   * hazard and a trap.
   *
   * Only the ACTIVE ring is excluded - the outermost one that still has free
   * cells. Completed rings are already solid terrain and blocked anyway, and
   * everything inside the front is untouched, so this costs the player about
   * one ring of board and costs the arena nothing: the schedule still closes at
   * the same rate, it just stops baiting.
   */
  private markClosingRing(blocked: Uint8Array): void {
    if (!this.ruleset.arena) return;
    const occupied = new Set<string>();
    for (const block of this.state.terrain) {
      occupied.add(cellKey(block.x, block.z));
    }
    const maxRing = Math.floor((this.gridSize - 1) / 2);
    for (let ring = 0; ring <= maxRing; ring++) {
      let free = 0;
      for (let x = ring; x < this.gridSize - ring; x++) {
        for (let z = ring; z < this.gridSize - ring; z++) {
          if (ringOf({ x, z }, this.gridSize) !== ring) continue;
          if (!occupied.has(cellKey(x, z))) free++;
        }
      }
      if (free === 0) continue;
      // The outermost ring with room left is where the next blocks land.
      for (let x = ring; x < this.gridSize - ring; x++) {
        for (let z = ring; z < this.gridSize - ring; z++) {
          if (ringOf({ x, z }, this.gridSize) !== ring) continue;
          markBlocked(blocked, this.gridSize, x, z);
        }
      }
      return;
    }
  }

  /**
   * Any terrain in this cell, forming or solid.
   *
   * Forming counts: a decal becomes lethal within a couple of seconds, and
   * food that spawns there would be a trap the player could not have read.
   */
  private isPositionOnTerrain(pos: Position): boolean {
    return (
      this.state.terrain.some((b) => b.x === pos.x && b.z === pos.z) ||
      this.isGenomeV2PermanentTerrain(pos)
    );
  }

  private isGenomeV2PermanentTerrain(pos: { x: number; z: number }): boolean {
    return (this.state.genomeV2?.permanentTerrain ?? []).some((fact) =>
      fact.cells.some((cell) => cell.x === pos.x && cell.z === pos.z)
    );
  }

  /**
   * Spawn food at random valid position(s). Public for compatibility -
   * replaces the whole wave.
   */
  spawnFood(): void {
    this.expireDisplacedGenomeV2Targets(this.state.foods);
    this.spawnFoods();
  }

  /**
   * Spawn an exit only when the board offers an honest route to it. Terrain,
   * live objectives, the body, and the arena's closing front are all occupied;
   * the destination must also sit in a free region large enough for the live
   * body to manoeuvre. The seeded rng still owns which valid cell is chosen.
   */
  private spawnExit(): void {
    const position = this.sampleExitCell(null);
    // A completely partitioned late board may have no honest portal cell.
    // Not drawing a choice is better than drawing one the player cannot take;
    // the cadence walker will retry or advance according to its existing rule.
    if (!position) return;
    this.state.exitTile = position;
    // Twin Exits (anomaly): portals spawn as a pair sharing one window
    this.state.exitTile2 =
      this.anomaly === 'twin_exits' ? this.sampleExitCell(position) : null;
    this.state.exitTicksRemaining = this.effectiveExitDespawnTicks();
    this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'spawn' });
    this.emit('exitSpawned', {
      position: { ...position },
      ...(this.state.exitTile2
        ? { position2: { ...this.state.exitTile2 } }
        : {}),
      ticksRemaining: this.state.exitTicksRemaining,
    });
  }

  /**
   * Select one reachable, escape-capable exit cell. Unlike the former
   * rejection sampler, this never returns its last illegal guess after an
   * arbitrary attempt limit.
   */
  private sampleExitCell(exclude: Position | null): Position | null {
    const head = this.state.snake[0];
    if (!head) return null;
    const cell = chooseSurvivableTargetCell(
      this.gridSize,
      head,
      this.opportunityBlockedGrid(exclude),
      this.rng,
      this.state.snake.length
    );
    return cell ? { ...cell, y: 0 } : null;
  }

  /**
   * The common fairness floor for optional opportunities. Placement remains
   * global and seeded — it may demand a dangerous break from the player's
   * route — but an objective is never buried in terrain, another objective,
   * the live body, or the arena's forming front.
   */
  private opportunityBlockedGrid(exclude: Position | null): Uint8Array {
    const blocked = this.waveBlockedGrid();
    // `waveBlockedGrid` deliberately starts before a new food wave exists in
    // its primary caller, so live food is layered here for opportunity spawns.
    for (const food of this.state.foods) {
      markBlocked(blocked, this.gridSize, food.x, food.z);
    }
    if (exclude) markBlocked(blocked, this.gridSize, exclude.x, exclude.z);
    return blocked;
  }

  /**
   * Spawn a timed gene opportunity under the same reachable/survivable rule
   * as a portal. If no honest cell exists, the food-indexed cadence retries
   * after the next eat instead of drawing an impossible temptation.
   */
  private spawnMutationFood(): void {
    const head = this.state.snake[0];
    if (!head) return;
    const cell = chooseSurvivableTargetCell(
      this.gridSize,
      head,
      this.opportunityBlockedGrid(null),
      this.rng,
      this.state.snake.length
    );
    if (!cell) return;
    const position: Position = { ...cell, y: 0 };

    this.state.mutationTile = position;
    this.state.mutationTicksRemaining = MUTATION_SPAWN.despawnTicks;
    this.emit('mutationSpawned', {
      position: { ...position },
      ticksRemaining: this.state.mutationTicksRemaining,
    });
  }

  /**
   * Place food at specific position (for testing). Replaces the whole
   * wave with this single food. On COSMIC the current group glyph is kept
   * (or rolled if none) unless an explicit glyph is given.
   */
  placeFood(position: Position, glyph?: number): void {
    this.expireDisplacedGenomeV2Targets(this.state.foods);
    this.state.foods = [{ ...position }];
    this.state.food = { ...position };
    this.registerGenomeV2Targets(this.state.foods);
    if (this.ruleset.constellation) {
      this.state.constellationGlyph =
        glyph ??
        this.state.constellationGlyph ??
        Math.floor(this.rng() * this.ruleset.constellation.glyphCount);
    }
  }

  /** Place a full food wave at specific positions (for testing). */
  placeFoods(positions: Position[], glyph?: number): void {
    if (positions.length === 0) return;
    this.expireDisplacedGenomeV2Targets(this.state.foods);
    this.state.foods = positions.map((p) => ({ ...p }));
    this.state.food = { ...positions[0] };
    this.registerGenomeV2Targets(this.state.foods);
    if (this.ruleset.constellation && glyph !== undefined) {
      this.state.constellationGlyph = glyph;
    }
  }

  /**
   * Place the exit portal at a specific position (for testing and driven
   * integration flows). Mirrors placeFood.
   */
  placeExit(
    position: Position,
    ticksRemaining?: number,
    position2?: Position
  ): void {
    this.state.exitTile = { ...position };
    this.state.exitTile2 = position2 ? { ...position2 } : null;
    this.state.exitTicksRemaining =
      ticksRemaining ?? this.effectiveExitDespawnTicks();
    this.emit('exitSpawned', {
      position: { ...position },
      ...(position2 ? { position2: { ...position2 } } : {}),
      ticksRemaining: this.state.exitTicksRemaining,
    });
  }

  /** Place the mutation food at a specific position (for testing). */
  placeMutation(position: Position, ticksRemaining?: number): void {
    this.state.mutationTile = { ...position };
    this.state.mutationTicksRemaining =
      ticksRemaining ?? MUTATION_SPAWN.despawnTicks;
    this.emit('mutationSpawned', {
      position: { ...position },
      ticksRemaining: this.state.mutationTicksRemaining,
    });
  }

  /**
   * Event system - subscribe
   */
  on(event: GameEvent, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback);
  }

  /**
   * Event system - unsubscribe
   */
  off(event: GameEvent, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: GameEvent, data?: unknown): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  private getNextPosition(pos: Position, dir: Direction): Position {
    const moves: Record<Direction, Position> = {
      UP: { x: pos.x, y: 0, z: pos.z - 1 },
      DOWN: { x: pos.x, y: 0, z: pos.z + 1 },
      LEFT: { x: pos.x - 1, y: 0, z: pos.z },
      RIGHT: { x: pos.x + 1, y: 0, z: pos.z },
    };
    return moves[dir];
  }

  /**
   * Wrap an out-of-bounds position to the opposite edge.
   *
   * Shared by COSMIC's permanent torus and by the four wall pardons that
   * borrow it (FLUX Rift Aura, Warp Skin, Pocket Rift, the Singularity well).
   */
  private wrapPosition(pos: Position): Position {
    return {
      x: ((pos.x % this.gridSize) + this.gridSize) % this.gridSize,
      y: 0,
      z: ((pos.z % this.gridSize) + this.gridSize) % this.gridSize,
    };
  }

  /**
   * Wall Rush slide: pick a perpendicular direction along the wall
   * (clockwise preferred) whose next cell is in-bounds and body-free.
   */
  private trySlide(head: Position): { dir: Direction; pos: Position } | null {
    const first = CLOCKWISE[this.state.direction];
    for (const dir of [first, OPPOSITES[first]]) {
      const pos = this.getNextPosition(head, dir);
      if (
        !this.checkWallCollision(pos) &&
        !this.checkSelfCollision(pos) &&
        !this.isPositionOnTerrain(pos)
      ) {
        return { dir, pos };
      }
    }
    return null;
  }

  /**
   * Revive physics (Phoenix and every genome revive kind): rewind the head 3
   * cells along the body and re-derive the heading. Economic voiding is the
   * caller's concern.
   *
   * RULE 15 (v1.4): the revive no longer TRUNCATES. It used to reduce the body
   * to length 8, which was the single largest length-rewind in the game - a
   * second chance that also handed back most of the board. A revive now grants
   * SURVIVAL, not a clean slate: you live, and you keep every consequence of
   * your size. `computeLengthTrace` mirrors this by doing nothing at a revive
   * index; the two models must agree, and a revive is one of the few events
   * the parity sweep cannot reach on its own.
   *
   * The rewind is kept because it is positional mercy, not length: it drops
   * the head back onto cells the body already occupies. `revivePhaseTicks`
   * then makes that intentionally overlapped state playable without clearing
   * body or terrain.
   */
  private rebirthBody(
    rewindSegments: number = MUTATION_PHYSICS.phoenixRewindCells
  ): void {
    const rewind = Math.min(
      Math.max(0, Math.floor(rewindSegments)),
      Math.max(0, this.state.snake.length - 1)
    );
    const reborn = this.state.snake.slice(rewind);
    const kept = (reborn.length > 0 ? reborn : this.state.snake).map((s) => ({
      ...s,
    }));
    // Backing the head off drops `rewind` cells, which would be a length
    // reduction - so the same count is restored at the tail. The head moves
    // back along its own path, the body keeps every segment it earned, and
    // `computeLengthTrace` is right to record no change at all.
    const grown = this.state.snake.length - kept.length;
    const tail = kept[kept.length - 1];
    for (let i = 0; i < grown; i++) kept.push({ ...tail });
    this.state.snake = kept;

    // Heading = from neck to head of the rewound body. Wrap seams (COSMIC)
    // leave adjacent segments a board apart - normalize by flipping sign.
    if (this.state.snake.length >= 2) {
      let dx = this.state.snake[0].x - this.state.snake[1].x;
      let dz = this.state.snake[0].z - this.state.snake[1].z;
      if (Math.abs(dx) > 1) dx = -Math.sign(dx);
      if (Math.abs(dz) > 1) dz = -Math.sign(dz);
      if (dx === 1) this.state.direction = 'RIGHT';
      else if (dx === -1) this.state.direction = 'LEFT';
      else if (dz === 1) this.state.direction = 'DOWN';
      else if (dz === -1) this.state.direction = 'UP';
    }
    this.clearDirectionalIntent();
  }

  /**
   * Advance terrain by one tick (WP-3.03).
   *
   * Forming blocks count down. A block whose forming has finished solidifies
   * ONLY if its cell is clear of the snake - otherwise it stays a decal and
   * waits ("pending"). That is what makes the overlap case impossible rather
   * than rare: a solid block is never under the body, so the head can never be
   * inside one, so no segment ever is.
   */
  private tickTerrain(): void {
    if (this.state.terrain.length === 0) return;
    const occupied = new Set(
      this.state.snake.map((seg) => cellKey(seg.x, seg.z))
    );
    for (const block of this.state.terrain) {
      if (block.solid) continue;
      if (block.formingTicks > 0) {
        block.formingTicks -= 1;
        continue;
      }
      if (!occupied.has(cellKey(block.x, block.z))) block.solid = true;
    }
  }

  /**
   * Place any terrain the schedule says is due (WP-3.03).
   *
   * Food-indexed, so a replay hardens the arena identically. Blocks may form
   * UNDER the snake - that is the interesting case, and `tickTerrain` keeps it
   * fair - but never on food or the exit portal, which would bury them.
   */
  private placeDueTerrain(): void {
    const schedule = this.ruleset.arena;
    if (!schedule) return;
    const due = blocksDueAt(schedule, this.state.foodEaten);
    const missing = due - this.state.terrain.length;
    if (missing <= 0) return;

    const blocked = new Set(this.state.terrain.map((b) => cellKey(b.x, b.z)));
    for (const food of this.state.foods) blocked.add(cellKey(food.x, food.z));
    if (this.state.exitTile) {
      blocked.add(cellKey(this.state.exitTile.x, this.state.exitTile.z));
    }
    if (this.state.exitTile2) {
      blocked.add(cellKey(this.state.exitTile2.x, this.state.exitTile2.z));
    }
    if (this.state.mutationTile) {
      blocked.add(
        cellKey(this.state.mutationTile.x, this.state.mutationTile.z)
      );
    }
    for (const cell of this.genomeV2ReservedTargetCells()) {
      blocked.add(cellKey(cell.x, cell.z));
    }

    this.placeTerrainAt(
      nextTerrainCells(this.gridSize, blocked, missing, this.rng),
      schedule.formingSeconds,
      schedule.source
    );
  }

  /**
   * Lay a block on each of these cells, unless one is already there.
   *
   * THE ONE PLACE A BLOCK IS EVER CREATED, and it earned that by being
   * discovered three times. WP-3.03 wrote it for CYBER's arena; WP-3.11 wrote
   * it again for Fortress's petrified segments; WP-3.13 wrote it a third time
   * for COSMIC's calcified stars - three near-identical copies of "dedupe by
   * cell, stamp a forming phase, push". They differ only in WHICH cells and
   * HOW LONG the forming phase is, so those are the two parameters and
   * nothing else is.
   *
   * The duplication was not cosmetic. `terrain.visible.test.ts` exists because
   * WP-3.03 shipped terrain lethal and undrawn, and every extra copy of this
   * loop is another place a source can be added without the renderer ever
   * hearing about it. One path means the connection is asserted once and
   * holds for every consumer, including the ladder rung that has not been
   * written yet.
   *
   * Deliberately no food/portal exclusion here: the ARENA does that itself,
   * before choosing its cells, because it picks cells it does not own.
   * Fortress and COSMIC lay stone on cells they DO own - a body segment, a
   * star - where there is nothing to bury and where skipping would be the
   * worse bug, since a cell that failed to petrify would GROW free space,
   * which is the one thing Rule 15 forbids.
   */
  private placeTerrainAt(
    cells: readonly { x: number; z: number }[],
    formingSeconds: number,
    source: TerrainSource
  ): void {
    if (cells.length === 0) return;
    const formingTicks = formingTicksForSeconds(
      formingSeconds,
      this.getSpeed()
    );
    const placed = new Set(this.state.terrain.map((b) => cellKey(b.x, b.z)));
    for (const cell of cells) {
      const key = cellKey(cell.x, cell.z);
      if (placed.has(key)) continue;
      placed.add(key);
      this.state.terrain.push({
        x: cell.x,
        z: cell.z,
        source,
        formingTicks,
        formingTotal: formingTicks,
        solid: false,
      });
    }
  }

  /** Open the choice-of-2 hold after eating the mutation food. */
  private openMutationChoice(): void {
    this.state.mutationTile = null;
    this.state.mutationTicksRemaining = 0;
    this.state.nextMutationAtFood =
      this.state.foodEaten + this.rollNextMutationInterval();

    // Genome runs: seeded gravity offers (server-verifiable trace).
    if (this.genomeActive()) {
      this.openGeneChoice('gene_food');
      return;
    }
    const offer = rollMutationOffer(
      this.state.heldMutations.map((m) => m.id).filter(isMutationId),
      this.rng,
      this.mutationPool
    );
    if (!offer) return;
    this.state.pendingChoice = offer;
    this.emit('mutationChoice', { options: [...offer] });
  }

  /**
   * Magnet Pulse / Magnetism: every food within the effective radius
   * (Chebyshev) of the head moves one cell toward it per tick along its
   * dominant axis. Pulls never move a food onto the head, the body,
   * another food, the portal, or the mutation food - blocked pulls simply
   * skip a tick.
   */
  private applyMagnetPulse(): void {
    const head = this.state.snake[0];
    if (!head) return;
    // Largest active pull radius wins - Black Magnet (4) > Gravity Well /
    // Gravity Bubble (3) > Magnet Pulse (2) > Magnetism (1); the pull
    // itself never stacks.
    const radius = this.hasSplice('splice_black_magnet')
      ? SPLICE_PHYSICS.blackMagnetPullRadius
      : this.hasMutation('gravity_well')
        ? MUTATION_PHYSICS.gravityWellRadius
        : this.hasSplice('splice_gravity_bubble')
          ? SPLICE_PHYSICS.gravityBubblePullRadius
          : this.hasMutation('magnet_pulse')
            ? MUTATION_PHYSICS.magnetRadius
            : TRAIT_PHYSICS.magnetismRadius;
    for (const food of this.state.foods) {
      const dx = head.x - food.x;
      const dz = head.z - food.z;
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      if (dist < 1 || dist > radius) continue;

      const target = { ...food };
      if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) {
        target.x += Math.sign(dx);
      } else if (dz !== 0) {
        target.z += Math.sign(dz);
      } else {
        continue;
      }

      const blocked =
        (target.x === head.x && target.z === head.z) ||
        this.isPositionOnSnake(target) ||
        this.isPositionOnExit(target) ||
        this.isPositionOnMutation(target) ||
        // Terrain is part of the board now. Without this the magnet is the
        // one thing on the board that can put food inside a block, which is
        // the same unreachable-food defect the placer exists to prevent -
        // only arrived at by pulling rather than by spawning.
        this.isPositionOnTerrain(target) ||
        this.state.foods.some(
          (f) => f !== food && f.x === target.x && f.z === target.z
        );
      if (!blocked) {
        food.x = target.x;
        food.z = target.z;
      }
    }
    // A wave can be empty - the placer returns null on a board with no free
    // cell, and Arc Lightning can clear the wave mid-tick. Spreading
    // `foods[0]` unguarded wrote `{}` into a Position and corrupted the
    // legacy single-food mirror.
    if (this.state.foods.length > 0) {
      this.state.food = { ...this.state.foods[0] };
    }
  }

  /**
   * The seeded schedule is live only when the server issued a runSeed.
   *
   * Without one there is nothing for the settlement to replay, so a legacy or
   * pre-genome run keeps the old roll-on-resolve behaviour - which is fine,
   * because the carry rides the genome path and a run with no seed never
   * reaches it.
   */
  private portalScheduleActive(): boolean {
    return this.genome !== null && !!this.genome.runSeed;
  }

  /**
   * Schedule the next door after one resolves — legacy runs only.
   *
   * Under the seeded schedule this is a no-op by design: `nextExitAtFood`
   * already points at the next scheduled door, fixed when the schedule
   * advanced past the one that just resolved. Rescheduling here would make the
   * cadence depend on WHEN the player resolved it, which is precisely the
   * tick-timing dependency that made the old schedule unreplayable.
   */
  private scheduleNextPortalAfterResolve(fromFood: number): void {
    if (this.portalScheduleActive()) return;
    this.state.nextExitAtFood = fromFood + this.rollNextExitInterval();
  }

  /**
   * Walk the food-indexed portal schedule up to food `n`.
   *
   * The recurrence here is the SAME one `portalSchedule` runs on the server;
   * this is its incremental form, because the engine learns `n` one food at a
   * time. `portals.ts` explains why the schedule stopped being "interval from
   * whenever the last door resolved" — that was a tick-timing fact the server
   * could not reconstruct, and the carry cannot be a client claim.
   *
   * A door is COUNTED whether or not it is drawn. If one is somehow still open
   * when the next comes due, the new one merges into it rather than stacking a
   * second portal on the board — but the index still advances, so the engine
   * and the settlement agree on how many doors the run met. (At the shipped
   * cadence this cannot happen: an 18-second window against an 8-16 food
   * interval leaves no overlap. It is defined because "cannot happen" is not
   * the same as "is undefined".)
   */
  private advancePortalSchedule(n: number): void {
    if (!this.portalScheduleActive()) {
      // Legacy path, unchanged.
      if (!this.state.exitTile && n >= this.state.nextExitAtFood) {
        this.spawnExit();
      }
      return;
    }
    const runSeed = this.genome!.runSeed;
    while (
      n >= this.state.nextExitAtFood &&
      this.portalIndex < PORTAL_SCHEDULE_LIMIT
    ) {
      this.portalsMet += 1;
      if (!this.state.exitTile) this.spawnExit();
      const interval =
        rollExitInterval(
          this.exitCadence(),
          portalStream(runSeed, this.portalIndex)
        ) + Math.max(0, this.portalIntervalTax(this.state.nextExitAtFood));
      this.state.nextExitAtFood += Math.max(1, interval);
      this.portalIndex += 1;
    }
  }

  /**
   * Portals this run has met — the carry's only input, and the reason the
   * schedule had to become replayable. The settlement derives the same number
   * from `(runSeed, foodCount, the taxes in force)` and never reads this; it
   * is exposed for the HUD, which has to quote the stake before the choice.
   */
  getPortalsMet(): number {
    return this.portalsMet;
  }

  /**
   * Additive interval penalties in force right now: the Magnet Pulse cost
   * (+4 foods), the Magnetism trait cost (+2), and the rest. The costs stack
   * additively - each pull source pays its own portal tax.
   *
   * Split out of `rollNextExitInterval` so the seeded schedule and the legacy
   * roll cannot drift apart, and so the server has one named thing to mirror.
   */
  private portalIntervalTax(atFood: number): number {
    return portalIntervalTax(portalTaxFactsAt(this.portalTaxSources(), atFood));
  }

  /**
   * The run data the interval tax reads, in the shape the settlement supplies
   * it. Building this rather than reading live predicates is what lets the two
   * sides share `portalTaxFactsAt` — see `portals.ts`.
   */
  private portalTaxSources(): PortalTaxSources {
    const genome = this.genomeActive();
    return {
      // Picks are NOT genome-gated: Magnet Pulse and Solstice Engine are
      // mutation-era genes and tax the interval on a legacy run too. Only the
      // strain tiers, splices and infuses below belong to the genome era.
      picks: this.state.heldMutations,
      splices: genome ? this.state.fusedSplices : [],
      traits: this.traits,
      anomaly: this.anomaly,
      infuses: genome ? this.state.infuses : [],
      fluxTierAt: (food) =>
        genome && this.activations
          ? Math.min(
              this.ftueTierCap(),
              strainTierAtFood(this.activations.FLUX, food + 0.5)
            )
          : 0,
    };
  }

  /**
   * The legacy roll: base interval plus the same taxes, from the engine's own
   * rng. Kept for runs with no seed — see `portalScheduleActive`.
   */
  private rollNextExitInterval(): number {
    return (
      rollExitInterval(this.exitCadence(), this.rng) +
      this.portalIntervalTax(this.state.foodEaten)
    );
  }

  /**
   * Genome cadence roll incl. the Patient trait cost: spawn rate -50%
   * means the universal 4-8-food interval doubles to 8-16.
   */
  private rollNextMutationInterval(): number {
    const interval = rollGeneOfferInterval(this.rng);
    return this.hasTrait('patient')
      ? interval * TRAIT_PHYSICS.patientMutationIntervalMultiplier
      : interval;
  }

  /**
   * Exit portal lifetime incl. every held portal-window mutation:
   * Gold Trail caps the window at 60 ticks, Deep Roots -10, Afterburner
   * -20 (costs), Tectonic Patience +30 (its benefit). Stacked costs are
   * floored at minExitDespawnTicks so the window never vanishes.
   */
  private effectiveExitDespawnTicks(): number {
    // WP-3.04: a ruleset may author its window in SECONDS, converted here by
    // the LIVE tick. `despawnTicks` alone is denominated in the wrong unit -
    // 90 ticks is 18.0s on PRIMAL and 4.5s at CYBER's old floor, so the
    // extraction window silently lost three quarters of its real duration as
    // the dynasty accelerated. Food has no deadline, which is exactly why
    // eating stayed possible while banking became impossible.
    const authored = this.ruleset.extraction.despawnSeconds;
    let base =
      authored !== undefined
        ? Math.max(
            1,
            Math.round((authored * 1000) / Math.max(1, this.getSpeed()))
          )
        : this.ruleset.extraction.despawnTicks;
    // WP-3.12: the ladder's "Narrow Door" rung shortens the window, and it is
    // authored in SECONDS for exactly the reason `despawnSeconds` is - a rung
    // that subtracted TICKS would shrink fourfold as CYBER accelerated, which
    // is the defect WP-3.04 removed. Converted here by the LIVE tick, on both
    // branches, so it means the same duration at every tempo. Applied to the
    // authored window before the mutation modifiers, which are ticks and stay
    // ticks; the final `minExitDespawnTicks` floor still binds the stack.
    const rungSeconds = ladderParams(this.ladderRung).portalWindowSecondsDelta;
    if (rungSeconds !== 0) {
      base = Math.max(
        1,
        base + Math.round((rungSeconds * 1000) / Math.max(1, this.getSpeed()))
      );
    }
    let ticks = this.hasMutation('gold_trail')
      ? Math.min(base, MUTATION_PHYSICS.goldTrailPortalTicks)
      : base;
    if (this.hasMutation('deep_roots')) {
      ticks -= MUTATION_PHYSICS.deepRootsPortalTicksPenalty;
    }
    if (this.hasMutation('afterburner')) {
      ticks -= MUTATION_PHYSICS.afterburnerPortalTicksPenalty;
    }
    if (this.hasMutation('glacial_reserve')) {
      ticks -= MUTATION_PHYSICS.glacialReservePortalTicksPenalty;
    }
    if (this.hasMutation('tectonic_patience')) {
      ticks += MUTATION_PHYSICS.tectonicPatiencePortalTicksBonus;
    }
    if (this.genomeActive()) {
      if (this.strainTierNow('AURUM') >= 2) {
        ticks -= STRAIN_PHYSICS.aurumWakePortalTicksPenalty;
      }
      if (this.strainTierNow('UMBRA') >= 2) {
        ticks -= STRAIN_PHYSICS.phantomPortalTicksPenalty;
      }
      if (this.strainTierNow('VOLT') >= 3) {
        ticks -= STRAIN_PHYSICS.overclockedPortalTicksPenalty;
      }
      if (this.hasGene('static_charge')) {
        ticks -= GENE_PHYSICS.staticChargePortalTicksPenalty;
      }
      if (this.hasSplice('splice_comet_tail')) {
        ticks -= SPLICE_PHYSICS.cometTailPortalTicksPenalty;
      }
      if (this.hasSplice('splice_old_growth')) {
        ticks -= SPLICE_PHYSICS.oldGrowthPortalTicksPenalty;
      }
    }
    return Math.max(MUTATION_PHYSICS.minExitDespawnTicks, ticks);
  }

  /**
   * Tick speed incl. Time Dilation: CYBER runs the speed curve one tier
   * (5 foods) behind while keeping its DNA multiplier; fixed-speed
   * dynasties simply gain +40 ms/tick.
   */
  private effectiveSpeedForFood(foodEaten: number): number {
    if (this.genomeV2Active()) {
      const base = this.ruleset.speedForFood(foodEaten);
      let speed = this.genomeV2Runtime?.hasMechanic('time_dilation')
        ? Math.max(
            1,
            Math.round(
              (base * 10_000) / GENOME_V2_CONFIG.timeDilation.speedMultiplierBps
            )
          )
        : base;
      const overclock = this.state.genomeV2?.overclock;
      if (overclock) {
        speed = Math.max(
          1,
          Math.round((speed * 10_000) / overclock.speedMultiplierBps)
        );
      }
      return speed;
    }
    // Time Dilation (Gravity Bubble carries it) + VOLT Tempo both slow
    // the world by shifting the food offset (CYBER) or adding ms.
    let offset = 0;
    let slowMs = 0;
    if (this.hasGene('time_dilation')) {
      offset += MUTATION_PHYSICS.timeDilationCyberFoodOffset;
      slowMs += MUTATION_PHYSICS.timeDilationSlowMs;
    }
    if (this.genomeActive() && this.strainTierNow('VOLT') >= 1) {
      offset += STRAIN_PHYSICS.tempoCyberFoodOffset;
      slowMs += STRAIN_PHYSICS.tempoSlowMs;
    }
    let speed =
      this.ruleset.id === 'CYBER'
        ? this.ruleset.speedForFood(Math.max(0, foodEaten - offset))
        : this.ruleset.speedForFood(foodEaten) + slowMs;
    // VOLT Apex "Overclocked Reality": the world runs 25% faster.
    if (this.genomeActive() && this.strainTierNow('VOLT') >= 3) {
      speed = Math.max(
        STRAIN_PHYSICS.tickFloorMs,
        Math.floor(speed * STRAIN_PHYSICS.overclockedRealityTickFactor)
      );
    }
    // FERAL: NO TEMPO TERM, and its absence is a decision (WP-3.11).
    //
    // Molt multiplied the tick interval by 0.92 per firing, compounding for
    // the rest of the run. That existed because Molt DELETED the difficulty:
    // the shed handed back the board, so the run needed a second clock or it
    // never ended. Fortress deletes nothing - it hardens the board, so every
    // firing makes the run harder in the currency the game already escalates
    // in. Carrying the speed step across as well would price the Expression
    // twice, and would do it in a currency the player cannot see coming.
    //
    // Dropping it silently would have been a stealth tempo change, which is
    // why it is written down here rather than simply deleted.
    return speed;
  }

  /**
   * FLUX Apex "Singularity": every `singularityEveryFoods` foods after the
   * apex, the board's food is dragged in to within `singularityPullRadius`
   * cells of the head.
   *
   * WP-3.13 IMPLEMENTED THIS. `singularityPullRadius` had zero call sites
   * while `lexicon.ts` promised the pull to the player and `genome.ts` paid
   * `singularityFlat` on exactly this cadence - so the player was being paid
   * for an event that never happened, and the flat bonus's own comment
   * ("+10 flat per pull event") described a fiction. The economic half was
   * already the harder half; the physical half is this.
   *
   * A relocation rather than the per-tick creep of Magnet Pulse, because
   * that is what the copy says: one event, on a cadence, not a field. It
   * uses the same sampler discipline as every other placement here, so a
   * seeded run pulls to identical cells on replay.
   */
  private applySingularityPull(n: number): void {
    if (!this.genomeActive()) return;
    if (this.strainTierNow('FLUX') < 3) return;
    const apexAt = this.activations?.FLUX.apexAt ?? null;
    if (apexAt === null || n <= apexAt) return;
    if ((n - apexAt) % STRAIN_ECONOMICS.singularityEveryFoods !== 0) return;
    if (n === this.lastSingularityPullAtFood) return;
    this.lastSingularityPullAtFood = n;

    const head = this.state.snake[0];
    if (!head || this.state.foods.length === 0) return;
    const radius = STRAIN_PHYSICS.singularityPullRadius;
    const pulled: Position[] = [];
    for (const food of this.state.foods) {
      // Already inside the well: the pull has nothing to do.
      if (
        Math.max(Math.abs(head.x - food.x), Math.abs(head.z - food.z)) <= radius
      ) {
        pulled.push(food);
        continue;
      }
      pulled.push(this.sampleCellNearHead(head, radius, pulled) ?? food);
    }
    this.state.foods = pulled;
    this.state.food = { ...pulled[0] };
  }

  /**
   * A free cell within `radius` (Chebyshev) of the head, or null when the
   * neighbourhood is full. Wraps on a torus, so the well works at the seam.
   */
  private sampleCellNearHead(
    head: Position,
    radius: number,
    placed: Position[]
  ): Position | null {
    for (let attempts = 0; attempts < 200; attempts++) {
      const raw = {
        x: head.x + Math.floor(this.rng() * (2 * radius + 1)) - radius,
        y: 0,
        z: head.z + Math.floor(this.rng() * (2 * radius + 1)) - radius,
      };
      const position = this.ruleset.torus ? this.wrapPosition(raw) : raw;
      if (
        position.x < 0 ||
        position.x >= this.gridSize ||
        position.z < 0 ||
        position.z >= this.gridSize
      ) {
        continue;
      }
      if (
        !this.isPositionOnSnake(position) &&
        !this.isPositionOnExit(position) &&
        !this.isPositionOnMutation(position) &&
        !this.isPositionOnTerrain(position) &&
        !placed.some((p) => p.x === position.x && p.z === position.z)
      ) {
        return position;
      }
    }
    return null;
  }

  /**
   * A gene's effect is live when its pick is held - fused parents KEEP
   * their physical effects (a splice is the union plus extras), so this
   * checks raw picks. Cycle/radius overrides live where they differ.
   */
  private hasGene(id: GeneId): boolean {
    return this.state.heldMutations.some((m) => m.id === id);
  }

  private hasMutation(id: GeneId): boolean {
    return this.hasGene(id);
  }

  private hasSplice(id: SpliceId): boolean {
    return this.state.fusedSplices.some((s) => s.id === id);
  }

  private hasTrait(id: TraitId): boolean {
    return this.traits.includes(id);
  }

  /**
   * Iron Scales: absorb one board collision per run (edge or solid terrain).
   * The blocked move is cancelled and the body remains exactly where it was,
   * buying one tick to turn. This is intentionally NOT a recoil: withdrawing
   * the head and duplicating the tail preserved segment count but released the
   * old head cell, growing free space in violation of Rule 15. A body hit is
   * not absorbed.
   */
  private triggerIronScales(collisionPosition: Position): void {
    this.state.ironScalesAvailable = false;

    this.emit('ironScalesTriggered', {
      position: { ...this.state.snake[0] },
      collision: { ...collisionPosition },
    });
  }

  private checkWallCollision(pos: Position): boolean {
    return (
      pos.x < 0 || pos.x >= this.gridSize || pos.z < 0 || pos.z >= this.gridSize
    );
  }

  private isInBounds(pos: Position): boolean {
    return !this.checkWallCollision(pos);
  }

  private checkSelfCollision(pos: Position): boolean {
    return this.state.snake.some((s) => s.x === pos.x && s.z === pos.z);
  }

  private findFoodIndex(pos: Position): number {
    return this.state.foods.findIndex((f) => f.x === pos.x && f.z === pos.z);
  }

  private isPositionOnSnake(pos: Position): boolean {
    return this.state.snake.some((s) => s.x === pos.x && s.z === pos.z);
  }

  private isPositionOnFood(pos: Position): boolean {
    return this.state.foods.some((f) => f.x === pos.x && f.z === pos.z);
  }

  private isPositionOnExit(pos: Position): boolean {
    return (
      (this.state.exitTile !== null &&
        this.state.exitTile.x === pos.x &&
        this.state.exitTile.z === pos.z) ||
      (this.state.exitTile2 !== null &&
        this.state.exitTile2.x === pos.x &&
        this.state.exitTile2.z === pos.z)
    );
  }

  private isPositionOnMutation(pos: Position): boolean {
    return (
      this.state.mutationTile !== null &&
      this.state.mutationTile.x === pos.x &&
      this.state.mutationTile.z === pos.z
    );
  }

  /**
   * Start death sequence with slow-motion effect. The collision cause
   * (wall vs self) is staged here and stamped by finalizeRun.
   */
  private startDeathSequence(
    collisionPosition: Position,
    cause: Exclude<RunDeathCause, 'extracted' | 'timeout'> = 'self'
  ): void {
    this.state.isDeathSequence = true;
    this.state.deathPosition = { ...collisionPosition };
    this.pendingDeathCause = cause;

    // Emit death sequence event for visual effects
    this.emit('deathSequence', {
      position: collisionPosition,
      score: this.state.score,
      dnaCollected: this.state.dnaCollected,
    });

    // Commit terminal state and emit gameOver in the same turn as collision.
    // The death flag remains alive for presentation only: reload can no longer
    // race an 800 ms non-terminal window, while the authored flourish survives.
    const token = ++this.deathSequenceToken;
    this.finalizeRun('died', true);
    setTimeout(() => {
      if (this.deathSequenceToken !== token) return;
      this.state.isDeathSequence = false;
      this.emit('deathSequenceComplete');
    }, DEATH_SEQUENCE_DURATION_MS);
  }

  /**
   * End the run - one path for both endings. Death and extraction both commit
   * synchronously; presentation may outlive this state transition.
   */
  private finalizeRun(
    reason: EndReason,
    retainDeathPresentation = false
  ): void {
    if (this.genomeV2Runtime) {
      // No live target contract survives the terminal boundary. This closes
      // partial Circuit/Crown facts before exporting the one canonical record.
      this.expireDisplacedGenomeV2Targets(this.state.foods, {
        terminal: true,
      });
    }
    this.state.isDeathSequence = retainDeathPresentation;
    this.state.isGameOver = true;
    this.state.isPlaying = false;

    // Run-event capture (Identity v1 section 9.5): close any live
    // near-wall episode, then record the ending.
    this.closeNearWallEpisode();

    if (reason === 'extracted') {
      this.state.extracted = true;
      this.state.exitTile = null;
      this.state.exitTile2 = null;
      this.state.exitTicksRemaining = 0;
      this.deathCause = 'extracted';
      this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'enter' });
      this.recordRunEvent({ t: this.runTimeDs(), e: 'b' });
      this.recordRunEvent(
        { t: this.runTimeDs(), e: 'x', c: 'extracted' },
        true
      );
      this.emit('extracted', {
        score: this.state.score,
        dnaCollected: this.state.dnaCollected,
        foodEaten: this.state.foodEaten,
      });
    } else {
      this.deathCause = this.pendingDeathCause ?? 'self';
      this.recordRunEvent(
        { t: this.runTimeDs(), e: 'x', c: this.deathCause },
        true
      );
    }

    const payload: GameOverData = {
      score: this.state.score,
      dnaCollected: this.state.dnaCollected,
      foodEaten: this.state.foodEaten,
      extracted: this.state.extracted,
      endReason: reason,
      deathPosition: this.state.deathPosition,
      mutations: this.state.heldMutations.map((m) => ({ ...m })),
      deathCause: this.deathCause,
      phoenixTriggeredAtFood: this.state.phoenixTriggeredAtFood,
      genome: this.genomeActive()
        ? {
            infuses: this.state.infuses.map((i) => ({ ...i })),
            surges: this.state.surges.map((s) => ({ ...s })),
            revive: this.state.revive ? { ...this.state.revive } : null,
            claims: { ...this.state.genomeClaims },
            pressureEvents: this.state.pressureEvents.map((e) => ({ ...e })),
            lossEvents: this.state.lossEvents.map((e) => ({ ...e })),
            // `resolved` is engine-internal - the wire shape stays exactly
            // OfferTraceEntry, so an unresolved offer still ships as
            // `picked: null` and replays identically on the server.
            offerTrace: this.offerTrace.map(({ k, atFood, picked }) => ({
              k,
              atFood,
              picked,
            })),
            fusedSplices: this.state.fusedSplices.map((s) => ({ ...s })),
            strainCounts: { ...this.state.strainCounts },
            strainTiers: { ...this.state.strainTiers },
          }
        : null,
      ...(this.genomeV2Runtime
        ? {
            genomeV2: genomeV2RunRecord(this.genomeV2Runtime.getState(), null),
          }
        : {}),
    };
    this.terminalResult = checkpointClone(payload);
    this.emit('gameOver', payload);
  }

  /**
   * Get death position (for visual effects)
   */
  getDeathPosition(): Position | null {
    return this.state.deathPosition ? { ...this.state.deathPosition } : null;
  }

  // -------------------------------------------------------------------------
  // Run-event recorder (Identity v1 section 9.5)
  // -------------------------------------------------------------------------

  /** Deciseconds since run start (0 before the run starts). */
  private runTimeDs(): number {
    if (this.state.startTime === null) return 0;
    return Math.max(0, Math.floor((Date.now() - this.state.startTime) / 100));
  }

  /**
   * Append an event, honoring the hard cap: non-terminal events past the
   * cap are dropped (truncated flag set); a terminal event displaces the
   * last non-terminal one so the ending always survives.
   */
  private recordRunEvent(event: RunEvent, terminal = false): void {
    if (this.runEvents.length >= RUN_EVENTS_MAX) {
      this.runEventsTruncated = true;
      if (!terminal) return;
      this.runEvents.pop();
    }
    this.runEvents.push(event);
  }

  /**
   * Near-wall episode tracking: called once per resolved tick with the
   * live head. Entering the 1-cell wall margin starts an episode;
   * leaving it (or the run ending) closes it, and episodes >=500ms are
   * recorded at their END time (t = end, d = duration in deciseconds) so
   * the stream stays monotonic.
   */
  private trackNearWall(head: Position | undefined): void {
    const inMargin =
      !!head &&
      (head.x <= 0 ||
        head.x >= this.gridSize - 1 ||
        head.z <= 0 ||
        head.z >= this.gridSize - 1);

    if (inMargin && this.nearWallSinceMs === null) {
      this.nearWallSinceMs = Date.now();
    } else if (!inMargin && this.nearWallSinceMs !== null) {
      this.closeNearWallEpisode();
    }
  }

  /** Close a live near-wall episode, recording it when long enough. */
  private closeNearWallEpisode(): void {
    if (this.nearWallSinceMs === null) return;
    const durationMs = Date.now() - this.nearWallSinceMs;
    this.nearWallSinceMs = null;
    if (durationMs >= NEAR_WALL_MIN_MS) {
      this.recordRunEvent({
        t: this.runTimeDs(),
        e: 'w',
        d: Math.max(1, Math.floor(durationMs / 100)),
      });
    }
  }

  /**
   * The run's captured event stream (immutable copy) + the truncation
   * flag. The game page ships this with the session-end request; the
   * server re-validates every bound and stores the envelope - or null,
   * with the run completing normally either way.
   */
  getRunEvents(): RunEventRecord {
    return {
      events: this.runEvents.map((e) => ({ ...e })),
      truncated: this.runEventsTruncated,
    };
  }

  /** How the run ended, or null while it is still going. */
  getDeathCause(): RunDeathCause | null {
    return this.deathCause;
  }
}
