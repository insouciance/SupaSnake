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
import { RULESETS, CYBER_TICK_FLOOR_MS, PRIMAL_SPEED_MS } from './rulesets';

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
    // PRIMAL's window is read at PRIMAL's OWN tick, never at a literal 200.
    // That literal is what this file exists to distrust, and WP-3.08 moved the
    // tempo to 175 (PRIMAL_SPEED_MS) — which takes the 90-tick window from
    // 18.0s to 15.75s.
    //
    // That shrinkage is not the rot `despawnSeconds` was invented to stop.
    // PRIMAL's tick is CONSTANT, so 90 ticks is a knowable 90 moves of runway
    // whatever the tempo is, and a portal window that shortens along with every
    // other traverse in the dynasty is the tempo change doing its job. CYBER
    // needed seconds because its tick halves *within a single run*, so the same
    // 90 ticks meant two different decisions in one sitting.
    //
    // What the ruling actually asserts is that the decision costs the same
    // ORDER wherever it is made. The defect it repaired was 4x (18.0 vs 4.5);
    // the tolerance here is 2.5s, which holds the two dynasties inside 15%.
    const primal = RULESETS.PRIMAL.extraction;
    const primalSeconds = windowSeconds(
      primal.despawnSeconds,
      primal.despawnTicks,
      PRIMAL_SPEED_MS
    );
    const cyberAtFloor = windowSeconds(
      RULESETS.CYBER.extraction.despawnSeconds,
      RULESETS.CYBER.extraction.despawnTicks,
      CYBER_TICK_FLOOR_MS
    );
    expect(primalSeconds).toBeCloseTo(15.75, 2);
    expect(primalSeconds).toBeGreaterThan(15);
    expect(Math.abs(primalSeconds - cyberAtFloor)).toBeLessThan(2.5);
  });

  it('PRIMAL is the one dynasty whose window may ride the tick count', () => {
    // The rule the two cases above come from, stated once. A dynasty whose tick
    // varies inside a run MUST author its window in seconds; a fixed-tempo
    // dynasty may ride `despawnTicks`, because for it the two units say the
    // same thing. If PRIMAL ever gets a speed curve, it needs `despawnSeconds`
    // in the same commit.
    for (const dynasty of ['PRIMAL', 'COSMIC'] as const) {
      const ruleset = RULESETS[dynasty];
      expect(ruleset.speedForFood(0)).toBe(ruleset.speedForFood(400));
      expect(ruleset.extraction.despawnSeconds).toBeUndefined();
    }
    expect(RULESETS.CYBER.speedForFood(0)).not.toBe(RULESETS.CYBER.speedForFood(400));
    expect(RULESETS.CYBER.extraction.despawnSeconds).toBeDefined();
  });

  it('the OLD tick-denominated behaviour is what it fixes', () => {
    // Regression documentation: without the seconds override, 90 ticks at the
    // floor is substantially shorter than PRIMAL's window. If someone deletes
    // `despawnSeconds`, this is the number that comes back.
    const ticksOnly = windowSeconds(undefined, 90, CYBER_TICK_FLOOR_MS);
    expect(ticksOnly).toBeCloseTo(10.8, 1);
    expect(windowSeconds(undefined, 90, 50)).toBeCloseTo(4.5, 1);
  });
});
