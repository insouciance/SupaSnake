/**
 * Energy Commitment — deterministic shared rules.
 *
 * Persistence and spending are server-authoritative. This module is pure so
 * the database adapter, API routes, UI previews and tests all use the same
 * recovery, commitment and integer-rounding contract.
 */

import { GAME_CONFIG } from '@/shared/config/game';

/** `charged` is retained as the stored legacy label for an Energy-funded run. */
export type ChargeState = 'charged' | 'lean' | 'exempt';

const CHARGE_STATES: readonly ChargeState[] = ['charged', 'lean', 'exempt'];

export function isChargeState(value: unknown): value is ChargeState {
  return typeof value === 'string' && (CHARGE_STATES as readonly string[]).includes(value);
}

/** Server-owned recovery ledger. `updatedAt` is the partial-tick anchor. */
export interface EnergyLedger {
  storedEnergy: number;
  updatedAt: string | Date | number | null;
}

/** Legacy daily ledger, accepted only while application and migration overlap. */
export interface ChargeLedger {
  chargesDay: string | null;
  chargesUsed: number;
}

/** Everything a client needs to display recovery without becoming authority. */
export interface EnergyStatus {
  available: number;
  capacity: number;
  recoveryIntervalSeconds: number;
  recoveryStartedAt: string;
  nextRecoveryAt: string | null;
  recoveryProgress: number;
  serverNow: string;
  /** Compatibility aliases for pre-amendment callers. */
  remaining: number;
  perDay: number;
  usedToday: number;
  day: string;
  refillsAt: string | null;
}

/** Temporary name compatibility while old surfaces migrate to Energy copy. */
export type ChargeStatus = EnergyStatus;

function finiteDateMs(value: EnergyLedger['updatedAt'], fallback: number): number {
  if (value === null) return fallback;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(parsed) || parsed > fallback) return fallback;
  return parsed;
}

function clampWhole(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, Math.floor(value)));
}

