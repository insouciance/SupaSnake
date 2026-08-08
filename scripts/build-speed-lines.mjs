/**
 * THE SPEED LINES, AS ORIGINAL VECTOR ART.
 *
 *   node scripts/build-speed-lines.mjs
 *
 * Emits `public/textures/speed-lines.svg`, the chamber's radial burst plate.
 * Run it when the constants below change; the OUTPUT is committed, so the
 * chamber never depends on this script at runtime and the drawing is fixed
 * whatever a future Node version does with the generator.
 *
 * WHY A GENERATOR AND NOT A HAND-DRAWN FILE. This is the same argument
 * `scripts/brand/markGeometry.mjs` makes for the Mark: the character of a
 * drawn burst lives in a small number of decisions — how many strokes, how
 * sharply each tapers, how much the hand wandered off the ideal angle — and
 * those are far easier to rule on, review and re-tune as named constants than
 * as several hundred committed path coordinates. The variation is drawn from a
 * SEEDED sequence rather than `Math.random()` for the same reason the Mark's
 * letter table is fixed: this is drawn once and then it is the drawing.
 *
 * THE DESIGN, and where each decision comes from (the trinity doctrine):
 *
 *   FEW AND BOLD — the owner's ruling. "the speed lines can also be simpler in
 *   90s cartoon style, bolder, that would contribute to a coherent appearance."
 *   So this is 26 decisive strokes, not a fine-grained radial texture. A comic
 *   zoom burst is a countable set of confident marks; density is what makes a
 *   photographic effect, and a photographic effect is what this replaces.
 *
 *   TAPER — from the MARK. Its burst is built from wedges that come to points,
 *   with mitred rather than rounded joins, so every stroke has a direction and
 *   a sharp end. These wedges narrow to nearly a point at the inner radius and
 *   open toward the rim, which is also simply what a speed line IS: the trace
 *   of something moving away from a convergence point.
 *
 *   THE HOLE AT THE CENTRE — from the composition, and it is load-bearing. No
 *   stroke starts inside `INNER_CLEAR`, so the middle of the plate is empty and
 *   the creature reads against a clean ground rather than against its own
 *   background energy. The lines are the room's motion AROUND the subject.
 *
 *   FLAT AUTHORED FILLS, NO STROKE — from the BOARD's language and the pattern
 *   library. Each wedge is one flat fill. There is deliberately NO dark keyline
 *   around them: rule 4 puts a contour on "the silhouette of an object the
 *   player treats as a thing", and these are air. A keyline here would be the
 *   library's own named failure — a line around a region a fill step already
 *   separated.
 *
 *   THE COLOUR IS THE ROOM'S, PLUS A WHISPER OF THE BRAND. Most wedges carry a
 *   lifted member of the room's own blue, because a bright stroke on a night
 *   ground is the pale-line failure at full-frame size and the creature's ink
 *   outline has to stay the boldest line in frame. A minority carry the Mark's
 *   purple — enough that the logo's colour is answered in the deepest layer of
 *   the composition, far too few to read as a purple background.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OUT = resolve('public/textures/speed-lines.svg');

/** Square power-of-two plate: sampled as a texture, never as a document. */
const SIZE = 1024;
const CENTRE = SIZE / 2;

/**
 * FEW — countable, which is the operative test. Twenty-six strokes around a
 * full turn is one every 14 degrees: few enough that the eye reads individual
 * marks rather than a texture, which is the whole of the owner's note, and not
 * so few that the burst stops converging.
 *
 * The first pass ran 18 and it was too few, in an instructive way: to stay
 * legible at that count each stroke had to be so wide at the rim that it read
 * as a triangular SHARD rather than as a line, and a burst made of shards is a
 * broken window, not speed. Boldness had to come out of the stroke's weight
 * instead of out of its angular width.
 */
const SPOKES = 26;

/**
 * The empty middle, as a fraction of the half-plate. Nothing is drawn inside
 * it. Sized so the creature and its contact shadow sit in clear room at every
 * aspect the chamber frames.
 */
const INNER_CLEAR = 0.3;

/** How far past the plate's own edge the strokes run, so none of them ends
 *  visibly inside the frame — a speed line stops at the panel border. */
const OUTER_BLEED = 1.5;

