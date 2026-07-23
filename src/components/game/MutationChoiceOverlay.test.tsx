import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  CHOICE_INPUT_LOCK_MS,
  MutationChoiceOverlay,
} from './MutationChoiceOverlay';

describe('MutationChoiceOverlay accessibility', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('announces the modal and focuses the first choice after the input lock', () => {
    const onChoose = jest.fn();
    render(
      <MutationChoiceOverlay
        options={['magnet_pulse', 'wall_rush']}
        onChoose={onChoose}
        onDecline={jest.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Mutation' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('mutation-option-0')).toBeDisabled();
    expect(screen.getByTestId('mutation-decline')).toBeDisabled();

    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('mutation-option-0')).toHaveFocus();
    fireEvent.keyDown(window, { key: '1' });
    expect(onChoose).toHaveBeenCalledWith(0);
  });
});
