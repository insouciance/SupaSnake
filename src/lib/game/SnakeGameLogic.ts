/**
 * Snake Game Logic - Core Game Engine
 * Pure game logic decoupled from rendering
 */

import { GAME_CONFIG } from '@/shared/config/game';

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

export interface GameState {
  snake: Position[];
  food: Position;
  direction: Direction;
  score: number;
  dnaCollected: number;
  isPlaying: boolean;
  isGameOver: boolean;
  isPaused: boolean;
  isDeathSequence: boolean;
  startTime: number | null;
  deathPosition: Position | null;
}

type GameEvent = 'gameStart' | 'gameOver' | 'foodCollected' | 'tick' | 'pause' | 'resume' | 'deathSequence';
type EventCallback = (data?: unknown) => void;

interface GameOptions {
  gridSize?: number;
  initialLength?: number;
  initialSpeed?: number;
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
  private minSpeed: number;
  private speedIncrease: number;
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
    this.speed = options.initialSpeed ?? GAME_CONFIG.snake.initialSpeed;
    this.minSpeed = GAME_CONFIG.snake.minSpeed;
    this.speedIncrease = GAME_CONFIG.snake.speedIncrease;
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
      isPlaying: true,
      isGameOver: false,
      isPaused: false,
      isDeathSequence: false,
      startTime: Date.now(),
      deathPosition: null,
    };

    this.speed = GAME_CONFIG.snake.initialSpeed;
    this.directionQueue = [];
    this.spawnFood();
    this.emit('gameStart');
  }

  /**
   * Get current game state (immutable copy)
   */
  getState(): GameState {
    return {
      ...this.state,
      snake: this.state.snake.map(s => ({ ...s })),
      food: { ...this.state.food },
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

    if (this.checkWallCollision(newHead) || this.checkSelfCollision(newHead)) {
      // Start death sequence instead of immediate game over
      this.startDeathSequence(newHead);
      return;
    }

    const ateFood = this.checkFoodCollision(newHead);

    this.state.snake.unshift(newHead);

    if (ateFood) {
      const collectedPosition = { ...newHead }; // Position where food was eaten
      this.state.score += 1;
      this.state.dnaCollected += GAME_CONFIG.economy.dna.foodValue;
      this.increaseSpeed();
      this.spawnFood();
      this.emit('foodCollected', {
        position: collectedPosition,
        score: this.state.score,
        dna: this.state.dnaCollected,
      });
    } else {
      this.state.snake.pop();
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
    } while (this.isPositionOnSnake(position) && attempts < maxAttempts);

    this.state.food = position;
  }

  /**
   * Place food at specific position (for testing)
   */
  placeFood(position: Position): void {
    this.state.food = { ...position };
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

  private increaseSpeed(): void {
    // Logarithmic speed curve - stays playable at high scores
    // Formula: speed = initialSpeed / (1 + 0.03 * score)
    // This approaches ~80ms asymptotically instead of hitting 50ms linearly
    const initialSpeed = GAME_CONFIG.snake.initialSpeed;
    const newSpeed = initialSpeed / (1 + 0.03 * this.state.score);
    this.speed = Math.max(this.minSpeed, Math.floor(newSpeed));
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
      this.finalizeGameOver();
    }, 800); // 800ms for dramatic effect
  }

  /**
   * Complete the game over after death sequence
   */
  private finalizeGameOver(): void {
    this.state.isDeathSequence = false;
    this.state.isGameOver = true;
    this.state.isPlaying = false;

    this.emit('gameOver', {
      score: this.state.score,
      dnaCollected: this.state.dnaCollected,
      deathPosition: this.state.deathPosition,
    });
  }

  /**
   * Get death position (for visual effects)
   */
  getDeathPosition(): Position | null {
    return this.state.deathPosition ? { ...this.state.deathPosition } : null;
  }
}
