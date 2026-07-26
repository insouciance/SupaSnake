/**
 * The web app manifest (Constitution §11.4 — "the web is the advantage").
 *
 * §11.4 treats the browser as the platform: no store, no download, no review
 * queue, a URL that opens the game in three seconds. Installing is therefore
 * an OPTIONAL convenience for a player who already plays — a shortcut on a
 * home screen and a window without browser chrome — never a gate and never a
 * thing to pester somebody about. That posture is why this file is small.
 *
 * ICONS ARE REUSED, NOT REGENERATED
 *
 *   WP-0.08 already shipped the icon set through the App Router file
 *   conventions: `src/app/icon.svg` (the scalable mark, served verbatim at
 *   `/icon.svg`) and `src/app/apple-icon.tsx` (180×180 PNG, rendered by
 *   `next/og` at `/apple-icon`). This module references those two URLs and
 *   creates nothing. A second icon set would be a second thing to keep in
 *   step with the palette, and the first one to go stale.
 *
 *   The SVG carries `sizes: 'any'`, which is what makes it satisfy the
 *   installability floor on Chromium (an icon of at least 144px, or a
 *   vector declared for any size) without a raster ladder.
 *
 * NOTHING COMMERCIAL LIVES HERE
 *
 *   Rule 7 keeps commerce in its district. A manifest is a surface a player
 *   sees on a home screen for years, so it carries the product name, the
 *   mission line and the mark — no price, no store link, no shortcut into a
 *   shop. `manifest.test.ts` sweeps every string in the composed document
 *   through the same commercial-vocabulary lint the Dispatch emails use, so a
 *   later edit cannot quietly turn the home screen into an advert.
 *
 * NOTHING HERE CAN TOUCH A RUN
 *
 *   Rule 1 (run sanctity). `start_url` is the site root, never `/game`: an
 *   installed launcher opens the home surface and the player starts a run
 *   deliberately, exactly as on the web. There are no `shortcuts` into the
 *   game for the same reason — a long-press shortcut that drops somebody
 *   straight into a run is a run they did not choose to start.
 */

import { SITE_NAME, SITE_TAGLINE } from '@/shared/config/site';

/**
 * The manifest's own description, and NOT `SITE_DESCRIPTION`.
 *
 * The site description says "Every run ends with a deal" — correct, vivid,
 * and the word "deal" is the extraction moment, not an offer. That reading is
 * obvious on a landing page surrounded by the game and invisible on a home
 * screen next to an app icon, which is why the Rule 7 lint (rightly) refuses
 * it here: the manifest is one of the few strings a player sees with no
 * context at all, potentially for years.
 *
 * So this line is written for that context, and it passes both the commercial
 * and the Rule 5 sweeps with room to spare. It is not a marketing variant —
 * it says the same thing in words that cannot be misread.
 */
export const PWA_DESCRIPTION =
  'A three-minute precision snake game. Bank the run, push your luck, or feed the snake.';

/** Background behind the splash screen; the void the arena sits in. */
export const PWA_BACKGROUND_COLOR = '#06090d';

/**
 * Matches `viewport.themeColor` in the root layout. If these two ever
 * disagree, an installed window and a browser tab tint differently on the
 * same device — `manifest.test.ts` pins the pair.
 */
export const PWA_THEME_COLOR = '#0e141c';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/**
 * The existing WP-0.08 icons, by their served URL. Both are App Router file
 * conventions; neither is a new asset.
 */
export const PWA_ICONS: readonly ManifestIcon[] = [
  {
    // src/app/icon.svg — static, served byte-for-byte at this path.
    src: '/icon.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any',
  },
  {
    // src/app/apple-icon.tsx — next/og route, 180×180 PNG.
    src: '/apple-icon',
    sizes: '180x180',
    type: 'image/png',
    purpose: 'any',
  },
];

export interface WebManifest {
  name: string;
  short_name: string;
  description: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  categories: string[];
  lang: string;
  dir: string;
  icons: ManifestIcon[];
}

/**
 * The manifest document. A pure function of the site config — it reads no
 * request, no header and no environment, so the manifest a preview serves and
 * the manifest production serves differ in nothing at all.
 *
 * `start_url` and `scope` are relative (`/`) on purpose: an installed app
 * resolves them against the origin it was installed from, so a player who
 * installed from an alternate host is not silently redirected somewhere else.
 */
export function buildWebManifest(): WebManifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: PWA_DESCRIPTION,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ['games'],
    lang: 'en',
    dir: 'ltr',
    icons: [...PWA_ICONS],
  };
}

/** Every human-readable string in the manifest, for the Rule 7 sweep. */
export function manifestProse(manifest: WebManifest): Record<string, string> {
  return {
    name: manifest.name,
    short_name: manifest.short_name,
    description: manifest.description,
  };
}
