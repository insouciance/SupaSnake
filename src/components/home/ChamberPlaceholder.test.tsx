/**
 * The placeholder must be the same room as the chamber.
 *
 * It is the first paint of the product. When it disagreed with the canvas it
 * disagreed in the worst direction — a black flash before a bright scene — so
 * this test pins the two files' colour values together. They are duplicated by
 * design (the placeholder must not pull three.js into the first paint), and
 * duplication that nothing checks is how the flash came back the first time.
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

describe('ChamberPlaceholder', () => {
  it('paints the paper the chamber itself paints, not a void', () => {
    expect(CHAMBER_PLACEHOLDER_BACKGROUND).toContain(chamberColor('PAPER'));
    expect(CHAMBER_PLACEHOLDER_BACKGROUND).toContain(chamberColor('PAPER_EDGE'));
  });

  it('contains no dark stop at all', () => {
    const background = CHAMBER_PLACEHOLDER_BACKGROUND.toLowerCase();

    // Every opaque hex in the gradient must be a bright value. "No black" is
    // an owner ruling, and a near-black is the same flash as a black.
    const hexes = background.match(/#[0-9a-f]{6}/g) ?? [];
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Rec. 601 luma; the chamber's darkest paper value sits near 240.
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      expect(luma).toBeGreaterThan(200);
    }
  });

  it('is decorative and never announced', () => {
    render(<ChamberPlaceholder />);
    expect(screen.getByTestId('home-chamber-placeholder')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
