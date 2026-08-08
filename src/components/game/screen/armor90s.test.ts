/**
 * ARMOR - the design law, as assertions.
 *
 * Everything here is pure arithmetic on the authored numbers, so it runs
 * without a browser, a GPU or a build - which is the only way the shape of a
 * wearable can be pinned at all: `SNAKE_STYLE` resolves from the URL at module
 * load and is therefore always `classic` under jest, so the concept's own
 * profile has to be named explicitly. Same technique `snake90s.test.ts` uses.
 */

import {
  ARMOR_EMBED,
  ARMOR_EMBED_MARGIN,
  ARMOR_HEAD_CLEARANCE,
  ARMOR_INK_WIDTH,
  ARMOR_MIN_MOUNT_SCALE,
  ARMOR_PALETTE,
  ARMOR_PLATE_LENGTH,
  ARMOR_PLATE_WIDTH,
  ARMOR_TIERS,
  ARMOR_TONES,
  ARMORED_SEGMENTS,
  armorFacingYaw,
  armorSeat,
  armorSpansItsSegment,
  armorSpanWorld,
  armorTierSeat,
  armorWrapDelta,
  resolveArmorFixture,
  resolveArmorMountScale,
  SEGMENT_ANCHORS,
} from './armor90s';
import { GUIDE_PALETTE, SNAKE_STYLE_PROFILES } from './snake90s';

/** The ratified creature - the one the armour is authored against. */
const shipped = SNAKE_STYLE_PROFILES.ninetiesGuide;
const mount = resolveArmorMountScale(shipped);

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// -----------------------------------------------------------------------------

describe('armor90s: the fixture', () => {
  it('is refused outright in a production bundle', () => {
    // The loadout is server-held (migration 069, Constitution R11). A query
    // parameter that equipped real gear would be the first item a player could
    // award themselves, so the pin cannot exist in the build they run.
    expect(resolveArmorFixture('?armor=2', 'production')).toBe('off');
    expect(resolveArmorFixture('?armor=1', 'production')).toBe('off');
  });

  it('offers BOTH variants, because the owner rules between them', () => {
    expect(resolveArmorFixture('?armor=1', 'development')).toBe('one');
    expect(resolveArmorFixture('?armor=one', 'development')).toBe('one');
    expect(resolveArmorFixture('?armor=2', 'development')).toBe('two');
    expect(resolveArmorFixture('?armor=two', 'development')).toBe('two');
  });

  it('defaults to unarmoured on anything it cannot read', () => {
    expect(resolveArmorFixture('', 'development')).toBe('off');
    expect(resolveArmorFixture('?armor=', 'development')).toBe('off');
    expect(resolveArmorFixture('?armor=yes', 'development')).toBe('off');
    expect(resolveArmorFixture('?other=1', 'development')).toBe('off');
  });

  it('never wears gear on the head', () => {
    // The owner's line: "worn on one, maybe two segments ... not the head."
    // Index 0 IS the head, and no variant may contain it.
    for (const segments of Object.values(ARMORED_SEGMENTS)) {
      expect(segments).not.toContain(0);
      expect(segments.every((index) => index >= 1)).toBe(true);
    }
    expect(ARMORED_SEGMENTS.one).toEqual([1]);
    expect(ARMORED_SEGMENTS.two).toEqual([1, 2]);
  });

  it('mounts on a SEGMENT anchor, which is not a third head slot', () => {
    // snake90s.test.ts pins the head at exactly two mount points ("no cap, and
    // no slot a cap could be worn in but the braids"). Gear on the body is a
    // different kind of thing in a different place; merging the tables would
    // have made that test a statement about gear too.
    expect(Object.keys(SEGMENT_ANCHORS)).toEqual(['back']);
    // Segment-local, on the top plane of an exact unit box - so one asset fits
    // every scale the product mounts it at.
    expect(SEGMENT_ANCHORS.back.position).toEqual([0, 0.5, 0]);
  });
});

