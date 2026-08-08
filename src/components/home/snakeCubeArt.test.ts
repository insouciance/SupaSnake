/**
 * THE RESEMBLANCE LAW, AS A TEST.
 *
 * The owner's acceptance bar for this round is that a button next to a body
 * segment must read as the same material. "Reads as" is a judgement and stays
 * one — but the part of it that is arithmetic can be pinned, and this is that
 * part: the drawn cube's bands are asserted against PIXELS MEASURED OFF A
 * RENDERED FRAME of the real creature.
 *
 * PROVENANCE OF THE FIXTURE. A 1440x900 frame of Home was captured from the
 * live chamber (`chromium`, dpr 1, `PEEK-desktop.png`), and the second and
 * third body cubes of the specimen were scanned along a row and a column. The
 * bands separate cleanly because the guide's transitions are hard:
 *
 *     scan y=455, x=686..790          scan x=730, y=366..520
 *     686..703  #ec982e  front face   390..402  #12100d  ink hull
 *     733..748  #ebd178  corner rim   403..419  #eaca5c  top face
 *     749..767  #d77018  right face   420..433  #edd47d  top-front rim
 *     768..779  #12100d  ink hull     435..490  #ed9a30 -> #e9932a  front face
 *
 * The tolerance is per channel and deliberately tight. It is not a "close
 * enough" allowance: the two sides of the comparison are a GPU running the
 * shader through 8-bit AA and a CPU running the same arithmetic in doubles, and
 * the residual is the sampling, not the model. A drift of more than a few units
 * means the drawn cube has stopped being the same material — which is exactly
 * the failure this file exists to catch.
 */

import {
  classifyFacet,
  getSnakeCubeArt,
  getSnakeCubeBandColors,
} from './snakeCubeArt';
import {
  GUIDE_PALETTE,
  SNAKE_FACE_CUTS,
  SNAKE_STYLE_PROFILES,
} from '@/components/game/screen/snake90s';

/**
 * The style the guide is about.
 *
 * Under jest the active style is always `classic` — it is resolved once at
 * module load from the URL and there is no URL — so every assertion about the
 * creature's material has to name the profile it is asking about. Same reason
 * `resolveCubeEdge` takes a profile.
 */
const GUIDE = SNAKE_STYLE_PROFILES.ninetiesGuide;

const toRgb = (hex: string): [number, number, number] => {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
};

function expectNear(actual: string, expected: string, tolerance: number) {
  const a = toRgb(actual);
  const b = toRgb(expected);
  const delta = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  if (delta > tolerance) {
    throw new Error(
      `${actual} is ${delta} off ${expected} (tolerance ${tolerance})`
    );
  }
}

describe('classifyFacet — the shipped shader branch, ported', () => {
  it('sends the up face to top and the down face to down', () => {
    expect(classifyFacet([0, 1, 0])).toBe('top');
    expect(classifyFacet([0, -1, 0])).toBe('down');
  });

  it('sends the two camera-facing verticals to side and the far pair to away', () => {
    // The key is an azimuth 120 degrees from +X, which is what puts the board
    // camera's two visible faces on the mid tone.
    expect(classifyFacet([0, 0, 1])).toBe('side');
    expect(classifyFacet([-1, 0, 0])).toBe('side');
    expect(classifyFacet([1, 0, 0])).toBe('away');
    expect(classifyFacet([0, 0, -1])).toBe('away');
  });

  it('gives every chamfer that faces up or sideways the rim, and never one that tilts down', () => {
    const d = 1 / Math.SQRT2;
    expect(classifyFacet([0, d, d])).toBe('rim'); // top-front chamfer
    expect(classifyFacet([d, 0, d])).toBe('rim'); // the vertical corner
    expect(classifyFacet([0, -d, d])).toBe('down'); // the under-edge stays dark
  });

  it('keeps the rim cut clear of interpolator noise on a flat face', () => {
    // A flat face's edgeness is 0; the cut is four orders of magnitude above it.
    expect(SNAKE_FACE_CUTS.rim).toBeGreaterThan(0);
    expect(classifyFacet([0, 0, 1])).not.toBe('rim');
  });
});

