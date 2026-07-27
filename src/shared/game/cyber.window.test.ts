/**
 * CYBER's extraction window (WP-3.04).
 *
 * The defect: `despawnTicks` is denominated in ticks, so the portal window
 * shrank as the dynasty accelerated — 18.0s on PRIMAL against 4.5s at CYBER's
 * old floor. Food carries no deadline, which is why eating stayed possible
 * exactly as banking became impossible, and why the owner reported "it's
 * pretty impossible to bank past a certain speed... I was able to eat food
 * though, so I should be able to hit the portal too".
 *
 * The fix is the unit, not the number.
 */

import { describe, it, expect } from '@jest/globals';
import { RULESETS, CYBER_TICK_FLOOR_MS } from './rulesets';

/** What the engine computes: seconds authored, converted by the live tick. */
function windowSeconds(despawnSeconds: number | undefined, despawnTicks: number, tickMs: number): number {
  const ticks =
    despawnSeconds !== undefined
      ? Math.max(1, Math.round((despawnSeconds * 1000) / Math.max(1, tickMs)))
      : despawnTicks;
  return (ticks * tickMs) / 1000;
}

describe('the extraction window holds its real duration', () => {
  it('CYBER authors its window in seconds', () => {
    expect(RULESETS.CYBER.extraction.despawnSeconds).toBe(18);
  });

  it('stays ~18s across CYBER\'s whole speed curve', () => {
    const { despawnSeconds, despawnTicks } = RULESETS.CYBER.extraction;
    for (const tick of [200, 150, 125, 110, CYBER_TICK_FLOOR_MS]) {
      const seconds = windowSeconds(despawnSeconds, despawnTicks, tick);
      expect(seconds).toBeGreaterThan(17);
      expect(seconds).toBeLessThan(19);
    }
  });

  it('matches PRIMAL — the decision costs the same wherever it is made', () => {
    const primal = RULESETS.PRIMAL.extraction;
    const primalSeconds = windowSeconds(
      primal.despawnSeconds,
      primal.despawnTicks,
      200
    );
    const cyberAtFloor = windowSeconds(
      RULESETS.CYBER.extraction.despawnSeconds,
      RULESETS.CYBER.extraction.despawnTicks,
      CYBER_TICK_FLOOR_MS
    );
    expect(Math.abs(primalSeconds - cyberAtFloor)).toBeLessThan(1);
  });

  it('the OLD tick-denominated behaviour is what it fixes', () => {
    // Regression documentation: without the seconds override, 90 ticks at the
    // floor is a quarter of PRIMAL's window. If someone deletes
    // `despawnSeconds`, this is the number that comes back.
    const ticksOnly = windowSeconds(undefined, 90, CYBER_TICK_FLOOR_MS);
    expect(ticksOnly).toBeCloseTo(9, 0);
    expect(windowSeconds(undefined, 90, 50)).toBeCloseTo(4.5, 1);
  });
});
