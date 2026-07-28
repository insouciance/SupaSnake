/**
 * Game State Store (Zustand)
 * Global game state management
 */

import { create } from 'zustand';
import type { TerrainBlock } from '@/shared/game/terrain';
import type { DynastyId } from '@/shared/types/game';
import type {
  Position,
  Direction,
  EndReason,
} from '@/lib/game/SnakeGameLogic';
import type { GeneId, GenePick } from '@/shared/game/genes';
import type { SpliceId } from '@/shared/game/splices';
import type { StrainId, StrainPoints } from '@/shared/game/strains';
import type { GenomeRevive } from '@/shared/game/genome';
import { DEFAULT_AIM_SYSTEM, type AimSystemId } from '@/lib/game/aimSystems';
import type { AnomalyId } from '@/shared/game/anomalies';
import type { ChargeState, ChargeStatus } from '@/shared/game/energyEnvelope';

/**
 * The day's charge status as the server reported it, plus the §8.6 ramp
 * flag telling the UI whether the meter should be shown at all.
 */
export interface ChargeSnapshot extends ChargeStatus {
  visible: boolean;
  /** How the run just started settles; absent outside a run. */
  state?: ChargeState;
}

/**
 * Run mode (Design v2 §7.4 + §7.2): 'earn' pays DNA; 'free' is unlimited
 * rewardless practice that pays nothing; 'anomaly' is an earning run under
 * the week's anomaly modifier that also scores on the weekly anomaly board.
 *
 * No mode is gated by charges (§8.6): 'earn' is always available.
 */
export type GameMode = 'earn' | 'free' | 'anomaly';

