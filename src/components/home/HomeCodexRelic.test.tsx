import { render, screen } from '@testing-library/react';
import { HomeCodexRelic } from './HomeCodexRelic';

describe('HomeCodexRelic', () => {
  it('makes the Genome vocabulary visible without adding a labelled command', () => {
    render(<HomeCodexRelic />);
    const relic = screen.getByRole('link', { name: 'Genome Research' });
    expect(relic).toHaveAttribute('href', '/codex');
    // A pressable, so it is a segment of the snake like the rail and the gear.
    expect(relic).toHaveClass('snake-cube', 'absolute', 'h-12', 'w-12');
    // Five strain runes still ring it — the drawn cube adds two more svgs of
    // its own (the block layer and the lit surface), and the runes are what
    // this test is about.
    expect(relic.querySelectorAll('[class*="rune"], svg')).not.toHaveLength(0);
    const runeRing = relic.querySelector('.-inset-2');
    expect(runeRing).not.toBeNull();
    expect(runeRing!.querySelectorAll('svg')).toHaveLength(5);
  });
});
