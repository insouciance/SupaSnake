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
 * - COSMIC Flux (section 3.3): constellation food groups with combo
 *   chaining, and wrap phases where the arena edges cycle between wrapping
 *   (open) and killing (closed) with a telegraph before each transition.
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
  cosmicComboMultiplier,
  type DynastyRuleset,
} from '@/shared/game/rulesets';
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
  formingTicksFor,
  nextTerrainCells,
  type TerrainBlock,
} from '@/shared/game/terrain';
import {
  blockedGrid,
  chooseFoodCell,
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
  rollOfferInterval,
  type GrowthProfile,
  type GrowthProfileId,
} from '@/shared/game/growth';
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
  moltResetLengthFor,
  type StrainId,
  type StrainPoints,
} from '@/shared/game/strains';
import {
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
  type ShedEvent,
  type StrainActivations,
  type StrainSurge,
} from '@/shared/game/genome';
import {
  pityForecast,
  rollGeneOffer,
  type LineageBias,
  type OfferTraceEntry,
} from '@/shared/game/offerGravity';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Outcome of a setDirection call. Purely informational (additive): the
 * engine's queue semantics are unchanged, but callers that care (touch
 * feedback, debug instrumentation) can react to why an input did or did
 * not enter the buffer.
 */
export type SetDirectionResult =
  | 'accepted'
  | 'duplicate'
  | 'reversal'
  | 'queue_full'
  | 'inactive';

export interface Position {
  x: number;
  y: number;
  z: number;
}

/** How a run ended: crashed into something, or left through the exit portal. */
export type EndReason = 'died' | 'extracted';

/** COSMIC wrap-phase state: edges wrap while open, kill while closed. */
export type FluxPhase = 'open' | 'closed';

/** COSMIC bounded-trust combo summary reported in the end-of-run payload. */
export interface CosmicComboSummary {
  /** Total DNA earned above the no-combo recompute. */
  comboDnaBonus: number;
  /** Total score earned above the no-combo recompute. */
  comboScoreBonus: number;
  /** Longest constellation chain of the run. */
  maxChain: number;
}

export interface GameState {
  snake: Position[];
  /** Primary food cell (= foods[0]) - kept for renderer/store compatibility. */
  food: Position;
  /**
   * All live food cells. One food normally; Splitter adds a second;
   * COSMIC spawns constellation groups of 3 (4 with Splitter). A new
   * wave spawns only when every food of the current one is eaten.
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
  // --- GENOME (Buildcraft: The Genome) - all inert in legacy mode ----------
  /** Live strain points (heirloom + genes + surges). */
  strainCounts: StrainPoints;
  /** Strain -> live tier (1 minor / 2 expression / 3 apex). */
  strainTiers: Partial<Record<StrainId, number>>;
  /** Fused splices, in fusion order (display; server re-derives). */
  fusedSplices: { id: SpliceId; atFood: number }[];
  /** AURUM Gilded Wake trail cells with per-cell remaining ticks. */
  gildedCells: { x: number; z: number; ticks: number }[];
  /** Bonus foods (FERAL molt drops / Heartwood goldens) - not run food. */
  bonusFoods: { x: number; z: number; kind: 'molt' | 'heartwood' }[];
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
  pendingPortalChoice: { canInfuse: boolean } | null;
  /** Surge-strain choice hold (infusing while at the gene cap). */
  pendingSurgeChoice: boolean;
  /** The run's one revive, once fired (generalizes phoenixTriggeredAtFood). */
  revive: GenomeRevive | null;
  /** Bounded-trust claim accumulators (display + end-of-run claim). */
  genomeClaims: GenomeClaims;
  /** Reported length losses (Thick Hide, Ouroboros) for the length model. */
  lossEvents: LengthLossEvent[];
  /** FERAL Thick Hide: one self-collision pardon per run. */
  thickHideAvailable: boolean;
  /** FLUX Warp Skin: free-wrap charge state. */
  warpSkinCharged: boolean;
  /** Pocket Rift: wall-teleport charge state. */
  pocketRiftCharged: boolean;
  /** UMBRA Phantom Coil: ticks of tail-phase remaining. */
  phantomTicksRemaining: number;
  /** True while a held Phoenix can still absorb one death. */
  phoenixAvailable: boolean;
  /** Food count at the Phoenix trigger, null if never triggered. */
  phoenixTriggeredAtFood: number | null;
  /** True while an Iron Scales trait can still absorb one wall hit. */
  ironScalesAvailable: boolean;
  /** COSMIC: glyph (0..2) of the current constellation group, else null. */
  constellationGlyph: number | null;
  /** COSMIC: current chain length (1 = no chain yet). */
  chainLength: number;
  /** COSMIC: combo multiplier in effect after the last eat. */
  comboMultiplier: number;
  /** COSMIC: running combo bonus accumulators for the bounded-trust claim. */
  comboDnaBonus: number;
  comboScoreBonus: number;
  maxChain: number;
  /** COSMIC: wrap-phase state, null outside COSMIC. */
  fluxPhase: FluxPhase | null;
  /** COSMIC: ticks until the wrap phase flips. */
  fluxTicksRemaining: number;
  /** COSMIC: true during the ~2s warning window before a phase flip. */
  fluxTelegraph: boolean;
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
  /** COSMIC only: the bounded-trust combo claim. Null on other dynasties. */
  cosmic: CosmicComboSummary | null;
  /**
   * Genome payload (null in legacy mode): the raw picks ride in
   * `mutations` above (wire compat); this carries the genome-only claims
   * and facts. Everything here is either re-derived or clamped
   * server-side - nothing is trusted.
   */
  genome: GameOverGenome | null;
}

/** The genome block of the end-of-run payload. */
export interface GameOverGenome {
  infuses: { atFood: number }[];
  surges: StrainSurge[];
  revive: GenomeRevive | null;
  claims: GenomeClaims;
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
  | 'fluxTelegraph'
  | 'fluxPhaseChange'
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
  | 'moltShed'
  | 'reviveTriggered';
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
  /** The session's offer seed (stored on the session row). */
  runSeed: string;
  /** Starting strain points (heirloom traits + lineage, server-derived). */
  heirloom?: StrainPoints;
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
  /**
   * Reused occupancy grid for food placement - see `waveBlockedGrid`. Held on
   * the instance so a wave costs no allocation; sized lazily because
   * `gridSize` can be overridden per run.
   */
  private blockedScratch: Uint8Array | null = null;
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
  private lengthTrace: LengthTrace = { lengthAtEat: [0], shedEvents: [] };
  /**
   * Ouroboros bites taken this run.
   *
   * Counted explicitly rather than inferred from `lossEvents` by segment
   * size. WP-2.05 normalizes Thick Hide to report the segments it ACTUALLY
   * removed, and a clamped Thick Hide can legitimately report 3 - the same
   * number as a bite - so the old `filter(e => e.segments === 3).length`
   * would have started miscounting the bite cadence cap.
   */
  private ouroborosBites = 0;
  /**
   * The segments each shed event removed, kept only between the pure and
   * visible halves of a single food so the visible half can place the molt
   * drops and the Heartwood golden on the cells that were actually shed.
   * Cleared by `applyShedVisuals`; never read anywhere else.
   */
  private shedRemovedCells = new Map<ShedEvent, Position[]>();

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
  private directionQueue: Direction[];
  private static readonly MAX_QUEUED_DIRECTIONS = 3;
  /** COSMIC chain internals: glyph of the previous eat + ticks since it. */
  private lastEatGlyph: number | null = null;
  private ticksSinceLastEat = 0;
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
  /** Death cause staged by the collision that started the death sequence. */
  private pendingDeathCause: Exclude<RunDeathCause, 'extracted'> | null = null;
  /** Near-wall episode tracking (1-cell wall margin). */
  private nearWallSinceMs: number | null = null;

