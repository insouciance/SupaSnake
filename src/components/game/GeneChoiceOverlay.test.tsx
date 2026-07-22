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
    fireEvent.click(screen.getByTestId('gene-option-0'));
    expect(onChoose).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
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
});
