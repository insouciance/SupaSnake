/**
 * Energy envelope — the settlement math and the day boundary.
 *
 * These tests are the executable form of Constitution §8.6 and the two
 * GROUND_TRUTH defects it retires. They are deliberately written against the
 * PROPERTIES the Constitution names ("lean, never zero", "absence is never
 * destructive", "one refill authority") rather than against the numbers, so
 * that retuning the [H] dials does not silently repeal a rule.
 */

import { GAME_CONFIG } from '@/shared/config/game';
import {
  applyHarvestFactor,
  harvestFactor,
  isChargeExempt,
  isChargeMeterVisible,
  isChargeState,
  nextUtcMidnight,
  NO_EXEMPTION,
  resolveChargeStatus,
  utcDayKey,
  type ChargeExemptionFacts,
} from './energyEnvelope';

const PER_DAY = GAME_CONFIG.economy.energy.chargesPerDay;
const LEAN = GAME_CONFIG.economy.energy.leanHarvestFactor;

describe('energy envelope — the [H] dials the Constitution fixes', () => {
  it('grants 6 charges per day and harvests 25% when uncharged (§8.6)', () => {
    expect(PER_DAY).toBe(6);
    expect(LEAN).toBe(0.25);
  });

  it('surfaces the meter at 4 banked runs, not before (§8.6 ramp)', () => {
    expect(GAME_CONFIG.economy.energy.meterVisibleAtBankedRuns).toBe(4);
    expect(isChargeMeterVisible(0)).toBe(false);
    expect(isChargeMeterVisible(3)).toBe(false);
    expect(isChargeMeterVisible(4)).toBe(true);
    expect(isChargeMeterVisible(400)).toBe(true);
  });

  it('exposes no cap, no cost-per-game and no regen rate', () => {
    // The old model's three knobs are gone. If any of them comes back the
    // gate, the drip, or the stock has come back with it.
    const energy = GAME_CONFIG.economy.energy as Record<string, unknown>;
    expect(energy.maxEnergy).toBeUndefined();
    expect(energy.costPerGame).toBeUndefined();
    expect(energy.regenRateMs).toBeUndefined();
    expect(energy.regenRateMinutes).toBeUndefined();
  });
});

describe('settlement — charged / lean / exempt', () => {
  it('pays a charged run its full Yield', () => {
    expect(applyHarvestFactor(1200, 'charged')).toBe(1200);
    expect(harvestFactor('charged')).toBe(1);
  });

  it('pays an exempt run its full Yield, identically to a charged run', () => {
    // §8.6: "the rituals are always full-fat". Exempt and charged must be
    // indistinguishable at settlement.
    for (const y of [1, 7, 500, 1192, 99999]) {
      expect(applyHarvestFactor(y, 'exempt')).toBe(
        applyHarvestFactor(y, 'charged')
      );
    }
    expect(harvestFactor('exempt')).toBe(1);
  });

  it('pays a lean run a quarter of its Yield', () => {
    expect(applyHarvestFactor(1200, 'lean')).toBe(300);
    expect(applyHarvestFactor(1192, 'lean')).toBe(298);
    expect(harvestFactor('lean')).toBe(LEAN);
  });

  it('is lean, NEVER zero: any positive Yield pays at least 1 DNA', () => {
    // §8.6 says "lean, never zero" in words; this is the code that has to
    // mean it. Naive flooring would pay 0 for any Yield below 4.
    for (const y of [1, 2, 3]) {
      expect(applyHarvestFactor(y, 'lean')).toBe(1);
    }
    expect(applyHarvestFactor(4, 'lean')).toBe(1);
    expect(applyHarvestFactor(8, 'lean')).toBe(2);
  });

  it('pays nothing for nothing, in every state', () => {
    for (const state of ['charged', 'lean', 'exempt'] as const) {
      expect(applyHarvestFactor(0, state)).toBe(0);
      expect(applyHarvestFactor(-50, state)).toBe(0);
      expect(applyHarvestFactor(Number.NaN, state)).toBe(0);
    }
  });

  it('never pays a lean run more than a charged one', () => {
    for (let y = 0; y < 3000; y += 37) {
      expect(applyHarvestFactor(y, 'lean')).toBeLessThanOrEqual(
        applyHarvestFactor(y, 'charged')
      );
    }
  });

  it('validates charge states and rejects anything else', () => {
    expect(isChargeState('charged')).toBe(true);
    expect(isChargeState('lean')).toBe(true);
    expect(isChargeState('exempt')).toBe(true);
    expect(isChargeState('free')).toBe(false);
    expect(isChargeState(null)).toBe(false);
    expect(isChargeState(undefined)).toBe(false);
    expect(isChargeState(1)).toBe(false);
  });
});

