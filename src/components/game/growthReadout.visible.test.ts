/**
 * THE GROWTH RATE MUST BE ON SCREEN WHILE IT MATTERS (WP-3.09).
 *
 * Two defects in this wave were the same defect. WP-3.03 shipped terrain as
 * complete physics with no renderer, under a fully green suite, because every
 * test asserted the model. WP-3.03 then shipped a growth readout that read the
 * ENGINE's profile pre-run - always `baseline` until the server answers - so
 * it displayed "Classic" whatever you picked, and WP-3.04 had to repair it.
 * Neither was visible to a model test, because the model was never wrong.
 *
 * And the readout it repaired was still PRE-RUN ONLY: it reached the screen
 * solely as `growthNote` on `RunSetupPanel`, which lives in the `!isPlaying`
 * branch, so it unmounted the instant the run began.
 *
 * So this file asserts the WIRE, in the same deliberately structural style as
 * `src/shared/game/terrain.visible.test.ts`: that a live number reaches a live
 * screen, on BOTH sides of the cockpit flag, from the one function that owns
 * the curve. It is not elegant. It is the shape of assertion that would
 * actually have caught all three.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const page = read('src/app/game/page.tsx');
const cockpit = read('src/components/game/cockpit/RunCockpit.tsx');
const component = read('src/components/game/GrowthReadout.tsx');
const types = read('src/components/game/cockpit/types.ts');

/**
 * Comments stripped. This codebase explains itself at length - the growth
 * component's own header names `baseGrowthForFood` and `role="alert"` in order
 * to say why it must not use them - so a naive substring search would flag the
 * explanation as the offence.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

const componentCode = code(component);
const cockpitCode = code(cockpit);

describe('the readout reads the ONE function, with the LIVE food count', () => {
  it('derives the rate from baseGrowthForFood', () => {
    expect(page).toContain('baseGrowthForFood(activeGrowth, growthFoodIndex)');
  });

  it('feeds it the live food count, not the constant 1', () => {
    // WP-3.02's readout was `baseGrowthForFood(activeGrowth, 1)` - the
    // first-food rate, permanently. On Tuned that means it promised 6
    // segments per food for the whole run while food 12 onward paid 2.
    expect(page).toMatch(/const growthFoodIndex =[^\n]*foodEaten \+ 1/);
    expect(page).not.toContain('baseGrowthForFood(activeGrowth, 1)');
  });

  it('the store food count is pushed every tick, or the rate freezes', () => {
    expect(page).toContain('setFoodEaten(state.foodEaten)');
  });

  it('IN-RUN it reads the profile the SERVER stamped', () => {
    // The WP-3.04 scar in reverse. Pre-run the engine is always `baseline`,
    // so the selection is the honest source; in-run the engine carries the
    // server's stamp, which is what settlement recomputes from.
    expect(page).toMatch(
      /const activeGrowth = isPlaying\s*\?\s*resolveGrowthProfile\(gameRef\.current\?\.getGrowthProfileId\(\)\)/
    );
  });

  it('no component holds a second copy of the curve', () => {
    // growth.ts: "Do not inline it, do not reimplement it, do not read the
    // profile fields directly to compute growth."
    for (const source of [componentCode, cockpitCode]) {
      expect(source).not.toContain('baseGrowthForFood');
      expect(source).not.toContain('GROWTH_PROFILES');
      expect(source).not.toContain('accelEvery');
    }
  });
});

describe('the readout survives the run starting', () => {
  it('is not reachable only through the pre-run setup panel', () => {
    // The exact WP-3.02 failure: one mount, on a panel that unmounts when
    // `isPlaying` flips. Two more mounts now exist, one per HUD.
    const mounts = page.match(/<GrowthReadout/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2);
  });

  it('the cockpit HUD carries it', () => {
    expect(types).toMatch(/growth\?: \{/);
    expect(page).toMatch(/growth: \{[\s\S]{0,200}perFood: growthPerFood/);
    expect(cockpit).toContain('<GrowthReadout');
    expect(cockpit).toContain('model.growth');
  });

  it('the rollback HUD carries it too, inside the in-run ticker', () => {
    // CI runs a flags-off leg and the legacy screen is the rollback path. A
    // readout that only exists under the cockpit flag breaks that leg - and
    // silently loses the diagnostic in the exact configuration a rollback is
    // reached from.
    expect(page).toContain('presentation="ticker"');
    const tickerAt = page.indexOf('game-hud-ticker');
    const readoutAt = page.indexOf('presentation="ticker"');
    const holdsAt = page.indexOf("data-testid=\"hold-budget\"");
    expect(tickerAt).toBeGreaterThan(-1);
    expect(readoutAt).toBeGreaterThan(tickerAt);
    expect(readoutAt).toBeLessThan(holdsAt);
  });

  it('the setup panel renders the same component, not a private copy', () => {
    expect(page).toMatch(
      /const growthNoteNode = \(\s*<GrowthReadout[\s\S]{0,240}presentation="panel"/
    );
    expect(page).toContain('growthNote={growthNoteNode}');
  });
});

describe('the step notice fires from the step, and only from the step', () => {
  it('compares this food rate against the previous one', () => {
    expect(page).toMatch(/lastGrowthPerFoodRef/);
    expect(page).toMatch(
      /if \(previous === null \|\| previous === growthPerFood\) return;/
    );
    expect(page).toMatch(/setGrowthStep\(\{ from: previous, to: growthPerFood/);
  });

  it('clears itself between runs, so a step cannot leak into the next one', () => {
    expect(page).toMatch(
      /if \(!isPlaying\) \{[\s\S]{0,160}setGrowthStep\(null\);/
    );
  });

  it('is mounted on BOTH HUDs from one node', () => {
    expect(page).toMatch(/const growthStepNoticeNode: ReactNode = isPlaying && growthStep/);
    // Cockpit: through its own slot...
    expect(page).toContain('growthNotice={growthStepNoticeNode}');
    expect(cockpit).toContain('{growthNotice}');
    // ...rollback: directly in the ticker row.
    expect(page).toContain('{growthStepNoticeNode}');
  });

  it('does NOT go through the cockpit event callout', () => {
    // `eventCallout` occupies `grid-area: status` and REPLACES the status
    // rail, and RunCockpit suppresses the `first-movement-prompt` testid
    // whenever it is truthy - an e2e spec depends on that testid. A growth
    // notice routed through it would contend with expression flourishes and
    // break that spec. It layers beside its own number instead.
    const calloutAt = page.indexOf('const cockpitEventCallout');
    const calloutEnd = page.indexOf('const growthStepNoticeNode');
    expect(calloutAt).toBeGreaterThan(-1);
    expect(calloutEnd).toBeGreaterThan(calloutAt);
    expect(page.slice(calloutAt, calloutEnd)).not.toContain('Growth');
    // The notice is placed in the mode instrument, not the status zone.
    const noticeAt = cockpit.indexOf('{growthNotice}');
    const railAt = cockpit.indexOf('className={styles.statusRail}');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(noticeAt).toBeLessThan(railAt);
  });
});

describe('the notice cannot cost the player the run', () => {
  it('never pauses the tick or touches the engine', () => {
    // §3.3: "never swallow a steering input or pause the tick."
    expect(componentCode).not.toMatch(/gameRef|setIsPaused|handlePause|pause\(/);
  });

  it('takes no input at all', () => {
    expect(componentCode).not.toMatch(/onClick|onPointer|onKeyDown|onTouch|<button/);
  });

  it('cannot intercept a flick: every in-run element is pointer-events-none', () => {
    // A flick that lands on a HUD chip instead of the board is a death the
    // player did not earn.
    expect(component).toContain('pointer-events-none');
    const css = read('src/components/game/cockpit/CockpitPrototype.module.css');
    expect(css).toMatch(/\.growthReadout \{[\s\S]{0,400}pointer-events: none;/);
    expect(css).toMatch(/\.growthNotice \{[\s\S]{0,400}pointer-events: none;/);
  });

  it('announces politely, never as an alert', () => {
    expect(componentCode).toContain('aria-live="polite"');
    expect(componentCode).not.toContain('role="alert"');
  });
});
