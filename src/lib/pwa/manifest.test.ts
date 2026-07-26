/**
 * The manifest is valid, it reuses the icons WP-0.08 already shipped, and it
 * says nothing commercial (Constitution §11.4, Rule 7).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PWA_BACKGROUND_COLOR,
  PWA_ICONS,
  PWA_THEME_COLOR,
  buildWebManifest,
  manifestProse,
} from '@/lib/pwa/manifest';
import { SITE_DESCRIPTION } from '@/shared/config/site';
import { sweepMessage } from '@/lib/growth/commercialLanguage';
import { sweepForLoss } from '@/lib/growth/lossLanguage';

const ROOT = join(__dirname, '..', '..', '..');

describe('web app manifest', () => {
  const manifest = buildWebManifest();

  it('carries every field a browser needs to treat it as installable', () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    // `short_name` is what fits under a home-screen icon; 12 chars is the
    // conventional ceiling before truncation.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('survives a JSON round trip unchanged (it is served as JSON)', () => {
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it('opens the home surface, never a run (Rule 1)', () => {
    expect(manifest.start_url).not.toContain('/game');
    expect(manifest.start_url).not.toContain('/training');
    // No `shortcuts` key at all: a long-press shortcut into the arena is a
    // run the player did not choose to start.
    expect(manifest).not.toHaveProperty('shortcuts');
  });

  describe('icons', () => {
    it('references the EXISTING WP-0.08 icons and generates no new set', () => {
      const sources = PWA_ICONS.map((icon) => icon.src);
      expect(sources).toEqual(['/icon.svg', '/apple-icon']);
    });

    it('every referenced icon is backed by a committed App Router file', () => {
      // `/icon.svg` is served verbatim from src/app/icon.svg; `/apple-icon`
      // is the next/og route at src/app/apple-icon.tsx. If either file is
      // renamed, the manifest points at a 404 and this fails.
      expect(existsSync(join(ROOT, 'src', 'app', 'icon.svg'))).toBe(true);
      expect(existsSync(join(ROOT, 'src', 'app', 'apple-icon.tsx'))).toBe(true);
    });

    it('declares a vector icon for any size, which is the installability floor', () => {
      const svg = PWA_ICONS.find((icon) => icon.type === 'image/svg+xml');
      expect(svg).toBeDefined();
      expect(svg?.sizes).toBe('any');
    });

    it('every icon declares src, sizes and type', () => {
      for (const icon of PWA_ICONS) {
        expect(icon.src.startsWith('/')).toBe(true);
        expect(icon.sizes.length).toBeGreaterThan(0);
        expect(icon.type).toMatch(/^image\//);
      }
    });

    it('the apple-icon entry matches the size that route actually renders', () => {
      const source = readFileSync(join(ROOT, 'src', 'app', 'apple-icon.tsx'), 'utf8');
      expect(source).toContain('APPLE_ICON_SIZE');
      const brand = readFileSync(join(ROOT, 'src', 'lib', 'og', 'brand.ts'), 'utf8');
      expect(brand).toContain('APPLE_ICON_SIZE = { width: 180, height: 180 }');
      expect(PWA_ICONS.find((icon) => icon.src === '/apple-icon')?.sizes).toBe('180x180');
    });
  });

  it('tints the same as the browser tab (layout viewport.themeColor)', () => {
    const layout = readFileSync(join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain(`themeColor: '${PWA_THEME_COLOR}'`);
    expect(PWA_BACKGROUND_COLOR).toBe('#06090d');
  });

  it('says nothing commercial — Rule 7 sweeps the home screen too', () => {
    expect(sweepMessage(manifestProse(manifest))).toEqual([]);
  });

  it('does not reuse SITE_DESCRIPTION, which the Rule 7 lint refuses here', () => {
    // "Every run ends with a deal" is right on a landing page and unreadable
    // on a home screen. The divergence is deliberate; this pins it so nobody
    // "fixes" the duplication by pointing the manifest back at the site copy.
    expect(manifest.description).not.toBe(SITE_DESCRIPTION);
    expect(sweepMessage({ site: SITE_DESCRIPTION }).length).toBeGreaterThan(0);
  });

  it('says nothing that guilts or implies decay — Rule 5', () => {
    expect(sweepForLoss(manifestProse(manifest))).toEqual([]);
  });
});
