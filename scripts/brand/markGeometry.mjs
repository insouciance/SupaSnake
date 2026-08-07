/**
 * THE MARK — how the SUPASNAKE logo is drawn.
 *
 * WHAT `LOGO-model.jpg` IS, AND WHAT THIS FILE IS
 *
 *   `assets/brand/LOGO-model.jpg` (413x148) is the owner's drawing of his own
 *   logo. It is a comp: too small to be a hero at 1x, let alone a 512px icon,
 *   and it has no alpha. It never ships. What ships is rebuilt from it here.
 *
 *   The letterform OUTLINES are the owner's, read out of that drawing by
 *   `traceModel.mjs` into `markOutlines.mjs` — see that script for why copying
 *   them is the instruction and not a shortcut. This file owns everything else:
 *   the shading system, the colour, and how the pieces stack.
 *
 * THE SHADING SYSTEM — ONE LIGHT, STATED ONCE, APPLIED EVERYWHERE
 *
 *   The first pass shaded each letter on its own and the owner's verdict was
 *   that the result "appears random" where the model's is consistent. It is
 *   consistent because one rule governs every shape in the drawing:
 *
 *     THE LIGHT COMES FROM ABOVE AND SLIGHTLY LEFT.
 *
 *   Everything below is that sentence:
 *
 *     - Every filled shape carries a lighter RIM on its top-left edge, built by
 *       laying the body colour over the rim colour offset down-right. The rim
 *       is a property of the EDGE, so it is built from the edge; stroking a
 *       reduced-weight copy instead draws a bright line up the middle of a
 *       stem, which is a ghost outline and not a bevel. This is why the
 *       lettering and the purple shape are constructed identically.
 *     - Every letter runs the same vertical ramp in its OWN box — gold at the
 *       cap, deep orange at the baseline. Per-letter, because a ramp spanning
 *       the whole lockup leaves the short letters sampling only its middle, so
 *       UPA/NAKE never reach orange while the S's do.
 *     - Every letter carries the same near-black contour, and the same hard
 *       drop below-right. Measured off the model: the dark band runs 3.0 units
 *       above the ink, 3.75 left, 4.5 right and 9.0 below. The contour is
 *       uniform and the DROP makes up the difference underneath.
 *     - Nothing is blurred and nothing glows. Every edge in the mark is a hard
 *       vector edge, which is the standing ruling (`HomeIdentityHud.tsx:50-57`):
 *       roughness is a reproduction fault pretending to be craft.
 *
 * THE SKETCHINESS IS THE DRAWING'S OWN
 *
 *   The owner's other note is that the model is sketchy — edges are not
 *   perfectly straight and some are fringed. That is not simulated here with
 *   jitter or a filter. The outlines are traced at 8x and simplified only far
 *   enough to drop JPEG chroma fringe, so the wobble in a stem and the torn
 *   bite out of a baseline are the ones he drew.
 *
 * COLOUR
 *
 *   Sampled from the model by modal quantisation, not guessed. The letter ramp
 *   is the model's own, measured in twelve bands with the contour-adjacent
 *   pixels excluded: #FDCE07 at the cap through #FDA402 at mid to #EF6602 at
 *   the baseline. Per ruling T-2 these are LOGO colours and must never enter
 *   the design tokens; they appear in brand artefacts only.
 *
 * WHY THE CHARACTER'S SWATCHES ARE NOT REUSED HERE, THOUGH THE LAW IS
 *
 *   The obvious coherence move is to paint the mark out of the snake's own
 *   authored palette (`src/components/game/screen/snake90s.ts`). Measured, they
 *   are not the same colours and not close enough to swap:
 *
 *       mark            snake                              dE*ab
 *       letterRim  #FFF6A5   rim = top + warm lift #ffd74c   32.7
 *       letterTop  #FDCE07   GUIDE_PALETTE.highlight #ffc53d 14.8
 *       letterMid  #FDA402   GUIDE_PALETTE.midtone   #f5811f 21.0
 *       letterBottom #EF6602 GUIDE_PALETTE.shadow    #8a3d14 42.5
 *       ink        #0B0410   GUIDE_PALETTE.ink       #12100d  7.5
 *
 *   Four of those are a different colour by any standard. The fifth, the ink,
 *   is the only near miss, and the style guide's own reason for its warm black
 *   settles it against unifying: a cold outline is ruled out there because it
 *   "reads cold and fights the palette it is drawn around", and the palette
 *   THIS ink is drawn around is violet, not orange. Same rule, opposite answer.
 *
 *   What IS taken from the character is its grammar, which is the part that
 *   makes two objects look related:
 *     - the three-tone law's HARD transitions. The lit rim is a flat fill with
 *       a hard boundary against the ramp — a facet step, never a soft gradient
 *       rim — and `traceModel.mjs` now rules the edge under it dead straight,
 *       so the facet has a facet's geometry as well as its colour.
 *     - "a thick near-black outline, never a 1px technical edge". Measured, the
 *       model's own band is 3.63px above the ink at the median, 4.13 left, 4.38
 *       right and 9.13 below; the contour here is 3.5 uniform with the drop
 *       making up the bottom, so the weight was already the drawing's and did
 *       not move. What changed is that it now BREATHES rather than sitting dead
 *       even — see `inkLayer`.
 */

