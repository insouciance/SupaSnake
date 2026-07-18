/**
 * Game State Store (Zustand)
 * Global game state management
 */

import { create } from 'zustand';
import type { DynastyId } from '@/shared/types/game';
import type {
  Position,
  Direction,
  EndReason,
  FluxPhase,
} from '@/lib/game/SnakeGameLogic';
import type { MutationId, MutationPick } from '@/shared/game/mutations';
import { DEFAULT_AIM_SYSTEM, type AimSystemId } from '@/lib/game/aimSystems';
import { GAME_CONFIG } from '@/shared/config/game';

/**
 * Run mode (Design v2 §7.4): 'earn' spends energy and pays DNA; 'free' is
 * unlimited, energy-free practice that pays nothing.
 */
export type GameMode = 'earn' | 'free';

export interface GameStore {
  // Game state
  isPlaying: boolean;
  isGameOver: boolean;
  isPaused: boolean;
  isDeathSequence: boolean;
  isReady: boolean;
  score: number;
  dnaCollected: number;
  /** Raw foods eaten this run (mirrored from the engine). */
  foodEaten: number;
  /** How the last run ended: 'extracted' (banked) or 'died' (salvage). */
  endReason: EndReason | null;

  // Energy system (synced from server)
  energy: number;
  maxEnergy: number;
  energyRegenAt: string | null; // ISO timestamp from server when next energy regenerates

  // Run mode: earning (energy-gated, rewarded) vs free play (unlimited,
  // rewardless practice). Survives resetGame so Play Again keeps the mode.
  gameMode: GameMode;

  // Dynasty
  selectedDynasty: DynastyId;

  // Aim telegraph system (synced from server player_settings)
  aimSystem: AimSystemId;

  // Snake state (for rendering)
  snake: Position[];
  food: Position | null;
  direction: Direction;
  /** Buffered inputs mirrored from the engine (for the aim telegraph) */
  queuedDirections: Direction[];
  deathPosition: Position | null;
  /** Live exit portal cell (extraction banking), null when none. */
  exitTile: Position | null;
  /** Ticks until the live exit portal despawns. */
  exitTicksRemaining: number;

  // Design v2 Phase 2: mutation food + COSMIC Flux (mirrored from engine)
  /** Food cells beyond the primary one (Splitter pairs, COSMIC groups). */
  extraFoods: Position[];
  /** COSMIC: glyph (0..2) of the live constellation group, else null. */
  constellationGlyph: number | null;
  /** COSMIC: current chain length + combo multiplier (for the HUD chip). */
  chainLength: number;
  comboMultiplier: number;
  /** Live mutation food cell, null when none. */
  mutationTile: Position | null;
  mutationTicksRemaining: number;
  /** Mutations held this run, in pick order. */
  heldMutations: MutationPick[];
  /** Live choice-of-2 offer (engine is frozen in its choice hold). */
  choiceOptions: [MutationId, MutationId] | null;
  /** True once Phoenix absorbed a death this run. */
  phoenixTriggered: boolean;
  /** COSMIC wrap-phase state (drives the ArenaBorder rails). */
  fluxPhase: FluxPhase | null;
  fluxTelegraph: boolean;

  // Audio state
  isMuted: boolean;

