import { act, fireEvent, render, screen } from '@testing-library/react';
import { GeneChoiceOverlay } from './GeneChoiceOverlay';
import { CHOICE_INPUT_LOCK_MS } from './MutationChoiceOverlay';

describe('GeneChoiceOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows strain tags, threshold hints, and hides an undiscovered splice name', () => {
    render(
      <GeneChoiceOverlay
        options={['compound_interest', 'tithe']}
        held={[{ id: 'gold_trail', atFood: 20 }]}
        strainCounts={{ AURUM: 2 }}
        showStrains
        splicesUnlocked
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Gene Offer' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getAllByTestId('strain-chip-AURUM')).toHaveLength(2);
    expect(screen.getByTestId('gene-fusion-0')).toHaveTextContent('Fuses: ???');
    expect(screen.getAllByText(/Gilded Wake/).length).toBeGreaterThan(0);
  });

  it('reveals a known splice and preserves the 300ms input lock', () => {
    const onChoose = jest.fn();
    render(
      <GeneChoiceOverlay
        options={['compound_interest', 'tithe']}
        held={[{ id: 'gold_trail', atFood: 20 }]}
        strainCounts={{ AURUM: 1 }}
        showStrains
        splicesUnlocked
        discoveredSplices={['splice_dragon_hoard']}
        onChoose={onChoose}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByTestId('gene-fusion-0')).toHaveTextContent('Dragon Hoard');
    expect(screen.getByTestId('gene-option-0')).toBeDisabled();
    fireEvent.click(screen.getByTestId('gene-option-0'));
    expect(onChoose).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('gene-option-0')).toHaveFocus();
    fireEvent.click(screen.getByTestId('gene-option-0'));
    expect(onChoose).toHaveBeenCalledWith(0);
  });

  it('keeps strain and splice systems invisible before their FTUE gates', () => {
    render(
      <GeneChoiceOverlay
        options={['compound_interest', 'tithe']}
        held={[{ id: 'gold_trail', atFood: 20 }]}
        strainCounts={{ AURUM: 2 }}
        showStrains={false}
        splicesUnlocked={false}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.queryByTestId('strain-chip-AURUM')).toBeNull();
    expect(screen.queryByText(/Fuses:/)).toBeNull();
  });

  describe('PASS', () => {
    const base = {
      options: ['compound_interest', 'tithe'] as ['compound_interest', 'tithe'],
      held: [{ id: 'gold_trail' as const, atFood: 20 }],
      strainCounts: { AURUM: 2 },
      showStrains: true,
      splicesUnlocked: true,
    };

    it('is a third card carrying the Escape shortcut and the shipped testid', () => {
      const onDecline = jest.fn();
      render(<GeneChoiceOverlay {...base} onChoose={jest.fn()} onDecline={onDecline} />);
      const pass = screen.getByTestId('gene-decline');
      // e2e depends on both of these; the promotion to a card must not move
      // either one.
      expect(pass).toHaveAttribute('aria-keyshortcuts', 'Escape');
      expect(pass).toBeDisabled();

      act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onDecline).toHaveBeenCalledTimes(1);
      fireEvent.click(pass);
      expect(onDecline).toHaveBeenCalledTimes(2);
    });

    it('names the strain when passing will force the next slot 1', () => {
      render(
        <GeneChoiceOverlay
          {...base}
          pityStrain="FERAL"
          onChoose={jest.fn()}
          onDecline={jest.fn()}
        />
      );
      expect(screen.getByTestId('gene-decline-consequence')).toHaveTextContent(
        "Pass. Your next offer's first slot is forced to FERAL."
      );
    });

    it('falls back to the generic line when the pity rule will not fire', () => {
      render(<GeneChoiceOverlay {...base} onChoose={jest.fn()} onDecline={jest.fn()} />);
      expect(screen.getByTestId('gene-decline-consequence')).toHaveTextContent(
        'Pass. Keeps your six slots for the combo you want.'
      );
    });
  });
});
