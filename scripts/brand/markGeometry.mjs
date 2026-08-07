/**
 * THE MARK — original vector construction of the SUPASNAKE logo.
 *
 * WHAT THIS IS, AND WHAT `LOGO.jpg` IS
 *
 *   The owner supplied `assets/brand/LOGO-model.jpg` (413x148) as a *model*,
 *   not as an asset: "you are not supposed to use the logo as is, you are
 *   supposed to rebuild a logo in full quality". It stands to this file exactly
 *   as the character sheet stands to the 3D snake — the thing the drawing is
 *   judged against, never the thing that ships. No pixel of the JPG reaches
 *   production; every brand artefact in the repo is rasterised from the SVG
 *   this module emits.
 *
 * WHY THE LETTERS ARE BUILT, NOT SET
 *
 *   The letterforms below are original geometry: a centreline skeleton per
 *   glyph, stroked to weight. Nothing is traced from the model and no font's
 *   outlines are embedded, which is what makes the mark safe to put on
 *   merchandise — a typeface licence governs the font file, and there is no
 *   font file here. It is also what T-8 permits: headings stay Russo One, and
 *   this lettering is the MARK's own, drawn once.
 *
 *   Skeleton-plus-stroke is the honest construction for this style. A 90s
 *   comic wordmark is a chunky, near-uniform-weight face; expressing that as a
 *   centreline and a weight makes the weight a single tunable number instead of
 *   two hundred hand-placed outline points that drift apart when it changes.
 *
 * THE VARIATION IS A TABLE, NOT A RANDOM CALL
 *
 *   `LOCKUP` fixes each letter's rotation, baseline bounce and size. This
 *   preserves the reasoning of the ruling it replaces
 *   (`HomeIdentityHud.tsx:58-66`): a random wordmark re-letters itself on every
 *   render, and "a hand-lettered logo is drawn ONCE and then it is the logo."
 *   The difference is that these values are now baked into a committed SVG
 *   rather than re-applied to live type on every paint.
 *
 * COLOUR
 *
 *   Sampled from the model by modal quantisation, not guessed: the burst violet
 *   is #7E0672, the lettering runs #FCCC06 -> #FC7E06. Per ruling T-2 these are
 *   LOGO colours and must never enter the design tokens; they appear in brand
 *   artefacts only (mark, favicon, PWA, OG, splash).
 */

/** Sampled from the model. LOGO COLOURS — never design tokens (ruling T-2). */
export const MARK_PALETTE = Object.freeze({
  burst: '#7E0672',
  burstLight: '#9B1490',
  burstEdge: '#2A0526',
  letterTop: '#FFD614',
  letterMid: '#FCC406',
  letterBottom: '#FA8102',
  letterRim: '#FFE47E',
  letterShade: '#C7500A',
  ink: '#0B0410',
});

/**
 * Glyph skeletons in a 100-unit cap-height space: y=0 is the cap line, y=100
 * the baseline, and every path is a centreline stroked to `STEM`.
 *
 * The caps are BUTT and the joins MITRE, which is the whole difference between
 * this and a marker face: a 90s comic letter is cut flat and turns a square
 * corner. Round caps read as a balloon and were tried first. Consequently a
 * skeleton endpoint sits exactly where the ink should stop, while a skeleton
 * CORNER is inset by half a stem so the mitre fills out to the cap line — which
 * is why vertical terminals sit at 0/100 and horizontal bars at 15/85.
 */
const STEM = 27;

const GLYPHS = Object.freeze({
  S: { w: 74, d: ['M65 26 L50 12 L26 12 L12 29 L19 45 L49 57 L56 71 L46 88 L23 88 L7 74'] },
  U: { w: 70, d: ['M12 0 L12 60 L21 81 L34 88 L47 81 L56 60 L56 0'] },
  P: { w: 66, d: ['M12 100 L12 12 L40 12 L56 27 L56 41 L40 56 L12 56'] },
  A: { w: 74, d: ['M9 100 L36 14 L63 100', 'M20 72 L52 72'] },
  N: { w: 72, d: ['M12 100 L12 0 L58 100 L58 0'] },
  K: { w: 70, d: ['M12 0 L12 100', 'M58 0 L24 50 L58 100'] },
  E: { w: 62, d: ['M56 12 L12 12 L12 88 L56 88', 'M12 50 L46 50'] },
});

