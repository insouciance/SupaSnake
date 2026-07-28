import { act, fireEvent, render, screen } from '@testing-library/react';
import { PortalChoiceOverlay, StrainSurgeOverlay } from './PortalChoiceOverlay';
import { CHOICE_INPUT_LOCK_MS } from './MutationChoiceOverlay';

const CADENCE = { firstExitAtFood: 15, intervalBase: 12, intervalJitter: 4 };

describe('PortalChoiceOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the payout tradeoff and disables an ineligible infuse', () => {
    render(<PortalChoiceOverlay canInfuse={false} infusesUsed={0} snakeLength={6} bankDna={400} crashDna={180} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Exit Portal' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('portal-bank')).toHaveTextContent('400 DNA');
    expect(screen.getByTestId('portal-infuse')).toBeDisabled();
    expect(screen.getByTestId('portal-infuse')).toHaveTextContent('Needs length 8');
  });

  it('quotes the carry on BOTH branches before the choice', () => {
    // WP-3.10: the decision is now "what is the stake", so the card has to
    // price passing as well as banking. At the first door the carry sits at
    // its origin: bank x1.25 (exactly the pre-carry flat value) and salvage
    // x1, because nothing has been declined yet.
    render(<PortalChoiceOverlay canInfuse infusesUsed={0} snakeLength={12} bankDna={400} crashDna={400} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-bank-carry')).toHaveTextContent('×1.25');
    const pass = screen.getByTestId('portal-pass-carry');
    // Passing raises the bank and lowers the salvage, and the card says so.
    expect(pass).toHaveTextContent('×1.25');
    expect(pass).toHaveTextContent('×1.5625');
    expect(pass).toHaveTextContent('×0.74');
    // The interval is interpolated from the dynasty's cadence, never a
    // literal - the "12±4" that used to be hardcoded here is exactly the
    // class of copy that goes stale silently.
    expect(screen.getByTestId('portal-pass')).toHaveTextContent('12±4 foods');
  });

  it('names how many doors are already behind the player', () => {
    render(<PortalChoiceOverlay canInfuse infusesUsed={0} snakeLength={12} bankDna={400} crashDna={180} doorsPassed={3} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-bank-carry')).toHaveTextContent('3 passed');
  });

  it('preserves the input lock and resolves PASS explicitly', () => {
    const onPass = jest.fn();
    render(<PortalChoiceOverlay canInfuse infusesUsed={1} snakeLength={12} bankDna={400} crashDna={180} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={onPass} onInfuse={jest.fn()} />);
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('portal-bank')).toHaveFocus();
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it('renders a surge choice at the six-gene cap', () => {
    render(<StrainSurgeOverlay strains={['AURUM', 'UMBRA']} onChoose={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Strain Surge' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('surge-AURUM')).toBeInTheDocument();
    expect(screen.getByTestId('surge-AURUM')).toHaveFocus();
    expect(screen.getByTestId('surge-UMBRA')).toBeInTheDocument();
  });
});