/** UTC day retained for audit metadata and backwards-compatible response shape. */
export function utcDayKey(at: Date | number = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Deprecated daily-reset helper retained for old clients during rollout. */
export function nextUtcMidnight(at: Date | number = Date.now()): Date {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/**
 * Lazily resolve offline recovery. No client clock is trusted by the server:
 * authoritative callers pass database `NOW()` and the RPC persists the
 * resulting stock and partial-tick anchor under a row lock.
 */
export function resolveEnergyStatus(
  ledger: EnergyLedger,
  now: Date | number = Date.now(),
  capacity: number = GAME_CONFIG.economy.energy.capacity,
  recoveryIntervalSeconds: number = GAME_CONFIG.economy.energy.recoveryIntervalSeconds
): EnergyStatus {
  const nowMs = new Date(now).getTime();
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const safeCapacity = Math.max(1, Math.floor(capacity));
  const intervalMs = Math.max(1, Math.floor(recoveryIntervalSeconds)) * 1000;
  const stored = clampWhole(ledger.storedEnergy, 0, safeCapacity);
  const anchorMs = finiteDateMs(ledger.updatedAt, safeNow);
  const elapsedMs = Math.max(0, safeNow - anchorMs);
  const recovered = stored >= safeCapacity ? 0 : Math.floor(elapsedMs / intervalMs);
  const available = Math.min(safeCapacity, stored + recovered);

  // At cap, elapsed overflow is intentionally discarded. The consumption RPC
  // anchors the next tick to the spend instant, so hoarding cannot bank time.
  const effectiveAnchorMs =
    available >= safeCapacity ? safeNow : anchorMs + recovered * intervalMs;
  const progress =
    available >= safeCapacity
      ? 1
      : Math.min(1, Math.max(0, (safeNow - effectiveAnchorMs) / intervalMs));
  const nextRecoveryAt =
    available >= safeCapacity
      ? null
      : new Date(effectiveAnchorMs + intervalMs).toISOString();

  return {
    available,
    capacity: safeCapacity,
    recoveryIntervalSeconds: Math.floor(intervalMs / 1000),
    recoveryStartedAt: new Date(effectiveAnchorMs).toISOString(),
    nextRecoveryAt,
    recoveryProgress: progress,
    serverNow: new Date(safeNow).toISOString(),
    remaining: available,
    perDay: safeCapacity,
    usedToday: safeCapacity - available,
    day: utcDayKey(safeNow),
    refillsAt: nextRecoveryAt,
  };
}

/** Compatibility resolver for a pre-migration daily ledger. */
export function resolveChargeStatus(
  ledger: ChargeLedger,
  now: Date | number = Date.now(),
  capacity: number = GAME_CONFIG.economy.energy.capacity
): ChargeStatus {
  const remaining =
    ledger.chargesDay === utcDayKey(now)
      ? capacity - clampWhole(ledger.chargesUsed, 0, capacity)
      : capacity;
  return resolveEnergyStatus({ storedEnergy: remaining, updatedAt: now }, now, capacity);
}

export interface ChargeExemptionFacts {
  signalObjectiveRunId: string | null;
  /** Legacy explicit Serpent attempts remain exempt while historical code exists. */
  serpentWeekId: string | null;
  rewardless: boolean;
}

export const NO_EXEMPTION: ChargeExemptionFacts = {
  signalObjectiveRunId: null,
  serpentWeekId: null,
  rewardless: false,
};

export function isChargeExempt(facts: ChargeExemptionFacts): boolean {
  return facts.rewardless || facts.signalObjectiveRunId !== null || facts.serpentWeekId !== null;
}

export function isValidEnergyCommitment(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= GAME_CONFIG.economy.energy.capacity
  );
}

/** Basis-point curve lookup. Zero is the explicit lean-run choice. */
export function energyCommitmentMultiplierBps(commitment: number): number {
  if (commitment === 0) {
    return Math.round(GAME_CONFIG.economy.energy.leanHarvestFactor * 10_000);
  }
  if (!isValidEnergyCommitment(commitment)) return 0;
  return GAME_CONFIG.economy.energy.commitmentMultipliersBps[commitment - 1] ?? 0;
}

export function energyCommitmentMultiplier(commitment: number): number {
  return energyCommitmentMultiplierBps(commitment) / 10_000;
}

export function formatEnergyMultiplier(commitment: number): string {
  const multiplier = energyCommitmentMultiplier(commitment);
  return Number.isInteger(multiplier) ? multiplier.toFixed(1) : multiplier.toFixed(1);
}

/**
 * Apply the immutable start-time multiplier using integer arithmetic.
 * Yield remains the unmodified full-strength value; only credited DNA uses
 * this result. A positive Yield on a lean run remains worth at least 1 DNA.
 */
export function applyEnergyHarvestMultiplier(
  yieldDna: number,
  multiplierBps: number,
  state: ChargeState
): number {
  if (!Number.isFinite(yieldDna) || yieldDna <= 0) return 0;
  const safeYield = Math.floor(yieldDna);
  const safeBps = Math.max(0, Math.floor(multiplierBps));
  const credited = Math.floor((safeYield * safeBps) / 10_000);
  return state === 'lean' ? Math.max(1, credited) : credited;
}

/** Legacy one-E/lean helper used by historical settlement tests. */
export function harvestFactor(
  state: ChargeState,
  leanFactor: number = GAME_CONFIG.economy.energy.leanHarvestFactor
): number {
  return state === 'lean' ? leanFactor : 1;
}

/** Legacy one-E/lean helper; new settlement passes the stored basis points. */
export function applyHarvestFactor(
  yieldDna: number,
  state: ChargeState,
  leanFactor: number = GAME_CONFIG.economy.energy.leanHarvestFactor
): number {
  return applyEnergyHarvestMultiplier(
    yieldDna,
    Math.round(harvestFactor(state, leanFactor) * 10_000),
    state
  );
}

export function isChargeMeterVisible(
  bankedRuns: number,
  threshold: number = GAME_CONFIG.economy.energy.meterVisibleAtBankedRuns
): boolean {
  return bankedRuns >= threshold;
}