/**
 * The lockup. `cap` carries the model's camel-case emphasis — the two S's stand
 * a third taller than the letters they lead, which is what makes the mark read
 * "SupaSnake" rather than one nine-letter shout. `rot`/`dy` are the drawn
 * bounce; `sw` trims a hair of weight off the small letters so the heavier S's
 * do not overpower them.
 */
const LOCKUP = Object.freeze([
  { g: 'S', cap: 1.0, rot: -4.0, dy: -1.0, sw: 1.0 },
  { g: 'U', cap: 0.83, rot: 2.6, dy: 1.5, sw: 0.97 },
  { g: 'P', cap: 0.83, rot: -2.2, dy: -1.0, sw: 0.97 },
  { g: 'A', cap: 0.83, rot: 3.0, dy: 2.0, sw: 0.97 },
  { g: 'S', cap: 1.0, rot: -3.6, dy: -1.5, sw: 1.0 },
  { g: 'N', cap: 0.83, rot: 2.3, dy: 1.0, sw: 0.97 },
  { g: 'A', cap: 0.83, rot: -2.8, dy: -1.0, sw: 0.97 },
  { g: 'K', cap: 0.83, rot: 3.2, dy: 1.5, sw: 0.97 },
  { g: 'E', cap: 0.83, rot: -2.4, dy: 0.0, sw: 0.97 },
]);

/** Comic lettering is tight; letters tuck toward each other. */
const TRACKING = -2.5;
/** Baseline in design units. */
const BASELINE = 130;
/** Half-weight of the near-black contour that rings every letter. */
const OUTLINE = 6.5;

/**
 * The bevel, in design units.
 *
 * The whole ink is filled with the light rim colour and the gradient body is
 * then laid over it shifted DOWN by this much, so the light survives only as a
 * band along each letter's top edge. An earlier pass instead stroked the
 * skeleton at reduced weight and offset it, which drew a bright line up the
 * MIDDLE of every stem — a ghost outline, not a bevel. A bevel is a property of
 * the edge, so it has to be built from the edge.
 */
const BEVEL = 4;

/**
 * Fixed seeds. The burst is drawn ONCE and the result committed as SVG; these
 * exist so the drawing can be re-derived byte-identically, not so it can be
 * re-rolled looking for a better one.
 */
const BURST_SEED = 0x5a4e;
const CHIP_SEED = 0x91ce;

/** Deterministic PRNG — the burst is drawn once and committed, never re-rolled. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Places each glyph and reports where the ink actually lands. */
function layout() {
  const letters = [];
  let pen = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const item of LOCKUP) {
    const glyph = GLYPHS[item.g];
    const s = item.cap;
    letters.push({ ...item, glyph, x: pen, s });
    const top = BASELINE + item.dy - 100 * s - OUTLINE;
    const bottom = BASELINE + item.dy + OUTLINE;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
    pen += glyph.w * s + TRACKING;
  }
  return { letters, width: pen - TRACKING, top: minY, bottom: maxY };
}

function letterTransform(l) {
  const base = l.baseline !== undefined ? l.baseline : BASELINE + l.dy;
  return `translate(${round(l.x)} ${round(base)}) rotate(${l.rot}) scale(${round(l.s)}) translate(0 -100)`;
}

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Emits the glyph skeletons once, at a given weight and colour.
 *
 * The stroke width is divided by the letter's own scale because the weight is
 * applied inside the letter's scaled coordinate system — without that division
 * the small letters would come out proportionally lighter than the two S's.
 */
function strokeLayer(letters, { width, stroke, extra = '', scaleWeight = 1 }) {
  const body = letters
    .map((l) => {
      const w = round((width * l.sw * scaleWeight) / l.s);
      const paths = l.glyph.d
        .map((d) => `<path d="${d}" stroke-width="${w}"/>`)
        .join('');
      return `<g transform="${letterTransform(l)}">${paths}</g>`;
    })
    .join('');
  return `<g fill="none" stroke="${stroke}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3"${extra}>${body}</g>`;
}