import { GLYPHS, LETTERS_BOX, SHADE_PLATE, SHAPE, SHAPE_BOX } from './markOutlines.mjs';

/** Sampled from the model. LOGO COLOURS — never design tokens (ruling T-2). */
export const MARK_PALETTE = Object.freeze({
  /** Modal violet of the shape. */
  burst: '#7D0275',
  /** The lit top-left edge: the model's own brightest violet decile. */
  burstRim: '#A201AE',
  /** The shape's outer contour. */
  burstEdge: '#170116',
  /** The hard-edged darker region the lettering sits on. */
  burstShade: '#33012D',
  letterTop: '#FDCE07',
  letterMid: '#FDA402',
  letterBottom: '#EF6602',
  /** The lit top edge of a letter — the model's pale rim, #FFFAA1 measured. */
  letterRim: '#FFF6A5',
  ink: '#0B0410',
});

/** The letter ramp, as measured off the model band by band. */
const LETTER_RAMP = Object.freeze([
  [0, MARK_PALETTE.letterTop],
  [0.3, '#FDC805'],
  [0.58, MARK_PALETTE.letterMid],
  [0.84, '#F88102'],
  [1, MARK_PALETTE.letterBottom],
]);

/** Half-weight of the near-black contour that rings every letter. */
const INK_CONTOUR = 7;
/** The hard drop, below and right. Sized so the dark under a letter matches the model's 9 units. */
const DROP = Object.freeze([3, 10]);
/**
 * How far the letter body is laid over its rim — the width of the lit edge.
 *
 * MEASURED, not chosen. Scanning the model at the true ink edge and counting
 * the run of pale pixels inside it, the lit rim is 1.25 model px at the median
 * and 2.0 at the ninetieth percentile, and it appears on 8% of top crossings
 * and 1% of bottom ones — a real bevel on the edges that face the light and
 * nothing at all on the ones that do not.
 *
 * The offset's DIRECTION is the light and does not move: 20.6° west of north,
 * which is where the model puts its rim (thick on up-and-left-facing diagonals,
 * absent on left-facing verticals — the reason a straight-left light would be
 * wrong). Only its LENGTH changed, by 1.59x, because the previous 1.615 units
 * put 0.80px of rim on a lit edge against the model's 1.25.
 */
const BEVEL = Object.freeze([0.9, 2.4]);
/** The same construction on the purple: its body over its own lit edge. */
const SHAPE_BEVEL = Object.freeze([3, 4]);
/** The shape's outer contour weight. */
const SHAPE_EDGE = 3.5;
/** Breathing room in the viewBox so no stroke is clipped. */
const PAD = 6;

const round = (n) => Math.round(n * 100) / 100;

const rampStops = () =>
  LETTER_RAMP.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('');

const letterPaths = (attrs, key = 'd') =>
  GLYPHS.map((g) => `<path d="${g[key]}"${attrs}/>`).join('');

/**
 * The near-black behind the lettering: the glyphs filled AND stroked, so the
 * contour reads as a band outside the ink rather than eating into it. Round
 * joins because the model's contour is a keyline around the letter, not a set
 * of mitred spikes off a traced polygon.
 *
 * It is built from the glyph's `ink` outline rather than its `d`. Those are the
 * same drawn edge at two tear amplitudes, and the ink's may only swell OUTWARD
 * (`traceModel.mjs`, `TEAR_GAIN_INK`), so the visible near-black band varies
 * along its length between its full weight and a little more and can never
 * thin. That is the whole of "a hand-inked line breathes": the amplitude is in
 * the outline, the MASS is in the stroke, and the stroke is untouched.
 */
const inkLayer = (transform = '') =>
  `<g fill="${MARK_PALETTE.ink}" stroke="${MARK_PALETTE.ink}" stroke-width="${INK_CONTOUR * 2}" stroke-linejoin="round"${transform}>` +
  letterPaths('', 'ink') +
  `</g>`;

/**
 * Builds the mark.
 *
 * @param {object} [opts]
 * @param {number} [opts.width]   Rendered px width; omit for a unitless SVG.
 * @param {boolean} [opts.burst]  Draw the purple shape. Off gives the plain lockup.
 * @param {string} [opts.title]   Accessible title.
 */
