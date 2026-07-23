import { fireEvent, render, screen } from '@testing-library/react';
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

  it('announces a modal, traps focus, and restores the prior target', () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();

    const { unmount } = render(
      <PauseMenu
        dynasty="PRIMAL"
        score={0}
        dnaCollected={0}
        onResume={jest.fn()}
        onQuit={jest.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Paused' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    const resume = screen.getByRole('button', { name: /plan next move/i });
    const quit = screen.getByRole('button', { name: /quit to menu/i });
    expect(resume).toHaveFocus();

    quit.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(resume).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(quit).toHaveFocus();

    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });
});
