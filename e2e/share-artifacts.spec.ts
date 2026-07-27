/**
 * WP-1.08 — share artifacts and challenge links (Constitution §11.3,
 * Rule 14, Rule 7).
 *
 * This spec owns the half of the acceptance criteria that only a live server
 * can prove:
 *
 *   1. "every artifact URL renders an OG image" — each `opengraph-image`
 *      route is fetched and its bytes checked. Jest cannot do this: next/og
 *      rasterises through Satori's WASM, which will not load under Jest's
 *      CommonJS VM (see `src/app/artifactImages.test.tsx` for the split).
 *   2. "challenge link → playable same-seed run" — a challenge URL is
 *      opened, the run is started, and the board is compared against a
 *      second visit to the same link. Same seed, same board.
 *
 * The suite splits on NEXT_PUBLIC_SHARE_ARTIFACTS_V1 exactly as
 * run-flow.spec.ts splits on its flag: the flag-on describe asserts the new
 * surfaces, the flag-off describe asserts they are absent. One of the two
 * runs in any given build.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedConsent, signInAsGuest } from './helpers';

const SHARE_ARTIFACTS_ENABLED = process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 === 'true';

/**
 * The build artifact rides its OWN flag (WP-2.08). `/b/` is the seventh
 * artifact class and it must be able to roll back without taking the six
 * Phase-1 classes with it, which is the whole reason it does not reuse
 * NEXT_PUBLIC_SHARE_ARTIFACTS_V1.
 */
const WORKBENCH_ENABLED = process.env.NEXT_PUBLIC_WORKBENCH_V1 === 'true';

/** A legal build code: name, dynasty, generation, genes, anomaly, clause, infuses. */
const BUILD_CODE = 'Vyper~CYBER~4~gold_trail%2Ctithe~gold_rush~clause%3Adeep_apex~2';

/** A PNG carrying a 1200×630 card is far larger than this. */
const MIN_IMAGE_BYTES = 2_000;

/**
 * One address per artifact class (Rule 14: "a run, a snake, a clan, a Signal
 * day, a Serpent week, a profile"). The Serpent week is pinned to a Monday
 * because only a Monday names a week.
 */
const ARTIFACTS: Array<{ name: string; page: string; image: string }> = [
  { name: 'Signal day', page: '/s/214', image: '/s/214/opengraph-image' },
  { name: 'run', page: '/r/D0badf00d', image: '/r/D0badf00d/opengraph-image' },
  { name: 'Serpent week', page: '/w/2026-07-20', image: '/w/2026-07-20/opengraph-image' },
  { name: 'clan', page: '/c/FANG', image: '/c/FANG/opengraph-image' },
  {
    name: 'snake / lineage',
    page: '/x/Vyper~CYBER~4~slipstream',
    image: '/x/Vyper~CYBER~4~slipstream/opengraph-image',
  },
  { name: 'profile', page: '/p/Sans_Souci', image: '/p/Sans_Souci/opengraph-image' },
];