/**
 * The burst: a jagged violet polygon on a superellipse, spikes alternating out
 * and in with seeded jitter so no two points are alike. n=3 keeps the base
 * shape closer to a rounded rectangle than an ellipse, which is what lets it
 * hug a wide lockup instead of ballooning past its ends.
 */
function burstPath(cx, cy, rx, ry, seed) {
  const rnd = mulberry32(seed);
  const spikes = 24;
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const t = (i / (spikes * 2)) * Math.PI * 2;
    const out = i % 2 === 0;
    const jitter = 0.86 + rnd() * 0.28;
    const k = out ? 1.0 + 0.10 * jitter : 0.88 + 0.06 * rnd();
    const c = Math.cos(t);
    const s = Math.sin(t);
    const n = 3;
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push([round(cx + rx * ex * k), round(cy + ry * ey * k)]);
  }
  return `M${pts.map((p) => p.join(' ')).join(' L')} Z`;
}

/** Loose shards thrown clear of the burst, as the model has. */
function chips(cx, cy, rx, ry, seed) {
  const rnd = mulberry32(seed);
  const out = [];
  const spots = [
    [-1.1, -0.34, 0.05], [-1.16, 0.42, 0.036],
    [1.09, -0.46, 0.046], [1.15, 0.36, 0.034],
    [-0.3, -1.1, 0.032], [0.38, 1.08, 0.028],
  ];
  for (const [fx, fy, fs] of spots) {
    const x = cx + rx * fx;
    const y = cy + ry * fy;
    const r = Math.max(rx, ry) * fs;
    const pts = [];
    const n = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + rnd() * 0.9;
      const rr = r * (0.6 + rnd() * 0.8);
      pts.push([round(x + Math.cos(t) * rr), round(y + Math.sin(t) * rr)]);
    }
    out.push(`M${pts.map((p) => p.join(' ')).join(' L')} Z`);
  }
  return out;
}

/**
 * Builds the mark.
 *
 * @param {object} [opts]
 * @param {number} [opts.width]   Rendered px width; omit for a unitless SVG.
 * @param {boolean} [opts.burst]  Draw the burst. Off gives the small-size mark.
 * @param {string} [opts.title]   Accessible title.
 */
export function buildMarkSvg(opts = {}) {
  const { width, burst = true, title = 'SupaSnake' } = opts;
  const L = layout();

  const cx = L.width / 2;
  const cy = (L.top + L.bottom) / 2;
  const rx = L.width / 2 + 36;
  const ry = (L.bottom - L.top) / 2 + 38;

  // The viewBox is the burst's reach when it is drawn, the ink's when it is not.
  const pad = 6;
  const box = burst
    ? { x: cx - rx * 1.13 - pad, y: cy - ry * 1.15 - pad, w: rx * 2.26 + pad * 2, h: ry * 2.3 + pad * 2 }
    : { x: -OUTLINE - pad, y: L.top - pad, w: L.width + (OUTLINE + pad) * 2, h: L.bottom - L.top + pad * 2 };

  const burstLayer = burst
    ? `<g stroke="${MARK_PALETTE.burstEdge}" stroke-width="7" stroke-linejoin="round">` +
      `<path d="${burstPath(cx, cy, rx, ry, BURST_SEED)}" fill="${MARK_PALETTE.burst}"/>` +
      chips(cx, cy, rx, ry, CHIP_SEED)
        .map((d) => `<path d="${d}" fill="${MARK_PALETTE.burst}" stroke-width="5"/>`)
        .join('') +
      `</g>`
    : '';

  const dim = width
    ? ` width="${round(width)}" height="${round((width * box.h) / box.w)}"`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(box.x)} ${round(box.y)} ${round(box.w)} ${round(box.h)}"${dim} role="img" aria-label="${title}">
