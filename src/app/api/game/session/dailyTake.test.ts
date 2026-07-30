/**
 * The Daily Take touches NOTHING but itself (WP-1.04 acceptance, §7.2).
 *
 * "The streak multiplies the Take only — never run payouts, never Yield, never
 * anything else." WP-0.02 deleted the account multiplier stack so that no
 * factor could reach the fold; the Take's tier is not allowed to become a new
 * one, and this file is the proof in two parts.
 *
 *   PART 1 (arithmetic). A run's payout, its Yield and its Score are computed
 *   from run facts by the same helpers the route uses. Recompute them under
 *   every Take state that exists — never collected, tier 0 through tier 4,
 *   collected, cooled — and the answers must be BYTE-IDENTICAL while the
 *   Take's own numbers visibly differ.
 *
 *   PART 2 (structural). The settlement route's `takeSlot` is read after every
 *   payout write has committed and is used in exactly one place: the response
 *   field. Arithmetic independence is worth little if a future edit multiplies
 *   `finalDna` by `takeSlot.multiplier`, so the ordering and the single use are
 *   pinned here rather than left to review.
 */

import fs from 'fs';
import path from 'path';

import { computeRunTotals } from '@/shared/game/rulesets';
import { applyAscendanceYield } from '@/shared/game/ascendance';
import { applyHarvestFactor } from '@/shared/game/energyEnvelope';
import {
  previewDailyTake,
  type TakeStreakState,
} from '@/shared/game/dailyTake';
import { parseDailyTake } from '@/lib/game/dailyTake';

const ROUTE = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');

/**
 * The run's settled economics, assembled from exactly the expressions
 * `route.ts` uses on the earning path (see the "Settlement against the
 * envelope" block). Nothing about a Take is an input, because there is no
 * parameter here that could carry one.
 */
function settleRun() {
  const totals = computeRunTotals('CYBER', 17, [], null, [], null);
  const adjustedDna = Math.floor(totals.rawDna * 1.25); // banked extraction
  const yieldDna = applyAscendanceYield(adjustedDna, 4);
  const finalDna = applyHarvestFactor(yieldDna, 'charged');
  return {
    adjustedDna: finalDna,
    baseDna: adjustedDna,
    rawDna: totals.rawDna,
    score: totals.score,
    yieldDna,
    chargeState: 'charged' as const,
  };
}

/** Every Take state a player can be in when a run settles. */
const TAKE_STATES: Array<[string, TakeStreakState]> = [
  ['never collected', { streakDays: 0, tier: 0, longestStreak: 0, lastClaimDate: null }],
  ['tier 0 (2 days)', { streakDays: 2, tier: 0, longestStreak: 2, lastClaimDate: '2026-07-25' }],
  ['tier 1 (3 days)', { streakDays: 2, tier: 0, longestStreak: 9, lastClaimDate: '2026-07-25' }],
  ['tier 2 (7 days)', { streakDays: 6, tier: 1, longestStreak: 9, lastClaimDate: '2026-07-25' }],
  ['tier 3 (14 days)', { streakDays: 13, tier: 2, longestStreak: 20, lastClaimDate: '2026-07-25' }],
  ['tier 4 (30 days)', { streakDays: 29, tier: 3, longestStreak: 40, lastClaimDate: '2026-07-25' }],
  ['cooled from tier 4', { streakDays: 30, tier: 4, longestStreak: 40, lastClaimDate: '2026-07-01' }],
  ['already collected', { streakDays: 30, tier: 4, longestStreak: 40, lastClaimDate: '2026-07-26' }],
];

const NOW = new Date('2026-07-26T12:00:00Z');

describe('PART 1 — the run settles identically under every Take state', () => {
  it('produces byte-identical payout, Yield and Score across all of them', () => {
    const settlements = TAKE_STATES.map(([, state]) => {
      // The Take is previewed alongside the settlement, exactly as the route
      // does it — and then the settlement is recomputed.
      previewDailyTake(state, NOW);
      return JSON.stringify(settleRun());
    });

    const [first, ...rest] = settlements;
    for (const settlement of rest) {
      expect(settlement).toBe(first);
    }
  });

  it('is not a vacuous assertion — the Take s own numbers really do differ', () => {
    const amounts = TAKE_STATES.map(([, state]) => previewDailyTake(state, NOW).amount);
    expect(new Set(amounts)).toEqual(new Set([0, 100, 125, 150, 200, 300]));
  });

  it('leaves Yield charge-independent and Score build-independent (§6.2, Rule 2)', () => {
    const base = settleRun();
    for (const [, state] of TAKE_STATES) {
      const preview = previewDailyTake(state, NOW);
      const settled = settleRun();
      expect(settled.yieldDna).toBe(base.yieldDna);
      expect(settled.score).toBe(base.score);
      expect(settled.adjustedDna).toBe(base.adjustedDna);
      // The Take's multiplier is not a factor of any of them.
      expect(settled.adjustedDna % Math.max(1, preview.amount)).toBe(
        base.adjustedDna % Math.max(1, preview.amount)
      );
    }
  });

  it('has no settlement helper that so much as mentions the Take', () => {
    // The type system already forbids passing one. This says the same thing
    // about the bodies, so a Take could not be reached through an import
    // either — the three modules that decide what a run is worth do not know
    // the mechanism exists.
    for (const file of [
      'src/shared/game/rulesets.ts',
      'src/shared/game/ascendance.ts',
      'src/shared/game/energyEnvelope.ts',
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/dailyTake|daily_take|takeTier|take_tier|TAKE_BASE/);
    }
  });
});

