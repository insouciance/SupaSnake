/**
 * Game State Store (Zustand)
 * Global game state management
 */

import { create } from 'zustand';
import type { DynastyId } from '@/shared/types/game';
import type { Position, Direction, EndReason } from '@/lib/game/SnakeGameLogic';
import { DEFAULT_AIM_SYSTEM, type AimSystemId } from '@/lib/game/aimSystems';
import { GAME_CONFIG } from '@/shared/config/game';

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
  setSnake: (snake: Position[]) => void;
  setFood: (food: Position | null) => void;
  setDirection: (direction: Direction) => void;
  setQueuedDirections: (queuedDirections: Direction[]) => void;
  setDeathPosition: (position: Position | null) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
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
  selectedDynasty: 'CYBER',
  aimSystem: DEFAULT_AIM_SYSTEM,
  snake: [],
  food: null,
  direction: 'RIGHT',
  queuedDirections: [],
  deathPosition: null,
  exitTile: null,
  exitTicksRemaining: 0,
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
    });
  },

  endGame: (score: number, dna: number, endReason: EndReason = 'died') => {
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
}));