/** The week's anomaly context (from the session-start response). */
export interface AnomalyRunInfo {
  id: string;
  name: string;
  effect: string;
  endsAt: string;
}

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

  /**
   * The day's harvest envelope (Constitution §8.6), synced from the server.
   * Display only - the client never decides charge state and never blocks a
   * run on it. Null until the first sync.
   */
  charge: ChargeSnapshot | null;

  // Run mode: earning (rewarded) vs free play (rewardless practice).
  // Survives resetGame so Play Again keeps the mode. NOTE: mode is never
  // chosen for the player by charge state - an empty allotment demotes
  // nothing (§8.6: there is no second-class run).
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
  /** Second live exit portal (Twin Exits anomaly), null when none. */
  exitTile2: Position | null;
  /** Ticks until the live exit portal despawns. */
  exitTicksRemaining: number;
  /** The active anomaly run's context (Design v2 §7.2), null off-board. */
  anomalyRun: AnomalyRunInfo | null;
  /**
   * The run's world condition, as the SERVER resolved it (§7.2, §7.3).
   *
   * The Anomaly board's weekly modifier, the Serpent week's condition or the
   * Signal day's — one id, whichever ritual named it. Distinct from
   * `anomalyRun`, which is the anomaly BOARD's context and still governs the
   * board chip and the cockpit's mode label: a Serpent run has a condition and
   * is not an anomaly run. Null on an ordinary run, and never set by the
   * client — it arrives on the session-start response and is the same id
   * settlement recomputes the payout with.
   */
  runCondition: AnomalyId | null;

  // Design v2 Phase 2: mutation food + COSMIC constellations (from engine)
  /** Food cells beyond the primary one (Splitter pairs, COSMIC stars). */
  extraFoods: Position[];
  /** COSMIC: hue of the live constellation, else null. Cosmetic. */
  constellationGlyph: number | null;
  /**
   * COSMIC: the calcification window - ticks left, and what it started at.
   *
   * Mirrored into the store because it must be DRAWN. Uncollected stars turn
   * into permanent lethal blocks when this reaches zero, and WP-3.03 already
   * taught this codebase what an undrawn lethal primitive costs: a window
   * the player cannot see is a punishment they cannot have chosen, and the
   * abandonment being chosen is COSMIC's whole fairness argument.
   */
  constellationTicksRemaining: number;
  constellationWindowTicks: number;
  /** Live mutation food cell, null when none. */
  mutationTile: Position | null;
  mutationTicksRemaining: number;
  /** Genes held this run, in raw pick order. */
  heldMutations: GenePick[];
  /** Live choice-of-2 offer (engine is frozen in its choice hold). */
  choiceOptions: [GeneId, GeneId] | null;
  /** True once Phoenix absorbed a death this run. */
  phoenixTriggered: boolean;
  /** True on a dynasty whose board wraps at every edge (drives the rails). */
  torus: boolean;

  // Buildcraft: The Genome (mirrored from the engine; inert in legacy runs)
  /** True when this run plays under genome rules (server capability). */
  genomeRun: boolean;
  /** Live strain points (heirloom + genes + surges). */
  strainCounts: StrainPoints;
  /** Strain -> live tier (1 minor / 2 expression / 3 apex). */
  strainTiers: Partial<Record<StrainId, number>>;
  /** Fused splices, in fusion order (survives into game-over recap). */
  fusedSplices: { id: SpliceId; atFood: number }[];
  /** AURUM Gilded Wake trail cells (renderer). */
  gildedCells: { x: number; z: number; ticks: number }[];
  /** Bonus foods (molt drops / Heartwood goldens) - renderer. */
  bonusFoods: { x: number; z: number; kind: 'molt' | 'heartwood' }[];
  /**
   * Arena terrain blocks (renderer).
   *
   * WP-3.05: terrain reached the engine's collision chain in WP-3.03 and never
   * reached the scene, so blocks were lethal and invisible. This field is the
   * missing wire.
   */
  terrain: TerrainBlock[];
  /** Committed infuses (drives the bank-preview HUD + game-over recap). */
  infusesCount: number;
  /** Where the live gene offer came from (choice card framing). */
  choiceSource: 'gene_food' | 'infuse' | null;
  /** BANK/INFUSE portal hold is live (PortalChoiceOverlay renders). */
  portalChoicePending: boolean;
  /** Strain Surge choice hold is live (infuse at the gene cap). */
  surgeChoicePending: boolean;
  /** The run's one revive, once fired (survives into game-over recap). */
  revive: GenomeRevive | null;

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
  setExitTile2: (exitTile2: Position | null) => void;
  setAnomalyRun: (anomalyRun: AnomalyRunInfo | null) => void;
  setRunCondition: (runCondition: AnomalyId | null) => void;
  setSelectedDynasty: (dynasty: DynastyId) => void;
  setAimSystem: (aimSystem: AimSystemId) => void;
  syncChargeFromServer: (charge: ChargeSnapshot | null) => void;
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
    ticksRemaining: number,
    windowTicks: number
  ) => void;
  setMutationTile: (tile: Position | null, ticksRemaining?: number) => void;
  setHeldMutations: (held: GenePick[]) => void;
  setChoiceOptions: (
    options: [GeneId, GeneId] | null,
    source?: 'gene_food' | 'infuse' | null
  ) => void;
  setPhoenixTriggered: (triggered: boolean) => void;
  setTorus: (torus: boolean) => void;

  // Genome actions
  setGenomeRun: (genomeRun: boolean) => void;
  setStrains: (
    counts: StrainPoints,
    tiers: Partial<Record<StrainId, number>>
  ) => void;
  setFusedSplices: (splices: { id: SpliceId; atFood: number }[]) => void;
  setGildedCells: (cells: { x: number; z: number; ticks: number }[]) => void;
  setBonusFoods: (
    foods: { x: number; z: number; kind: 'molt' | 'heartwood' }[]
  ) => void;
  setTerrain: (terrain: TerrainBlock[]) => void;
  setInfusesCount: (count: number) => void;
  setPortalChoicePending: (pending: boolean) => void;
  setSurgeChoicePending: (pending: boolean) => void;
  setRevive: (revive: GenomeRevive | null) => void;
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
  charge: null, // Synced from server; never assumed locally
  gameMode: 'earn',
  selectedDynasty: 'PRIMAL',
  aimSystem: DEFAULT_AIM_SYSTEM,
  snake: [],
  food: null,
  direction: 'RIGHT',
  queuedDirections: [],
  deathPosition: null,
  exitTile: null,
  exitTile2: null,
  exitTicksRemaining: 0,
  anomalyRun: null,
  runCondition: null,
  extraFoods: [],
  constellationGlyph: null,
  constellationTicksRemaining: 0,
  constellationWindowTicks: 0,
  mutationTile: null,
  mutationTicksRemaining: 0,
  heldMutations: [],
  choiceOptions: null,
  phoenixTriggered: false,
  torus: false,
  genomeRun: false,
  strainCounts: {},
  strainTiers: {},
  fusedSplices: [],
  gildedCells: [],
  terrain: [],
  bonusFoods: [],
  infusesCount: 0,
  choiceSource: null,
  portalChoicePending: false,
  surgeChoicePending: false,
  revive: null,
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
      exitTile2: null,
      exitTicksRemaining: 0,
      extraFoods: [],
      constellationGlyph: null,
      constellationTicksRemaining: 0,
      constellationWindowTicks: 0,
      mutationTile: null,
      mutationTicksRemaining: 0,
      heldMutations: [],
      choiceOptions: null,
      phoenixTriggered: false,
      torus: false,
      strainCounts: {},
      strainTiers: {},
      fusedSplices: [],
      gildedCells: [],
      terrain: [],
      bonusFoods: [],
      infusesCount: 0,
      choiceSource: null,
      portalChoicePending: false,
      surgeChoicePending: false,
      revive: null,
    });
  },

  endGame: (score: number, dna: number, endReason: EndReason = 'died') => {
    // heldMutations, phoenixTriggered, anomalyRun, strainCounts/Tiers,
    // fusedSplices, infusesCount and revive survive into game-over on
    // purpose: the game-over screen (Genome Card) lists the run's build,
    // its outcome multiplier, and the board it scored on
    set({
      isPlaying: false,
      isGameOver: true,
      isPaused: false,
      isDeathSequence: false,
      score,
      dnaCollected: dna,
      endReason,
      exitTile: null,
      exitTile2: null,
      exitTicksRemaining: 0,
      mutationTile: null,
      mutationTicksRemaining: 0,
      choiceOptions: null,
      choiceSource: null,
      portalChoicePending: false,
      surgeChoicePending: false,
      gildedCells: [],
      terrain: [],
      bonusFoods: [],
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
      exitTile2: null,
      exitTicksRemaining: 0,
      anomalyRun: null,
      runCondition: null,
      extraFoods: [],
      constellationGlyph: null,
      constellationTicksRemaining: 0,
      constellationWindowTicks: 0,
      mutationTile: null,
      mutationTicksRemaining: 0,
      heldMutations: [],
      choiceOptions: null,
      phoenixTriggered: false,
      torus: false,
      strainCounts: {},
      strainTiers: {},
      fusedSplices: [],
      gildedCells: [],
      terrain: [],
      bonusFoods: [],
      infusesCount: 0,
      choiceSource: null,
      portalChoicePending: false,
      surgeChoicePending: false,
      revive: null,
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

  setExitTile2: (exitTile2: Position | null) => {
    set({ exitTile2 });
  },

  setAnomalyRun: (anomalyRun: AnomalyRunInfo | null) => {
    set({ anomalyRun });
  },

  setRunCondition: (runCondition: AnomalyId | null) => {
    set({ runCondition });
  },

  setSelectedDynasty: (dynasty: DynastyId) => {
    set({ selectedDynasty: dynasty });
  },

  setAimSystem: (aimSystem: AimSystemId) => {
    set({ aimSystem });
  },

  syncChargeFromServer: (charge: ChargeSnapshot | null) => {
    // Straight mirror of server authority (Rule 11). The client never
    // computes, decrements or refills charges - a stale snapshot simply
    // renders stale until the next sync, and nothing gameplay-facing
    // depends on it.
    set({ charge });
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
    ticksRemaining: number,
    windowTicks: number
  ) => {
    set({
      constellationGlyph: glyph,
      constellationTicksRemaining: ticksRemaining,
      constellationWindowTicks: windowTicks,
    });
  },

  setMutationTile: (tile: Position | null, ticksRemaining: number = 0) => {
    set({
      mutationTile: tile,
      mutationTicksRemaining: tile ? ticksRemaining : 0,
    });
  },

  setHeldMutations: (held: GenePick[]) => {
    set({ heldMutations: held });
  },

  setChoiceOptions: (
    options: [GeneId, GeneId] | null,
    source: 'gene_food' | 'infuse' | null = null
  ) => {
    set({ choiceOptions: options, choiceSource: options ? source : null });
  },

  setPhoenixTriggered: (triggered: boolean) => {
    set({ phoenixTriggered: triggered });
  },

  setTorus: (torus: boolean) => {
    set({ torus });
  },

  // Genome actions
  setGenomeRun: (genomeRun: boolean) => {
    set({ genomeRun });
  },

  setStrains: (
    counts: StrainPoints,
    tiers: Partial<Record<StrainId, number>>
  ) => {
    set({ strainCounts: counts, strainTiers: tiers });
  },

  setFusedSplices: (splices: { id: SpliceId; atFood: number }[]) => {
    set({ fusedSplices: splices });
  },

  setGildedCells: (cells: { x: number; z: number; ticks: number }[]) => {
    set({ gildedCells: cells });
  },
  setTerrain: (terrain: TerrainBlock[]) => {
    set({ terrain });
  },

  setBonusFoods: (
    foods: { x: number; z: number; kind: 'molt' | 'heartwood' }[]
  ) => {
    set({ bonusFoods: foods });
  },

  setInfusesCount: (count: number) => {
    set({ infusesCount: count });
  },

  setPortalChoicePending: (pending: boolean) => {
    set({ portalChoicePending: pending });
  },

  setSurgeChoicePending: (pending: boolean) => {
    set({ surgeChoicePending: pending });
  },

  setRevive: (revive: GenomeRevive | null) => {
    set({ revive });
  },
}));
