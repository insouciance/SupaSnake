/**
 * THE LETTERFORMS, TAKEN FROM THE OWNER'S OWN DRAWING.
 *
 *     node scripts/brand/traceModel.mjs            # rewrites markOutlines.mjs
 *     node scripts/brand/traceModel.mjs --check    # verifies, writes nothing
 *
 * WHY THIS EXISTS
 *
 *   The first pass built the lettering as centreline skeletons stroked to
 *   weight — an original face "in the spirit of" the model. The owner's verdict
 *   was that the letters look nothing like his: *"just COPY the outline of each
 *   letter to create a font, then work on the shading."* So the silhouettes are
 *   no longer invented. They are read out of `assets/brand/LOGO-model.jpg` —
 *   the owner's own artwork — and re-expressed as clean vector outlines.
 *
 *   That is not the thing the earlier no-tracing scruple was protecting
 *   against. A typeface licence governs a font FILE, and copying a foundry's
 *   outlines would put someone else's product on our merchandise. These
 *   outlines come from the owner's drawing of his own logo; the risk the rule
 *   existed for is not present, and the owner gave the instruction directly.
 *
 * WHAT COMES OUT
 *
 *   `markOutlines.mjs`, a generated data module holding
 *     - nine glyph outlines (each a path with its counters as sub-paths),
 *     - the purple shape, which is NOT a starburst: the owner's note is that it
 *       *follows the outline of the lettering*. Read from the model it is
 *       exactly that — a torn keyline offset around the words — so tracing it
 *       reproduces the fit rather than approximating it with an ellipse,
 *     - the shade plate: the lettering dilated by a few units and unioned, the
 *       hard-edged darker region the letters sit on.
 *
 *   Everything is emitted in DESIGN UNITS of two per model pixel, with the
 *   origin at the lettering's top-left. Nothing downstream is capped by the
 *   model's 413x148: these are outlines, and they are re-rasterised at whatever
 *   size a surface needs.
 *
 * WHY IT IS A SEPARATE HAND-RUN STEP
 *
 *   Same reason as `build-brand-assets.mjs`: `sharp` arrives as one of Next's
 *   OPTIONAL dependencies, so a runner installed with `--omit=optional` has no
 *   image pipeline. Output is committed and `--check` proves it is current.
 *   It is deterministic — fixed kernel, fixed thresholds, no randomness — so a
 *   re-run on the same model reproduces the file byte for byte.
 *
 * THE PARAMETERS, AND WHY EACH IS WHERE IT IS
 *
 *   Every number below was set by measuring the model rather than by eye; the
 *   measurements are recorded beside each one.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MODEL = path.join(ROOT, 'assets/brand/LOGO-model.jpg');
const TARGET = path.join(ROOT, 'scripts/brand/markOutlines.mjs');
const CHECK = process.argv.includes('--check');

/**
 * Supersampling factor. The model is 413x148; at 8x a letter edge is ~500
 * samples long, which is enough that the traced polygon carries the drawing's
 * own irregularity and not the JPEG's blocking.
 */
const K = 8;
/** Half a supersampled pixel of blur — enough to melt 8x8 JPEG blocks, not enough to round a corner. */
const BLUR = K * 0.22;
/** Simplification tolerance, supersampled px. 5 keeps the hand-drawn wobble and drops the chroma fringe. */
const EPS = 5;
/** Design units per model pixel. */
const UNITS = 2;

/**
 * The letter mask is eroded by this much (model px) before tracing.
 *
 * A high-contrast orange-on-black JPEG edge bleeds roughly a pixel of
 * intermediate colour outward, and that bleed classifies as letter. Eroding it
 * back lands the outline on the drawing's own edge; without it every glyph
 * comes out about a pixel fat and the counters close up.
 */
const LETTER_ERODE = 0.9;

/**
 * The shade plate is the lettering dilated by this much (model px).
 *
 * Measured against the model: the near-black band between a letter and the
 * purple runs 3.0px above, 3.75px left, 4.5px right and 9px below (the drop).
 * The ink contour drawn in `markGeometry.mjs` covers 3.5px of that, so the
 * plate is set a little wider — the darker violet shows as a hard edge just
 * outside the contour and closes the gaps between letters, which is what the
 * model's interior does.
 */
