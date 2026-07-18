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
 * RNG discipline: the injectable rng drives everything that tests need to
 * be deterministic (exit/mutation cadence rolls, mutation offers, mutation
 * tile placement, constellation glyphs). Food cell placement stays on
 * Math.random - placement affects where things are, never what they pay.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  FOOD_BASE_SCORE,
  RULESETS,
  cosmicComboMultiplier,
  rollExitInterval,
  type DynastyRuleset,
} from '@/shared/game/rulesets';
import {
  MUTATION_PHYSICS,
  MUTATION_POOL,
  MUTATION_SPAWN,
  foodValueFlatBonus,
  foodValueModifier,
  rollMutationInterval,
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
  ANOMALY_PHYSICS,
  anomalyFoodValueModifier,
  type AnomalyId,
} from '@/shared/game/anomalies';

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
  /** Mutations held this run, in pick order. */
  heldMutations: MutationPick[];
  /**
   * The live choice-of-2 offer. While non-null the engine is in "choice
   * hold": tick() no-ops and direction input is inactive, but this is NOT
   * the pause state - the pause menu must not render.
   */
  pendingChoice: [MutationId, MutationId] | null;
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
  isDeathSequence: boolean;
  startTime: number | null;
  deathPosition: Position | null;
}

/** Payload of the 'gameOver' event - one event for both endings. */
export interface GameOverData {
  score: number;
  dnaCollected: number;
  foodEaten: number;
  extracted: boolean;
  endReason: EndReason;
  deathPosition: Position | null;
  /** Mutations held at run end, in pick order (server validates these). */
  mutations: MutationPick[];
  /** Food count at the Phoenix trigger (honest-client analytics + payout). */
  phoenixTriggeredAtFood: number | null;
  /** COSMIC only: the bounded-trust combo claim. Null on other dynasties. */
  cosmic: CosmicComboSummary | null;
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
  | 'fluxPhaseChange';
type EventCallback = (data?: unknown) => void;

interface GameOptions {
  gridSize?: number;
  initialLength?: number;
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
  private traits: TraitId[];
  private mutationPool: MutationId[];
  private anomaly: AnomalyId | null;
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
    this.speed = options.initialSpeed ?? this.ruleset.speedForFood(0);
    this.events = new Map();
    this.directionQueue = [];

    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      snake: [],
      food: { x: 0, y: 0, z: 0 },
      foods: [],
      direction: 'RIGHT',
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      exitTile: null,
      exitTile2: null,
      exitTicksRemaining: 0,
      foodTicksRemaining: 0,
      nextExitAtFood: this.ruleset.extraction.firstExitAtFood,
      extracted: false,
      mutationTile: null,
      mutationTicksRemaining: 0,
      nextMutationAtFood: this.rollNextMutationInterval(),
      heldMutations: [],
      pendingChoice: null,
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
      isDeathSequence: false,
      startTime: null,
      deathPosition: null,
    };
  }

  /**
   * Start or restart the game
   */
  start(): void {
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

    this.speed = this.ruleset.speedForFood(0);
    this.directionQueue = [];
    this.lastEatGlyph = null;
    this.ticksSinceLastEat = 0;
    this.spawnFoods();
    this.emit('gameStart');
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
      this.state.nextExitAtFood = this.ruleset.extraction.firstExitAtFood;
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
      exitTile: this.state.exitTile ? { ...this.state.exitTile } : null,
      exitTile2: this.state.exitTile2 ? { ...this.state.exitTile2 } : null,
      mutationTile: this.state.mutationTile ? { ...this.state.mutationTile } : null,
      heldMutations: this.state.heldMutations.map(m => ({ ...m })),
      pendingChoice: this.state.pendingChoice
        ? [...this.state.pendingChoice]
        : null,
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
      this.state.pendingChoice !== null
    ) {
      return 'inactive';
    }

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
   * pause menu fight the choice UI.
   */
  pause(): void {
    if (
      !this.state.isPlaying ||
      this.state.isGameOver ||
      this.state.isDeathSequence ||
      this.state.pendingChoice !== null
    ) {
      return;
    }
    this.state.isPaused = true;
    this.emit('pause');
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
      this.state.pendingChoice !== null
    ) {
      return;
    }

    // Consume exactly one buffered input per tick
    const queued = this.directionQueue.shift();
    if (queued) {
      this.state.direction = queued;
    }

    const head = this.state.snake[0];
    let newHead = this.getNextPosition(head, this.state.direction);
    let wallHit = this.checkWallCollision(newHead);

    // COSMIC Flux: while the walls are open, edges wrap to the opposite side
    if (wallHit && this.ruleset.flux && this.state.fluxPhase === 'open') {
      newHead = this.wrapPosition(newHead);
      wallHit = false;
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
      }
    }

    const exitExistedAtTickStart = this.state.exitTile !== null;
    const mutationExistedAtTickStart = this.state.mutationTile !== null;

    // Exit-portal collision checks first: the portal is always in-bounds
    // and never on the snake, so stepping onto it ends the run banked -
    // no death sequence on the way out. (A wrapped head can land on it.)
    // Twin Exits (anomaly): either of the pair banks the run.
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
      this.finalizeRun('extracted');
      return;
    }

    if (wallHit || this.checkSelfCollision(newHead)) {
      // Iron Scales (trait): absorb exactly one WALL hit per run - the
      // snake recoils one cell off the wall and the tick is consumed.
      // Checked before Phoenix so the trait save never burns the pickup.
      if (wallHit && this.state.ironScalesAvailable) {
        this.triggerIronScales(newHead);
        this.emit('tick');
        return;
      }
      // Phoenix: absorb exactly one death - rebirth consumes the tick
      if (this.state.phoenixAvailable) {
        this.triggerPhoenix(newHead);
        this.emit('tick');
        return;
      }
      // Start death sequence instead of immediate game over
      this.startDeathSequence(newHead);
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

    this.state.snake.unshift(newHead);

    if (ateFood) {
      const collectedPosition = { ...newHead }; // Position where food was eaten
      this.state.foodEaten += 1;
      const n = this.state.foodEaten;

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

      // Per-food value: base x combo x mutation modifier x trait modifier,
      // one round per food - mirrors computeRunTotals exactly (combo
      // aside, which the server clamps via the bounded-trust summary).
      // Anomaly [E] modifier (Gold Rush x1.5) folds into the SAME single
      // per-food round - mirroring computeRunTotals exactly, so the
      // HUD's DNA counter matches the server recompute to the digit.
      const mod =
        foodValueModifier(
          this.state.heldMutations,
          n,
          this.state.phoenixTriggeredAtFood
        ) *
        traitFoodValueModifier(this.traits, n) *
        anomalyFoodValueModifier(this.anomaly, n);
      // Flat [E] bonus (Deep Roots) added after the per-food round -
      // outside the combo, exactly mirroring computeRunTotals.
      const flat = foodValueFlatBonus(
        this.state.heldMutations,
        n,
        this.state.phoenixTriggeredAtFood
      );
      const baseDna = this.ruleset.foodDnaValue(n);
      const baseScore = Math.round(
        FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n)
      );
      const dnaNoCombo = Math.round(baseDna * mod) + flat;
      const dnaValue = Math.round(baseDna * combo * mod) + flat;
      const scoreValue = Math.round(
        FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n) * combo
      );
      this.state.dnaCollected += dnaValue;
      this.state.score += scoreValue;
      this.state.comboDnaBonus += dnaValue - dnaNoCombo;
      this.state.comboScoreBonus += scoreValue - baseScore;

      // Overgrowth: +2 extra segments per food (the head unshift above is
      // the normal +1 growth - the tail is simply not popped)
      if (this.hasMutation('overgrowth')) {
        const tail = this.state.snake[this.state.snake.length - 1];
        for (let i = 0; i < MUTATION_PHYSICS.overgrowthExtraSegments; i++) {
          this.state.snake.push({ ...tail });
        }
      }

      // Shed: every 25 foods after pickup, the tail resets to length 8
      const shedPick = this.state.heldMutations.find((m) => m.id === 'shed');
      if (
        shedPick &&
        n > shedPick.atFood &&
        (n - shedPick.atFood) % MUTATION_PHYSICS.shedEveryFoods === 0 &&
        this.state.snake.length > MUTATION_PHYSICS.shedResetLength
      ) {
        this.state.snake.length = MUTATION_PHYSICS.shedResetLength;
      }

      this.speed = this.effectiveSpeedForFood(n);

      // Remove the eaten food; a new wave spawns only once all are eaten
      this.state.foods.splice(foodIndex, 1);
      if (this.state.foods.length === 0) {
        this.spawnFoods();
      } else {
        this.state.food = { ...this.state.foods[0] };
      }

      if (!this.state.exitTile && n >= this.state.nextExitAtFood) {
        this.spawnExit();
      }
      // Ascetic (trait): mutation food never spawns - no builds, pure snake
      if (
        !this.state.mutationTile &&
        !ateMutation &&
        !this.hasTrait('ascetic') &&
        this.state.heldMutations.length < MUTATION_SPAWN.maxHeld &&
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
        this.state.nextExitAtFood =
          this.state.foodEaten + this.rollNextExitInterval();
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

    // COSMIC chain window countdown
    if (this.ruleset.constellation) {
      this.ticksSinceLastEat = Math.min(this.ticksSinceLastEat + 1, 1_000_000);
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

    const pick: MutationPick = { id, atFood: this.state.foodEaten };
    this.state.pendingChoice = null;
    this.applyPick(pick);

    this.emit('mutationPicked', {
      id,
      atFood: pick.atFood,
      held: this.state.heldMutations.map((m) => ({ ...m })),
    });
    return true;
  }

  /**
   * Grant a mutation directly (for testing and driven flows): the same
   * pick pipeline as chooseMutation, without an offer. atFood defaults to
   * the current food count. Mirrors placeFood/placeExit.
   */
  grantMutation(id: MutationId, atFood?: number): void {
    this.applyPick({ id, atFood: atFood ?? this.state.foodEaten });
  }

  /** Shared pick pipeline: hold the mutation + immediate physical effects. */
  private applyPick(pick: MutationPick): void {
    this.state.heldMutations.push(pick);
    if (pick.id === 'phoenix') {
      this.state.phoenixAvailable = true;
    }
    if (
      (pick.id === 'gold_trail' ||
        pick.id === 'deep_roots' ||
        pick.id === 'afterburner' ||
        pick.id === 'glacial_reserve') &&
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
    this.emit('mutationDeclined');
  }

  /**
   * Spawn all foods for a new wave: a single food normally, a pair under
   * Splitter, a constellation group of 3 (4 with Splitter) on COSMIC -
   * clustered within groupRadius of the anchor so chains are chaseable.
   */
  private spawnFoods(): void {
    const constellation = this.ruleset.constellation;
    const target =
      (constellation ? constellation.groupSize : 1) +
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

    const foods: Position[] = [];
    for (let i = 0; i < target; i++) {
      foods.push(this.sampleFoodCell(foods, i === 0 ? null : foods[0]));
    }
    this.state.foods = foods;
    this.state.food = { ...foods[0] };

    // Meteor Shower (anomaly): every fresh wave gets a 60-tick fuse
    this.state.foodTicksRemaining =
      this.anomaly === 'meteor_shower'
        ? ANOMALY_PHYSICS.meteorShowerFoodDespawnTicks
        : 0;
  }

  /** Rejection-sample one food cell (optionally clustered near an anchor). */
  private sampleFoodCell(placed: Position[], anchor: Position | null): Position {
    const radius = this.ruleset.constellation?.groupRadius ?? 4;
    let position: Position = { x: 0, y: 0, z: 0 };
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      attempts++;
      if (anchor && attempts <= maxAttempts / 2) {
        // Cluster around the anchor; fall back to anywhere if the
        // neighborhood is too crowded
        position = {
          x: anchor.x + Math.floor(Math.random() * (2 * radius + 1)) - radius,
          y: 0,
          z: anchor.z + Math.floor(Math.random() * (2 * radius + 1)) - radius,
        };
        if (
          position.x < 0 ||
          position.x >= this.gridSize ||
          position.z < 0 ||
          position.z >= this.gridSize
        ) {
          continue;
        }
      } else {
        position = {
          x: Math.floor(Math.random() * this.gridSize),
          y: 0,
          z: Math.floor(Math.random() * this.gridSize),
        };
      }

      if (
        !this.isPositionOnSnake(position) &&
        !this.isPositionOnExit(position) &&
        !this.isPositionOnMutation(position) &&
        !placed.some((p) => p.x === position.x && p.z === position.z)
      ) {
        return position;
      }
    }
    return position;
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
   * Phoenix rebirth: consume the one-time save, rewind the head 3 cells
   * along the body, truncate to length 8, void economic benefits from
   * here on (see mutations.ts), and re-derive the heading from the body.
   */
  private triggerPhoenix(collisionPosition: Position): void {
    this.state.phoenixAvailable = false;
    this.state.phoenixTriggeredAtFood = this.state.foodEaten;

    const rewind = Math.min(
      MUTATION_PHYSICS.phoenixRewindCells,
      Math.max(0, this.state.snake.length - 1)
    );
    let reborn = this.state.snake.slice(
      rewind,
      rewind + MUTATION_PHYSICS.phoenixRebirthLength
    );
    if (reborn.length === 0) {
      reborn = this.state.snake.slice(0, MUTATION_PHYSICS.phoenixRebirthLength);
    }
    this.state.snake = reborn.map((s) => ({ ...s }));

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

    this.emit('phoenixTriggered', {
      atFood: this.state.phoenixTriggeredAtFood,
      position: { ...this.state.snake[0] },
      collision: { ...collisionPosition },
    });
  }

  /** Open the choice-of-2 hold after eating the mutation food. */
  private openMutationChoice(): void {
    this.state.mutationTile = null;
    this.state.mutationTicksRemaining = 0;
    this.state.nextMutationAtFood =
      this.state.foodEaten + this.rollNextMutationInterval();

    const offer = rollMutationOffer(
      this.state.heldMutations.map((m) => m.id),
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
    // Largest active pull radius wins - Gravity Well (3) > Magnet Pulse
    // (2) > Magnetism (1); the pull itself never stacks.
    const radius = this.hasMutation('gravity_well')
      ? MUTATION_PHYSICS.gravityWellRadius
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
        this.state.foods.some(
          (f) => f !== food && f.x === target.x && f.z === target.z
        );
      if (!blocked) {
        food.x = target.x;
        food.z = target.z;
      }
    }
    this.state.food = { ...this.state.foods[0] };
  }

  /**
   * Exit interval roll incl. the Magnet Pulse cost (+4 foods) and the
   * Magnetism trait cost (+2 foods). The costs stack additively - each
   * pull source pays its own portal tax.
   */
  private rollNextExitInterval(): number {
    return (
      rollExitInterval(this.ruleset.extraction, this.rng) +
      (this.hasMutation('magnet_pulse')
        ? MUTATION_PHYSICS.magnetPortalIntervalPenalty
        : 0) +
      (this.hasMutation('solstice_engine')
        ? MUTATION_PHYSICS.solsticeEnginePortalIntervalPenalty
        : 0) +
      (this.hasTrait('magnetism')
        ? TRAIT_PHYSICS.magnetismPortalIntervalPenalty
        : 0) +
      // Gold Rush (anomaly): richer food, rarer doors - interval +6
      (this.anomaly === 'gold_rush'
        ? ANOMALY_PHYSICS.goldRushPortalIntervalPenalty
        : 0)
    );
  }

  /**
   * Mutation cadence roll incl. the Patient trait cost: spawn rate -50%
   * means the rolled food-interval doubles (40 +/- 10 instead of 20 +/- 5).
   */
  private rollNextMutationInterval(): number {
    const interval = rollMutationInterval(this.rng);
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
    let ticks = this.hasMutation('gold_trail')
      ? Math.min(
          this.ruleset.extraction.despawnTicks,
          MUTATION_PHYSICS.goldTrailPortalTicks
        )
      : this.ruleset.extraction.despawnTicks;
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
    return Math.max(MUTATION_PHYSICS.minExitDespawnTicks, ticks);
  }

  /**
   * Tick speed incl. Time Dilation: CYBER runs the speed curve one tier
   * (5 foods) behind while keeping its DNA multiplier; fixed-speed
   * dynasties simply gain +40 ms/tick.
   */
  private effectiveSpeedForFood(foodEaten: number): number {
    if (!this.hasMutation('time_dilation')) {
      return this.ruleset.speedForFood(foodEaten);
    }
    if (this.ruleset.id === 'CYBER') {
      return this.ruleset.speedForFood(
        Math.max(0, foodEaten - MUTATION_PHYSICS.timeDilationCyberFoodOffset)
      );
    }
    return (
      this.ruleset.speedForFood(foodEaten) + MUTATION_PHYSICS.timeDilationSlowMs
    );
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

  private hasMutation(id: MutationId): boolean {
    return this.state.heldMutations.some((m) => m.id === id);
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
   * Start death sequence with slow-motion effect
   */
  private startDeathSequence(collisionPosition: Position): void {
    this.state.isDeathSequence = true;
    this.state.deathPosition = { ...collisionPosition };

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

    if (reason === 'extracted') {
      this.state.extracted = true;
      this.state.exitTile = null;
      this.state.exitTile2 = null;
      this.state.exitTicksRemaining = 0;
      this.emit('extracted', {
        score: this.state.score,
        dnaCollected: this.state.dnaCollected,
        foodEaten: this.state.foodEaten,
      });
    }

    const payload: GameOverData = {
      score: this.state.score,
      dnaCollected: this.state.dnaCollected,
      foodEaten: this.state.foodEaten,
      extracted: this.state.extracted,
      endReason: reason,
      deathPosition: this.state.deathPosition,
      mutations: this.state.heldMutations.map((m) => ({ ...m })),
      phoenixTriggeredAtFood: this.state.phoenixTriggeredAtFood,
      cosmic: this.ruleset.constellation
        ? {
            comboDnaBonus: this.state.comboDnaBonus,
            comboScoreBonus: this.state.comboScoreBonus,
            maxChain: this.state.maxChain,
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
}