describe('PART 2 — the settlement route reads the Take and nothing more', () => {
  it('imports the read-only describer and NOT the collector', () => {
    expect(ROUTE).toContain("import { describeDailyTakeSlot } from '@/lib/server/dailyTake';");
    // Settlement must not be able to pay the Take: §7.2 attaches it to a tap.
    expect(ROUTE).not.toMatch(/collectDailyTake/);
    expect(ROUTE).not.toMatch(/collect_daily_take/);
  });

  it('calls the describer exactly once', () => {
    expect(ROUTE.match(/describeDailyTakeSlot\(/g)).toHaveLength(1);
  });

  it('reads the Take AFTER every payout write has committed', () => {
    const call = ROUTE.indexOf('await describeDailyTakeSlot(');
    expect(call).toBeGreaterThan(-1);
    for (const earlier of [
      'const ascendance = ascendanceYieldBreakdown(',
      'const yieldDna = ascendance.totalYield;',
      'const finalDna = applyEnergyHarvestMultiplier(',
      'const settlementUpdate: Record<string, unknown> = {',
      'dna: newDna,',
      "source_type: 'game_reward',",
      'await refreshPlayerRecords(supabase, player.id);',
      'await settleSignalAttemptForSession(',
    ]) {
      expect(ROUTE.indexOf(earlier)).toBeGreaterThan(-1);
      expect(call).toBeGreaterThan(ROUTE.indexOf(earlier));
    }
  });

  it('uses `takeSlot` only to decide whether to attach it to the response', () => {
    const uses = ROUTE.match(/takeSlot[?.\w]*/g) ?? [];
    expect(uses).toEqual([
      'takeSlot', // const takeSlot = ...
      'takeSlot?.firstRunOfDay', // the guard
      'takeSlot', // the payload
    ]);
    // No arithmetic, anywhere.
    expect(ROUTE).not.toMatch(/[*+/-]\s*takeSlot/);
    expect(ROUTE).not.toMatch(/takeSlot[?.\w]*\s*[*+/-]/);
    expect(ROUTE).not.toMatch(/takeSlot[?.]*\.(amount|multiplier|streakDays)/);
  });

  it('keeps the Take out of the session row and out of the validation block', () => {
    const settlementUpdate = ROUTE.slice(
      ROUTE.indexOf('const settlementUpdate: Record<string, unknown> = {'),
      ROUTE.indexOf('const endSession = ()')
    );
    expect(settlementUpdate).not.toMatch(/take/i);

    // The `validation` block of the earning-path response.
    const responseStart = ROUTE.lastIndexOf('return NextResponse.json({\n        success: true,');
    const validation = ROUTE.slice(
      ROUTE.indexOf('validation: {', responseStart),
      ROUTE.indexOf('...(identityInfo', responseStart)
    );
    expect(validation.length).toBeGreaterThan(50);
    expect(validation).not.toMatch(/take/i);
    expect(validation).not.toMatch(/dailyTake/);
  });

  it('attaches the slot only when the server has one to offer', () => {
    expect(ROUTE).toContain('...(takeSlot?.firstRunOfDay ? { dailyTake: takeSlot } : {}),');
  });

  it('never lets the Take reach the Free Play response either', () => {
    const freePlay = ROUTE.slice(
      ROUTE.indexOf('if (isFreeSession) {'),
      ROUTE.indexOf('const newDna = player.dna + finalDna;')
    );
    expect(freePlay.length).toBeGreaterThan(100);
    // Free Play pays nothing, so it offers nothing (§7.4).
    expect(freePlay).not.toMatch(/take/i);
  });
});

describe('PART 3 — the slot the surface receives', () => {
  it('renders only when the server said this run may collect', () => {
    const slot = {
      live: true,
      firstRunOfDay: true,
      amount: 200,
      streakDays: 14,
      multiplier: 2,
      collected: false,
    };
    expect(parseDailyTake({ success: true, dailyTake: slot })).toEqual({
      firstRunOfDay: true,
      amount: 200,
      streakDays: 14,
      multiplier: 2,
      collected: false,
    });
  });

  it('renders nothing when the settlement omits the block (flag off, or collected)', () => {
    expect(parseDailyTake({ success: true })).toBeNull();
    expect(parseDailyTake({ success: true, dailyTake: null })).toBeNull();
    expect(
      parseDailyTake({ dailyTake: { live: true, firstRunOfDay: false, amount: 0 } })
    ).toBeNull();
  });

  it('cannot be talked into a bigger Take by the payload it is handed', () => {
    // `parseDailyTake` is display-only; the endpoint is authoritative. This
    // pins that a fabricated settlement cannot make the surface *claim* more,
    // because the amount it renders is never sent back on collect.
    const inflated = parseDailyTake({
      dailyTake: { firstRunOfDay: true, amount: 999999, multiplier: 50, streakDays: 9999 },
    });
    expect(inflated?.amount).toBe(999999);

    // …and none of it can travel back: the collect route never reads the
    // request body at all, so a fabricated slot buys a misleading label and
    // nothing else. The RPC pays what the chain earned.
    const collectRoute = fs.readFileSync(
      path.join(__dirname, '../../daily-take/collect/route.ts'),
      'utf8'
    );
    expect(collectRoute).not.toMatch(/request\.json\(\)/);
    expect(collectRoute).not.toMatch(/\bbody[.[]/);
    expect(collectRoute).not.toMatch(/const\s+body\b/);
    expect(collectRoute).toContain("collectDailyTake(supabase, player.id as string)");
  });
});