const PLATE_DILATE = 5.5;

/** Closes the JPEG's speckle inside the purple before the shape is traced. */
const BURST_CLOSE = 0.9;

const hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
};

async function main() {
  const meta = await sharp(MODEL).metadata();
  const { data, info } = await sharp(MODEL)
    .resize({ width: meta.width * K, height: meta.height * K, kernel: 'lanczos3' })
    .blur(BLUR)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const px = (x, y) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const maskOf = (test) => {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) m[y * W + x] = test(...px(x, y)) ? 1 : 0;
    }
    return m;
  };

  // The lettering: everything from the pale top rim (#FFFAA1) to the deepest
  // baseline orange (#F57202). The purple and the ink both fall outside it.
  const letterMask = maskOf((r, g, b) => {
    const [h, s, v] = hsv(r, g, b);
    return v > 0.46 && s > 0.22 && h < 70;
  });
  // The violet, wide enough to catch the darkened lower-right of the shape.
  const purpleMask = maskOf((r, g, b) => {
    const [h, s, v] = hsv(r, g, b);
    return v > 0.13 && s > 0.28 && h > 252 && h < 345;
  });

  const ctx = { W, H };
  const letters = erode(ctx, letterMask, K * LETTER_ERODE);

  const glyphComponents = components(ctx, letters, W * H * 0.0012);
  if (glyphComponents.length !== 9) {
    throw new Error(`expected 9 glyphs in the model, found ${glyphComponents.length}`);
  }
  const originX = Math.min(...glyphComponents.map((c) => c.x0));
  const originY = Math.min(...glyphComponents.map((c) => c.y0));
  const toUnits = { scale: UNITS / K, ox: originX, oy: originY };

  const NAMES = ['S1', 'U', 'P', 'A1', 'S2', 'N', 'A2', 'K', 'E'];
  const glyphs = glyphComponents.map((c, i) => ({
    name: NAMES[i],
    d: pathOf(ctx, c, { ...toUnits, eps: EPS, minArea: K * K * 3 }),
    box: boxOf(c, toUnits),
  }));

  const burstFilled = fillHoles(ctx, dilate(ctx, purpleMask, K * BURST_CLOSE));
  const burstComponent = components(ctx, burstFilled, W * H * 0.02).sort((a, b) => b.count - a.count)[0];
  const burst = pathOf(ctx, burstComponent, { ...toUnits, eps: EPS * 1.4, minArea: K * K * 40, outerOnly: true });

  const plateMask = fillHoles(ctx, dilate(ctx, letters, K * PLATE_DILATE));
  const plate = components(ctx, plateMask, W * H * 0.02)
    .map((c) => pathOf(ctx, c, { ...toUnits, eps: EPS * 1.2, minArea: K * K * 20, outerOnly: true }))
    .join(' ');

  const box = boxOf(burstComponent, toUnits);
  const source = render({ glyphs, burst, plate, box, model: `${meta.width}x${meta.height}` });

  if (CHECK) {
    const existing = await readFile(TARGET, 'utf8').catch(() => '');
    const same =
      createHash('sha1').update(existing).digest('hex') ===
      createHash('sha1').update(source).digest('hex');
    if (!same) {
      console.error('scripts/brand/markOutlines.mjs is STALE — re-run without --check');
      process.exitCode = 1;
    } else {
      console.log('outlines up to date');
    }
    return;
  }
  await writeFile(TARGET, source, 'utf8');
  console.log(`traced 9 glyphs + shape + plate from ${path.relative(ROOT, MODEL)} (${meta.width}x${meta.height})`);
  console.log(`  shape box ${box.join(' ')} design units`);
  console.log(`  wrote ${path.relative(ROOT, TARGET)} (${(source.length / 1024).toFixed(1)} kB)`);
}

// ---------------------------------------------------------------- morphology

/**
 * Two-pass chamfer distance transform — the cheap Euclidean approximation that
 * makes dilate/erode a threshold rather than a structuring-element convolution.
 */
