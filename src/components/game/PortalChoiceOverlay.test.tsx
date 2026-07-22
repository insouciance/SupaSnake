import { act, fireEvent, render, screen } from '@testing-library/react';
import { PortalChoiceOverlay, StrainSurgeOverlay } from './PortalChoiceOverlay';
import { CHOICE_INPUT_LOCK_MS } from './MutationChoiceOverlay';

describe('PortalChoiceOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the payout tradeoff and disables an ineligible infuse', () => {
    render(<PortalChoiceOverlay canInfuse={false} infusesUsed={0} snakeLength={6} bankDna={400} crashDna={180} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-bank')).toHaveTextContent('400 DNA');
    expect(screen.getByTestId('portal-infuse')).toBeDisabled();
    expect(screen.getByTestId('portal-infuse')).toHaveTextContent('Needs length 8');
  });

  it('preserves the input lock and resolves PASS explicitly', () => {
    const onPass = jest.fn();
    render(<PortalChoiceOverlay canInfuse infusesUsed={1} snakeLength={12} bankDna={400} crashDna={180} onBank={jest.fn()} onPass={onPass} onInfuse={jest.fn()} />);
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it('renders a surge choice at the six-gene cap', () => {
    render(<StrainSurgeOverlay strains={['AURUM', 'UMBRA']} onChoose={jest.fn()} />);
    expect(screen.getByTestId('surge-AURUM')).toBeInTheDocument();
    expect(screen.getByTestId('surge-UMBRA')).toBeInTheDocument();
  });
});