/**
 * BOLD. Angular half-width at the outer end, in radians, before per-stroke
 * variation. At the plate's rim this is a wedge tens of pixels across rather
 * than a hairline — the difference between a drawn stroke and a texture.
 */
const HALF_ANGLE_OUTER = 0.0105;
/** …and at the inner end, where the stroke is nearly a point. */
const HALF_ANGLE_INNER = 0.0016;

/** The room's own blue, lifted. The default voice of the plate. */
const ROOM_LINE = '#3e6086';
/** A deeper member of the same family, for the strokes that sit back. */
const ROOM_LINE_DEEP = '#2b4a6b';
/** The Mark's burst fill. The whisper. */
const BRAND_PURPLE = '#a201ae';
/** The Mark's inner recess — purple, but sitting far back in the plate. */
const BRAND_PURPLE_DEEP = '#33012d';

/**
 * Which strokes carry the brand rather than the room. Five of twenty-six, spread
 * so no two are adjacent: the purple has to be findable anywhere the eye lands
 * without ever forming a purple region.
 */
const BRAND_SPOKES = new Set([2, 8, 13, 19, 24]);

/** Deterministic variation. Seeded once; the emitted file is the drawing. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function polar(radius, angle) {
  return [
    CENTRE + Math.cos(angle) * radius,
    CENTRE + Math.sin(angle) * radius,
  ];
}

const round = (n) => Math.round(n * 100) / 100;

function build() {
  const random = makeRandom(0x5efba11);
  const half = SIZE / 2;
  const wedges = [];

  for (let i = 0; i < SPOKES; i++) {
    // The ideal angle, plus the hand's wander. +/- a third of the gap between
    // neighbours: enough that the ring is visibly not a machine's, never so
    // much that two strokes collide.
    const step = (Math.PI * 2) / SPOKES;
    const wander = (random() - 0.5) * step * 0.66;
    const angle = i * step + wander;

    // Every stroke starts outside the clear middle, at its own radius, so the
    // inner ends do not describe a circle.
    const innerR = half * (INNER_CLEAR + random() * 0.16);
    const outerR = half * (OUTER_BLEED - random() * 0.32);

    // Weight varies per stroke. A drawn burst has heavy strokes and light ones;
    // a generated one that does not is a starburst clip-art.
    const weight = 0.55 + random() * 0.95;
    const aOut = HALF_ANGLE_OUTER * weight;
    const aIn = HALF_ANGLE_INNER * weight;

    const brand = BRAND_SPOKES.has(i);
    // The heaviest strokes sit forward; the lightest sit back a step in value,
    // which is the fill ladder doing the depth rather than a blur doing it.
    const forward = weight > 0.95;
    const fill = brand
      ? forward
        ? BRAND_PURPLE
        : BRAND_PURPLE_DEEP
      : forward
        ? ROOM_LINE
        : ROOM_LINE_DEEP;
    // Opacity is the plate's own depth axis. The material multiplies the whole
    // plate down again, so these are RELATIVE weights among the strokes.
    // The brand strokes sit BELOW the room's, not above it. Purple is the
    // rarer colour here, and a rare colour drawn louder than the common one
    // stops being a whisper and becomes the subject.
    const opacity = round(brand ? 0.3 + weight * 0.22 : 0.34 + weight * 0.42);

    const [x1, y1] = polar(innerR, angle - aIn);
    const [x2, y2] = polar(outerR, angle - aOut);
    const [x3, y3] = polar(outerR, angle + aOut);
    const [x4, y4] = polar(innerR, angle + aIn);
    const d =
      `M${round(x1)} ${round(y1)} L${round(x2)} ${round(y2)} ` +
      `L${round(x3)} ${round(y3)} L${round(x4)} ${round(y4)} Z`;
    wedges.push(
      `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" ` +
      `viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="geometricPrecision">`,
    '<title>SupaSnake chamber speed lines</title>',
    // No background rect: the plate is transparent everywhere it is not a
    // stroke, so the room shows through and the material needs no alpha map.
    ...wedges,
    '</svg>',
    '',
  ].join('\n');
}

async function main() {
  const svg = build();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, svg, 'utf8');
  console.log(`wrote ${OUT} (${SPOKES} strokes, ${svg.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
