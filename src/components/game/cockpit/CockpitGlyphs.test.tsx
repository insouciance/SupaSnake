import { render } from '@testing-library/react';
import { GENES, type GeneId } from '@/shared/game/genes';
import { STRAIN_IDS } from '@/shared/game/strains';
import { GeneGlyph, StrainGlyph } from './CockpitGlyphs';

describe('cockpit glyph catalog', () => {
  it('gives every offerable gene a nonempty, bespoke silhouette', () => {
    const signatures = new Set<string>();
    const ids = Object.keys(GENES) as GeneId[];

    for (const id of ids) {
      const { container, unmount } = render(<GeneGlyph id={id} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.children.length).toBeGreaterThan(0);
      signatures.add(svg?.innerHTML ?? '');
      unmount();
    }

    expect(signatures.size).toBe(ids.length);
  });

  it('keeps the five strain symbols distinct', () => {
    const signatures = new Set<string>();
    for (const id of STRAIN_IDS) {
      const { container, unmount } = render(<StrainGlyph id={id} />);
      signatures.add(container.querySelector('svg')?.innerHTML ?? '');
      unmount();
    }
    expect(signatures.size).toBe(STRAIN_IDS.length);
  });
});
