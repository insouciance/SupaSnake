/**
 * Snake Game Logic - Core Game Engine
 * Pure game logic decoupled from rendering
 *
 * Design v2: dynasty rulesets drive speed and scoring (injected via
 * GameOptions.ruleset / setRuleset), and runs can end two ways - death or
 * extraction through a periodically spawning exit portal. All payout math
 * is delegated to the shared ruleset module so the server can recompute
 * it exactly from the raw food count.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  FOOD_BASE_SCORE,
  RULESETS,
  rollExitInterval,
  type DynastyRuleset,
} from '@/shared/game/rulesets';

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

export interface GameState {
  snake: Position[];
  food: Position;
  direction: Direction;
  /** Display points (ruleset-multiplied) - no longer the food count. */
  score: number;
  /** Raw DNA total (pre bank/salvage multiplier - the server applies that). */
  dnaCollected: number;
  /** Raw foods eaten this run - the fact the server recomputes from. */
  foodEaten: number;
  /** Exit portal cell, when one is live. */
  exitTile: Position | null;
  /** Ticks until the live exit portal despawns. */
  exitTicksRemaining: number;
  /** Food count at which the next exit portal spawns. */
  nextExitAtFood: number;
  /** True once the run ended through the exit portal. */
  extracted: boolean;
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
  | 'extracted';
type EventCallback = (data?: unknown) => void;

