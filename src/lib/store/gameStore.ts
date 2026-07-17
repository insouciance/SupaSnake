/**
 * Game State Store (Zustand)
 * Global game state management
 */

import { create } from 'zustand';
import type { DynastyId } from '@/shared/types/game';
import type { Position, Direction } from '@/lib/game/SnakeGameLogic';
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

  // Energy system (synced from server)
  energy: number;
  maxEnergy: number;
  energyRegenAt: string | null; // ISO timestamp from server when next energy regenerates

  // Dynasty
  selectedDynasty: DynastyId;

  // Snake state (for rendering)
  snake: Position[];
  food: Position | null;
  direction: Direction;
  /** Buffered inputs mirrored from the engine (for the aim telegraph) */
  queuedDirections: Direction[];
  deathPosition: Position | null;

  // Audio state
  isMuted: boolean;

  // Actions
  startGame: () => void;
  endGame: (score: number, dna: number) => void;
  resetGame: () => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
  setDeathSequence: (active: boolean, position?: Position) => void;
  setReady: (ready: boolean) => void;
  setScore: (score: number) => void;
  incrementScore: () => void;
  setDnaCollected: (dna: number) => void;
  setSelectedDynasty: (dynasty: DynastyId) => void;
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
  energy: GAME_CONFIG.economy.energy.maxEnergy,
  maxEnergy: GAME_CONFIG.economy.energy.maxEnergy,
  energyRegenAt: null, // Synced from server
  selectedDynasty: 'CYBER',
  snake: [],
  food: null,
  direction: 'RIGHT',
  queuedDirections: [],
  deathPosition: null,
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
      direction: 'RIGHT',
      queuedDirections: [],
      deathPosition: null,
    });
  },

  endGame: (score: number, dna: number) => {
    set({
      isPlaying: false,
      isGameOver: true,
      isPaused: false,
      isDeathSequence: false,
      score,
      dnaCollected: dna,
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
      snake: [],
      food: null,
      direction: 'RIGHT',
      queuedDirections: [],
      deathPosition: null,
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

  setSelectedDynasty: (dynasty: DynastyId) => {
    set({ selectedDynasty: dynasty });
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
