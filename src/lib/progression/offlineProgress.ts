/**
 * Offline Progress Calculation
 * Pure functions for calculating passive DNA earned while the player is away.
 * Used by both client (preview) and server (authoritative).
 *
 * Energy is deliberately absent from this claim (Constitution §8.6). It now
 * recovers independently on the authoritative Energy ledger, including while
 * offline. This module once mirrored a client-side “Energy Restored” preview,
 * creating a second implementation beside competing server clocks
 * (GROUND_TRUTH §9.2). That duplication stays deleted: an authenticated
 * Energy read applies server-time recovery instead.
 */

import { ENGAGEMENT_CONFIG } from '@/shared/config/engagement';

export interface OfflineProgressInput {
  lastLoginAt: string; // ISO timestamp from server
  collectionSize: number; // Number of snakes owned
}

export interface OfflineProgress {
  elapsedMs: number;
  elapsedHours: number;
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
 * Calculate complete offline progress
 * Main entry point for both client preview and server validation.
 *
 * The config parameter exists so tests can pin a window; it is NOT a
 * per-player override. Premium used to pass a 48h cap here instead of 24h -
 * WP-0.09 removed that perk (Constitution §10.4: offline anything is on the
 * never-sold list). Every caller now passes the one shared config.
 */
export function calculateOfflineProgress(
  input: OfflineProgressInput,
  config: PassiveProgressConfig = ENGAGEMENT_CONFIG.passiveProgress
): OfflineProgress {
  // Handle null/invalid lastLoginAt
  if (!input.lastLoginAt) {
    return {
      elapsedMs: 0,
      elapsedHours: 0,
      passiveDnaEarned: 0,
      shouldShowModal: false,
      hasRewards: false,
    };
  }

  const lastLogin = new Date(input.lastLoginAt).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - lastLogin);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  const passiveDnaEarned = calculatePassiveDna(
    input.collectionSize,
    elapsedHours,
    config
  );

  // Determine if modal should show
  const minOfflineMs = config.minOfflineMinutes * 60 * 1000;
  const shouldShowModal = elapsedMs >= minOfflineMs;
  const hasRewards = passiveDnaEarned > 0;

  return {
    elapsedMs,
    elapsedHours,
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