describe('exemptions — closed by default, server-resolved only', () => {
  it('grants no exemption from the default facts', () => {
    expect(isChargeExempt(NO_EXEMPTION)).toBe(false);
  });

  it('exempts a confirmed Signal objective run (§7.2)', () => {
    const facts: ChargeExemptionFacts = {
      ...NO_EXEMPTION,
      signalObjectiveRunId: 'signal-2026-07-25',
    };
    expect(isChargeExempt(facts)).toBe(true);
  });

  it('exempts a confirmed Serpent attempt (§7.3)', () => {
    const facts: ChargeExemptionFacts = {
      ...NO_EXEMPTION,
      serpentWeekId: 'week-31',
    };
    expect(isChargeExempt(facts)).toBe(true);
  });

  it('exempts rewardless practice — it pays nothing, so it takes nothing', () => {
    expect(isChargeExempt({ ...NO_EXEMPTION, rewardless: true })).toBe(true);
  });

  it('requires a server-resolved id, not a truthy intent', () => {
    // The whole point of the shape: an exemption is a row the server can
    // point at. There is no boolean here a client could flip.
    expect(
      isChargeExempt({
        signalObjectiveRunId: null,
        serpentWeekId: null,
        rewardless: false,
      })
    ).toBe(false);
  });
});

describe('the day boundary — one clock, at 00:00 UTC (GT §9.2)', () => {
  it('keys the day in UTC, so every player rolls over at the same instant', () => {
    // 23:59:59Z and 00:00:00Z the next day are different days everywhere on
    // earth. A local-time key would give a Tokyo player a different day to
    // a Los Angeles player and reintroduce two clocks by the back door.
    expect(utcDayKey(new Date('2026-07-25T23:59:59.999Z'))).toBe('2026-07-25');
    expect(utcDayKey(new Date('2026-07-26T00:00:00.000Z'))).toBe('2026-07-26');
    expect(utcDayKey(new Date('2026-07-25T00:00:00.000Z'))).toBe('2026-07-25');
  });

  it('computes the next 00:00 UTC, never a partial-day offset', () => {
    expect(nextUtcMidnight(new Date('2026-07-25T13:37:00Z')).toISOString()).toBe(
      '2026-07-26T00:00:00.000Z'
    );
    // Exactly at midnight, the NEXT reset is a full day away.
    expect(nextUtcMidnight(new Date('2026-07-25T00:00:00Z')).toISOString()).toBe(
      '2026-07-26T00:00:00.000Z'
    );
    // Month and year boundaries.
    expect(nextUtcMidnight(new Date('2026-07-31T23:00:00Z')).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z'
    );
    expect(nextUtcMidnight(new Date('2026-12-31T23:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z'
    );
  });

  it('is FULL one millisecond after the boundary, with the same stored row', () => {
    // This is the refill. No job ran; the date simply changed.
    const spent = { chargesDay: '2026-07-25', chargesUsed: PER_DAY };

    const before = resolveChargeStatus(spent, new Date('2026-07-25T23:59:59.999Z'));
    expect(before.remaining).toBe(0);
    expect(before.usedToday).toBe(PER_DAY);

    const after = resolveChargeStatus(spent, new Date('2026-07-26T00:00:00.000Z'));
    expect(after.remaining).toBe(PER_DAY);
    expect(after.usedToday).toBe(0);
    expect(after.day).toBe('2026-07-26');
  });

  it('counts down within a day and reports the next reset', () => {
    const now = new Date('2026-07-25T09:00:00Z');
    const status = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: 2 },
      now
    );
    expect(status.remaining).toBe(PER_DAY - 2);
    expect(status.usedToday).toBe(2);
    expect(status.perDay).toBe(PER_DAY);
    expect(status.refillsAt).toBe('2026-07-26T00:00:00.000Z');
  });

  it('treats a never-used ledger as a full day', () => {
    const status = resolveChargeStatus({ chargesDay: null, chargesUsed: 0 });
    expect(status.remaining).toBe(PER_DAY);
  });
});