export function buildMarkSvg(opts = {}) {
  const { width, burst = true, title = 'SupaSnake' } = opts;

  // With the shape, the viewBox is its reach plus its stroke; without it, the
  // lettering's own ink plus contour and drop.
  const box = burst
    ? {
        x: SHAPE_BOX[0] - SHAPE_EDGE / 2 - PAD,
        y: SHAPE_BOX[1] - SHAPE_EDGE / 2 - PAD,
        w: SHAPE_BOX[2] + SHAPE_EDGE + PAD * 2,
        h: SHAPE_BOX[3] + SHAPE_EDGE + PAD * 2,
      }
    : {
        x: LETTERS_BOX[0] - INK_CONTOUR - PAD,
        y: LETTERS_BOX[1] - INK_CONTOUR - PAD,
        w: LETTERS_BOX[2] + (INK_CONTOUR + PAD) * 2 + DROP[0],
        h: LETTERS_BOX[3] + (INK_CONTOUR + PAD) * 2 + DROP[1],
      };

  const dim = width
    ? ` width="${round(width)}" height="${round((width * box.h) / box.w)}"`
    : '';

  const shapeLayer = burst
    ? `<path d="${SHAPE}" fill="${MARK_PALETTE.burstRim}" stroke="${MARK_PALETTE.burstEdge}" stroke-width="${SHAPE_EDGE}" stroke-linejoin="miter" stroke-miterlimit="4"/>
<g clip-path="url(#ss-shape)"><path d="${SHAPE}" fill="${MARK_PALETTE.burst}" transform="translate(${SHAPE_BEVEL[0]} ${SHAPE_BEVEL[1]})"/></g>
<path d="${SHADE_PLATE}" fill="${MARK_PALETTE.burstShade}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(box.x)} ${round(box.y)} ${round(box.w)} ${round(box.h)}"${dim} role="img" aria-label="${title}">
<title>${title}</title>
<defs>
<linearGradient id="ss-letter" x1="0" y1="0" x2="0" y2="1">${rampStops()}</linearGradient>
<clipPath id="ss-ink">${letterPaths('')}</clipPath>${
    burst ? `\n<clipPath id="ss-shape"><path d="${SHAPE}"/></clipPath>` : ''
  }
</defs>
${shapeLayer}
${inkLayer(` transform="translate(${DROP[0]} ${DROP[1]})"`)}
${inkLayer()}
<g clip-path="url(#ss-ink)">
<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}" fill="${MARK_PALETTE.letterRim}"/>
<g transform="translate(${BEVEL[0]} ${BEVEL[1]})">${letterPaths(' fill="url(#ss-letter)"')}</g>
</g>
</svg>`;
}

/**
 * THE MONOGRAM — the mark at sizes the wordmark cannot survive.
 *
 * Nine letters inside the shape turn to mud somewhere under 64px; at 16px the
 * lettering is three pixels tall. Rather than ship an unreadable favicon, the
 * small sizes carry the lockup's leading S — the owner's own S, the same
 * outline, the same light, the same ramp, the same contour — on the shape's
 * violet. It is the same drawing, cropped to the one letter that still reads.
 *
 * This departs from D.1.3, which proposed the character head. The head is a
 * separate illustration the mark does not contain, and pairing an illustrated
 * cobra with drawn lettering puts two unrelated drawings in one brand. Flagged
 * for the owner rather than settled.
 *
 * MASKABLE SAFE ZONE. Android may crop an installed icon to a circle inscribed
 * in the middle 80%. `maskable` therefore shrinks the S and squares off the
 * plate so every part of the letter survives the worst crop a launcher applies;
 * the plain variant fills its plate properly instead of paying that tax on
 * platforms that do not charge it.
 */
export function buildMonogramSvg(opts = {}) {
  const {
    size,
    maskable = false,
    radius = maskable ? 0 : 20,
    title = 'SupaSnake',
    outlineScale = 1,
  } = opts;

  const glyph = GLYPHS[0];
  const [gx, gy, gw, gh] = glyph.box;
  const inner = maskable ? 62 : 82;
  const s = inner / gh;
  const tx = 50 - (gx + gw / 2) * s;
  const ty = 50 - (gy + gh / 2) * s;
  const place = `translate(${round(tx)} ${round(ty)}) scale(${round(s)})`;

  const contour = round((INK_CONTOUR * 2 * outlineScale));
  const dim = size ? ` width="${round(size)}" height="${round(size)}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dim} role="img" aria-label="${title}">
<title>${title}</title>
<defs>
<linearGradient id="ss-mono" x1="0" y1="0" x2="0" y2="1">${rampStops()}</linearGradient>
<clipPath id="ss-mono-ink"><path transform="${place}" d="${glyph.d}"/></clipPath>
</defs>
<rect width="100" height="100" rx="${radius}" fill="${MARK_PALETTE.burst}"/>
<g transform="${place}" fill="${MARK_PALETTE.ink}" stroke="${MARK_PALETTE.ink}" stroke-width="${contour}" stroke-linejoin="round"><path d="${glyph.ink}"/></g>
<g clip-path="url(#ss-mono-ink)">
<rect width="100" height="100" fill="${MARK_PALETTE.letterRim}"/>
<g transform="translate(${round(BEVEL[0] * s)} ${round(BEVEL[1] * s)}) ${place}"><path d="${glyph.d}" fill="url(#ss-mono)"/></g>
</g>
</svg>`;
}
