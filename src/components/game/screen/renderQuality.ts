/**
 * ADAPTIVE QUALITY - the board spends consequences before it spends identity.
 *
 * INK & AMBER costs roughly twice what the board cost before it: the ink hull
 * doubles the geometry of every solid object, and the pop-out gives the canvas
 * 2.25x the bay's area to paint. On a capable device that is free. On a weak
 * one it is not, and the way it is NOT free here is unusual enough to state
 * plainly, because it is what this module exists for:
 *
 *   THE ENGINE TICKS ON `setInterval`, NOT ON rAF. A saturated main thread
 *   therefore does not render a slower animation of the same run - the browser
 *   DROPS interval callbacks, and the run itself advances fewer ticks per
 *   second. Frame cost is gameplay throughput. A player on a weak device does
 *   not get a prettier board that stutters; they get a board that plays slower
 *   than the one the leaderboard was set on.
 *
 * So the renderer measures the thing that actually matters - how many of its
 * scheduled callbacks the browser is still firing - and steps down cost tiers
 * until the run is moving again.
 *
 * PRIOR ART. This is dynamic resolution / dynamic quality scaling, which has
 * been standard in shipping engines for over a decade: consoles and mobile
 * titles routinely scale render resolution, shadow resolution and
 * post-processing at runtime to hold a frame budget (id Tech, Unreal's dynamic
 * resolution, Unity's adaptive performance, and every current-gen console
 * title with a "performance mode"). The pattern is unchanged here; only the
 * CONTROL SIGNAL differs. Those systems hold frame rate because frame rate is
 * what the player feels. This one holds TICK RETENTION, because on a board
 * driven by an interval timer the thing the player feels is how fast their
 * snake moves, and frame rate is merely the thing competing with it for the
 * main thread.
 *
 * WHAT THIS MODULE MAY NEVER DO. It is render-side only. It reads no engine
 * state, mutates none, and consumes no randomness - so the rules, the replay
 * contract and every settled run stay byte-identical whatever tier a device
 * ends up on. Two players at different tiers play exactly the same game; one
 * of them is looking at cheaper shadows.
 *
 * The core is pure (samples in, tier out) so the policy is unit-testable
 * without a GPU, a browser, or a clock.
 */

/** 0 is the full ratified look; higher tiers are progressively cheaper. */
export type RenderTier = 0 | 1 | 2 | 3;

export const MAX_RENDER_TIER: RenderTier = 3;

export interface RenderQuality {
  readonly tier: RenderTier;
  /**
   * Bloom's internal resolution as a fraction of the canvas, or `null` to drop
   * the post-processing composer entirely.
   */
  readonly bloomResolutionScale: number | null;
  /** Whether solid terrain contributes to the shadow map. */
  readonly terrainCastsShadow: boolean;
  /** Whether the key light renders a shadow map at all. */
  readonly shadowsEnabled: boolean;
}

/**
 * THE TIER TABLE.
 *
 * Ordered by the owner's rule: SPEND CONSEQUENCES BEFORE IDENTITY. The ink
 * hull, the toon bands, the slab's geometry and Venom Orange are the ratified
 * direction and are present at EVERY tier - they are what the board IS. What
 * degrades is lighting and post-processing: what the board's shapes are
 * dressed in, never the shapes themselves.
 *
 * The order is measured rather than guessed (6x CPU throttle, cockpit
 * fixture): dropping the composer entirely moved the board from ~2.7fps to
 * ~10.9fps, which is why bloom is spent first and spent twice.
 *
 *   T0  the full look. Bloom at half resolution, 1024 shadow map, terrain
 *       casting. This is what a capable device renders, always.
 *   T1  bloom at quarter resolution. Bloom is a blurred copy of the bright
 *       parts, so a quarter-resolution bloom is a slightly softer glow and
 *       nothing else - the cheapest real saving on the board.
 *   T2  terrain stops casting into the shadow map. Up to 400 instanced blocks
 *       leave the shadow pass; they still RECEIVE, so the board keeps its
 *       depth. Sanctioned only as a degraded tier - never the default.
 *   T3  no shadow map and no composer. The floor: flat toon fills, ink
 *       outlines, the slab, the amber. Still unmistakably this board.
 */
