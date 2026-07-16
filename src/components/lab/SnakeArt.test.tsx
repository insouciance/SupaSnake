/**
 * Tests for SnakeArt - deterministic procedural card art
 */

import React from 'react';
import { render } from '@testing-library/react';
import { SnakeArt, type SnakeArtProps } from './SnakeArt';

const baseProps: SnakeArtProps = {
  seed: 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d',
  name: 'CYBER SPARK',
  dynasty: 'CYBER',
  primaryColor: '#00FFFF',
  secondaryColor: '#FF00FF',
  rarity: 'common',
};

function renderMarkup(props: Partial<SnakeArtProps> = {}): string {
  const { container, unmount } = render(<SnakeArt {...baseProps} {...props} />);
  const markup = container.innerHTML;
  unmount();
  return markup;
}

describe('SnakeArt', () => {
  it('renders an svg with an accessible label', () => {
    const { container, getByRole } = render(<SnakeArt {...baseProps} />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 400');
    expect(getByRole('img')).toBe(svg);
    expect(svg?.getAttribute('aria-label')).toBe('CYBER SPARK artwork');
  });

  it('is deterministic: same seed renders identical output', () => {
    const first = renderMarkup();
    const second = renderMarkup();

    expect(first).toBe(second);
  });

  it('renders different art for different seeds', () => {
    const first = renderMarkup({ seed: 'seed-one' });
    const second = renderMarkup({ seed: 'seed-two' });

    expect(first).not.toBe(second);
  });

  it('renders dynasty-specific motifs', () => {
    const cyber = renderMarkup({ dynasty: 'CYBER' });
    const primal = renderMarkup({ dynasty: 'PRIMAL' });
    const cosmic = renderMarkup({ dynasty: 'COSMIC' });

    expect(cyber).toContain('polyline'); // circuit traces
    expect(primal).toContain('ellipse'); // leaves
    expect(cosmic).not.toContain('polyline'); // star field
    expect(cosmic).not.toContain('ellipse');
  });

  it('applies a glow filter for higher rarities but not common', () => {
    const common = renderMarkup({ rarity: 'common' });
    const legendary = renderMarkup({ rarity: 'legendary' });

    expect(common).not.toContain('<filter');
    expect(legendary).toContain('<filter');
    expect(legendary).toContain('feGaussianBlur');
  });
});