  // Actions
  startGame: () => void;
  endGame: (score: number, dna: number, endReason?: EndReason) => void;
  resetGame: () => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
  setDeathSequence: (active: boolean, position?: Position) => void;
  setReady: (ready: boolean) => void;
  setScore: (score: number) => void;
  incrementScore: () => void;
  setDnaCollected: (dna: number) => void;
  setFoodEaten: (foodEaten: number) => void;
  setExitTile: (exitTile: Position | null, ticksRemaining?: number) => void;
  setSelectedDynasty: (dynasty: DynastyId) => void;
  setAimSystem: (aimSystem: AimSystemId) => void;
  setEnergy: (energy: number) => void;
  syncEnergyFromServer: (energy: number, energyRegenAt: string | null) => void;
  setGameMode: (gameMode: GameMode) => void;
  setSnake: (snake: Position[]) => void;
  setFood: (food: Position | null) => void;
  setDirection: (direction: Direction) => void;
  setQueuedDirections: (queuedDirections: Direction[]) => void;
  setDeathPosition: (position: Position | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;

  // Design v2 Phase 2 actions
  setExtraFoods: (extraFoods: Position[]) => void;
  setConstellation: (
    glyph: number | null,
    chainLength: number,
    comboMultiplier: number
  ) => void;
  setMutationTile: (tile: Position | null, ticksRemaining?: number) => void;
  setHeldMutations: (held: MutationPick[]) => void;
  setChoiceOptions: (options: [MutationId, MutationId] | null) => void;
  setPhoenixTriggered: (triggered: boolean) => void;
  setFlux: (phase: FluxPhase | null, telegraph: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  isPlaying: false,
  isGameOver: false,
  isPaused: false,
  isDeathSequence: false,
  isReady: false,
  score: 0,
  dnaCollected: 0,
  foodEaten: 0,
  endReason: null,
  energy: GAME_CONFIG.economy.energy.maxEnergy,
  maxEnergy: GAME_CONFIG.economy.energy.maxEnergy,
  energyRegenAt: null, // Synced from server
  gameMode: 'earn',
  selectedDynasty: 'CYBER',
  aimSystem: DEFAULT_AIM_SYSTEM,
  snake: [],
  food: null,
  direction: 'RIGHT',
  queuedDirections: [],
  deathPosition: null,
  exitTile: null,
  exitTicksRemaining: 0,
  extraFoods: [],
  constellationGlyph: null,
  chainLength: 0,
  comboMultiplier: 1,
  mutationTile: null,
  mutationTicksRemaining: 0,
  heldMutations: [],
  choiceOptions: null,
  phoenixTriggered: false,
  fluxPhase: null,
  fluxTelegraph: false,
  isMuted: false,

  // Actions
  startGame: () => {
    // Energy is now deducted server-side in the game session API
    // This just updates UI state - caller must first call /api/game/session
    set({
      isPlaying: true,
      isGameOver: false,
      isPaused: false,
      isDeathSequence: false,
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      endReason: null,
      direction: 'RIGHT',
      queuedDirections: [],
      deathPosition: null,
      exitTile: null,
      exitTicksRemaining: 0,
      extraFoods: [],
      constellationGlyph: null,
      chainLength: 0,
      comboMultiplier: 1,
      mutationTile: null,
      mutationTicksRemaining: 0,
      heldMutations: [],
      choiceOptions: null,
      phoenixTriggered: false,
      fluxPhase: null,
      fluxTelegraph: false,
    });
  },

  endGame: (score: number, dna: number, endReason: EndReason = 'died') => {
    // heldMutations and phoenixTriggered survive into game-over on purpose:
    // the game-over screen lists the run's build and its outcome multiplier
    set({
      isPlaying: false,
      isGameOver: true,
      isPaused: false,
      isDeathSequence: false,
      score,
      dnaCollected: dna,
      endReason,
      exitTile: null,
      exitTicksRemaining: 0,
      mutationTile: null,
      mutationTicksRemaining: 0,
      choiceOptions: null,
    });
  },

  resetGame: () => {
    set({
      isPlaying: false,
      isGameOver: false,
      isPaused: false,
      isDeathSequence: false,
      isReady: false,
      score: 0,
      dnaCollected: 0,
      foodEaten: 0,
      endReason: null,
      snake: [],
      food: null,
      direction: 'RIGHT',
      queuedDirections: [],
      deathPosition: null,
      exitTile: null,
      exitTicksRemaining: 0,
      extraFoods: [],
      constellationGlyph: null,
      chainLength: 0,
      comboMultiplier: 1,
      mutationTile: null,
      mutationTicksRemaining: 0,
      heldMutations: [],
      choiceOptions: null,
      phoenixTriggered: false,
      fluxPhase: null,
      fluxTelegraph: false,
    });
  },

  setPaused: (paused: boolean) => {
    const { isPlaying, isGameOver, isDeathSequence } = get();
    if (!isPlaying || isGameOver || isDeathSequence) return;
    set({ isPaused: paused });
  },

  togglePause: () => {
    const { isPaused, isPlaying, isGameOver, isDeathSequence } = get();
    if (!isPlaying || isGameOver || isDeathSequence) return;
    set({ isPaused: !isPaused });
  },

  setDeathSequence: (active: boolean, position?: Position) => {
    set({
      isDeathSequence: active,
      deathPosition: position || null,
    });
  },

  setReady: (ready: boolean) => {
    set({ isReady: ready });
  },

  setScore: (score: number) => {
    set({ score });
  },

  incrementScore: () => {
    set(state => ({ score: state.score + 1 }));
  },

  setDnaCollected: (dna: number) => {
    set({ dnaCollected: dna });
  },

  setFoodEaten: (foodEaten: number) => {
    set({ foodEaten });
  },

  setExitTile: (exitTile: Position | null, ticksRemaining: number = 0) => {
    set({
      exitTile,
      exitTicksRemaining: exitTile ? ticksRemaining : 0,
    });
  },

  setSelectedDynasty: (dynasty: DynastyId) => {
    set({ selectedDynasty: dynasty });
  },

  setAimSystem: (aimSystem: AimSystemId) => {
    set({ aimSystem });
  },

  setEnergy: (energy: number) => {
    // Allow bonus energy above maxEnergy (from purchases)
    set({ energy: Math.max(0, energy) });
  },

  syncEnergyFromServer: (energy: number, energyRegenAt: string | null) => {
    // Allow bonus energy above maxEnergy (from purchases)
    set({
      energy: Math.max(0, energy),
      energyRegenAt,
    });
  },

  setGameMode: (gameMode: GameMode) => {
    set({ gameMode });
  },

  setSnake: (snake: Position[]) => {
    set({ snake });
  },

  setFood: (food: Position | null) => {
    set({ food });
  },

  setDirection: (direction: Direction) => {
    set({ direction });
  },

  setQueuedDirections: (queuedDirections: Direction[]) => {
    set({ queuedDirections });
  },

  setDeathPosition: (position: Position | null) => {
    set({ deathPosition: position });
  },

  setMuted: (muted: boolean) => {
    set({ isMuted: muted });
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  // Design v2 Phase 2 actions
  setExtraFoods: (extraFoods: Position[]) => {
    set({ extraFoods });
  },

  setConstellation: (
    glyph: number | null,
    chainLength: number,
    comboMultiplier: number
  ) => {
    set({ constellationGlyph: glyph, chainLength, comboMultiplier });
  },

  setMutationTile: (tile: Position | null, ticksRemaining: number = 0) => {
    set({
      mutationTile: tile,
      mutationTicksRemaining: tile ? ticksRemaining : 0,
    });
  },

  setHeldMutations: (held: MutationPick[]) => {
    set({ heldMutations: held });
  },

  setChoiceOptions: (options: [MutationId, MutationId] | null) => {
    set({ choiceOptions: options });
  },

  setPhoenixTriggered: (triggered: boolean) => {
    set({ phoenixTriggered: triggered });
  },

  setFlux: (phase: FluxPhase | null, telegraph: boolean) => {
    set({ fluxPhase: phase, fluxTelegraph: phase ? telegraph : false });
  },
}));