describe('armor90s: the silhouette - broader than the body, narrower than the head', () => {
  it('is wider than ANY body cube can ever be, in every fusion state', () => {
    // This is the read the owner is buying: a mid-coil armoured segment is a
    // silhouette change at every level, not only when the snake runs loose.
    const widestCube = Math.max(...shipped.trailFootprint);
    expect(armorSpanWorld(mount)).toBeGreaterThan(widestCube);
  });

  it('is narrower than the head, so head primacy survives being worn against', () => {
    // The head leads on size, emissive and base colour. A plate that
    // out-measured it would take the first of the three away.
    expect(armorSpanWorld(mount)).toBeLessThan(shipped.headSize);
    // And it steps in from the head's own claim rather than merely landing
    // under it - the bound is arithmetic, not coincidence.
    expect(armorSpanWorld(mount)).toBeLessThanOrEqual(
      shipped.headSize * ARMOR_HEAD_CLEARANCE + 1e-9
    );
  });

  it('holds that bound under any profile, not just the shipped one', () => {
    // classic's head (0.9) is no wider than its own packed cube (0.9), so the
    // pair of bounds is unsatisfiable there. What must never fail is the head
    // one, because that is the one gameplay reads.
    for (const profile of Object.values(SNAKE_STYLE_PROFILES)) {
      const scale = resolveArmorMountScale(profile);
      expect(armorSpanWorld(scale)).toBeLessThan(profile.headSize);
    }
  });

  it('takes its size from the SETTLED body, and then never changes', () => {
    // The armour is rigid: the cube beneath it swells with fusion, shrinks
    // toward vacancy and breathes, and the plate does none of it. That is the
    // whole "manufactured object on an organism" read, and it is bought by the
    // mount being a constant rather than a per-frame number.
    expect(mount).toBe(shipped.trailFootprint[1]);
  });
});

describe('armor90s: the ziggurat - lamellae, not a fin', () => {
  it('is three slabs, each strictly smaller in plan than the one below', () => {
    expect(ARMOR_TIERS.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ARMOR_TIERS.length; i += 1) {
      expect(ARMOR_TIERS[i].width).toBeLessThan(ARMOR_TIERS[i - 1].width);
      expect(ARMOR_TIERS[i].length).toBeLessThan(ARMOR_TIERS[i - 1].length);
      expect(ARMOR_TIERS[i].rise).toBeGreaterThan(ARMOR_TIERS[i - 1].rise);
    }
  });

  it('is WIDER THAN IT IS LONG at every tier, so a turn shows', () => {
    // The plate's long axis lies ACROSS the creature. A square plate would
    // track its segment's heading perfectly and show nothing for it.
    for (const tier of ARMOR_TIERS) {
      expect(tier.width).toBeGreaterThan(tier.length);
    }
  });

  it('never stands as tall as it is wide - a plate, not a tower', () => {
    const tallest = Math.max(...ARMOR_TIERS.map((tier) => tier.rise));
    expect(tallest).toBeLessThan(ARMOR_PLATE_WIDTH / 2);
  });

  it('buries every slab in the surface it rests on - THE EMBED RULE', () => {
    // A worn part may never be tangent to what it is worn on: a hull that
    // straddles a surface leaves back-facing chamfer facets sitting on the sign
    // change of a back-face test, and the idle sway flickers them into being
    // drawn. That is the braid fringe, and this is the fix for its whole class.
    ARMOR_TIERS.forEach((tier, index) => {
      const seat = armorTierSeat(index);
      const restsOn = index === 0 ? 0 : ARMOR_TIERS[index - 1].rise;
      const bottom = seat.y - seat.thickness / 2;
      expect(bottom).toBeCloseTo(restsOn - ARMOR_EMBED, 10);
      // The top is exactly where it was authored to be - the only look
      // decision in the seat.
      expect(seat.y + seat.thickness / 2).toBeCloseTo(tier.rise, 10);
    });
  });

  it('buries its own ink line at the SMALLEST mount the product uses', () => {
    // The embed is expressed segment-local because the armour mounts at several
    // scales - 0.76 on the board, 0.64 and 0.58 on the chamber's tapering body.
    // The rule has to survive the smallest of them.
    expect(ARMOR_EMBED * ARMOR_MIN_MOUNT_SCALE).toBeGreaterThan(
      ARMOR_INK_WIDTH + ARMOR_EMBED_MARGIN
    );
  });
});