  constructor(options: GameOptions = {}) {
    this.gridSize = options.gridSize ?? GAME_CONFIG.board.gridSize;
    this.initialLength = options.initialLength ?? GAME_CONFIG.snake.initialLength;
    this.ruleset = options.ruleset ?? RULESETS.COSMIC;
    this.rng = options.rng ?? Math.random;
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
    this.directionQueue = [];

    this.state = this.createInitialState();
  }

  /** True while the run plays under genome rules (server capability). */
  private genomeActive(): boolean {
    return this.genome !== null;
  }

  /**
   * Swap the genome capability config. Mirrors setTraits: the page
   * constructs the engine on mount, before the session-start response
   * arrives. Refused mid-run - a run is genome or legacy for its whole
   * life, never half of each.
   */
  setGenome(genome: GenomeEngineConfig | null): void {
    if (this.state.isPlaying) return;
    this.genome = genome;
    this.state.strainCounts = this.spawnStrainPoints();
  }

  /** The active genome config (or null in legacy mode). */
  getGenome(): GenomeEngineConfig | null {
    return this.genome ? { ...this.genome } : null;
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
   * to `baseline`, so a client that is newer, older or confused still plays
   * the shipped curve rather than an invented one.
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
      GAME_CONFIG.session.holds.base,
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
    this.fusedView = this.genome?.ftue?.splicesUnlocked === false
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
        ? Math.min(gate, strainTierAtFood(before[strain], Number.MAX_SAFE_INTEGER))
        : 0;
      if (tier > beforeTier && tier >= 1) {
        this.recordRunEvent({ t: this.runTimeDs(), e: 'g', id: strain, v: tier });
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
      nextMutationAtFood: this.rollNextMutationInterval(),
      heldMutations: [],
      pendingChoice: null,
      strainCounts: this.spawnStrainPoints(),
      strainTiers: {},
      fusedSplices: [],
      gildedCells: [],
      bonusFoods: [],
      infuses: [],
      surges: [],
      choiceSource: null,
      pendingChoicePity: null,
      pendingPortalChoice: null,
      pendingSurgeChoice: false,
      revive: null,
      genomeClaims: {},
      lossEvents: [],
      thickHideAvailable: false,
      warpSkinCharged: false,
      pocketRiftCharged: false,
      phantomTicksRemaining: 0,
      phoenixAvailable: false,
      phoenixTriggeredAtFood: null,
      ironScalesAvailable: this.hasTrait('iron_scales'),
      constellationGlyph: null,
      chainLength: 0,
      comboMultiplier: 1,
      comboDnaBonus: 0,
      comboScoreBonus: 0,
      maxChain: 0,
      fluxPhase: null,
      fluxTicksRemaining: 0,
      fluxTelegraph: false,
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
      holdBudget: ladderHoldBase(GAME_CONFIG.session.holds.base, this.ladderRung),
      isDeathSequence: false,
      startTime: null,
      deathPosition: null,
    };
  }

  /**
   * Start or restart the game
   */
  start(): void {
    this.beginRun(null);
  }

  private beginRun(opening: DrivenStartState | null): void {
    this.drivenRun = opening !== null;
    const centerX = Math.floor(this.gridSize / 2);
    const centerZ = Math.floor(this.gridSize / 2);

    const snake: Position[] = [];
    for (let i = 0; i < this.initialLength; i++) {
      snake.push({ x: centerX - i, y: 0, z: centerZ });
    }

    this.state = this.createInitialState();
    this.state.snake = snake;
    this.state.isPlaying = true;
    this.state.startTime = Date.now();

    // COSMIC Flux: every run opens with a full open-phase window
    if (this.ruleset.flux) {
      this.state.fluxPhase = 'open';
      this.state.fluxTicksRemaining = this.ruleset.flux.openTicks;
    }

    this.directionQueue = [];
    this.lastEatGlyph = null;
    this.ticksSinceLastEat = 0;
    this.runEvents = [];
    this.runEventsTruncated = false;
    this.deathCause = null;
    this.pendingDeathCause = null;
    this.nearWallSinceMs = null;
    // Genome derived state
    this.fusedView = { loose: [], splices: [] };
    this.activations = null;
    this.lengthTrace = { lengthAtEat: [0], shedEvents: [] };
    this.ouroborosBites = 0;
    this.shedRemovedCells = new Map();
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
    this.spawnFoods();
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
      const delta = opening.direction === 'UP' ? { x: 0, z: -1 }
        : opening.direction === 'DOWN' ? { x: 0, z: 1 }
          : opening.direction === 'LEFT' ? { x: -1, z: 0 }
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

    this.beginRun(opening);
  }

