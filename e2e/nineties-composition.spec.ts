/**
 * WHICH COMPOSITION THIS BUILD SHIPPED, checked in a real browser (90S-A).
 *
 * THE FLAG MATRIX IS EXPLICIT, NEVER INFERRED.
 *
 * `NEXT_PUBLIC_NINETIES_COMPOSITION` is in
 * `config/production-public-surface.json`, so the `production` leg arms it
 * `true` and the `rollback` leg arms it `false` - both pinned. Both legs run
 * the whole suite, so every other spec in this directory is ALREADY exercising
 * both compositions; what none of them does is say out loud which one it got.
 * This file does exactly that, and nothing else.
 *
 * WHY THAT NEEDS A BROWSER AT ALL. `NEXT_PUBLIC_*` values are inlined at build
 * time, so the only place the flag's effect exists is in the artifact CI
 * actually built. Jest proves the resolver against every input; it cannot
 * prove that the leg CALLING itself the rollback leg shipped the rollback. A
 * rollback CI cannot see is a rollback nobody is testing.
 *
 * WHY THE CHAMBER AND NOT THE BOARD. `chamber = game law`: the home portrait
 * and the played head resolve ONE style through one flag, and the chamber is
 * reachable without a session, a run or a route mock. Asserting it here costs
 * one page load instead of the run-start journey `cockpit.spec` pays five
 * minutes for, and the fact being asserted is the same fact.
 */

import { expect, test } from '@playwright/test';
import { seedConsent } from './helpers';

const NINETIES_ENABLED =
  process.env.NEXT_PUBLIC_NINETIES_COMPOSITION === 'true';

test.describe('the 90s composition', () => {
  test('the build declares one composition, and that composition renders', async ({
    page,
  }) => {
    // Runs on BOTH legs, asserting the opposite thing on each. The attribute
    // is the claim; the live canvas beside it is what makes the claim
    // expensive to fake - a style whose patched material failed to compile
    // would take the canvas down with it, and this would go red on the leg
    // that broke rather than on both or neither.
    await seedConsent(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('home-chamber-placeholder')).toBeAttached({
      timeout: 20000,
    });

    const stage = page.getByTestId('home-specimen-full-stage');
    await expect(stage).toHaveAttribute(
      'data-composition',
      NINETIES_ENABLED ? 'nineties' : 'stone'
    );
    await expect(stage.locator('canvas')).toBeAttached({ timeout: 30000 });
  });
});