describe('armor90s: the anchor bounds - it always rests on its own segment', () => {
  it('is longer than the widest gap the body ever opens', () => {
    // Mid-glide a segment is drawn up to half a cell off its own cube, so a
    // short plate could hang over open board. The plate is 0.71 of a cell and
    // the widest gap is 0.32.
    expect(armorSpansItsSegment(shipped, mount)).toBe(true);
    const widestGap = 1 - Math.min(...shipped.trailFootprint);
    expect(ARMOR_PLATE_LENGTH * mount).toBeGreaterThan(widestGap);
  });

  it('leaves the two-segment variant reading as TWO pieces of gear', () => {
    // Armoured segments sit exactly one cell apart. If the ink can paint the
    // gap closed from both sides the pair fuses into one slab.
    const gap = 1 - ARMOR_PLATE_LENGTH * mount;
    expect(gap).toBeGreaterThan(ARMOR_INK_WIDTH * 2);
  });

  it('is inked between the creature and its own detail', () => {
    // The line follows FEATURE SIZE: a shoulder plate is nearer a head than a
    // bead. Bolder than the shades, still under the body's own weight, so the
    // segment remains the larger silhouette inside the heavier line.
    expect(ARMOR_INK_WIDTH).toBeGreaterThan(0.042);
    expect(ARMOR_INK_WIDTH).toBeLessThan(shipped.inkHullWidth);
  });
});

