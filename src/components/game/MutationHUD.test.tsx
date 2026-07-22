import { render, screen } from '@testing-library/react';
import { MutationHUD } from './MutationHUD';

describe('MutationHUD', () => {
  it('keeps raw genes as separate slots when splices are gated off', () => {
    render(
      <MutationHUD
        held={[
          { id: 'gold_trail', atFood: 15 },
          { id: 'compound_interest', atFood: 30 },
        ]}
        phoenixTriggered={false}
      />
    );
    expect(screen.getByTestId('mutation-chip-gold_trail')).toBeInTheDocument();
    expect(screen.getByTestId('mutation-chip-compound_interest')).toBeInTheDocument();
    expect(screen.queryByTestId('splice-chip-splice_dragon_hoard')).toBeNull();
  });

  it('renders a discovered fusion as one braided held slot', () => {
    render(
      <MutationHUD
        held={[
          { id: 'gold_trail', atFood: 15 },
          { id: 'compound_interest', atFood: 30 },
          { id: 'overgrowth', atFood: 45 },
        ]}
        phoenixTriggered={false}
        splicesEnabled
      />
    );
    const splice = screen.getByTestId('splice-chip-splice_dragon_hoard');
    expect(splice).toHaveAttribute('data-slot-kind', 'splice');
    expect(splice).toHaveAttribute('title', expect.stringContaining('one held slot'));
    expect(screen.getByTestId('mutation-chip-overgrowth')).toBeInTheDocument();
    expect(screen.queryByTestId('mutation-chip-gold_trail')).toBeNull();
    expect(screen.queryByTestId('mutation-chip-compound_interest')).toBeNull();
  });
});