export const RENDER_QUALITY_TIERS: readonly RenderQuality[] = [
  {
    tier: 0,
    bloomResolutionScale: 0.5,
    terrainCastsShadow: true,
    shadowsEnabled: true,
  },
  {
    tier: 1,
    bloomResolutionScale: 0.25,
    terrainCastsShadow: true,
    shadowsEnabled: true,
  },
  {
    tier: 2,
    bloomResolutionScale: 0.25,
    terrainCastsShadow: false,
    shadowsEnabled: true,
  },
  {
    tier: 3,
    bloomResolutionScale: null,
    terrainCastsShadow: false,
    shadowsEnabled: false,
  },
] as const;

export function qualityForTier(tier: RenderTier): RenderQuality {
  return RENDER_QUALITY_TIERS[tier] ?? RENDER_QUALITY_TIERS[0];
}

/**
 * Governor policy constants.
 *
 * `stepDownBelow` is set from measurement rather than taste. A healthy board
 * retains essentially all of its interval callbacks; `main` under a 6x CPU
 * throttle retained ~61% and this branch ~31%, and the run-flow contract
 * (checkpoint replay depth growing >20 ticks in its window) sat right on that
 * boundary. 0.7 is comfortably above "healthy but busy" and well below any
 * value a device that is actually keeping up would produce.
 *
 * The asymmetry is the whole point of a governor: STEP DOWN ON ONE BAD SAMPLE,
 * step up only after a sustained run of good ones. Dropping ticks is a
 * gameplay problem and must be answered immediately; recovering quality is a
 * cosmetic gain and must never be answered so eagerly that the board flaps
 * between tiers on a passing hitch.
 */
export const RENDER_GOVERNOR = {
  /** How often the probe callback is scheduled. */
  sampleIntervalMs: 100,
  /** Callbacks per decision window - one second at the interval above. */
  windowSamples: 10,
  /** Below this retention, step down at once. */
  stepDownBelow: 0.7,
  /** Above this retention, count toward a step up. */
  stepUpAbove: 0.92,
  /** Consecutive healthy windows required before recovering one tier. */
  stepUpAfterWindows: 6,
  /**
   * Windows ignored after the governor starts sampling.
   *
   * Measured, not defensive: on a cold page the first window came back at 3%
   * retention while the bundle was still compiling and the scene was still
   * warming, and the governor - correctly, by its own rule - dived straight to
   * the floor on a machine that was not throttled at all. Nothing about that
   * window described the device. Skipping the first few is what every adaptive
   * renderer does around a level load.
   */
  warmupWindows: 3,
  /**
   * How much longer each successive demotion makes the next recovery attempt.
   *
   * WITHOUT THIS THE GOVERNOR OSCILLATES, and it did: at the floor the board is
   * cheap, so retention reads ~99%, so it climbs a tier - where the cost it
   * just escaped comes straight back, retention collapses, and it drops again.
   * Recovery was being judged at the CHEAP tier and paid for at the expensive
   * one. Measured on the fixture, that produced a 3->2->3 cycle every few
   * seconds.
   *
   * So each demotion makes the next attempt cost more healthy windows. A
   * device that is briefly busy recovers quickly; a device that genuinely
   * cannot afford a tier stops asking for it every few seconds. This is
   * ordinary exponential-ish backoff, and it is capped so recovery stays
   * possible for a device whose situation really did improve.
   */
  backoffPerDemotion: 1,
  maxBackoffMultiplier: 8,
} as const;