describe('armor90s: the metal - warm, and never the three forbidden hues', () => {
  it('is not the creature, not the terrain decal, not the Mark', () => {
    const forbidden = [
      GUIDE_PALETTE.highlight,
      GUIDE_PALETTE.bodyHighlight,
      GUIDE_PALETTE.midtone,
      GUIDE_PALETTE.shadow,
      GUIDE_PALETTE.bead,
      '#f2a03f', // forming terrain / brand amber
      '#a855f7', // mutation violet - the Mark's
    ];
    for (const stock of Object.values(ARMOR_PALETTE)) {
      expect(forbidden).not.toContain(stock);
    }
  });

  it('keeps every stock WARM - R > G > B, so no band of it can fall to blue', () => {
    for (const stock of Object.values(ARMOR_PALETTE)) {
      const [r, g, b] = rgb(stock);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('is desaturated where the creature is saturated - it reads as metal', () => {
    // The body's own swatches are vivid (the midtone spans 214 between its
    // brightest and darkest channel). Metal is the opposite: a narrow spread is
    // what separates a plate from a piece of the snake at a glance.
    const spread = (hex: string) => {
      const [r, g, b] = rgb(hex);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(GUIDE_PALETTE.midtone)).toBeGreaterThan(100);
    expect(spread(ARMOR_PALETTE.iron)).toBeLessThan(40);
    expect(spread(ARMOR_PALETTE.steel)).toBeLessThan(40);
  });

  it('gives the top tier a clear value step over the base - the bright block', () => {
    // At 24px the read is a dark band with a bright block in its middle. That
    // step is the whole silhouette, so it is a number, not a hope.
    const luma = (hex: string) => {
      const [r, g, b] = rgb(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luma(ARMOR_PALETTE.steel) - luma(ARMOR_PALETTE.iron)).toBeGreaterThan(
      35
    );
  });

  it('steps DOWN monotonically from the lit edge to the underside', () => {
    const bands = [
      ARMOR_TONES.top,
      ARMOR_TONES.side,
      ARMOR_TONES.away,
      ARMOR_TONES.down,
    ];
    for (let i = 1; i < bands.length; i += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        expect(bands[i].mul[channel]).toBeLessThan(bands[i - 1].mul[channel]);
      }
    }
  });

  it('puts the only ADD on the rim - metal catches its edge', () => {
    // The rim is the one band that goes up, and it has to be an add: the stock
    // is already the base colour and there is nothing above 1.0 to multiply
    // toward. Stronger than the braids' gold, because a forged edge catches
    // more than hair does.
    expect(ARMOR_TONES.rim.add).toBeDefined();
    expect(Math.min(...ARMOR_TONES.rim.add!)).toBeGreaterThan(0.2);
    for (const band of [ARMOR_TONES.top, ARMOR_TONES.side, ARMOR_TONES.away]) {
      expect(band.add).toBeUndefined();
    }
  });

  it('keeps every band warm - a shadow may darken, it may never go cool', () => {
    // The creature's own rule ("shadows are dark orange, never grey or slate")
    // generalises to its gear as: no band may raise blue above red.
    for (const band of Object.values(ARMOR_TONES)) {
      if (typeof band === 'number') continue;
      expect(band.mul[0]).toBeGreaterThanOrEqual(band.mul[2]);
      if (band.add) expect(band.add[0]).toBeGreaterThanOrEqual(band.add[2]);
    }
  });

  it('never blooms - it is the one mid-value grey on the board that cannot', () => {
    // Asserted as the absence of any emissive authoring in the palette: the
    // material builder passes '#000000' at intensity 0 and there is no number
    // here for it to read instead.
    expect(Object.keys(ARMOR_PALETTE).sort()).toEqual([
      'iron',
      'rivet',
      'steel',
    ]);
  });

  it('has a gentler fall than the creature, because a slab is thinner', () => {
    // The body's 0.16 is set against a cube ~24 device pixels tall. A tier is a
    // quarter of that, so the same fraction would read as a gradient on a
    // surface rather than as a top light.
    expect(ARMOR_TONES.fall).toBeGreaterThan(0);
    expect(ARMOR_TONES.fall).toBeLessThan(0.16);
  });
});

describe('armor90s: facing', () => {
  it('reads the four grid headings the way the head does', () => {
    // rotation.y = t sends local +Z to (sin t, 0, cos t).
    expect(armorFacingYaw(0, 1, 0, 0, 20)).toBeCloseTo(0, 10); // +Z / DOWN
    expect(armorFacingYaw(0, -1, 0, 0, 20)).toBeCloseTo(Math.PI, 10); // -Z / UP
    expect(armorFacingYaw(1, 0, 0, 0, 20)).toBeCloseTo(Math.PI / 2, 10); // +X
    expect(armorFacingYaw(-1, 0, 0, 0, 20)).toBeCloseTo(-Math.PI / 2, 10); // -X
  });

  it('sweeps through the diagonal rather than snapping at a corner', () => {
    // Both drawn positions are continuous in glide motion, so the angle between
    // them is too. Mid-corner the pair is offset on both axes and the plate
    // sits at 45 degrees - the creature's spine bending, read off the spine.
    expect(armorFacingYaw(0.5, 0.5, 0, 0, 20)).toBeCloseTo(Math.PI / 4, 10);
  });

  it('keeps the yaw it has when the pair coincides', () => {
    // The first stamp of a run seeds every segment onto one cell. Null means
    // "no opinion", not "face +Z" - a plate that snapped to a default on frame
    // one would be visibly wrong for exactly one frame, which is a flicker.
    expect(armorFacingYaw(3, 4, 3, 4, 20)).toBeNull();
  });

  it('corrects a torus wrap instead of pointing across the arena', () => {
    // COSMIC wraps. Two adjacent segments on opposite edges differ by nearly a
    // full grid; left raw the plate would swing across the whole board for a
    // frame, which is the armour detaching from the creature.
    expect(armorWrapDelta(19, 20)).toBe(-1);
    expect(armorWrapDelta(-19, 20)).toBe(1);
    expect(armorWrapDelta(1, 20)).toBe(1);
    expect(armorWrapDelta(0, 20)).toBe(0);
    // A head that wrapped from x = 19 to x = 0 is ONE cell ahead, not nineteen
    // behind.
    expect(armorFacingYaw(0, 5, 19, 5, 20)).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('armor90s: the seat helper', () => {
  it('authors the top and derives the buried half', () => {
    const seat = armorSeat(0.2, 0.05);
    expect(seat.y + seat.thickness / 2).toBeCloseTo(0.2, 10);
    expect(seat.y - seat.thickness / 2).toBeCloseTo(0.05 - ARMOR_EMBED, 10);
  });
});
