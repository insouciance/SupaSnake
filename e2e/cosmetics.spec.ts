/**
 * The home wardrobe, in a real browser (LF-B).
 *
 * THE FLAG MATRIX IS EXPLICIT, NEVER INFERRED.
 *
 * `NEXT_PUBLIC_SNAKE_COSMETICS` is in `config/production-public-surface.json`,
 * so the `production` e2e leg arms it and the `rollback` leg does not. Both
 * legs run this file and both assert something: with the flag on, the snake
 * opens a wardrobe; with it off, Home is exactly what it was and the snake is
 * not a control at all. A spec that only tested one state would be proving
 * whichever state CI happened to build.
 *
 * WHAT IS WORTH TESTING IN A BROWSER
 *
 * Not the equip call — jest covers that end of it, against mocks that match
 * the route. What only a browser can show is the CONTINUITY: that the canvas
 * survives opening the wardrobe. The whole shared-element design rests on the
 * snake never unmounting, and "the canvas element is the same object before
 * and after" is a claim no unit test can make.
 */

import { expect, test } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

const COSMETICS_ENABLED = process.env.NEXT_PUBLIC_SNAKE_COSMETICS === 'true';

/** The chamber is WebGL and lazy; wait for it rather than for a fixed delay. */
async function waitForChamber(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('home-chamber-placeholder')).toBeAttached({
    timeout: 20000,
  });
}

