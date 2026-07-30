import { GAME_CONFIG } from '@/shared/config/game';
import {
  applyEnergyHarvestMultiplier,
  energyCommitmentMultiplierBps,
  isChargeExempt,
  isChargeMeterVisible,
  isValidEnergyCommitment,
  NO_EXEMPTION,
  resolveEnergyStatus,
} from './energyEnvelope';

const HOUR = 3_600_000;
const NOW = new Date('2026-07-29T12:00:00.000Z');

describe('Energy Commitment configuration', () => {
  it('centralizes the cap, hourly cadence, lean factor and nonlinear curve', () => {
    expect(GAME_CONFIG.economy.energy.capacity).toBe(6);
    expect(GAME_CONFIG.economy.energy.recoveryIntervalSeconds).toBe(3600);
    expect(GAME_CONFIG.economy.energy.leanHarvestFactor).toBe(0.25);
    expect(GAME_CONFIG.economy.energy.commitmentMultipliersBps).toEqual([
      10_000, 22_000, 36_000, 52_000, 72_000, 100_000,
    ]);
  });

  it.each([
    [0, 2_500],
    [1, 10_000],
    [2, 22_000],
    [3, 36_000],
    [4, 52_000],
    [5, 72_000],
    [6, 100_000],
  ])('maps %i Energy to %i basis points', (commitment, bps) => {
    expect(energyCommitmentMultiplierBps(commitment)).toBe(bps);
  });

  it('accepts only whole commitments 1..6 as funded runs', () => {
    for (const value of [1, 2, 3, 4, 5, 6]) expect(isValidEnergyCommitment(value)).toBe(true);
    for (const value of [0, -1, 1.5, 7, NaN, '6']) expect(isValidEnergyCommitment(value)).toBe(false);
  });
});

describe('server-time offline recovery', () => {
  it('recovers one Energy for every complete hour', () => {
    const status = resolveEnergyStatus(
      { storedEnergy: 1, updatedAt: new Date(NOW.getTime() - 3 * HOUR) },
      NOW
    );
    expect(status.available).toBe(4);
    expect(status.recoveryProgress).toBe(0);
    expect(status.nextRecoveryAt).toBe('2026-07-29T13:00:00.000Z');
  });

  it('preserves partial progress across reads and offline time', () => {
    const status = resolveEnergyStatus(
      { storedEnergy: 2, updatedAt: new Date(NOW.getTime() - HOUR / 2) },
      NOW
    );
    expect(status.available).toBe(2);
    expect(status.recoveryProgress).toBeCloseTo(0.5);
    expect(status.nextRecoveryAt).toBe('2026-07-29T12:30:00.000Z');
  });

  it('caps at six and discards overflow time', () => {
    const status = resolveEnergyStatus(
      { storedEnergy: 0, updatedAt: new Date(NOW.getTime() - 30 * HOUR) },
      NOW
    );
    expect(status.available).toBe(6);
    expect(status.nextRecoveryAt).toBeNull();
    expect(status.recoveryProgress).toBe(1);
    expect(status.recoveryStartedAt).toBe(NOW.toISOString());
  });

  it('is timezone-independent for equivalent instants', () => {
    const ledger = { storedEnergy: 3, updatedAt: '2026-07-29T09:15:00.000Z' };
    const utc = resolveEnergyStatus(ledger, new Date('2026-07-29T10:45:00.000Z'));
    const offset = resolveEnergyStatus(ledger, new Date('2026-07-29T12:45:00+02:00'));
    expect(offset).toEqual(utc);
  });

  it('clamps a future anchor instead of granting client-clock recovery', () => {
    const status = resolveEnergyStatus(
      { storedEnergy: 2, updatedAt: '2099-01-01T00:00:00.000Z' },
      NOW
    );
    expect(status.available).toBe(2);
    expect(status.recoveryProgress).toBe(0);
    expect(status.recoveryStartedAt).toBe(NOW.toISOString());
  });

  it('clamps corrupt stock into 0..capacity', () => {
    expect(resolveEnergyStatus({ storedEnergy: -20, updatedAt: NOW }, NOW).available).toBe(0);
    expect(resolveEnergyStatus({ storedEnergy: 200, updatedAt: NOW }, NOW).available).toBe(6);
  });
});

describe('harvest settlement', () => {
  it('uses exact integer basis-point rounding for every commitment', () => {
    expect(applyEnergyHarvestMultiplier(101, 10_000, 'charged')).toBe(101);
    expect(applyEnergyHarvestMultiplier(101, 22_000, 'charged')).toBe(222);
    expect(applyEnergyHarvestMultiplier(101, 100_000, 'charged')).toBe(1010);
  });

  it('keeps a positive lean harvest worth at least one DNA', () => {
    expect(applyEnergyHarvestMultiplier(1, 2_500, 'lean')).toBe(1);
    expect(applyEnergyHarvestMultiplier(10, 2_500, 'lean')).toBe(2);
    expect(applyEnergyHarvestMultiplier(0, 2_500, 'lean')).toBe(0);
  });

  it('does not infer commitment from exemption facts', () => {
    expect(isChargeExempt(NO_EXEMPTION)).toBe(false);
    expect(isChargeExempt({ ...NO_EXEMPTION, rewardless: true })).toBe(true);
    expect(
      isChargeExempt({ ...NO_EXEMPTION, signalObjectiveRunId: 'signal-run' })
    ).toBe(true);
  });
});

describe('meter ramp', () => {
  it('stays hidden until four banked runs', () => {
    expect(isChargeMeterVisible(3)).toBe(false);
    expect(isChargeMeterVisible(4)).toBe(true);
  });
});
