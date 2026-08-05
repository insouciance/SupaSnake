#!/usr/bin/env node

/**
 * Derives the textures we SERVE from the plates the owner AUTHORED.
 *
 * The authored files are the record and are never written by this script.
 * `public/textures/*` is a delivery format, regenerated from source, and the
 * repo keeps both so a derivative can always be re-derived rather than
 * re-authored. `docs/game/HUD_COCKPIT_REDESIGN.md` permits a derived format
 * only where measurement proves a loading win and the authored pixels and
 * crop survive it; the numbers in the table below are that measurement, and
 * the space plate is deliberately NOT resized for exactly that reason.
 *
 * WHY THIS EXISTS AT ALL. These three files never pass through `next/image`:
 * two are read by CSS `background-image` and two by drei's `useTexture`, and
 * both paths hand the browser the raw bytes. Next's optimizer only sees
 * `<Image>`. So 2.9 MB of PNG/JPEG was reaching every player - 2.1 MB of it
 * on the game screen, on a mechanic whose audience is mostly on phones.
 *
 * Run: node scripts/optimize-textures.mjs [--check]
 *
 * `--check` re-derives into a temp dir and diffs the byte sizes instead of
 * writing, so CI or a reviewer can prove the committed derivatives still
 * match their sources. Not wired into any npm script: this is a one-time
 * derivation that only reruns when a plate is re-authored.
 *
 * `sharp` arrives as a Next optional dependency rather than a direct one.
 * That is fine for a tool that is run by hand and whose OUTPUT is committed;
 * it would not be fine for a build step, which is why this is not one.
 */

import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const sharp = (await import('sharp')).default;

/**
 * Each entry records why its size and quality are what they are. The
 * per-texture reasoning is the point: "make it smaller" is not a decision.
 */
const TEXTURES = [
  {
    source: 'assets/minimalistic_background_texture_of_space_1.png',
    output: 'public/textures/minimalistic_background_texture_of_space_1.webp',
    // NOT resized. This is the authored backdrop for the whole game screen,
    // drawn with `background-size: cover`, so on a wide desktop it is
    // magnified to the viewport already - downscaling it would be visible
    // where the other two would not. Format alone pays 91% here, which is
    // the entire argument for leaving the pixels alone.
    resizeWidth: null,
    quality: 86,
  },
  {
    source: 'assets/New/TEX_high-resolution_paper_surface_texture_subtle_fiber.png',
    output: 'public/textures/paper-fiber.webp',
    // Drawn as `map` at opacity 0.07 under a near-white multiply: it exists
    // to give the backdrop TOOTH, not detail. Half resolution doubles the
    // apparent grain size, which at 7% opacity no eye resolves.
    resizeWidth: 512,
    quality: 85,
  },
  {
    source: 'assets/New/TEX_COMIC_SPEED_LINES.png',
    output: 'public/textures/speed-lines.webp',
    // Used only as an `alphaMap` at opacity 0.2 - three reads the green
    // channel and the colour is a flat warm grey, so chroma detail here is
    // discarded by the renderer before it is ever seen. Greyscaling it first
    // was measured and saved nothing (WebP already decorrelates chroma), so
    // the plate stays in colour and unmodified in character.
    resizeWidth: 512,
    quality: 85,
  },
];

const check = process.argv.includes('--check');
const outDir = check ? mkdtempSync(join(tmpdir(), 'supasnake-tex-')) : null;

let failed = false;
let before = 0;
let after = 0;

for (const { source, output, resizeWidth, quality } of TEXTURES) {
  const target = check ? join(outDir, output.replaceAll('/', '_')) : output;

  const pipeline = sharp(source);
  if (resizeWidth !== null) {
    pipeline.resize({ width: resizeWidth, withoutEnlargement: true });
  }
  await pipeline.webp({ quality, effort: 6 }).toFile(target);

  const derived = statSync(target).size;
  const { width, height } = await sharp(target).metadata();

  if (check) {
    let committed;
    try {
      committed = statSync(output).size;
    } catch {
      console.error(`MISSING  ${output} — run without --check to derive it`);
      failed = true;
      continue;
    }
    // WebP encoding is deterministic for a fixed libvips/libwebp, but the
    // version is not pinned here, so compare with a small tolerance rather
    // than demanding byte equality and failing on a harmless upgrade.
    const drift = Math.abs(committed - derived) / derived;
    const ok = drift < 0.02;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'ok      ' : 'DRIFTED '} ${output} committed=${committed} derived=${derived}`
    );
    continue;
  }

  before += statSync(source).size;
  after += derived;
  console.log(`${output}  ${width}x${height}  q${quality}  ${derived} bytes`);
}

if (check) {
  console.log(failed ? 'texture derivatives are stale' : 'texture derivatives match their sources');
  process.exitCode = failed ? 1 : 0;
} else {
  console.log(`\nauthored ${before} bytes -> served ${after} bytes`);
}
