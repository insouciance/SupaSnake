/**
 * The placeholder must be the same room as the chamber.
 *
 * It is the first paint of the product, so when it disagrees with the canvas
 * the player sees a flash — and the DIRECTION of that flash is an accident of
 * which room shipped. This file has now been on both sides of it: a black
 * flash before a bright scene once, and a bright flash before a dark one if
 * the stops were ever left behind. The invariant underneath is the same in
 * both directions and is what this test actually defends: the two files are
 * duplicated by design (the placeholder must not pull three.js into the first
 * paint), and duplication that nothing checks is how the flash came back the
 * first time.
 *
 * THE LUMA GATE IS INVERTED, BY OWNER RULING (2026-08-08).
 *
 *   "home should be dark like the other pages."
 *
 * The gate below used to read `luma > 200`, and it carried the sentence "'No
 * black' is an owner ruling". That ruling has been reversed by the same
 * authority that made it, so the assertion is re-expressed rather than
 * deleted: the placeholder must now be as unambiguously DARK as it was
 * required to be bright, because a bright stop surviving in this file is
 * exactly the flash the old gate existed to prevent, wearing the other
 * polarity. The floor is set from the chamber's own lamp value — the
 * BRIGHTEST thing the placeholder is allowed to contain — with a margin, so
 * the test still fails on a stray near-white rather than merely on pure
 * paper.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';

import {
  ChamberPlaceholder,
  CHAMBER_PLACEHOLDER_BACKGROUND,
} from '@/components/home/ChamberPlaceholder';

const chamberSource = readFileSync(
  join(process.cwd(), 'src/components/home/SpecimenChamber.tsx'),
  'utf8'
);

/** Read a `const NAME = '#hex';` out of the chamber, so the test cannot hold a
 *  stale copy of the value it is checking. */
function chamberColor(name: string): string {
  const match = chamberSource.match(
    new RegExp(`const ${name} = '(#[0-9a-fA-F]{3,8})'`)
  );
  if (!match) throw new Error(`SpecimenChamber has no ${name} constant`);
  return match[1];
}

/** Rec. 601 luma of a `#rrggbb`. */
function luma(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('ChamberPlaceholder', () => {
  it('paints the night room the chamber itself paints, not a page', () => {
    expect(CHAMBER_PLACEHOLDER_BACKGROUND).toContain(chamberColor('ROOM'));
    expect(CHAMBER_PLACEHOLDER_BACKGROUND).toContain(chamberColor('ROOM_EDGE'));
    expect(CHAMBER_PLACEHOLDER_BACKGROUND).toContain(chamberColor('ROOM_LAMP'));
  });

  it('contains no bright stop at all', () => {
    const background = CHAMBER_PLACEHOLDER_BACKGROUND.toLowerCase();

    // The lamp is the brightest value the chamber puts on screen behind the
    // creature, so it is the ceiling for the placeholder too. The margin
    // exists so this fails on a stray page-white rather than on a shade.
    const ceiling = luma(chamberColor('ROOM_LAMP').toLowerCase()) + 12;

    const hexes = background.match(/#[0-9a-f]{6}/g) ?? [];
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(luma(hex)).toBeLessThan(ceiling);
    }
  });

  it('never lets the first paint be lighter than the room it precedes', () => {
    // The failure this whole file exists to prevent, stated once as a
    // relation rather than as a threshold: whichever way the ground is ruled,
    // the placeholder may not be brighter than the chamber's own lamp, because
    // brighter-than-the-room IS the flash.
    const hexes =
      CHAMBER_PLACEHOLDER_BACKGROUND.toLowerCase().match(/#[0-9a-f]{6}/g) ?? [];
    const brightest = Math.max(...hexes.map(luma));
    expect(brightest).toBeLessThanOrEqual(
      luma(chamberColor('ROOM_LAMP').toLowerCase())
    );
  });

  it('is decorative and never announced', () => {
    render(<ChamberPlaceholder />);
    expect(screen.getByTestId('home-chamber-placeholder')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