<title>${title}</title>
<defs>
<linearGradient id="ss-letter" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
<stop offset="0" stop-color="${MARK_PALETTE.letterTop}"/>
<stop offset="0.46" stop-color="${MARK_PALETTE.letterMid}"/>
<stop offset="1" stop-color="${MARK_PALETTE.letterBottom}"/>
</linearGradient>
<mask id="ss-ink" maskUnits="userSpaceOnUse" x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}">
<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}" fill="#000"/>
${strokeLayer(L.letters, { width: STEM, stroke: '#fff' })}
</mask>
</defs>
${burstLayer}
${strokeLayer(L.letters, { width: STEM + OUTLINE * 2, stroke: MARK_PALETTE.ink, extra: ' transform="translate(4 6)" opacity="0.55"' })}
${strokeLayer(L.letters, { width: STEM + OUTLINE * 2, stroke: MARK_PALETTE.ink })}
<g mask="url(#ss-ink)">
<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}" fill="${MARK_PALETTE.letterRim}"/>
${strokeLayer(L.letters, { width: STEM, stroke: 'url(#ss-letter)', extra: ` transform="translate(0 ${BEVEL})"` })}
</g>
</svg>`;
}

export const MARK_LAYOUT = layout;

/**
 * THE MONOGRAM — the mark at sizes the wordmark cannot survive.
 *
 * Nine letters inside a burst turn to mud somewhere under 64px; at 16px the
 * lettering is three pixels tall and the burst is a violet smudge. Rather than
 * ship an unreadable favicon, the small sizes carry the lockup's leading S,
 * drawn in exactly the same language — same skeleton, same weight ratio, same
 * gradient, same bevel, same ink contour — on the burst's own violet. It is the
 * same drawing, cropped to the one letter that still reads.
 *
 * This also honours what D.1.3 was reaching for ("a wordmark is illegible at
 * 16px") without importing the cobra: the head is an illustration the mark does
 * not contain, so using it here would put two unrelated drawings in one brand.
 *
 * MASKABLE SAFE ZONE. Android may crop an installed icon to a circle inscribed
 * in the middle 80%. `maskable` therefore shrinks the S to 46 units of the 100
 * and squares off the plate, so every part of the letter survives the worst
 * crop any launcher applies; the plain variant fills its plate properly instead
 * of paying that tax on platforms that do not charge it.
 */
export function buildMonogramSvg(opts = {}) {
  const {
    size,
    maskable = false,
    radius = maskable ? 0 : 20,
    title = 'SupaSnake',
    outlineScale = 1,
  } = opts;

  const inner = maskable ? 46 : 64;
  const s = inner / 100;
  const g = GLYPHS.S;
  const letters = [
    { glyph: g, x: 50 - (g.w * s) / 2, s, rot: -4, sw: 1, baseline: 50 + inner / 2 },
  ];

  const dim = size ? ` width="${round(size)}" height="${round(size)}"` : '';
  const stem = STEM * s;
  const outline = OUTLINE * s * outlineScale;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dim} role="img" aria-label="${title}">
<title>${title}</title>
<defs>
<linearGradient id="ss-mono" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
<stop offset="0" stop-color="${MARK_PALETTE.letterTop}"/>
<stop offset="0.46" stop-color="${MARK_PALETTE.letterMid}"/>
<stop offset="1" stop-color="${MARK_PALETTE.letterBottom}"/>
</linearGradient>
<mask id="ss-mono-ink" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
<rect width="100" height="100" fill="#000"/>
${strokeLayer(letters, { width: stem, stroke: '#fff' })}
</mask>
</defs>
<rect width="100" height="100" rx="${radius}" fill="${MARK_PALETTE.burst}"/>
${strokeLayer(letters, { width: stem + outline * 2, stroke: MARK_PALETTE.ink })}
<g mask="url(#ss-mono-ink)">
<rect width="100" height="100" fill="${MARK_PALETTE.letterRim}"/>
${strokeLayer(letters, { width: stem, stroke: 'url(#ss-mono)', extra: ` transform="translate(0 ${round(BEVEL * s)})"` })}
</g>
</svg>`;
}