describe('Rule 5 — absence is never destructive', () => {
  it('gives a 30-day absentee exactly the same day as a daily player', () => {
    const now = new Date('2026-08-24T08:00:00Z');

    const absentee = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: PER_DAY },
      now
    );
    const daily = resolveChargeStatus(
      { chargesDay: '2026-08-23', chargesUsed: PER_DAY },
      now
    );
    const brandNew = resolveChargeStatus({ chargesDay: null, chargesUsed: 0 }, now);

    expect(absentee.remaining).toBe(PER_DAY);
    expect(daily.remaining).toBe(PER_DAY);
    expect(brandNew.remaining).toBe(PER_DAY);
    expect(absentee).toEqual(daily);
    expect(absentee).toEqual(brandNew);
  });

  it('never accrues a backlog: 30 unused days do not bank 180 charges', () => {
    // Rule 5 cuts both ways. Absence must not punish, and it must not pay -
    // "no backlog, no debt". An accumulating allotment would also blow past
    // the bounded daily economy envelope §8.6 exists to create.
    const status = resolveChargeStatus(
      { chargesDay: '2026-06-25', chargesUsed: 0 },
      new Date('2026-07-25T00:00:01Z')
    );
    expect(status.remaining).toBe(PER_DAY);
    expect(status.remaining).not.toBeGreaterThan(PER_DAY);
  });

  it('never reports a debt, even from a corrupt over-count', () => {
    const status = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: 9999 },
      new Date('2026-07-25T12:00:00Z')
    );
    expect(status.remaining).toBe(0);
    expect(status.remaining).toBeGreaterThanOrEqual(0);
    expect(status.usedToday).toBeLessThanOrEqual(PER_DAY);
  });

  it('clamps a negative stored counter instead of trusting it', () => {
    const status = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: -5 },
      new Date('2026-07-25T12:00:00Z')
    );
    expect(status.remaining).toBe(PER_DAY);
    expect(status.usedToday).toBe(0);
  });
});

describe('GT §9.1 regression — nothing can be destroyed', () => {
  it('has no cap for a balance to be clamped down to', () => {
    // The €4-destroying bug was `Math.min(energy + restored, max_energy)`:
    // a stock, a cap, and a writer that clamped one against the other. The
    // envelope has no stock and no cap, so the shape of that bug cannot be
    // expressed. `resolveChargeStatus` is a pure read; there is no write.
    const spent = { chargesDay: '2026-07-25', chargesUsed: 4 };
    const now = new Date('2026-07-25T12:00:00Z');

    // Reading repeatedly never changes the answer, and never consumes.
    const a = resolveChargeStatus(spent, now);
    const b = resolveChargeStatus(spent, now);
    const c = resolveChargeStatus(spent, now);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(spent.chargesUsed).toBe(4); // input untouched
  });

  it('cannot be raised by any input, so no grant can be destroyed', () => {
    // There is no argument to resolveChargeStatus that produces more than
    // the day's allotment. Nothing can be granted; therefore nothing
    // granted can be lost.
    for (const used of [-100, 0, 1, PER_DAY, PER_DAY + 50, 100000]) {
      const status = resolveChargeStatus(
        { chargesDay: '2026-07-25', chargesUsed: used },
        new Date('2026-07-25T12:00:00Z')
      );
      expect(status.remaining).toBeLessThanOrEqual(PER_DAY);
      expect(status.remaining).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('GT §9.2 regression — exactly one refill authority', () => {
  it('derives the refill from the date alone, with no stored timestamp', () => {
    // The old model had `energy_regen_at` (advanced by /api/player) and
    // `last_login_at` (read by claim-offline) as two independent clocks
    // that could disagree indefinitely. The status has no input but the
    // stored day and the current time.
    const now = new Date('2026-07-25T12:00:00Z');
    const status = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: 3 },
      now
    );
    expect(Object.keys(status).sort()).toEqual(
      ['day', 'perDay', 'refillsAt', 'remaining', 'usedToday'].sort()
    );
  });

  it('is a pure function of (storedDay, now): same inputs, same answer', () => {
    // Two callers - a profile GET and a run start - asking at the same
    // instant get identical answers, because neither can advance anything.
    const ledger = { chargesDay: '2026-07-25', chargesUsed: 2 };
    const now = new Date('2026-07-25T18:30:00Z');
    expect(resolveChargeStatus(ledger, now)).toEqual(
      resolveChargeStatus(ledger, now)
    );
  });

  it('reports one refill instant that every caller agrees on', () => {
    const now = new Date('2026-07-25T18:30:00Z');
    const fromProfile = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: 0 },
      now
    );
    const fromRunStart = resolveChargeStatus(
      { chargesDay: '2026-07-25', chargesUsed: 5 },
      now
    );
    expect(fromProfile.refillsAt).toBe(fromRunStart.refillsAt);
  });
});
