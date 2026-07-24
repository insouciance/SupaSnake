import { fireEvent, render, screen } from '@testing-library/react';
import { AbandonRunDialog } from './AbandonRunDialog';

describe('AbandonRunDialog', () => {
  it('states the destructive consequences, traps focus, and cancels with Escape', () => {
    const onCancel = jest.fn();
    render(
      <AbandonRunDialog
        score={12840}
        dnaCollected={186}
        costsEnergy
        onCancel={onCancel}
        onConfirm={jest.fn()}
      />
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Abandon run?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Score 12,840 and 186 run DNA will not be recorded');
    expect(dialog).toHaveTextContent('Energy spent to launch this run is not returned');
    expect(screen.getByRole('button', { name: 'Keep planning' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('omits the Energy warning for Free Play and requires explicit confirmation', () => {
    const onConfirm = jest.fn();
    render(
      <AbandonRunDialog
        score={50}
        dnaCollected={0}
        costsEnergy={false}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByText(/Energy spent/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abandon run' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