function distance({ W, H }, mask, inside) {
  const f = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = mask[i] === inside ? 1e9 : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (f[i] === 0) continue;
      let m = f[i];
      if (x > 0) m = Math.min(m, f[i - 1] + 1);
      if (y > 0) m = Math.min(m, f[i - W] + 1);
      if (x > 0 && y > 0) m = Math.min(m, f[i - W - 1] + 1.414);
      if (x < W - 1 && y > 0) m = Math.min(m, f[i - W + 1] + 1.414);
      f[i] = m;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (f[i] === 0) continue;
      let m = f[i];
      if (x < W - 1) m = Math.min(m, f[i + 1] + 1);
      if (y < H - 1) m = Math.min(m, f[i + W] + 1);
      if (x < W - 1 && y < H - 1) m = Math.min(m, f[i + W + 1] + 1.414);
      if (x > 0 && y < H - 1) m = Math.min(m, f[i + W - 1] + 1.414);
      f[i] = m;
    }
  }
  return f;
}

function dilate(ctx, mask, r) {
  if (r <= 0) return mask;
  const f = distance(ctx, mask, 0);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] || f[i] <= r ? 1 : 0;
  return out;
}

function erode(ctx, mask, r) {
  if (r <= 0) return mask;
  const f = distance(ctx, mask, 1);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] && f[i] > r ? 1 : 0;
  return out;
}

/** Flood from the border; anything unreached and unset was an enclosed hole. */
function fillHoles({ W, H }, mask) {
  const out = new Uint8Array(mask);
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || mask[p]) continue;
    seen[p] = 1;
    const x = p % W;
    const y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  for (let i = 0; i < W * H; i++) if (!mask[i] && !seen[i]) out[i] = 1;
  return out;
}

function components({ W, H }, mask, minPixels) {
  const label = new Int32Array(W * H).fill(-1);
  const out = [];
  let next = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = next++;
    const stack = [i];
    label[i] = id;
    const pixels = new Set();
    let count = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p / W) | 0;
      count++;
      pixels.add(p);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (mask[q] && label[q] < 0) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    if (count >= minPixels) out.push({ count, x0, x1, y0, y1, pixels });
  }
  return out.sort((a, b) => a.x0 - b.x0);
}

// ------------------------------------------------------------------ tracing

/**
 * Crack following: walk the boundary BETWEEN pixels rather than along pixel
 * centres, so a contour is a closed polyline on the integer grid with no
 * staircase ambiguity. Emitting each edge with the foreground on its right
 * makes outer rings clockwise and counters anticlockwise, which is exactly the
 * winding SVG's default `nonzero` fill rule wants — the counters come out as
 * holes with no `fill-rule` to remember.
 */
function contours({ W, H }, inside) {
  const edges = new Map();
  const key = (x, y) => `${x},${y}`;
  const add = (a, b) => {
    const k = key(a[0], a[1]);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add([x, y], [x + 1, y]);
      if (!inside(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!inside(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!inside(x - 1, y)) add([x, y + 1], [x, y]);
    }
  }
  const loops = [];
  for (const [k, list] of edges) {
    while (list.length) {
      const start = k.split(',').map(Number);
      let cur = start;
      let next = list.shift();
      const loop = [cur];
      for (let guard = 0; guard < 4e6; guard++) {
        loop.push(next);
        if (next[0] === start[0] && next[1] === start[1]) break;
        const outgoing = edges.get(key(next[0], next[1]));
        if (!outgoing || !outgoing.length) break;
        let pick = 0;
        if (outgoing.length > 1) {
          // A saddle: prefer the sharpest right turn, which keeps the walk on
          // one region instead of hopping across a diagonal pinch.
          const dx = next[0] - cur[0];
          const dy = next[1] - cur[1];
          const rank = (o) => {
            const ex = o[0] - next[0];
            const ey = o[1] - next[1];
            const cross = dx * ey - dy * ex;
            const dot = dx * ex + dy * ey;
            return cross < 0 ? 0 : dot > 0 ? 1 : cross > 0 ? 2 : 3;
          };
          let best = 9;
          outgoing.forEach((o, i) => {
            const r = rank(o);
            if (r < best) {
              best = r;
              pick = i;
            }
          });
        }
        const step = outgoing.splice(pick, 1)[0];
        cur = next;
        next = step;
      }
      if (loop.length > 6) loops.push(loop);
    }
  }
  return loops;
}

const signedArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return a / 2;
};