interface GameOptions {
  gridSize?: number;
  initialLength?: number;
  initialSpeed?: number;
  /**
   * Dynasty ruleset driving speed + scoring. Defaults to the COSMIC
   * placeholder (fixed speed, flat food value). The page swaps in the
   * equipped snake's ruleset via setRuleset once the collection resolves.
   */
  ruleset?: DynastyRuleset;
  /**
   * Random source for extraction-spawn timing (injectable for
   * deterministic tests). Never used for scoring.
   */
  rng?: () => number;
}

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

  constructor(options: GameOptions = {}) {
    this.gridSize = options.gridSize ?? GAME_CONFIG.board.gridSize;
    this.initialLength = options.initialLength ?? GAME_CONFIG.snake.initialLength;
    this.ruleset = options.ruleset ?? RULESETS.COSMIC;
    this.rng = options.rng ?? Math.random;
    this.speed = options.initialSpeed ?? this.ruleset.speedForFood(0);
    this.events = new Map();
    this.directionQueue = [];

    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      snake: [],
      food: { x: 0, y: 0, z: 0 },
      direction: 'RIGHT',
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      exitTile: null,
      exitTicksRemaining: 0,
      nextExitAtFood: this.ruleset.extraction.firstExitAtFood,
      extracted: false,
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

    this.state = {
      snake,
      food: { x: 0, y: 0, z: 0 },
      direction: 'RIGHT',
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      exitTile: null,
      exitTicksRemaining: 0,
      nextExitAtFood: this.ruleset.extraction.firstExitAtFood,
      extracted: false,
      isPlaying: true,
      isGameOver: false,
      isPaused: false,
      isDeathSequence: false,
      startTime: Date.now(),
      deathPosition: null,
    };

    this.speed = this.ruleset.speedForFood(0);
    this.directionQueue = [];
    this.spawnFood();
    this.emit('gameStart');
  }

  /**
   * Swap the active dynasty ruleset. Needed because the page constructs
   * the engine on mount, before the equipped snake's dynasty arrives from
   * the collection API. Takes effect immediately: speed follows the new
   * ruleset's curve at the current food count, and (outside a live run)
   * the first-exit threshold follows the new cadence.
   */
  setRuleset(ruleset: DynastyRuleset): void {
    this.ruleset = ruleset;
    this.speed = this.ruleset.speedForFood(this.state.foodEaten);
    if (!this.state.isPlaying && !this.state.exitTile) {
      this.state.nextExitAtFood = this.ruleset.extraction.firstExitAtFood;
    }
  }

  /** The active dynasty ruleset. */
  getRuleset(): DynastyRuleset {
    return this.ruleset;
  }

  /**
   * Get current game state (immutable copy)
   */
  getState(): GameState {
    return {
      ...this.state,
      snake: this.state.snake.map(s => ({ ...s })),
      food: { ...this.state.food },
      exitTile: this.state.exitTile ? { ...this.state.exitTile } : null,
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
    if (!this.state.isPlaying || this.state.isGameOver || this.state.isPaused) {
      return 'inactive';
    }

    const opposites: Record<Direction, Direction> = {
      UP: 'DOWN',
      DOWN: 'UP',
      LEFT: 'RIGHT',
      RIGHT: 'LEFT',
    };

    const reference =
      this.directionQueue.length > 0
        ? this.directionQueue[this.directionQueue.length - 1]
        : this.state.direction;

    if (dir === reference) return 'duplicate';
    if (dir === opposites[reference]) return 'reversal';
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
   * Pause the game
   */
  pause(): void {
    if (!this.state.isPlaying || this.state.isGameOver || this.state.isDeathSequence) return;
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
    if (!this.state.isPlaying || this.state.isGameOver || this.state.isPaused || this.state.isDeathSequence) return;

    // Consume exactly one buffered input per tick
    const queued = this.directionQueue.shift();
    if (queued) {
      this.state.direction = queued;
    }

    const head = this.state.snake[0];
    const newHead = this.getNextPosition(head, this.state.direction);

    // Exit-portal collision checks first: the portal is always in-bounds
    // and never on the snake, so stepping onto it ends the run banked -
    // no death sequence on the way out.
    const exitExistedAtTickStart = this.state.exitTile !== null;
    if (
      this.state.exitTile &&
      newHead.x === this.state.exitTile.x &&
      newHead.z === this.state.exitTile.z
    ) {
      this.state.snake.unshift(newHead);
      this.state.snake.pop();
      this.finalizeRun('extracted');
      return;
    }

    if (this.checkWallCollision(newHead) || this.checkSelfCollision(newHead)) {
      // Start death sequence instead of immediate game over
      this.startDeathSequence(newHead);
      return;
    }

    const ateFood = this.checkFoodCollision(newHead);

    this.state.snake.unshift(newHead);

    if (ateFood) {
      const collectedPosition = { ...newHead }; // Position where food was eaten
      this.state.foodEaten += 1;
      const n = this.state.foodEaten;
      this.state.score += Math.round(FOOD_BASE_SCORE * this.ruleset.scoreMultiplier(n));
      this.state.dnaCollected += this.ruleset.foodDnaValue(n);
      this.speed = this.ruleset.speedForFood(n);
      this.spawnFood();
      if (!this.state.exitTile && n >= this.state.nextExitAtFood) {
        this.spawnExit();
      }
      this.emit('foodCollected', {
        position: collectedPosition,
        score: this.state.score,
        dna: this.state.dnaCollected,
        foodEaten: this.state.foodEaten,
      });
    } else {
      this.state.snake.pop();
    }

    // Exit-portal lifetime countdown (only for portals that were already
    // live when the tick began, so a fresh spawn gets its full window)
    if (this.state.exitTile && exitExistedAtTickStart) {
      this.state.exitTicksRemaining -= 1;
      if (this.state.exitTicksRemaining <= 0) {
        this.state.exitTile = null;
        this.state.exitTicksRemaining = 0;
        this.state.nextExitAtFood =
          this.state.foodEaten + rollExitInterval(this.ruleset.extraction, this.rng);
        this.emit('exitDespawned');
      }
    }

    this.emit('tick');
  }

  /**
   * Spawn food at random valid position
   */
  spawnFood(): void {
    let position: Position;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
      position = {
        x: Math.floor(Math.random() * this.gridSize),
        y: 0,
        z: Math.floor(Math.random() * this.gridSize),
      };
      attempts++;
    } while (
      (this.isPositionOnSnake(position) || this.isPositionOnExit(position)) &&
      attempts < maxAttempts
    );

    this.state.food = position;
  }

  /**
   * Spawn the exit portal at a random valid position (not on the snake,
   * not on the food). Rejection sampling, mirroring spawnFood. Uses the
   * injectable rng so tests can drive placement deterministically.
   */
  private spawnExit(): void {
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
        (position.x === this.state.food.x && position.z === this.state.food.z)) &&
      attempts < maxAttempts
    );

    this.state.exitTile = position;
    this.state.exitTicksRemaining = this.ruleset.extraction.despawnTicks;
    this.emit('exitSpawned', {
      position: { ...position },
      ticksRemaining: this.state.exitTicksRemaining,
    });
  }

  /**
   * Place food at specific position (for testing)
   */
  placeFood(position: Position): void {
    this.state.food = { ...position };
  }

  /**
   * Place the exit portal at a specific position (for testing and driven
   * integration flows). Mirrors placeFood.
   */
  placeExit(position: Position, ticksRemaining?: number): void {
    this.state.exitTile = { ...position };
    this.state.exitTicksRemaining =
      ticksRemaining ?? this.ruleset.extraction.despawnTicks;
    this.emit('exitSpawned', {
      position: { ...position },
      ticksRemaining: this.state.exitTicksRemaining,
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

  private checkWallCollision(pos: Position): boolean {
    return pos.x < 0 || pos.x >= this.gridSize || pos.z < 0 || pos.z >= this.gridSize;
  }

  private checkSelfCollision(pos: Position): boolean {
    return this.state.snake.some(s => s.x === pos.x && s.z === pos.z);
  }

  private checkFoodCollision(pos: Position): boolean {
    return pos.x === this.state.food.x && pos.z === this.state.food.z;
  }

  private isPositionOnSnake(pos: Position): boolean {
    return this.state.snake.some(s => s.x === pos.x && s.z === pos.z);
  }

  private isPositionOnExit(pos: Position): boolean {
    return (
      this.state.exitTile !== null &&
      this.state.exitTile.x === pos.x &&
      this.state.exitTile.z === pos.z
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
