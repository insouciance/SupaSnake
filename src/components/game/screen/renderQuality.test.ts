/**
 * Adaptive-quality governor policy.
 *
 * The core is pure by design, so the policy that decides how a weak device
 * plays is testable without a GPU, a browser or a clock. What these pin is
 * the two things a governor can get catastrophically wrong: reacting too
 * slowly to a run that has started dropping ticks, and flapping between tiers
 * once it has reacted.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  INITIAL_GOVERNOR_STATE,
  windowsRequiredToStepUp,
  MAX_RENDER_TIER,
  RENDER_GOVERNOR,
  RENDER_QUALITY_TIERS,
  nextGovernorState,
  qualityForTier,
  type GovernorState,
  type RenderTier,
} from './renderQuality';

const STARVED = RENDER_GOVERNOR.stepDownBelow - 0.1;
const HEALTHY = RENDER_GOVERNOR.stepUpAbove + 0.05;
/** Between the thresholds: keeps its tier, earns nothing back. */
const MIDDLING =
  (RENDER_GOVERNOR.stepDownBelow + RENDER_GOVERNOR.stepUpAbove) / 2;

/** Past the warm-up, so a scenario measures the policy and not the cold start. */
function warmed(state: GovernorState = INITIAL_GOVERNOR_STATE): GovernorState {
  return { ...state, observedWindows: RENDER_GOVERNOR.warmupWindows };
}

function feed(
  state: GovernorState,
  retention: number,
  times: number,
  options?: { allowStepUp?: boolean }
): GovernorState {
  let next = state;
  for (let i = 0; i < times; i += 1) {
    next = nextGovernorState(next, retention, options);
  }
  return next;
}

describe('the tier table', () => {
  it('spends consequences before identity - every tier is still this board', () => {
    // The ratified direction is the ink hull, the toon bands, the slab and the
    // amber. NONE of them is a tier knob: there is nothing in this table that
    // can turn the board into a different board. What degrades is lighting and
    // post-processing only.
    for (const quality of RENDER_QUALITY_TIERS) {
      expect(Object.keys(quality).sort()).toEqual(
        ['bloomResolutionScale', 'shadowsEnabled', 'terrainCastsShadow', 'tier'].sort()
      );
    }
  });

  it('is ordered cheapest-last and never gets more expensive as it degrades', () => {
    RENDER_QUALITY_TIERS.forEach((quality, index) => {
      expect(quality.tier).toBe(index);
    });

    // Bloom is spent first and spent twice; it was the largest measured cost.
    expect(RENDER_QUALITY_TIERS[0].bloomResolutionScale).toBe(0.5);
    expect(RENDER_QUALITY_TIERS[1].bloomResolutionScale).toBe(0.25);
    expect(RENDER_QUALITY_TIERS[3].bloomResolutionScale).toBeNull();

    // Terrain keeps casting until T2, and shadows survive until the floor.
    expect(RENDER_QUALITY_TIERS[1].terrainCastsShadow).toBe(true);
    expect(RENDER_QUALITY_TIERS[2].terrainCastsShadow).toBe(false);
    expect(RENDER_QUALITY_TIERS[2].shadowsEnabled).toBe(true);
    expect(RENDER_QUALITY_TIERS[3].shadowsEnabled).toBe(false);

    // Monotonic: no tier restores something a cheaper-numbered tier gave up.
    for (let i = 1; i < RENDER_QUALITY_TIERS.length; i += 1) {
      const prev = RENDER_QUALITY_TIERS[i - 1];
      const curr = RENDER_QUALITY_TIERS[i];
      const cost = (q: (typeof RENDER_QUALITY_TIERS)[number]) =>
        (q.bloomResolutionScale ?? 0) +
        (q.terrainCastsShadow ? 1 : 0) +
        (q.shadowsEnabled ? 1 : 0);
      expect(cost(curr)).toBeLessThan(cost(prev));
    }
  });

  it('resolves every tier, and falls back to the full look on a bad index', () => {
    for (let tier = 0; tier <= MAX_RENDER_TIER; tier += 1) {
      expect(qualityForTier(tier as RenderTier).tier).toBe(tier);
    }
    expect(qualityForTier(99 as RenderTier)).toBe(RENDER_QUALITY_TIERS[0]);
  });
});

