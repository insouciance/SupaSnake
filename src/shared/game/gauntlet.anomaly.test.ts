/**
 * Gauntlet x Anomaly interaction (Design v2 sections 8.2 + 8.3 node 1):
 * anomaly-board runs are excluded from counted scoring under every lens
 * EXCEPT Anomaly Doctrine (protocols_1), which counts them at x1.20.
 * TS mirror of the gauntlet_side_score changes in migration 021.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildSideRules,
  countedSideScore,
  runCountsForRules,
  type CountedRunInput,
} from '@/shared/game/gauntlet';

const WEEK = new Date(Date.UTC(2026, 6, 13)); // Monday
const THURSDAY = new Date(Date.UTC(2026, 6, 16, 12));

function run(overrides: Partial<CountedRunInput> = {}): CountedRunInput {
  return {
    memberId: 'member-1',
    dnaEarned: 500,
    endedAt: THURSDAY,
    dynasty: 'CYBER',
    extracted: true,
    ...overrides,
  };
}

describe('anomaly runs vs counted-run lenses', () => {
  it('anomaly runs never count under the base lenses', () => {
    const rules = buildSideRules({ dynasty: 'CYBER', modifier: 'vanguard' }, []);
    expect(runCountsForRules(run(), rules, WEEK)).toBe(true);
    expect(runCountsForRules(run({ anomaly: true }), rules, WEEK)).toBe(false);
  });

  it('anomaly runs never count under the legacy (no rules) lens either', () => {
    expect(runCountsForRules(run(), null, WEEK)).toBe(true);
    expect(runCountsForRules(run({ anomaly: true }), null, WEEK)).toBe(false);
  });

  it('Anomaly Doctrine counts them - alongside normal counted runs', () => {
    const rules = buildSideRules(
      { dynasty: 'CYBER', modifier: 'anomaly_doctrine' },
      ['protocols_1']
    );
    expect(rules.include_anomaly).toBe(true);
    expect(rules.weight).toBe(1.2);
    expect(runCountsForRules(run({ anomaly: true }), rules, WEEK)).toBe(true);
    expect(runCountsForRules(run(), rules, WEEK)).toBe(true);
  });

  it('doctrine-counted anomaly runs still respect the dynasty pick + window', () => {
    const rules = buildSideRules(
      { dynasty: 'PRIMAL', modifier: 'anomaly_doctrine' },
      ['protocols_1']
    );
    expect(runCountsForRules(run({ anomaly: true }), rules, WEEK)).toBe(false); // CYBER run
    expect(
      runCountsForRules(
        run({ anomaly: true, dynasty: 'PRIMAL', endedAt: new Date(Date.UTC(2026, 6, 14)) }),
        rules,
        WEEK
      )
    ).toBe(false); // Tuesday - outside Thu-Sun
  });

  it('countedSideScore applies the x1.20 weight over the merged pool', () => {
    const rules = buildSideRules(
      { dynasty: 'CYBER', modifier: 'anomaly_doctrine' },
      ['protocols_1']
    );
    const runs = [
      run({ dnaEarned: 1000 }),
      run({ dnaEarned: 800, anomaly: true }),
    ];
    expect(countedSideScore(runs, rules, WEEK)).toBe(Math.floor(1800 * 1.2));
    // Same runs under Vanguard: anomaly run drops out, x1.10 on the rest
    const vanguard = buildSideRules({ dynasty: 'CYBER', modifier: 'vanguard' }, []);
    expect(countedSideScore(runs, vanguard, WEEK)).toBe(Math.floor(1000 * 1.1));
  });
});