function rdp(pts, eps) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let idx = -1;
    let far = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > far) {
        far = d;
        idx = i;
      }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Ramer-Douglas-Peucker degenerates on a ring, where the first and last points
 * coincide and every vertex measures zero distance from the "line" between
 * them. The ring is therefore cut at the vertex furthest from its start and
 * simplified as two open chains.
 */
function simplifyRing(loop, eps) {
  const closed =
    loop[loop.length - 1][0] === loop[0][0] && loop[loop.length - 1][1] === loop[0][1];
  const pts = closed ? loop.slice(0, -1) : loop.slice();
  if (pts.length < 8) return pts;
  let cut = 0;
  let far = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > far) {
      far = d;
      cut = i;
    }
  }
  const head = rdp(pts.slice(0, cut + 1), eps);
  const tail = rdp(pts.slice(cut).concat([pts[0]]), eps);
  return head.slice(0, -1).concat(tail.slice(0, -1));
}

function pathOf(ctx, component, { scale, ox, oy, eps, minArea, outerOnly = false }) {
  const inside = (x, y) =>
    x >= 0 && y >= 0 && x < ctx.W && y < ctx.H && component.pixels.has(y * ctx.W + x);
  const parts = [];
  for (const loop of contours(ctx, inside)) {
    const area = signedArea(loop);
    if (Math.abs(area) < minArea) continue;
    if (outerOnly && area < 0) continue;
    const ring = simplifyRing(loop, eps);
    if (ring.length < 4) continue;
    const pts = ring.map(([x, y]) => `${round((x - ox) * scale)} ${round((y - oy) * scale)}`);
    parts.push(`M${pts.join(' L')} Z`);
  }
  return parts.join(' ');
}

const round = (n) => Math.round(n * 10) / 10;
const boxOf = (c, { scale, ox, oy }) => [
  round((c.x0 - ox) * scale),
  round((c.y0 - oy) * scale),
  round((c.x1 - c.x0) * scale),
  round((c.y1 - c.y0) * scale),
];

// ------------------------------------------------------------------- output

function render({ glyphs, burst, plate, box, model }) {
  const lettersBox = [
    0,
    0,
    Math.max(...glyphs.map((g) => g.box[0] + g.box[2])),
    Math.max(...glyphs.map((g) => g.box[1] + g.box[3])),
  ];
  return `/**
 * GENERATED by \`node scripts/brand/traceModel.mjs\` — do not edit by hand.
 *
 * The outlines of the SUPASNAKE mark, read out of the owner's own drawing
 * (\`assets/brand/LOGO-model.jpg\`, ${model}) and re-expressed as vector paths.
 * See that script's header for why the letterforms are copied rather than
 * invented, and \`markGeometry.mjs\` for how they are coloured and shaded.
 *
 * Coordinates are DESIGN UNITS, ${UNITS} per model pixel, origin at the top-left of
 * the lettering. Counters are sub-paths wound against their outline, so the
 * default nonzero fill rule turns them into holes.
 */

/** The lettering, left to right. \`box\` is [x, y, w, h] of the glyph's own ink. */
export const GLYPHS = Object.freeze([
${glyphs.map((g) => `  { name: '${g.name}', box: [${g.box.join(', ')}], d: '${g.d}' },`).join('\n')}
].map(Object.freeze));

/**
 * The purple shape. Not a starburst drawn behind the words but a torn keyline
 * that FOLLOWS them — the owner's own observation about his drawing, and the
 * reason it is traced rather than generated from an ellipse.
 */
export const SHAPE = '${burst}';

/** The hard-edged darker region the lettering sits on. */
export const SHADE_PLATE = '${plate}';

/** [x, y, w, h] of the purple shape, in design units. */
export const SHAPE_BOX = Object.freeze([${box.join(', ')}]);

/** [x, y, w, h] of the lettering's ink, in design units. */
export const LETTERS_BOX = Object.freeze([${lettersBox.map(round).join(', ')}]);
`;
}

await main();