describe('stepping down', () => {
  it('drops a tier on the FIRST starved window - dropped ticks are a gameplay problem', () => {
    const next = nextGovernorState(warmed(), STARVED);
    expect(next.tier).toBe(1);
    expect(next.healthyWindows).toBe(0);
  });

  it('keeps descending while the run stays starved, and stops at the floor', () => {
    let state = warmed();
    for (const expected of [1, 2, 3]) {
      state = nextGovernorState(state, STARVED);
      expect(state.tier).toBe(expected);
    }
    // The floor holds: no tier 4, no wrap, no oscillation.
    state = feed(state, STARVED, 5);
    expect(state.tier).toBe(MAX_RENDER_TIER);
  });

  it('steps down even while a decision surface forbids stepping up', () => {
    // A downgrade under an open decision is invisible - the board is blurred
    // behind it - and the run still has to be protected.
    const next = nextGovernorState(warmed(), STARVED, {
      allowStepUp: false,
    });
    expect(next.tier).toBe(1);
  });
});

describe('stepping up', () => {
  it('requires a sustained run of healthy windows, not one good one', () => {
    const degraded = warmed({ ...INITIAL_GOVERNOR_STATE, tier: 2 });
    const almost = feed(degraded, HEALTHY, RENDER_GOVERNOR.stepUpAfterWindows - 1);
    expect(almost.tier).toBe(2);
    expect(almost.healthyWindows).toBe(RENDER_GOVERNOR.stepUpAfterWindows - 1);

    const recovered = nextGovernorState(almost, HEALTHY);
    expect(recovered.tier).toBe(1);
    expect(recovered.healthyWindows).toBe(0);
  });

  it('never climbs past the full look', () => {
    const state = feed(warmed(), HEALTHY, 50);
    expect(state.tier).toBe(0);
  });

  it('holds quality steady while a decision surface is open', () => {
    // The streak still accrues, so recovery is not lost - it just does not pop
    // the board's lighting back in under a surface the player is reading.
    const degraded = warmed({ ...INITIAL_GOVERNOR_STATE, tier: 2 });
    const held = feed(degraded, HEALTHY, RENDER_GOVERNOR.stepUpAfterWindows + 4, {
      allowStepUp: false,
    });
    expect(held.tier).toBe(2);
    expect(held.healthyWindows).toBeGreaterThanOrEqual(
      RENDER_GOVERNOR.stepUpAfterWindows
    );

    // And the moment the decision closes, the earned recovery lands.
    expect(nextGovernorState(held, HEALTHY).tier).toBe(1);
  });
});

describe('hysteresis', () => {
  it('does not flap: one starved window costs a long healthy streak to undo', () => {
    let state = nextGovernorState(warmed(), STARVED);
    expect(state.tier).toBe(1);

    // A single good window must not undo it.
    state = nextGovernorState(state, HEALTHY);
    expect(state.tier).toBe(1);

    // And the streak required is the BACKED-OFF one, because this tier has now
    // been demoted once. Recovery is deliberately more expensive than the
    // demotion that caused it.
    const required = windowsRequiredToStepUp(1);
    expect(required).toBeGreaterThan(RENDER_GOVERNOR.stepUpAfterWindows);

    state = feed(state, HEALTHY, required - 2);
    expect(state.tier).toBe(1);

    state = nextGovernorState(state, HEALTHY);
    expect(state.tier).toBe(0);
  });

  it('a middling window holds the tier and resets the recovery streak', () => {
    const degraded = warmed({ ...INITIAL_GOVERNOR_STATE, tier: 1 });
    const nearlyRecovered = feed(
      degraded,
      HEALTHY,
      RENDER_GOVERNOR.stepUpAfterWindows - 1
    );
    const interrupted = nextGovernorState(nearlyRecovered, MIDDLING);
    expect(interrupted.tier).toBe(1);
    expect(interrupted.healthyWindows).toBe(0);

    // The streak must start over, so recovery always means an UNBROKEN run.
    const afterInterruption = feed(
      interrupted,
      HEALTHY,
      RENDER_GOVERNOR.stepUpAfterWindows - 1
    );
    expect(afterInterruption.tier).toBe(1);
  });

  it('settles instead of oscillating when retention sits at the step-down edge', () => {
    // Alternating starved/healthy is the classic flapping input. The tier must
    // not bounce every other window.
    let state = warmed();
    const tiers: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      state = nextGovernorState(state, i % 2 === 0 ? STARVED : HEALTHY);
      tiers.push(state.tier);
    }
    // It descends to the floor and stays there: a single healthy window between
    // starved ones can never earn a tier back. A RISING tier number is a
    // quality drop, so "never flapped" means the number never fell.
    expect(state.tier).toBe(MAX_RENDER_TIER);
    const recoveries = tiers.filter((tier, i) => i > 0 && tier < tiers[i - 1]);
    expect(recoveries).toHaveLength(0);
  });
});

