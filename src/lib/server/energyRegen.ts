/**
 * Server-Side Energy Regeneration
 *
 * Calculates energy regeneration based on database timestamps.
 * This is the source of truth for energy - client just displays.
 */

import { GAME_CONFIG } from '@/shared/config/game';

export interface EnergyRegenResult {
  currentEnergy: number;
  newRegenAt: Date | null;
  energyRegenerated: number;
}

/**
 * Calculate current energy based on stored value and regen timestamp.
 * Call this on every Player API GET to ensure accurate energy.
 *
 * Bonus energy (from purchases) can exceed maxEnergy.
 * Regeneration only occurs when below maxEnergy.
 *
 * @param dbEnergy - Energy value from database
 * @param maxEnergy - Maximum energy cap (natural limit)
 * @param regenAt - Timestamp when next energy regenerates (null if at/above max)
 * @param regenRateMs - Milliseconds per energy point regeneration
 * @returns Current energy, new regen timestamp, and points regenerated
 */
export function calculateServerEnergy(
  dbEnergy: number,
  maxEnergy: number,
  regenAt: Date | string | null,
  regenRateMs: number = GAME_CONFIG.economy.energy.regenRateMs
): EnergyRegenResult {
  // Allow bonus energy above max (from purchases), only clamp to minimum 0
  const currentEnergy = Math.max(0, dbEnergy);

  // If at or above max (includes bonus energy), no regen needed
  if (currentEnergy >= maxEnergy) {
    return { currentEnergy, newRegenAt: null, energyRegenerated: 0 };
  }

  // If no regen timestamp, start timer now
  if (!regenAt) {
    return {
      currentEnergy: currentEnergy,
      newRegenAt: new Date(Date.now() + regenRateMs),
      energyRegenerated: 0
    };
  }

  // Parse timestamp if string
  const regenTime = typeof regenAt === 'string' ? new Date(regenAt) : regenAt;
  const now = Date.now();
  const elapsed = now - regenTime.getTime();

  // Timer hasn't passed yet
  if (elapsed < 0) {
    return { currentEnergy: currentEnergy, newRegenAt: regenTime, energyRegenerated: 0 };
  }

  // Calculate regenerated points based on complete periods elapsed
  // elapsed >= 0 means first timer passed (1 point)
  // Each additional complete period adds 1 more point
  const totalRegenPoints = 1 + Math.floor(elapsed / regenRateMs);

  // Cap regeneration at what's needed to reach max
  const maxRegen = maxEnergy - currentEnergy;
  const actualRegen = Math.min(totalRegenPoints, maxRegen);
  const newEnergy = currentEnergy + actualRegen;

  // Calculate next regen time (or null if at max)
  let newRegenAt: Date | null = null;
  if (newEnergy < maxEnergy) {
    // Next timer starts from original + all completed periods
    newRegenAt = new Date(regenTime.getTime() + (totalRegenPoints * regenRateMs));
  }

  return { currentEnergy: newEnergy, newRegenAt, energyRegenerated: actualRegen };
}

/**
 * Calculate the next regen timestamp after consuming energy.
 * Use this when starting a game or any energy deduction.
 *
 * @param currentEnergy - Energy after deduction
 * @param maxEnergy - Maximum energy cap
 * @param existingRegenAt - Current regen timestamp (may be null or past)
 * @param regenRateMs - Milliseconds per energy point regeneration
 * @returns New regen timestamp, or null if at max
 */
export function calculateNextRegenAfterConsume(
  currentEnergy: number,
  maxEnergy: number,
  existingRegenAt: Date | string | null,
  regenRateMs: number = GAME_CONFIG.economy.energy.regenRateMs
): Date | null {
  // At max energy, no timer needed
  if (currentEnergy >= maxEnergy) {
    return null;
  }

  // If existing timer is valid and in the future, keep it
  if (existingRegenAt) {
    const regenTime = typeof existingRegenAt === 'string'
      ? new Date(existingRegenAt)
      : existingRegenAt;

    if (regenTime.getTime() > Date.now()) {
      return regenTime;
    }
  }

  // Start a new timer
  return new Date(Date.now() + regenRateMs);
}
