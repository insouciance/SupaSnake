/**
 * Offline Progress Calculation
 * Pure functions for calculating passive rewards while player is offline
 * Used by both client (preview) and server (authoritative)
 */

import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';
import { GAME_CONFIG } from '@/shared/config/game';

export interface OfflineProgressInput {
  lastLoginAt: string; // ISO timestamp from server
  currentEnergy: number;
  maxEnergy: number;
  collectionSize: number; // Number of snakes owned
}

export interface OfflineProgress {
  elapsedMs: number;
  elapsedHours: number;
  energyRestored: number;
  passiveDnaEarned: number;
  shouldShowModal: boolean;
  hasRewards: boolean;
}

/**
 * Widened shape of ENGAGEMENT_CONFIG.passiveProgress (whose values are
 * literal types) so callers can override the cap - SupaSnake Premium
 * raises maxOfflineHours 24 -> 48.
 */
export interface PassiveProgressConfig {
  readonly dnaPerSnakePerHour: number;
  readonly maxOfflineHours: number;
  readonly minOfflineMinutes: number;
}

/**
 * Calculate passive DNA earned while offline
 * Each snake in collection generates DNA per hour
 */
export function calculatePassiveDna(
  collectionSize: number,
  elapsedHours: number,
  config: PassiveProgressConfig = ENGAGEMENT_CONFIG.passiveProgress
): number {
  if (collectionSize <= 0 || elapsedHours <= 0) {
    return 0;
  }

  // Cap hours at maximum
  const cappedHours = Math.min(elapsedHours, config.maxOfflineHours);

  // Calculate total DNA (floor to avoid fractional DNA)
  return Math.floor(collectionSize * config.dnaPerSnakePerHour * cappedHours);
}

/**
 * Calculate energy restored while offline
 * Uses same formula as server-side energyRegen.ts
 */
export function calculateEnergyRestored(
  currentEnergy: number,
  maxEnergy: number,
  elapsedMs: number,
  regenRateMs: number = GAME_CONFIG.economy.energy.regenRateMs
): number {
  if (elapsedMs <= 0 || currentEnergy >= maxEnergy) {
    return 0;
  }

  // Calculate how many complete regen periods elapsed
  const periodsElapsed = Math.floor(elapsedMs / regenRateMs);

  // Cap at what's needed to reach max
  const maxRestorable = maxEnergy - currentEnergy;

  return Math.min(periodsElapsed, maxRestorable);
}

/**
 * Calculate complete offline progress
 * Main entry point for both client preview and server validation.
 * The optional config override raises the DNA cap for SupaSnake Premium
 * (48h instead of 24h - PREMIUM_CONFIG.passiveProgress).
 */
export function calculateOfflineProgress(
  input: OfflineProgressInput,
  config: PassiveProgressConfig = ENGAGEMENT_CONFIG.passiveProgress
): OfflineProgress {
  const energyConfig = GAME_CONFIG.economy.energy;

  // Handle null/invalid lastLoginAt
  if (!input.lastLoginAt) {
    return {
      elapsedMs: 0,
      elapsedHours: 0,
      energyRestored: 0,
      passiveDnaEarned: 0,
      shouldShowModal: false,
      hasRewards: false,
    };
  }

  const lastLogin = new Date(input.lastLoginAt).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastLogin);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // Calculate rewards
  const energyRestored = calculateEnergyRestored(
    input.currentEnergy,
    input.maxEnergy,
    elapsedMs,
    energyConfig.regenRateMs
  );

  const passiveDnaEarned = calculatePassiveDna(
    input.collectionSize,
    elapsedHours,
    config
  );

  // Determine if modal should show
  const minOfflineMs = config.minOfflineMinutes * 60 * 1000;
  const shouldShowModal = elapsedMs >= minOfflineMs;
  const hasRewards = energyRestored > 0 || passiveDnaEarned > 0;

  return {
    elapsedMs,
    elapsedHours,
    energyRestored,
    passiveDnaEarned,
    shouldShowModal,
    hasRewards,
  };
}

/**
 * Format duration for display in Welcome Back modal
 */
export function formatOfflineDuration(
  elapsedMs: number,
  config: PassiveProgressConfig = ENGAGEMENT_CONFIG.passiveProgress
): string {
  const maxMs = config.maxOfflineHours * 60 * 60 * 1000;

  // Cap display at max hours
  if (elapsedMs >= maxMs) {
    return `${config.maxOfflineHours}+ hours`;
  }

  const totalMinutes = Math.floor(elapsedMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