export interface GovernorState {
  readonly tier: RenderTier;
  /** Consecutive healthy windows observed since the last tier change. */
  readonly healthyWindows: number;
  /**
   * How many times this session has been forced down a tier. Recovery gets
   * harder with each one - see `backoffPerDemotion`.
   */
  readonly demotions: number;
  /** Windows observed since sampling began; the first few are ignored. */
  readonly observedWindows: number;
}

export const INITIAL_GOVERNOR_STATE: GovernorState = {
  tier: 0,
  healthyWindows: 0,
  demotions: 0,
  observedWindows: 0,
};

/** Healthy windows required to earn one tier back, given past demotions. */
export function windowsRequiredToStepUp(demotions: number): number {
  const multiplier = Math.min(
    RENDER_GOVERNOR.maxBackoffMultiplier,
    1 + Math.max(0, demotions) * RENDER_GOVERNOR.backoffPerDemotion
  );
  return RENDER_GOVERNOR.stepUpAfterWindows * multiplier;
}

export interface GovernorOptions {
  /**
   * When false, the governor may still step DOWN but never up.
   *
   * Used while a decision surface is open. A step down there is invisible -
   * the board is blurred behind the decision anyway - while a step UP would
   * pop the board's lighting back in underneath a surface the player is
   * reading. Protecting the run always wins; restoring quality can wait.
   */
  readonly allowStepUp?: boolean;
}

/**
 * The governor, as a pure function: current state plus one window's retention
 * in, next state out. No clock, no renderer, no globals.
 *
 * `retention` is fired-callbacks / expected-callbacks over the window, so 1
 * means the browser kept every appointment and 0.5 means it dropped half.
 * Values outside 0..1 (a stalled tab reporting nonsense, a NaN from a zero
 * window) are clamped rather than trusted: a governor that reacts to garbage
 * is worse than one that reacts late.
 */
export function nextGovernorState(
  state: GovernorState,
  retention: number,
  options: GovernorOptions = {}
): GovernorState {
  const allowStepUp = options.allowStepUp ?? true;
  // A real window is fired/expected, so it lives in 0..1. Anything above that
  // is clamped (harmless), but anything non-finite or NEGATIVE is nonsense -
  // a stalled tab, a zero-length window, a clock that went backwards - and is
  // read as healthy rather than clamped down into a false emergency. Zero
  // itself is a legitimate reading: the browser fired nothing.
  const safe =
    Number.isFinite(retention) && retention >= 0 ? Math.min(1, retention) : 1;

  const observedWindows = state.observedWindows + 1;
  const warmed = { ...state, observedWindows };

  // Warm-up: observe, but do not act. A cold page is not a slow device.
  if (observedWindows <= RENDER_GOVERNOR.warmupWindows) {
    return { ...warmed, healthyWindows: 0 };
  }

  if (safe < RENDER_GOVERNOR.stepDownBelow) {
    if (state.tier >= MAX_RENDER_TIER) {
      return { ...warmed, tier: MAX_RENDER_TIER, healthyWindows: 0 };
    }
    return {
      ...warmed,
      tier: (state.tier + 1) as RenderTier,
      healthyWindows: 0,
      demotions: state.demotions + 1,
    };
  }

  if (safe > RENDER_GOVERNOR.stepUpAbove) {
    if (state.tier === 0) return { ...warmed, healthyWindows: 0 };
    const healthyWindows = state.healthyWindows + 1;
    if (!allowStepUp) return { ...warmed, healthyWindows };
    if (healthyWindows >= windowsRequiredToStepUp(state.demotions)) {
      return {
        ...warmed,
        tier: (state.tier - 1) as RenderTier,
        healthyWindows: 0,
      };
    }
    return { ...warmed, healthyWindows };
  }

  // Between the two thresholds: healthy enough to keep the tier, not healthy
  // enough to earn one back. The recovery streak resets so that a step up
  // always represents an unbroken run of good windows.
  return { ...warmed, healthyWindows: 0 };
}