  /**
   * Swap the active dynasty ruleset. Needed because the page constructs
   * the engine on mount, before the equipped snake's dynasty arrives from
   * the collection API. Takes effect immediately: speed follows the new
   * ruleset's curve at the current food count, and (outside a live run)
   * the first-exit threshold and flux state follow the new ruleset.
   */
  setRuleset(ruleset: DynastyRuleset): void {
    this.ruleset = ruleset;
    this.speed = this.effectiveSpeedForFood(this.state.foodEaten);
    if (!this.state.isPlaying && !this.state.exitTile) {
      this.state.nextExitAtFood = this.exitCadence().firstExitAtFood;
      this.state.fluxPhase = null;
      this.state.fluxTicksRemaining = 0;
      this.state.fluxTelegraph = false;
      this.state.constellationGlyph = null;
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
        this.state.nextMutationAtFood = this.rollNextMutationInterval();
      }
      this.state.ironScalesAvailable = this.hasTrait('iron_scales');
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
      snake: this.state.snake.map(s => ({ ...s })),
      food: { ...this.state.food },
      foods: this.state.foods.map(f => ({ ...f })),
      // Cloned per tick, deliberately: the renderer reads this through zustand,
      // and a stable array reference would never re-render — terrain would be
      // computed, lethal, and still invisible, which is the bug WP-3.05 found.
      terrain: this.state.terrain.map((b) => ({ ...b })),
      exitTile: this.state.exitTile ? { ...this.state.exitTile } : null,
      exitTile2: this.state.exitTile2 ? { ...this.state.exitTile2 } : null,
      mutationTile: this.state.mutationTile ? { ...this.state.mutationTile } : null,
      heldMutations: this.state.heldMutations.map(m => ({ ...m })),
      pendingChoice: this.state.pendingChoice
        ? [...this.state.pendingChoice]
        : null,
      strainCounts: { ...this.state.strainCounts },
      strainTiers: { ...this.state.strainTiers },
      fusedSplices: this.state.fusedSplices.map((s) => ({ ...s })),
      gildedCells: this.state.gildedCells.map((c) => ({ ...c })),
      bonusFoods: this.state.bonusFoods.map((f) => ({ ...f })),
      infuses: this.state.infuses.map((i) => ({ ...i })),
      surges: this.state.surges.map((s) => ({ ...s })),
      pendingPortalChoice: this.state.pendingPortalChoice
        ? { ...this.state.pendingPortalChoice }
        : null,
      revive: this.state.revive ? { ...this.state.revive } : null,
      genomeClaims: { ...this.state.genomeClaims },
      lossEvents: this.state.lossEvents.map((e) => ({ ...e })),
    };
  }

  /**
   * Get current speed (ms per tick)
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * Queue a direction change. Inputs buffer (up to MAX_QUEUED_DIRECTIONS)
   * and apply one per tick, so rapid sequences like UP+LEFT within a single
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
  setDirection(dir: Direction): SetDirectionResult {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isPaused ||
      this.state.pendingChoice !== null ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return 'inactive';
    }

    return this.enqueueDirection(dir);
  }

  /**
   * Validate and queue a direction without consulting the pause flag.
   * Kept separate so a post-pause safety gate can accept the player's first
   * steering command before releasing the engine.
   */
  private enqueueDirection(dir: Direction): SetDirectionResult {
    const reference =
      this.directionQueue.length > 0
        ? this.directionQueue[this.directionQueue.length - 1]
        : this.state.direction;

    if (dir === reference) return 'duplicate';
    if (dir === OPPOSITES[reference]) return 'reversal';
    if (this.directionQueue.length >= SnakeGameLogic.MAX_QUEUED_DIRECTIONS) {
      return 'queue_full';
    }

    this.directionQueue.push(dir);
    return 'accepted';
  }

  /**
   * Atomically release a paused board with a deliberate direction.
   *
   * A legal turn is queued before resume, an exact duplicate deliberately
   * resumes the current heading, and unsafe/rejected commands leave the
   * engine paused. If a rapid follow-up arrives after the first command has
   * already released the board, it falls through to normal input buffering.
   */
  resumeWithDirection(dir: Direction): SetDirectionResult {
    if (!this.state.isPaused) {
      return this.setDirection(dir);
    }
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return 'inactive';
    }

    const result = this.enqueueDirection(dir);
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
    return [...this.directionQueue];
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
   * A `'decision'` hold is free, always. It is how the page re-arms the
   * resume gate after a gene, portal or surge decision resolves: the run's
   * own decisions are protected by Inviolable Rule 1 and must never cost
   * the player a resource. The engine cannot infer which is which - the
   * choice flags are already cleared by the time the re-arm runs - so the
   * caller states it, and `'tactical'` is the default so a new call site
   * has to opt OUT of paying rather than remember to opt in.
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
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return false;
    }
    if (kind === 'tactical' && !this.drivenRun) {
      this.refreshHoldBudget();
      if (this.state.holdsUsed >= this.state.holdBudget) return false;
      this.state.holdsUsed += 1;
    }
    this.directionQueue = [];
    this.state.isPaused = true;
    this.emit('pause');
    return true;
  }

  /**
   * Grow the hold budget as the body reaches the lengths that make it hard
   * to steer. Earned holds are never taken back - a body that sheds past a
   * threshold keeps what reaching it paid for, which also keeps the budget
   * from ever dropping below what the player has already spent.
   */
  private refreshHoldBudget(): void {
    // WP-3.12: the ladder's "Short Rope" rung takes one from the OPENING
    // budget, never from what a body has already earned - the `Math.max` below
    // is what makes that true, and it is the same guarantee the paragraph above
    // states for earned holds. `ladderHoldBase` floors at 1: a run with no hold
    // at all is a different game, not a harder one.
    let budget: number = ladderHoldBase(
      GAME_CONFIG.session.holds.base,
      this.ladderRung
    );
    for (const threshold of GAME_CONFIG.session.holds.bonusAtLengths) {
      if (this.state.snake.length >= threshold) budget += 1;
    }
    this.state.holdBudget = Math.max(this.state.holdBudget, budget);
  }

  /**
   * Resume the game
   */
  resume(): void {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
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
      this.state.isPaused ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null ||
      this.state.pendingPortalChoice !== null ||
      this.state.pendingSurgeChoice
    ) {
      return;
    }

    // Consume exactly one buffered input per tick
    const queued = this.directionQueue.shift();
    if (queued) {
      this.state.direction = queued;
    }
    this.slidThisTick = false;
    // Terrain advances BEFORE the move resolves, so a block that solidifies
    // this tick is lethal on this tick - the player saw it forming and had
    // the whole forming window to leave.
    this.tickTerrain();

    const head = this.state.snake[0];
    let newHead = this.getNextPosition(head, this.state.direction);
    let wallHit = this.checkWallCollision(newHead);

    // COSMIC Flux: while the walls are open, edges wrap to the opposite side
    if (wallHit && this.ruleset.flux && this.state.fluxPhase === 'open') {
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
    if (wallHit && this.hasMutation('pocket_rift') && this.state.pocketRiftCharged) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
      this.state.pocketRiftCharged = false;
      this.pocketRiftLastRecharge = this.state.foodEaten;
      this.emit('pocketRiftTriggered', { position: { ...newHead } });
    }

    // FLUX Minor "Warp Skin": one free edge-wrap per 30 foods.
    if (wallHit && this.strainTierNow('FLUX') >= 1 && this.state.warpSkinCharged) {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
      this.state.warpSkinCharged = false;
      this.warpSkinLastRecharge = this.state.foodEaten;
      this.emit('warpSkinTriggered', { position: { ...newHead } });
    }

    // Wall Rush: a wall hit becomes a slide along the wall (clockwise
    // perpendicular preferred, counter-clockwise fallback). A corner or a
    // body-blocked slide still kills - Wall Rush is not a corner pardon.
    if (wallHit && this.hasMutation('wall_rush')) {
      const slide = this.trySlide(head);
      if (slide) {
        this.state.direction = slide.dir;
        newHead = slide.pos;
        wallHit = false;
        this.slidThisTick = true;
      }
    }

    // TERRAIN (WP-3.03): a solid block is lethal to the HEAD. Deliberately
    // after the wall pardons and unprotected by them - Rift Aura, Warp Skin,
    // Pocket Rift and Wall Rush are wall mechanics, and a block is not a wall.
    // Pardoning terrain would hand the arena back to the player who has most
    // invested in never meeting a wall, which is the opposite of the point.
    const terrainHit =
      !wallHit &&
      this.state.terrain.some(
        (b) => b.solid && b.x === newHead.x && b.z === newHead.z
      );

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

    // FERAL Apex "Ouroboros": biting your own TAIL TIP is a meal, not a
    // death - consume 3 segments, pay 30 flat DNA (bounded-trust claim).
    if (!wallHit && this.tryOuroborosBite(newHead)) {
      wallHit = false; // the tail tip is gone; the move resolves normally
    }

    if (wallHit || terrainHit || this.checkSelfCollisionForDeath(newHead)) {
      // Terrain reports as 'wall' rather than growing `RunDeathCause`, which
      // is a persisted enum (migration 022) - and it is honest: a block is a
      // wall you watched arrive. Iron Scales absorbs a WALL hit and therefore
      // absorbs this one too; that is deliberate, since the trait's promise is
      // "survive one collision with the board" and terrain is the board.
      const collisionCause: Exclude<RunDeathCause, 'extracted' | 'timeout'> =
        wallHit || terrainHit ? 'wall' : 'self';
      // Iron Scales (trait): absorb exactly one WALL hit per run - the
      // snake recoils one cell off the wall and the tick is consumed.
      // Checked before any revive so the trait save never burns one.
      if (wallHit && this.state.ironScalesAvailable) {
        this.triggerIronScales(newHead);
        this.emit('tick');
        return;
      }
      // FERAL Minor "Thick Hide": absorb one SELF collision - lose 5 tail
      // segments instead of dying (reported, payout-non-increasing).
      if (
        !wallHit &&
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

    // Mutation food pickup: the helix is not food (no growth, no DNA) -
    // stepping onto it opens the choice-of-2 hold after the move resolves.
    const ateMutation =
      this.state.mutationTile !== null &&
      newHead.x === this.state.mutationTile.x &&
      newHead.z === this.state.mutationTile.z;

    const foodIndex = this.findFoodIndex(newHead);
    const ateFood = foodIndex >= 0;

    // The body length BEFORE this move resolves. `computeLengthTrace`
    // records exactly this as `lengthAtEat[n]` - before the food's growth -
    // so it is captured before the head goes on rather than read back off
    // the array afterwards, when it is one segment too long.
    const lengthBeforeMove = this.state.snake.length;

    this.state.snake.unshift(newHead);

    if (ateFood) {
      const collectedPosition = { ...newHead }; // Position where food was eaten
      this.state.foodEaten += 1;
      const n = this.state.foodEaten;
      this.lengthTrace.lengthAtEat[n] = lengthBeforeMove;
      this.recordRunEvent({ t: this.runTimeDs(), e: 'f', n });

      // COSMIC constellation chain: same glyph as the previous eat within
      // the window extends the chain; anything else resets it.
      let combo = 1;
      if (this.ruleset.constellation) {
        const glyph = this.state.constellationGlyph ?? 0;
        const withinWindow =
          this.ticksSinceLastEat <= this.effectiveChainWindowTicks();
        if (
          this.state.chainLength > 0 &&
          this.lastEatGlyph === glyph &&
          withinWindow
        ) {
          this.state.chainLength += 1;
        } else {
          this.state.chainLength = 1;
        }
        this.lastEatGlyph = glyph;
        this.ticksSinceLastEat = 0;
        combo = cosmicComboMultiplier(this.state.chainLength);
        this.state.comboMultiplier = combo;
        this.state.maxChain = Math.max(this.state.maxChain, this.state.chainLength);
      }

      // Per-food value: base x combo x gene modifier x trait modifier,
      // one round per food - mirrors computeRunTotals exactly (combo
      // aside, which the server clamps via the bounded-trust summary).
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
        (baseGrowthForFood(this.growth, n) - 1) +
        (this.hasGene('overgrowth') ? MUTATION_PHYSICS.overgrowthExtraSegments : 0) +
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

      // Shed cycles, PURE HALF: loose Shed (25 -> 8), Regenesis (20 -> 8),
      // Molted Rebirth (25 -> 8), FERAL Molt (every 20, proportional) and
      // the Molt growth floor. Length moves and trace records only -
      // mirrors computeLengthTrace's cycle model exactly.
      const sheds = this.applyShedMoves(n);

      const { dnaValue, scoreValue, dnaNoCombo, baseScore } =
        this.resolveFoodEconomy(n, combo);
      this.state.dnaCollected += dnaValue;
      this.state.score += scoreValue;
      this.state.comboDnaBonus += dnaValue - dnaNoCombo;
      this.state.comboScoreBonus += scoreValue - baseScore;

      // Shed cycles, VISIBLE HALF: molt-food drops, Heartwood goldens and
      // the `moltShed` emit. These are board objects and events, not
      // pricing inputs, so they stay after the food resolves - exactly
      // where they were.
      this.applyShedVisuals(sheds);

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
          n - this.pocketRiftLastRecharge >= GENE_PHYSICS.pocketRiftRechargeFoods
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
      if (this.state.foods.length === 0) {
        this.spawnFoods();
      } else {
        this.state.food = { ...this.state.foods[0] };
      }

      this.advancePortalSchedule(n);
      // Ascetic (trait): mutation food never spawns - no builds, pure snake
      if (
        !this.state.mutationTile &&
        !ateMutation &&
        !this.hasTrait('ascetic') &&
        this.heldSlotCount() < this.maxHeld() &&
        n >= this.state.nextMutationAtFood
      ) {
        this.spawnMutationFood();
      }
      this.emit('foodCollected', {
        position: collectedPosition,
        score: this.state.score,
        dna: this.state.dnaCollected,
        foodEaten: this.state.foodEaten,
        chainLength: this.state.chainLength,
        comboMultiplier: this.state.comboMultiplier,
      });
    } else {
      this.state.snake.pop();
    }

    // Genome pickups on the resolved head cell: bonus foods (molt drops /
    // Heartwood goldens) and AURUM gilded cells - flat claims, not run food.
    if (this.genomeActive()) {
      this.tryConsumeBonusFood(this.state.snake[0]);
      this.tryConsumeGildedCell(this.state.snake[0]);
    }

    // Magnet Pulse (mutation, radius 2) / Magnetism (trait, radius 1):
    // nearby food creeps toward the head, one cell per tick. When both are
    // active the larger radius wins - the pull itself never stacks.
    if (
      this.hasMutation('magnet_pulse') ||
      this.hasMutation('gravity_well') ||
      this.hasTrait('magnetism')
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
    if (this.anomaly === 'meteor_shower' && !ateFood && this.state.foods.length > 0) {
      this.state.foodTicksRemaining -= 1;
      if (this.state.foodTicksRemaining <= 0) {
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

    // COSMIC chain window countdown
    if (this.ruleset.constellation) {
      this.ticksSinceLastEat = Math.min(this.ticksSinceLastEat + 1, 1_000_000);
    }

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

    // COSMIC Flux phase countdown + telegraph. Event Horizon (COSMIC M9)
    // stretches both phases: open +25 ticks (benefit), closed +15 (cost).
    if (this.ruleset.flux && this.state.fluxPhase) {
      const { telegraphTicks } = this.ruleset.flux;
      const horizon = this.hasMutation('event_horizon');
      const openTicks =
        this.ruleset.flux.openTicks +
        (horizon ? MUTATION_PHYSICS.eventHorizonOpenTicksBonus : 0);
      const closedTicks =
        this.ruleset.flux.closedTicks +
        (horizon ? MUTATION_PHYSICS.eventHorizonClosedTicksPenalty : 0);
      this.state.fluxTicksRemaining -= 1;
      if (this.state.fluxTicksRemaining <= 0) {
        const nextPhase: FluxPhase =
          this.state.fluxPhase === 'open' ? 'closed' : 'open';
        this.state.fluxPhase = nextPhase;
        this.state.fluxTicksRemaining =
          nextPhase === 'open' ? openTicks : closedTicks;
        this.state.fluxTelegraph =
          this.state.fluxTicksRemaining <= telegraphTicks;
        this.emit('fluxPhaseChange', { phase: nextPhase });
      } else {
        const nowTelegraph = this.state.fluxTicksRemaining <= telegraphTicks;
        if (nowTelegraph && !this.state.fluxTelegraph) {
          this.emit('fluxTelegraph', {
            nextPhase: this.state.fluxPhase === 'open' ? 'closed' : 'open',
            ticksUntilChange: this.state.fluxTicksRemaining,
          });
        }
        this.state.fluxTelegraph = nowTelegraph;
      }
    }

    this.emit('tick');
  }

  /**
   * Choose one of the two offered mutations (0 or 1). Applies immediate
   * physical side effects, clears the choice hold, and the game resumes on
   * the next tick. Returns false when no choice is pending.
   */
  chooseMutation(index: 0 | 1): boolean {
    const offer = this.state.pendingChoice;
    if (!offer) return false;
    const id = offer[index];
    if (!id) return false;

    const pick: GenePick = { id, atFood: this.state.foodEaten };
    this.state.pendingChoice = null;
    this.state.choiceSource = null;
    this.state.pendingChoicePity = null;
    if (this.genomeActive()) {
      this.resolveOfferTrace(id);
    }
    this.applyPick(pick);

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
    if (!this.state.pendingChoice) return;
    this.state.pendingChoice = null;
    this.state.choiceSource = null;
    this.state.pendingChoicePity = null;
    if (this.genomeActive()) {
      this.resolveOfferTrace(null);
    }
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
      this.state.snake.length >= STRAIN_PHYSICS.infuseMinLength
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
    const pending = this.state.pendingPortalChoice;
    if (!pending) return false;
    this.state.pendingPortalChoice = null;
    if (action === 'pass') {
      this.consumePassedPortal();
      return true;
    }
    if (action === 'bank' || !pending.canInfuse) {
      this.finalizeRun('extracted');
      return true;
    }
    this.performInfuse();
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
    this.state.pendingSurgeChoice = false;
    this.state.surges.push({ strain, atFood: this.state.foodEaten });
    this.refreshGenomeDerived();
    this.emit('surged', { strain, atFood: this.state.foodEaten });
    return true;
  }

  /** Per-food economy under genome or legacy rules - one round per food. */
  private resolveFoodEconomy(
    n: number,
    combo: number
  ): { dnaValue: number; scoreValue: number; dnaNoCombo: number; baseScore: number } {
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
      mod = genomeFoodValueModifier(this.fusedView, this.activations, n, this.state.revive, {
        lengthAt,
        prevRunDied: this.genome?.prevRunDied,
      });
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
    const baseScore = Math.round(
      FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n)
    );
    // The per-food floor, from the SAME function the server's fold calls.
    // `hasGene('tithe')` stood here, and it differs in two ways that both
    // reach the payout: it is true on tithe's own food (the shared helper
    // requires `n > tithe.atFood`), and it stays true once tithe is
    // consumed by a fusion (the helper reads the LOOSE view only).
    const floor =
      this.genomeActive() ? tithePerFoodFloor(this.fusedView, n) : 0;
    const dnaNoCombo = Math.max(floor, Math.round(baseDna * mod) + flat);
    const dnaValue = Math.max(floor, Math.round(baseDna * combo * mod) + flat);
    const scoreValue = Math.round(
      FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n) * combo
    );
    return { dnaValue, scoreValue, dnaNoCombo, baseScore };
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
      const bonus = Math.round(dnaValue * SPLICE_ECONOMICS.ricochetSlideBonusRatio);
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
    return typeof recorded === 'number' ? recorded : this.state.snake.length;
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
    };
  }

  /** atFood of a held gene, or null. */
  private pickAtFoodOf(id: GeneId): number | null {
    const pick = this.state.heldMutations.find((m) => m.id === id);
    return pick ? pick.atFood : null;
  }

  /**
   * Shed cycles, PURE HALF (WP-2.05): loose Shed 25->8, Regenesis 20->8,
   * Molted Rebirth 25->8, FERAL Molt every 20 foods down to
   * `moltResetLengthFor(len)`, and the Molt growth floor. Mirrors
   * `computeLengthTrace`'s cycle model.
   *
   * This half moves length and records shed events, and does NOTHING else -
   * no DNA, no board objects, no emits. That is what lets it run BEFORE the
   * food is priced, which is what the fold requires: `genomeFoodValueFlat-
   * Bonus` pays Regenesis `regenesisFlatPerSegment` per segment shed AT
   * THIS FOOD, reading the shed events out of the length trace.
   *
   * THE PAYMENT IS NOT HERE ANY MORE. It used to be - `dnaCollected +=
   * regenesisFlatPerSegment * segmentsShed` - because the engine passed an
   * EMPTY shed-event list into the fold and the in-fold branch could never
   * fire. Now the fold is fed the live trace and pays it, so paying it here
   * as well would pay it twice. Do not restore that line without also
   * removing the trace the fold reads.
   */
  private applyShedMoves(n: number): ShedEvent[] {
    type Cycle = {
      every: number;
      anchor: number;
      /**
       * The length this cycle resets a body of `current` to. Molt's shed is
       * proportional, so it MUST be evaluated per firing against the live
       * length - `computeLengthTrace` calls the identical `resetFor` at the
       * identical point, which is what keeps the two in parity.
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
      const moltAt = this.activations?.FERAL.expressionAt ?? null;
      if (moltAt !== null && this.strainTierNow('FERAL') >= 2) {
        cycles.push({
          every: STRAIN_PHYSICS.moltEveryFoods,
          anchor: moltAt,
          resetFor: moltResetLengthFor,
          source: 'molt',
        });
      }
    }
    const fired: ShedEvent[] = [];
    for (const cycle of cycles) {
      const since = n - cycle.anchor;
      if (since <= 0 || since % cycle.every !== 0) continue;
      const reset = cycle.resetFor(this.state.snake.length);
      if (this.state.snake.length <= reset) continue;
      const removed = this.state.snake.slice(reset);
      const segmentsShed = removed.length;
      this.state.snake.length = reset;
      const event: ShedEvent = { atFood: n, segmentsShed, source: cycle.source };
      fired.push(event);
      if (this.genomeActive()) {
        this.lengthTrace.shedEvents.push(event);
        this.shedRemovedCells.set(event, removed);
      }
    }
    // FERAL Molt growth floor while the expression is active. A length move,
    // so it belongs to this half; `computeLengthTrace` applies the same
    // `max(moltMinLength, len)` at the same point in the food.
    if (
      this.genomeActive() &&
      this.strainTierNow('FERAL') >= 2 &&
      this.state.snake.length < STRAIN_PHYSICS.moltMinLength
    ) {
      const tail = this.state.snake[this.state.snake.length - 1];
      while (this.state.snake.length < STRAIN_PHYSICS.moltMinLength) {
        this.state.snake.push({ ...tail });
      }
    }
    return fired;
  }

  /**
   * Shed cycles, VISIBLE HALF (WP-2.05): the molt-food drops, the Heartwood
   * golden and the `moltShed` emit. Board objects and events only - nothing
   * here can change a number the server recomputes, which is precisely why
   * it is safe to leave it after the food has been priced.
   */
  private applyShedVisuals(events: ShedEvent[]): void {
    if (!this.genomeActive()) {
      this.shedRemovedCells = new Map();
      return;
    }
    for (const event of events) {
      const removed = this.shedRemovedCells.get(event) ?? [];
      if (event.source === 'molt') {
        const drops = removed.slice(0, STRAIN_ECONOMICS.moltFoodsPerEvent);
        for (const cell of drops) {
          this.state.bonusFoods.push({ x: cell.x, z: cell.z, kind: 'molt' });
        }
        this.emit('moltShed', { atFood: event.atFood, drops: drops.length });
      }
      if (this.hasGene('heartwood') && removed.length > 0) {
        const cell = removed[removed.length - 1];
        this.state.bonusFoods.push({ x: cell.x, z: cell.z, kind: 'heartwood' });
      }
    }
    this.shedRemovedCells = new Map();
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
      // An arc eat has no head unshift, so the live length IS the
      // pre-growth length the model records for this food.
      this.lengthTrace.lengthAtEat[n] = this.state.snake.length;
      this.recordRunEvent({ t: this.runTimeDs(), e: 'f', n });
      // Growth -> shed -> price, the order `computeGenomeRunTotals` folds
      // in: the shed events of food n are inputs to food n's own flat
      // bonus (Regenesis pays per shed segment), so they have to have
      // happened before the food is priced.
      // +1 segment each (board pressure is the arc's physical price).
      const tail = this.state.snake[this.state.snake.length - 1];
      this.state.snake.push({ ...tail });
      const arcSheds = this.applyShedMoves(n);
      const { dnaValue, scoreValue } = this.resolveFoodEconomy(n, 1);
      this.state.dnaCollected += dnaValue;
      this.state.score += scoreValue;
      this.applyShedVisuals(arcSheds);
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

  /** Consume a bonus food (molt drop / Heartwood golden) under the head. */
  private tryConsumeBonusFood(head: Position | undefined): void {
    if (!head || this.state.bonusFoods.length === 0) return;
    const index = this.state.bonusFoods.findIndex(
      (f) => f.x === head.x && f.z === head.z
    );
    if (index < 0) return;
    const food = this.state.bonusFoods[index];
    this.state.bonusFoods.splice(index, 1);
    const claims = this.state.genomeClaims;
    if (food.kind === 'molt') {
      const value =
        this.anomaly === 'overgrown'
          ? ANOMALY_ECONOMICS.overgrownMoltFoodFlat
          : STRAIN_ECONOMICS.moltFoodFlat;
      this.state.dnaCollected += value;
      claims.moltFoodDna = (claims.moltFoodDna ?? 0) + value;
    } else {
      this.state.dnaCollected += GENE_ECONOMICS.heartwoodGoldenFlat;
      claims.heartwoodDna =
        (claims.heartwoodDna ?? 0) + GENE_ECONOMICS.heartwoodGoldenFlat;
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

  /** FERAL Apex "Ouroboros": tail-tip bites are meals (capped cadence). */
  private tryOuroborosBite(newHead: Position): boolean {
    if (!this.genomeActive() || this.strainTierNow('FERAL') < 3) return false;
    const tail = this.state.snake[this.state.snake.length - 1];
    if (!tail || tail.x !== newHead.x || tail.z !== newHead.z) return false;
    if (this.state.snake.length <= STRAIN_PHYSICS.ouroborosSegmentsPerBite + 2) {
      return false;
    }
    const apexAt = this.activations?.FERAL.apexAt ?? 0;
    // WP-2.05: counted, not inferred from the loss list by segment size.
    // Thick Hide now reports the segments it actually removed, which can
    // legitimately be `ouroborosSegmentsPerBite`, and the old filter would
    // then have read a Thick Hide as a bite and closed the cadence early.
    const bitesSoFar = this.ouroborosBites;
    const biteCap = Math.floor(
      Math.max(0, this.state.foodEaten - apexAt) /
        STRAIN_ECONOMICS.ouroborosFoodsPerBite
    );
    if (bitesSoFar >= biteCap) return false;
    this.state.snake.length =
      this.state.snake.length - STRAIN_PHYSICS.ouroborosSegmentsPerBite;
    this.ouroborosBites += 1;
    this.state.lossEvents.push({
      atFood: this.state.foodEaten,
      segments: STRAIN_PHYSICS.ouroborosSegmentsPerBite,
    });
    this.state.dnaCollected += STRAIN_ECONOMICS.ouroborosBiteFlat;
    const claims = this.state.genomeClaims;
    claims.ouroborosDna =
      (claims.ouroborosDna ?? 0) + STRAIN_ECONOMICS.ouroborosBiteFlat;
    this.emit('ouroborosBite', {
      position: { ...newHead },
      total: claims.ouroborosDna,
    });
    return true;
  }

  /** FERAL Minor "Thick Hide": lose 5 tail segments instead of dying. */
  private triggerThickHide(collisionPosition: Position): void {
    this.state.thickHideAvailable = false;
    const loss = Math.min(
      STRAIN_PHYSICS.thickHideSegmentLoss,
      Math.max(0, this.state.snake.length - this.initialLength)
    );
    if (loss > 0) this.state.snake.length = this.state.snake.length - loss;
    // WP-2.05: report the segments ACTUALLY removed, not the nominal 5.
    // This changes no payout - the model's `max(initialLength, len - 5)`
    // and this clamp are the same number, which is why (F) was not a
    // divergence - but a run report should not claim a loss that did not
    // happen.
    this.state.lossEvents.push({
      atFood: this.state.foodEaten,
      segments: loss,
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
    if (!this.genomeActive()) return this.checkSelfCollision(pos);
    if (this.state.phantomTicksRemaining > 0 && this.strainTierNow('UMBRA') >= 2) {
      return false;
    }
    const safeTail = this.hasGene('serpentine')
      ? GENE_PHYSICS.serpentineSafeTailSegments
      : 0;
    const body =
      safeTail > 0
        ? this.state.snake.slice(0, Math.max(1, this.state.snake.length - safeTail))
        : this.state.snake;
    return body.some((s) => s.x === pos.x && s.z === pos.z);
  }

  /** The revive that would fire now, honoring one-revive-per-run. */
  private availableReviveKind(): GenomeRevive['kind'] | null {
    if (this.state.revive !== null) return null;
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
   * Fire the run's one revive: Phoenix physics for every kind (rewind 3
   * cells, reborn at length 8). Classic Phoenix voids economic benefits;
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
    this.rebirthBody();
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

  /**
   * Spawn all foods for a new wave: one food normally, a pair under Splitter,
   * a constellation group of 3 (4 with Splitter) on COSMIC - clustered within
   * groupRadius of the anchor so chains are chaseable.
   *
   * THE OCCUPANCY GRID IS BUILT ONCE PER WAVE, NOT ONCE PER FOOD. That is the
   * shape the owner asked for (2026-07-28: food count must stay "a cheap
   * configuration change", never a rewrite): a wave of N is N placer calls
   * that each exclude what the previous ones placed, with no branch anywhere
   * on the count. Raising `simultaneousFoods` costs one more call and one more
   * `markBlocked`; it does not cost a second code path.
   */
  private spawnFoods(): void {
    const constellation = this.ruleset.constellation;
    // COSMIC keeps wave semantics - the constellation GROUP is the combo
    // mechanic, so its size comes from the ruleset and never from the growth
    // profile. The other two dynasties get the profile's count, which WP-3.06
    // returns to one (owner: "what i certainly don't like are the 3 foods on
    // the screen"). Collapsing this to one unconditionally would silently
    // delete a dynasty's identity.
    const target =
      (constellation
        ? constellation.groupSize
        : Math.max(1, this.growth.simultaneousFoods)) +
      (this.hasMutation('splitter') ? 1 : 0) +
      // Starweaver (COSMIC M3): constellation groups gain one extra food
      (constellation && this.hasMutation('starweaver')
        ? MUTATION_PHYSICS.starweaverExtraGroupFood
        : 0);

    if (constellation) {
      this.state.constellationGlyph = Math.floor(
        this.rng() * constellation.glyphCount
      );
    }

    const blocked = this.waveBlockedGrid();
    const head = this.state.snake[0] ?? { x: 0, y: 0, z: 0 };
    const occupancy =
      this.state.snake.length / Math.max(1, this.gridSize * this.gridSize);
    const anchorRadius = constellation?.groupRadius ?? 4;

    const foods: Position[] = [];
    for (let i = 0; i < target; i++) {
      const cell = chooseFoodCell(
        this.gridSize,
        head,
        blocked,
        occupancy,
        this.rng,
        // Only a constellation clusters. Splitter's extra food on PRIMAL or
        // CYBER is a second target, not a chain link, so it places freely.
        constellation && i > 0
          ? { cell: foods[0], radius: anchorRadius }
          : null
      );
      // `null` means the board holds no free cell at all - the player has
      // filled it. Placing nothing is the honest answer; the wave carries
      // whatever it managed to place.
      if (cell === null) break;
      markBlocked(blocked, this.gridSize, cell.x, cell.z);
      foods.push({ x: cell.x, y: 0, z: cell.z });
    }
    this.state.foods = foods;
    if (foods.length > 0) this.state.food = { ...foods[0] };

    // Meteor Shower (anomaly): every fresh wave gets a 60-tick fuse
    this.state.foodTicksRemaining =
      this.anomaly === 'meteor_shower'
        ? ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
        : 0;
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
    return blocked;
  }

  /**
   * Any terrain in this cell, forming or solid.
   *
   * Forming counts: a decal becomes lethal within a couple of seconds, and
   * food that spawns there would be a trap the player could not have read.
   */
  private isPositionOnTerrain(pos: Position): boolean {
    return this.state.terrain.some((b) => b.x === pos.x && b.z === pos.z);
  }

  /**
   * Spawn food at random valid position(s). Public for compatibility -
   * replaces the whole wave.
   */
  spawnFood(): void {
    this.spawnFoods();
  }

  /**
   * Spawn the exit portal at a random valid position (not on the snake,
   * food, or mutation food). Rejection sampling, mirroring spawnFood.
   * Uses the injectable rng so tests can drive placement deterministically.
   */
  private spawnExit(): void {
    const position = this.sampleExitCell(null);
    this.state.exitTile = position;
    // Twin Exits (anomaly): portals spawn as a pair sharing one window
    this.state.exitTile2 =
      this.anomaly === 'twin_exits' ? this.sampleExitCell(position) : null;
    this.state.exitTicksRemaining = this.effectiveExitDespawnTicks();
    this.recordRunEvent({ t: this.runTimeDs(), e: 'p', k: 'spawn' });
    this.emit('exitSpawned', {
      position: { ...position },
      ...(this.state.exitTile2 ? { position2: { ...this.state.exitTile2 } } : {}),
      ticksRemaining: this.state.exitTicksRemaining,
    });
  }

  /**
   * Rejection-sample one exit cell (not on the snake, food, mutation food,
   * or an already-placed twin portal). Injectable rng - deterministic in
   * tests, placement only, never payout.
   */
  private sampleExitCell(exclude: Position | null): Position {
    let position: Position;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
      position = {
        x: Math.floor(this.rng() * this.gridSize),
        y: 0,
        z: Math.floor(this.rng() * this.gridSize),
      };
      attempts++;
    } while (
      (this.isPositionOnSnake(position) ||
        this.isPositionOnFood(position) ||
        this.isPositionOnMutation(position) ||
        (exclude !== null &&
          exclude.x === position.x &&
          exclude.z === position.z)) &&
      attempts < maxAttempts
    );

    return position;
  }

  /**
   * Spawn the mutation food at a random valid position (not on the snake,
   * food, or exit portal). Injectable rng - deterministic in tests.
   */
  private spawnMutationFood(): void {
    let position: Position;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
      position = {
        x: Math.floor(this.rng() * this.gridSize),
        y: 0,
        z: Math.floor(this.rng() * this.gridSize),
      };
      attempts++;
    } while (
      (this.isPositionOnSnake(position) ||
        this.isPositionOnFood(position) ||
        this.isPositionOnExit(position)) &&
      attempts < maxAttempts
    );

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
    this.state.foods = [{ ...position }];
    this.state.food = { ...position };
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
    this.state.foods = positions.map((p) => ({ ...p }));
    this.state.food = { ...positions[0] };
    if (this.ruleset.constellation && glyph !== undefined) {
      this.state.constellationGlyph = glyph;
    }
  }

  /**
   * Place the exit portal at a specific position (for testing and driven
   * integration flows). Mirrors placeFood.
   */
  placeExit(position: Position, ticksRemaining?: number, position2?: Position): void {
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
      callbacks.forEach(cb => cb(data));
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

  /** Wrap an out-of-bounds position to the opposite edge (COSMIC open phase). */
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
  private trySlide(
    head: Position
  ): { dir: Direction; pos: Position } | null {
    const first = CLOCKWISE[this.state.direction];
    for (const dir of [first, OPPOSITES[first]]) {
      const pos = this.getNextPosition(head, dir);
      if (!this.checkWallCollision(pos) && !this.checkSelfCollision(pos)) {
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
   * the head back onto cells the body already occupies, which is what gives a
   * full-length snake room to escape the jam that killed it.
   */
  private rebirthBody(): void {
    const rewind = Math.min(
      MUTATION_PHYSICS.phoenixRewindCells,
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
    this.directionQueue = [];
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
      blocked.add(cellKey(this.state.mutationTile.x, this.state.mutationTile.z));
    }

    const formingTicks = formingTicksFor(schedule, this.getSpeed());
    for (const cell of nextTerrainCells(
      this.gridSize,
      blocked,
      missing,
      this.rng
    )) {
      this.state.terrain.push({
        ...cell,
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
    return this.genomeActive() && !!this.genome?.runSeed;
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
   * Mutation cadence roll incl. the Patient trait cost: spawn rate -50%
   * means the rolled food-interval doubles (40 +/- 10 instead of 20 +/- 5).
   */
  private rollNextMutationInterval(): number {
    // WP-3.05: rolled from the RUN'S GROWTH PROFILE, not the global
    // `MUTATION_SPAWN` constant it used to read. That constant is why choosing
    // Tuned changed how fast you grew but not how often you were offered a
    // gene - the profile's cadence fields were never wired to anything.
    const interval = rollOfferInterval(this.growth, this.rng);
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
        ? Math.max(1, Math.round((authored * 1000) / Math.max(1, this.getSpeed())))
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
    // FERAL Molt: each molt makes the world permanently faster, compounding.
    // Molt's proportional shed keeps the body long enough to stay dangerous
    // but no longer lets length alone end the run, so the price of shedding
    // is tempo. The loop re-arms from getSpeed() every tick, so this applies
    // the moment a molt fires.
    const molts = this.moltsFired();
    if (molts > 0) {
      speed = Math.max(
        STRAIN_PHYSICS.tickFloorMs,
        Math.floor(speed * Math.pow(STRAIN_PHYSICS.moltTickFactor, molts))
      );
    }
    return speed;
  }

  /**
   * Molts fired so far this run - the exponent of the compounding speed
   * step. Derived from the live length trace rather than a second counter,
   * so it can never drift from the shed events the server recomputes.
   */
  private moltsFired(): number {
    let count = 0;
    for (const event of this.lengthTrace.shedEvents) {
      if (event.source === 'molt') count += 1;
    }
    return count;
  }

  /**
   * COSMIC chain window incl. the Starweaver cost: 2 ticks shorter
   * (bigger groups, tighter chains). Floored at 1 tick defensively.
   */
  private effectiveChainWindowTicks(): number {
    const base = this.ruleset.constellation?.chainWindowTicks ?? 0;
    return Math.max(
      1,
      base -
        (this.hasMutation('starweaver')
          ? MUTATION_PHYSICS.starweaverChainWindowPenalty
          : 0)
    );
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
   * Iron Scales: absorb one wall collision per run. The blocked move is
   * cancelled and the snake recoils one cell backward along its own path
   * (head withdrawn, length preserved by duplicating the tail cell -
   * exactly how Overgrowth already grows), leaving the head a cell clear
   * of the wall with its heading intact - the bounce buys the tick the
   * player needed. A body hit is NOT absorbed (walls only, per the doc).
   */
  private triggerIronScales(collisionPosition: Position): void {
    this.state.ironScalesAvailable = false;

    if (this.state.snake.length >= 2) {
      const tail = this.state.snake[this.state.snake.length - 1];
      this.state.snake = [...this.state.snake.slice(1), { ...tail }];
    }

    this.emit('ironScalesTriggered', {
      position: { ...this.state.snake[0] },
      collision: { ...collisionPosition },
    });
  }

  private checkWallCollision(pos: Position): boolean {
    return pos.x < 0 || pos.x >= this.gridSize || pos.z < 0 || pos.z >= this.gridSize;
  }

  private isInBounds(pos: Position): boolean {
    return !this.checkWallCollision(pos);
  }

  private checkSelfCollision(pos: Position): boolean {
    return this.state.snake.some(s => s.x === pos.x && s.z === pos.z);
  }

  private findFoodIndex(pos: Position): number {
    return this.state.foods.findIndex((f) => f.x === pos.x && f.z === pos.z);
  }

  private isPositionOnSnake(pos: Position): boolean {
    return this.state.snake.some(s => s.x === pos.x && s.z === pos.z);
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

    // After slow-motion delay, trigger actual game over
    setTimeout(() => {
      this.finalizeRun('died');
    }, 800); // 800ms for dramatic effect
  }

  /**
   * End the run - one path for both endings. Death arrives here through
   * the 800ms death sequence; extraction calls it synchronously (no death
   * drama when you leave on your own terms).
   */
  private finalizeRun(reason: EndReason): void {
    this.state.isDeathSequence = false;
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
      cosmic: this.ruleset.constellation
        ? {
            comboDnaBonus: this.state.comboDnaBonus,
            comboScoreBonus: this.state.comboScoreBonus,
            maxChain: this.state.maxChain,
          }
        : null,
      genome: this.genomeActive()
        ? {
            infuses: this.state.infuses.map((i) => ({ ...i })),
            surges: this.state.surges.map((s) => ({ ...s })),
            revive: this.state.revive ? { ...this.state.revive } : null,
            claims: { ...this.state.genomeClaims },
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
    };
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