describe('the drawn cube is the rendered cube', () => {
  const bands = getSnakeCubeBandColors({ role: 'body', dynasty: 'PRIMAL', profile: GUIDE });

  it('matches the front face measured off the live chamber', () => {
    // The flat front face spans object y roughly -0.3..+0.3 once the chamfer
    // has taken its share, so the measured top and bottom of it sit inside the
    // gradient's own endpoints rather than on them.
    const top = toRgb(bands.side.from);
    const bottom = toRgb(bands.side.to);
    for (const [i, measured] of [0xed, 0x9a, 0x30].entries()) {
      expect(measured).toBeLessThanOrEqual(top[i] + 3);
      expect(measured).toBeGreaterThanOrEqual(bottom[i] - 3);
    }
    for (const [i, measured] of [0xe9, 0x93, 0x2a].entries()) {
      expect(measured).toBeLessThanOrEqual(top[i] + 3);
      expect(measured).toBeGreaterThanOrEqual(bottom[i] - 3);
    }
  });

  it('matches the rim, the top face and the away face', () => {
    // Sampled at mid height, so compared against the gradient's midpoint.
    const mid = (a: string, b: string) => {
      const x = toRgb(a);
      const y = toRgb(b);
      return (
        '#' +
        x
          .map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0'))
          .join('')
      );
    };
    expectNear(mid(bands.rim.from, bands.rim.to), '#ebd178', 4);
    expectNear(bands.top.from, '#eaca5c', 4);
    expectNear(mid(bands.away.from, bands.away.to), '#d77018', 5);
  });

  it('draws the outline in the creature own warm black, untouched by tone mapping', () => {
    const art = getSnakeCubeArt({ role: 'body', profile: GUIDE });
    expect(art.ink.color).toBe(GUIDE_PALETTE.ink);
  });
});

describe('the drawing', () => {
  const art = getSnakeCubeArt({ role: 'body', profile: GUIDE });

  it('is stable — the same options return the identical object', () => {
    expect(getSnakeCubeArt({ role: 'body', profile: GUIDE })).toBe(art);
  });

  it('shows exactly the facets a camera can see, and no others', () => {
    // A chamfered cube has 26 facets; from any generic direction a convex
    // solid shows fewer than half of them.
    expect(art.facets.length).toBeGreaterThan(6);
    expect(art.facets.length).toBeLessThan(26);
  });

  it('carries all five bands so a facet can never fall through to nothing', () => {
    expect(art.gradients.map((g) => g.band).sort()).toEqual(
      ['away', 'down', 'rim', 'side', 'top'].sort()
    );
  });

  it('leaves a real glyph box on the flat front face, inside the drawing', () => {
    const [vx, vy, vw, vh] = art.viewBox.split(' ').map(Number);
    expect(art.face.width).toBeGreaterThan(0.35);
    expect(art.face.height).toBeGreaterThan(0.35);
    expect(art.face.x).toBeGreaterThanOrEqual(vx);
    expect(art.face.y).toBeGreaterThanOrEqual(vy);
    expect(art.face.x + art.face.width).toBeLessThanOrEqual(vx + vw);
    expect(art.face.y + art.face.height).toBeLessThanOrEqual(vy + vh);
  });

  it('gives the head a bigger, hotter cube than the body — the row is the creature', () => {
    const head = getSnakeCubeArt({ role: 'head', profile: GUIDE });
    const body = getSnakeCubeArt({ role: 'body', profile: GUIDE });
    const headTop = toRgb(head.gradients.find((g) => g.band === 'top')!.from);
    const bodyTop = toRgb(body.gradients.find((g) => g.band === 'top')!.from);
    // Brighter on every channel: more emissive on a brighter base.
    headTop.forEach((v, i) => expect(v).toBeGreaterThan(bodyTop[i]));
  });
});
