import { render, screen } from '@testing-library/react';
import { HomeCodexRelic } from './HomeCodexRelic';

describe('HomeCodexRelic', () => {
  it('makes the Genome vocabulary visible without adding a labelled command', () => {
    render(<HomeCodexRelic />);
    const relic = screen.getByRole('link', { name: 'Genome Research' });
    expect(relic).toHaveAttribute('href', '/codex');
    expect(relic).toHaveClass('h-12', 'w-12');
    expect(relic.querySelectorAll('svg')).toHaveLength(5);
  });
});
