/**
 * Derives every brand artefact in the repo from the vector mark.
 *
 * Run by hand, output committed:
 *
 *     node scripts/build-brand-assets.mjs
 *     node scripts/build-brand-assets.mjs --check   # verifies, writes nothing
 *
 * NOT WIRED INTO A BUILD, for the reason `scripts/optimize-textures.mjs:20-29`
 * already records: `sharp` reaches `node_modules` as one of Next's OPTIONAL
 * dependencies, so a CI runner installed with `--omit=optional` would not have
 * it. That is fine for a tool run by hand whose output is committed, and would
 * not be fine for a build step.
 *
 * THE POINT OF DERIVING RATHER THAN DRAWING
 *
 *   `scripts/brand/markGeometry.mjs` is the only place the mark is drawn. Every
 *   PNG, WebP, favicon and app icon below is rasterised from it, so the mark
 *   cannot drift between surfaces the way the old icon did — `icon.svg` and
 *   `apple-icon.tsx` each carried their own hand-written copy of the same path,
 *   and both still shipped the retired cyan months after it was retired.
 *
 *   It also means a better source re-runs the whole family. The owner's model
 *   (`assets/brand/LOGO-model.jpg`) is 413x148; the geometry module owes it
 *   nothing but its likeness, so nothing here is capped by that resolution.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { buildMarkSvg, buildMonogramSvg, MARK_PALETTE } from './brand/markGeometry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHECK = process.argv.includes('--check');

const written = [];
const drift = [];

async function emit(rel, buffer) {
  const abs = path.join(ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  if (CHECK) {
    const existing = await readFile(abs).catch(() => null);
    const same =
      existing && createHash('sha1').update(existing).digest('hex') ===
        createHash('sha1').update(buffer).digest('hex');
    if (!same) drift.push(rel);
    return;
  }
  await writeFile(abs, buffer);
  written.push([rel, buffer.length]);
}

const svgBuf = (svg) => Buffer.from(svg, 'utf8');
const png = (svg) => sharp(svgBuf(svg)).png({ compressionLevel: 9 }).toBuffer();

/**
 * A minimal ICO container holding PNG frames.
 *
 * Every browser in support has read PNG-in-ICO since IE11, and it keeps the
 * 48px frame a twelfth of the size a BMP frame would be. Sizes are declared as
 * one byte, where 0 means 256 — irrelevant here, but the reason the field looks
 * odd.
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const { size, data } of frames) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
}

async function main() {
  // ---------------------------------------------------------------- vectors
  // The canonical drawings. Unitless (no width/height) so every consumer
  // scales them without fighting an intrinsic size.
  const markSvg = buildMarkSvg();
  const plainSvg = buildMarkSvg({ burst: false });
  const monoSvg = buildMonogramSvg();

  await emit('assets/brand/supasnake-mark.svg', svgBuf(markSvg));
  await emit('assets/brand/supasnake-mark-plain.svg', svgBuf(plainSvg));
  await emit('assets/brand/supasnake-monogram.svg', svgBuf(monoSvg));

  // ------------------------------------------------------------- home hero
  // 441px is the mark's widest CSS box on Home: 6.12em at the lg:text-7xl
  // step, which is the locked wordmark geometry expressed as a width. The
  // ladder is that box at 1x/2x/3x.
  const HERO_1X = 441;
  for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
    const svg = buildMarkSvg({ width: HERO_1X * scale });
    const buf = svgBuf(svg);
    await emit(`public/brand/mark${suffix}.png`, await sharp(buf).png({ compressionLevel: 9 }).toBuffer());
    await emit(`public/brand/mark${suffix}.webp`, await sharp(buf).webp({ quality: 92 }).toBuffer());
  }

  // ------------------------------------------------------------- app icons
  // `src/app/icon.svg` keeps its path: the manifest and the service worker
  // both reference `/icon.svg`, and it is now a real vector rather than a
  // hand-written duplicate of one.
  await emit('src/app/icon.svg', svgBuf(buildMonogramSvg()));

  // The favicon frames carry a thinner ink contour. At 16px the production
  // contour is a quarter of the glyph and the S closes up into a dark blob;
  // this is the same drawing with the one parameter that does not survive the
  // size turned down.
  const icoFrames = [];
  for (const size of [16, 32, 48]) {
    const svg = buildMonogramSvg({ size, outlineScale: size <= 32 ? 0.55 : 0.8, radius: 14 });
    icoFrames.push({ size, data: await png(svg) });
  }
  await emit('src/app/favicon.ico', buildIco(icoFrames));

  await emit('src/app/apple-icon.png', await png(buildMonogramSvg({ size: 180, radius: 0 })));

  for (const size of [192, 512]) {
    await emit(`public/brand/icon-${size}.png`, await png(buildMonogramSvg({ size, radius: 20 })));
    await emit(
      `public/brand/icon-maskable-${size}.png`,
      await png(buildMonogramSvg({ size, maskable: true }))
    );
  }

  // --------------------------------------------------------------- OG card
  // Satori cannot fetch anything, so the mark reaches the OG card as a data
  // URI compiled into the bundle. PNG rather than SVG: satori rasterises an
  // <img> itself and its SVG support is narrower than its PNG support, and an
  // OG card is a fixed-size surface that gains nothing from a vector.
  const ogMark = await sharp(svgBuf(buildMarkSvg({ width: 760 })))
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
  const ogMeta = await sharp(ogMark).metadata();
  const ts = `/**
 * The mark, for \`next/og\`. GENERATED by \`scripts/build-brand-assets.mjs\` —
 * do not edit, and do not hand-tune the base64: re-run the script.
 *
 * Satori resolves no network and no filesystem, so a card that wants the logo
 * has to carry it. ${(ogMark.length / 1024).toFixed(1)} kB of base64 is the price of the real mark on
 * every share card instead of the word "SUPASNAKE" set in the fallback face.
 */
export const OG_MARK_WIDTH = ${ogMeta.width};
export const OG_MARK_HEIGHT = ${ogMeta.height};
export const OG_MARK_DATA_URI =
  'data:image/png;base64,${ogMark.toString('base64')}';
`;
  await emit('src/lib/og/markImage.ts', Buffer.from(ts, 'utf8'));

  // ------------------------------------------------------------------ done
  if (CHECK) {
    if (drift.length) {
      console.error('brand assets are STALE — re-run without --check:');
      for (const r of drift) console.error('  ' + r);
      process.exitCode = 1;
    } else {
      console.log('brand assets up to date');
    }
    return;
  }
  let total = 0;
  for (const [rel, bytes] of written) {
    total += bytes;
    console.log(`  ${rel.padEnd(44)} ${(bytes / 1024).toFixed(1)} kB`);
  }
  console.log(`\n${written.length} files, ${(total / 1024).toFixed(1)} kB total`);
  console.log(`burst ${MARK_PALETTE.burst} · letters ${MARK_PALETTE.letterTop} -> ${MARK_PALETTE.letterBottom}`);
}

await main();
