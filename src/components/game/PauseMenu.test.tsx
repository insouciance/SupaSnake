import { render, screen } from '@testing-library/react';
import { PauseMenu } from './PauseMenu';

describe('PauseMenu', () => {
  it('uses capability-aware payout previews when the game page supplies them', () => {
    render(
      <PauseMenu
        dynasty="PRIMAL"
        score={500}
        dnaCollected={100}
        heldMutations={[{ id: 'compound_interest', atFood: 20 }]}
        bankDna={321}
        crashDna={123}
        onResume={jest.fn()}
        onQuit={jest.fn()}
      />
    );
    expect(screen.getByText('Bank / crash value').parentElement).toHaveTextContent(
      '321 / 123'
    );
  });
});