test.describe('home cosmetics', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test('the chamber is a lit room and never a page', async ({ page }) => {
    // OVERTURNED, AND RE-EXPRESSED (owner ruling, 2026-08-08 — "home should be
    // dark like the other pages"). This test was 'the chamber is never a dark
    // room' and it gated `luma > 120`, argued from "the owner has ruled out
    // black twice". The same authority has now ruled the other way, so the
    // threshold flips rather than the test being deleted.
    //
    // What it protects is unchanged in KIND. The chamber is a stage, and a
    // stage fails in two directions: a room so bright the character is a hole
    // in it, or a room so uniformly black that there is no stage at all and
    // the creature floats in a void. The old gate defended one edge; this one
    // defends both, because a dark ground makes the second failure the live
    // risk. The room must be dark AND it must have a lamp in it.
    //
    // Runs on BOTH legs: the ground is not behind the flag. The placeholder is
    // the first paint, so it is the frame most likely to regress unnoticed.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForChamber(page);

    const luma = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="home-chamber-placeholder"]'
      );
      if (!el) return null;
      // A real browser normalises every colour in a gradient to `rgb()` /
      // `rgba()`, so the authored hex literals are gone by the time the DOM is
      // readable — the jest twin of this test can match hex, this one cannot.
      // Fully transparent stops are skipped: `rgba(…, 0)` is not a colour the
      // player ever sees, and several of them are authored as transparent
      // black, which would fail a luma check while being invisible.
      const style = window.getComputedStyle(el);
      const source = `${style.backgroundImage} ${style.backgroundColor}`;
      const colors = source.match(/rgba?\([^)]+\)/g) ?? [];
      const lumas: number[] = [];
      for (const color of colors) {
        const parts = color
          .replace(/rgba?\(|\)/g, '')
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(Number);
        const [r, g, b, a = 1] = parts;
        if (!Number.isFinite(r) || a === 0) continue;
        lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
      }
      return lumas.length === 0
        ? null
        : { min: Math.min(...lumas), max: Math.max(...lumas) };
    });

    expect(luma).not.toBeNull();
    // THE CEILING — this is the dark ruling, made checkable. The brightest
    // authored stop is the lamp, #2b4869, luma ~67. The page this replaced
    // graded from #ffffff through #fffaf1 to #faf1e2, luma ~240+. Anything
    // approaching those is the regression this test now exists for.
    expect(luma!.max).toBeLessThan(110);
    // THE FLOOR — and it is the half a straight inversion would have thrown
    // away. The room's own edge is #0e1c2c, luma ~26, and the creature's ink
    // is #0b1118, luma ~16: the lamp has to keep the ground ABOVE the line the
    // character is drawn with, or the bold outline the whole style rests on
    // has nothing to be bold against. A flat black chamber passes a ceiling
    // check and is still the failure.
    expect(luma!.max).toBeGreaterThan(40);
  });

  test('the wordmark is announced once, however it is drawn', async ({ page }) => {
    // The visible letters are per-glyph spans with no single text node, so the
    // name is carried by one screen-reader-only string. If that string is ever
    // lost the logo becomes invisible to assistive technology while looking
    // perfect. Both legs.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'SUPASNAKE', level: 1 })
    ).toBeVisible();
  });

  test.describe('with the wardrobe armed', () => {
    test.skip(!COSMETICS_ENABLED, 'NEXT_PUBLIC_SNAKE_COSMETICS is off on this leg');

    test('the snake opens a wardrobe, and never leaves the page', async ({
      page,
    }) => {
      await signInAsGuest(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForChamber(page);

      const opener = page.getByTestId('home-specimen-select');
      await expect(opener).toBeVisible({ timeout: 20000 });

      // Mark the live canvas. If opening the wardrobe remounts it — which a
      // route transition would — the mark is gone, and the player watched
      // their pet blink out and come back.
      const marked = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        (canvas as HTMLCanvasElement).dataset.continuityProbe = 'lf-b';
        return true;
      });
      expect(marked).toBe(true);

      const urlBefore = page.url();
      await opener.click();

      await expect(page.getByTestId('cosmetics-menu')).toBeVisible();

      // 1. Same document, same canvas object: no navigation, no remount.
      expect(page.url()).toBe(urlBefore);
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              document.querySelector<HTMLCanvasElement>('canvas')?.dataset
                .continuityProbe ?? null
          )
        )
        .toBe('lf-b');

      // 2. Home's chrome stepped back, and stepped back INERT — a faded
      //    control that is still focusable is a trap.
      const dock = page.locator('[data-home-command-dock]');
      await expect(dock).toHaveAttribute('data-stepped-back', 'true');
      await expect(dock).toHaveAttribute('inert', /.*/);

      // 3. Closing returns Home without a navigation either.
      await page.getByTestId('cosmetics-close').click();
      await expect(page.getByTestId('cosmetics-menu')).toBeHidden();
      await expect(dock).toHaveAttribute('data-stepped-back', 'false');
      expect(page.url()).toBe(urlBefore);
    });

    test('every category is reachable, including the empty one', async ({
      page,
    }) => {
      await signInAsGuest(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForChamber(page);
      await page.getByTestId('home-specimen-select').click();
      await expect(page.getByTestId('cosmetics-menu')).toBeVisible();

      for (const slot of ['face', 'crown', 'food_skin']) {
        const tab = page.getByTestId(`cosmetics-category-${slot}`);
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        // An empty shelf says so rather than looking broken.
        await expect(page.getByTestId('cosmetics-shelf')).toBeVisible();
      }
    });

    test('the wardrobe quotes no price and sells nothing (R7)', async ({
      page,
    }) => {
      await signInAsGuest(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForChamber(page);
      await page.getByTestId('home-specimen-select').click();

      const menu = page.getByTestId('cosmetics-menu');
      await expect(menu).toBeVisible();

      // Commerce stays in its district. Anything that looks like a price or a
      // checkout on this surface is a constitutional regression, not a design
      // change — assert the absence, because absence is the rule.
      const text = (await menu.textContent()) ?? '';
      expect(text).not.toMatch(/[€$£]/);
      expect(text).not.toMatch(/\d+[.,]\d{2}/);
      expect(text).not.toMatch(/buy|purchase|checkout|subscribe/i);

      // Any supporter-marked entry is a link to the district, never a form.
      const shopLinks = menu.locator('[data-action="shop"]');
      for (let i = 0; i < (await shopLinks.count()); i += 1) {
        await expect(shopLinks.nth(i)).toHaveAttribute('href', '/shop');
      }
    });

    test('Escape backs out of the wardrobe', async ({ page }) => {
      await signInAsGuest(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForChamber(page);
      await page.getByTestId('home-specimen-select').click();
      await expect(page.getByTestId('cosmetics-menu')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('cosmetics-menu')).toBeHidden();
    });
  });

  test.describe('with the wardrobe rolled back', () => {
    test.skip(COSMETICS_ENABLED, 'NEXT_PUBLIC_SNAKE_COSMETICS is on on this leg');

    test('Home is exactly what it was, and the snake is not a control', async ({
      page,
    }) => {
      // The rollback path, tested deliberately. Rolling the flag back removes
      // the WARDROBE and never the clothes: the chamber still renders, the
      // command rail is still the way out, and there is simply nothing to open.
      await signInAsGuest(page);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForChamber(page);

      await expect(page.getByTestId('home-command-rail')).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByTestId('home-specimen-select')).toHaveCount(0);
      await expect(page.getByTestId('cosmetics-menu')).toHaveCount(0);

      // And Home is not left in a stepped-back state by a flag that is off.
      await expect(page.locator('[data-home-command-dock]')).toHaveAttribute(
        'data-stepped-back',
        'false'
      );
    });
  });
});
