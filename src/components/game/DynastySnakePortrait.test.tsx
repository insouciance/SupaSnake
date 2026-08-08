/**
 * THE HOUSE-TINTED CREATURE — the tint LAW, not the picture.
 *
 * Owner ruling, 2026-08-08, overruling the one-colour law for portraits by
 * name: CYBER, PRIMAL and COSMIC each get a house-tinted snake in their Run
 * Setup portrait. The board is untouched; the three heads that LAUNCH are
 * still the one amber creature `snake90s.ts` describes.
 *
 * A portrait is a WebGL readback and jest has no WebGL, so what is asserted
 * here is the thing that actually decides what the picture looks like: which
 * two colours the head is painted from, and where they come from. The risk
 * this guards is not that the render breaks — it is that somebody "tidies" the
 * tint into three hand-picked hexes, or reinstates the forced amber, and the
 * three houses quietly become one again.
 */

import * as THREE from 'three';
import {
  houseMidTone,
  portraitHouseTint,
} from './DynastySnakePortrait';
import { SETUP_DYNASTIES } from './SnakePickerSheet';
import { GAME_MATERIAL_PROFILES } from './screen/gameMaterialProfiles';
import { GUIDE_PALETTE, TONE_SIDE } from './screen/snake90s';

const hex = (color: THREE.Color) => `#${color.getHexString()}`;

describe('the portrait tint is authored, not washed', () => {
  /**
   * NOTHING HERE IS PICKED BY EYE.
   *
   * The base is the dynasty's OWN snake colour — the colour the creature had
   * before `ninetiesGuide` forced all three to amber. The portrait un-forces
   * it; it does not invent a fourth palette.
   */
  it('paints each house from that house\'s own authored snake colour', () => {
    for (const dynasty of SETUP_DYNASTIES) {
      expect(portraitHouseTint(dynasty).base).toBe(
        GAME_MATERIAL_PROFILES[dynasty].snake.baseColor
      );
    }
  });

  /** And the three really are three. */
  it('gives the three houses three different creatures', () => {
    const bases = SETUP_DYNASTIES.map((d) => portraitHouseTint(d).base);
    expect(new Set(bases).size).toBe(SETUP_DYNASTIES.length);
    // Specifically: not the guide's amber, which is what the board forces.
    for (const base of bases) {
      expect(base).not.toBe(GUIDE_PALETTE.highlight);
    }
  });

  /**
   * THE LAMP IS THE HOUSE'S OWN MID TONE, DERIVED THE GUIDE'S OWN WAY.
   *
   * The guide's mid tone swatch IS its highlight run through `TONE_SIDE` —
   * `snake90s.ts` states that in its tone table and the arithmetic agrees to
   * about two units per channel. So a house's emissive is that house's base
   * through the same multiplier: one rule, generalised, with no authored hex.
   *
   * This test checks the rule against the guide's own published swatch,
   * because that is the only external number that can confirm the derivation
   * is the one the sheet was drawn with.
   */
  it('derives the lamp from the base by the guide\'s own mid tone rule', () => {
    const amberMid = houseMidTone(GUIDE_PALETTE.highlight);
    const stated = new THREE.Color(GUIDE_PALETTE.midtone);
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(Math.abs(amberMid[channel] - stated[channel])).toBeLessThan(0.02);
    }

    // Same rule, every house.
    for (const dynasty of SETUP_DYNASTIES) {
      const { base, midTone } = portraitHouseTint(dynasty);
      expect(midTone).toBe(hex(houseMidTone(base)));
    }
  });

  /**
   * A MID TONE IS DARKER AND STAYS IN ITS OWN HUE FAMILY.
   *
   * This is the property that makes it a tone family rather than a hue-shift
   * wash: the multiplier only ever removes light, and it removes more from the
   * cool channels than the warm one, which is the guide's rule that "a shadow
   * is a darker, MORE saturated member of the hue".
   */
  it('keeps every house\'s lamp inside that house\'s own hue', () => {
    expect(TONE_SIDE.every((factor) => factor > 0 && factor < 1)).toBe(true);
    for (const dynasty of SETUP_DYNASTIES) {
      const { base, midTone } = portraitHouseTint(dynasty);
      const from = new THREE.Color(base);
      const to = new THREE.Color(midTone);
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(to[channel]).toBeLessThan(from[channel]);
      }
    }
  });
});