describe('garbage input', () => {
  it('treats a NaN or out-of-range window as healthy rather than reacting to it', () => {
    // A stalled tab, a zero-length window, a clock that went backwards. A
    // governor that reacts to nonsense is worse than one that reacts late.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 5, -3]) {
      expect(nextGovernorState(warmed(), bad).tier).toBe(0);
    }
    // ...and a clamped-low value is still treated as the starvation it is.
    expect(nextGovernorState(warmed(), -0).tier).toBe(1);
  });
});

describe('warm-up', () => {
  it('ignores the first windows entirely - a cold page is not a slow device', () => {
    // Measured: an unthrottled machine reported 3% retention on its first
    // window while the bundle was still compiling, and the governor dived to
    // the floor on hardware that was never the problem.
    let state = INITIAL_GOVERNOR_STATE;
    for (let i = 0; i < RENDER_GOVERNOR.warmupWindows; i += 1) {
      state = nextGovernorState(state, 0);
      expect(state.tier).toBe(0);
    }
    // The window after warm-up is acted on normally.
    expect(nextGovernorState(state, 0).tier).toBe(1);
  });

  it('counts warm-up windows even when they look healthy', () => {
    const state = feed(INITIAL_GOVERNOR_STATE, HEALTHY, RENDER_GOVERNOR.warmupWindows);
    expect(state.observedWindows).toBe(RENDER_GOVERNOR.warmupWindows);
  });
});

describe('backoff', () => {
  it('makes each recovery attempt cost more than the last', () => {
    expect(windowsRequiredToStepUp(0)).toBe(RENDER_GOVERNOR.stepUpAfterWindows);
    expect(windowsRequiredToStepUp(1)).toBeGreaterThan(windowsRequiredToStepUp(0));
    expect(windowsRequiredToStepUp(3)).toBeGreaterThan(windowsRequiredToStepUp(1));
  });

  it('caps the backoff so a device that genuinely improved can still recover', () => {
    const capped =
      RENDER_GOVERNOR.stepUpAfterWindows * RENDER_GOVERNOR.maxBackoffMultiplier;
    expect(windowsRequiredToStepUp(1000)).toBe(capped);
  });

  it('stops the measured 3->2->3 oscillation at the floor', () => {
    /*
     * THE FLAW THIS EXISTS FOR, reproduced. At the floor the board is cheap, so
     * retention reads ~99% and the governor climbs - into the cost it just
     * escaped, which collapses retention and sends it straight back down.
     * Recovery was being judged at the cheap tier and paid for at the expensive
     * one. On the fixture that cycled every few seconds.
     *
     * The simulation below is exactly that device: healthy whenever it is at
     * the floor, starved at any tier above it.
     */
    let state = warmed();
    let climbs = 0;
    for (let i = 0; i < 400; i += 1) {
      const atFloor = state.tier === MAX_RENDER_TIER;
      const before = state.tier;
      state = nextGovernorState(state, atFloor ? HEALTHY : STARVED);
      if (state.tier < before) climbs += 1;
    }
    // It still tries occasionally - a device whose situation improved must be
    // able to recover - but the attempts become RARE instead of constant.
    // Without backoff this device would climb every `stepUpAfterWindows + 1`
    // windows, forever; the guard is that it does so a small fraction as often.
    const withoutBackoff = Math.floor(400 / (RENDER_GOVERNOR.stepUpAfterWindows + 1));
    expect(climbs).toBeLessThan(withoutBackoff / 4);
    // And whatever it tries, it always ends up back where the device can cope.
    expect(state.tier).toBe(MAX_RENDER_TIER);
  });
});

describe('the engine contract', () => {
  it('is render-side only: the module reads no engine, rules or random state', () => {
    // The governor may never change what a run IS. Two players at different
    // tiers must play the same game, so this module must not be able to reach
    // gameplay at all - not through an import, not through Math.random.
    const source = readFileSync(
      join(process.cwd(), 'src/components/game/screen/renderQuality.ts'),
      'utf8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('import');
    expect(code).not.toContain('Math.random');
    expect(code).not.toContain('Date.now');
    expect(code).not.toContain('performance.now');
  });
});