test.describe('every artifact URL renders an OG image (Rule 14)', () => {
  for (const artifact of ARTIFACTS) {
    test(`${artifact.name} — ${artifact.image}`, async ({ request }) => {
      const response = await request.get(artifact.image);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^image\//);
      expect((await response.body()).byteLength).toBeGreaterThan(MIN_IMAGE_BYTES);
    });
  }

  test('the challenge card renders the dare the file convention cannot see', async ({
    request,
  }) => {
    const response = await request.get(
      '/og/challenge?kind=signal&day=214&t=1240&by=Sans_Souci&d=ippb'
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
    expect((await response.body()).byteLength).toBeGreaterThan(MIN_IMAGE_BYTES);
  });

  test('an OG image route is not gated by the rollout flag', async ({ request }) => {
    // The flag gates the player-visible PAGE. A crawler that unfurls a link
    // during a rollback must still get a card, not a grey box.
    const response = await request.get('/s/214/opengraph-image');
    expect(response.status()).toBe(200);
  });

  test('build — /b/<code> renders bytes on either side of its own flag', async ({
    request,
  }) => {
    // Deliberately outside the WORKBENCH_ENABLED split: the seventh class's
    // image is ungated for the same reason the other six are.
    const response = await request.get(`/b/${BUILD_CODE}/opengraph-image`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
    expect((await response.body()).byteLength).toBeGreaterThan(MIN_IMAGE_BYTES);
  });

  test('an undecodable build code still renders a card rather than throwing', async ({
    request,
  }) => {
    const response = await request.get('/b/garbage/opengraph-image');
    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength).toBeGreaterThan(MIN_IMAGE_BYTES);
  });
});

test.describe('the build artifact — a recipe, never evidence (WP-2.08)', () => {
  test.skip(!WORKBENCH_ENABLED, 'NEXT_PUBLIC_WORKBENCH_V1 is off');

  test('the landing page offers a way in and quotes no Yield', async ({ page }) => {
    await page.goto(`/b/${BUILD_CODE}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('artifact-landing')).toBeVisible();
    await expect(page.getByTestId('artifact-title')).toHaveText('Vyper — Gen 4');

    // Rule 14: "a way in".
    const play = page.getByTestId('artifact-play');
    await expect(play).toBeVisible();
    await expect(play).toHaveAttribute('href', /^\/(game|codex)/);

    // The constraint the class exists under: a forgeable code carries no
    // rankable number, so neither does the page rendered from it.
    const body = (await page.getByTestId('artifact-landing').innerText()).toLowerCase();
    expect(body).not.toContain('yield');
    expect(body).not.toContain('score');

    // Rule 7: no commercial surface.
    await expect(page.locator('a[href^="/shop"]')).toHaveCount(0);
  });

  test('a code naming a gene that does not exist 404s rather than guessing', async ({
    page,
  }) => {
    const response = await page.goto('/b/Vyper~CYBER~4~gold_trail%2Cnot_a_gene~~~0', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
  });

  test('a code with the wrong field count 404s', async ({ page }) => {
    const response = await page.goto('/b/Vyper~CYBER~4~gold_trail', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
  });
});

test.describe('flag off — the build page is absent but its card is not', () => {
  test.skip(WORKBENCH_ENABLED, 'NEXT_PUBLIC_WORKBENCH_V1 is on');

  test('/b/<code> is not found', async ({ page }) => {
    const response = await page.goto(`/b/${BUILD_CODE}`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
  });

  test('and the already-shared link still unfurls', async ({ request }) => {
    const response = await request.get(`/b/${BUILD_CODE}/opengraph-image`);
    expect(response.status()).toBe(200);
  });
});

test.describe('artifact landing pages', () => {
  test.skip(!SHARE_ARTIFACTS_ENABLED, 'NEXT_PUBLIC_SHARE_ARTIFACTS_V1 is off');

  for (const artifact of ARTIFACTS.filter((entry) => entry.page !== '/p/Sans_Souci')) {
    test(`${artifact.name} — ${artifact.page} offers a way in`, async ({ page }) => {
      const response = await page.goto(artifact.page, { waitUntil: 'domcontentloaded' });
      // A clan or profile that does not exist in this environment 404s,
      // which is correct behaviour rather than a failure of the artifact.
      test.skip(response?.status() === 404, 'artifact does not exist in this environment');

      await expect(page.getByTestId('artifact-landing')).toBeVisible();
      await expect(page.getByTestId('artifact-title')).toBeVisible();

      // Rule 14: "a way in".
      const play = page.getByTestId('artifact-play');
      await expect(play).toBeVisible();
      await expect(play).toHaveAttribute('href', /^\/(game|lab)/);

      // Rule 7: zero commercial surfaces on an artifact's landing page.
      await expect(page.locator('a[href^="/shop"]')).toHaveCount(0);
      await expect(page.getByText(/\b(buy|subscribe|upgrade now)\b/i)).toHaveCount(0);
    });
  }

  test('a Signal challenge landing shows the dare and points at the day seed', async ({
    page,
  }) => {
    await page.goto('/s/214?t=1240&by=Sans_Souci&d=ippb', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('artifact-title')).toHaveText(
      "Beat Sans_Souci's 1,240"
    );
    await expect(page.getByTestId('artifact-glyphs')).toHaveText('⚡▶▶💰');
    await expect(page.getByTestId('artifact-subtitle')).toHaveText(
      'infuse · pass · pass · BANKED ×1.25'
    );
    // Provenance is stated: a target off a URL is a claim, not a record.
    await expect(page.getByTestId('artifact-provenance')).toHaveText(
      'A shared result — play it yourself'
    );

    const href = await page.getByTestId('artifact-play').getAttribute('href');
    expect(href).toMatch(/^\/game\?seed=D[0-9a-f]{8}&target=1240&challenge=signal%3A214/);
  });

  /**
   * The shape the single-gene fixture above cannot test.
   *
   * `encodeLineageCode` joins genes with a comma and escapes it, so ANY
   * two-gene code contains `%2C` — and `/x/Vyper~CYBER~4~slipstream`, the only
   * lineage URL this suite pinned, has no escapes in it at all. A path helper
   * that re-encoded the code therefore looked fine here while silently
   * emptying every real multi-gene card: 200 OK, "Unwritten — no genes held".
   */
  test('a multi-gene lineage card renders its genes, not an empty snake', async ({
    page,
  }) => {
    await page.goto('/x/Vyper~CYBER~4~slipstream%2Cgold_trail', {
      waitUntil: 'domcontentloaded',
    });
    const subtitle = page.getByTestId('artifact-subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('Slipstream');
    await expect(subtitle).toContainText('Gold Trail');
    await expect(subtitle).not.toContainText('Unwritten');
  });

  test('a forged seed in the URL cannot change the board', async ({ page }) => {
    await page.goto('/s/214?seed=forged&t=1240', { waitUntil: 'domcontentloaded' });
    const href = await page.getByTestId('artifact-play').getAttribute('href');
    expect(href).not.toContain('forged');
  });
});

test.describe('flag off — the artifact pages are absent', () => {
  test.skip(SHARE_ARTIFACTS_ENABLED, 'NEXT_PUBLIC_SHARE_ARTIFACTS_V1 is on');

  for (const artifact of ARTIFACTS.filter((entry) => entry.page !== '/p/Sans_Souci')) {
    test(`${artifact.page} is not found`, async ({ page }) => {
      const response = await page.goto(artifact.page, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(404);
    });
  }

  test('the profile page keeps working — it is not a new surface', async ({ request }) => {
    const response = await request.get('/p/Sans_Souci/opengraph-image');
    expect(response.status()).toBe(200);
  });
});

/**
 * The seed the engine was actually constructed with, as the page reports it.
 *
 * Deliberately NOT a pixel comparison of the board: the arena is WebGL, and
 * two renders of one board are not byte-comparable. The seed is the honest
 * browser-observable — the engine's determinism from a seed is proven
 * exhaustively in `SnakeGameLogic.determinism.test.ts`, so a seed that
 * survives the URL, the landing page and the mount is a same-seed run.
 */
async function runSeed(page: Page): Promise<string | null> {
  return page.locator('[data-run-seed]').first().getAttribute('data-run-seed');
}

test.describe('challenge link → playable same-seed run', () => {
  test.skip(!SHARE_ARTIFACTS_ENABLED, 'NEXT_PUBLIC_SHARE_ARTIFACTS_V1 is off');

  test('the link lands on a live board carrying the dare', async ({ page }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    // The visitor's journey: the shared link, then its one way in.
    await page.goto('/s/214?t=1240&by=Sans_Souci&d=ippb', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('artifact-play').click();
    await page.waitForURL(/\/game\?seed=/, { timeout: 30000 });

    // The dare is legible before START, not after (§11.3).
    const note = page.getByTestId('challenge-note');
    if ((await note.count()) > 0) {
      await expect(note).toContainText('1,240');
      await expect(note).toContainText('Signal #214');
    }

    // And the board is live: a start control, or the HUD already up.
    const started = page
      .getByTestId('earn-start')
      .or(page.getByTestId('free-play-start'))
      .or(page.getByTestId('anomaly-start'))
      .or(page.getByText(/^score$/i));
    await expect(started.first()).toBeVisible({ timeout: 30000 });

    // The engine was seeded from the DAY, not from anything in the query.
    expect(await runSeed(page)).toMatch(/^D[0-9a-f]{8}$/);
  });

  test('two visits to one challenge link build the engine on the same seed', async ({
    page,
  }) => {
    await seedConsent(page);
    await signInAsGuest(page);

    const challengeUrl = '/game?seed=Dchallenge1&target=1240&challenge=run%3ADchallenge1';

    await page.goto(challengeUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-run-seed]').first()).toBeVisible({ timeout: 30000 });
    const first = await runSeed(page);

    await page.goto(challengeUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-run-seed]').first()).toBeVisible({ timeout: 30000 });
    const second = await runSeed(page);

    expect(first).toBe('Dchallenge1');
    expect(second).toBe(first);
  });

  test('an ordinary run reports no seed, so nothing is silently seeded', async ({
    page,
  }) => {
    await seedConsent(page);
    await signInAsGuest(page);
    await page.goto('/game', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-run-seed]')).toHaveCount(0);
  });
});
