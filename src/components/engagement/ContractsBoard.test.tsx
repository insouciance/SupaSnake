/**
 * ContractsBoard Tests - pick-2-of-3 selection, progress display, claim
 * flow, card state derivation and the mission-line summary helper.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ContractsBoard,
  getContractCardState,
  summarizeContracts,
  type ContractView,
} from './ContractsBoard';

function buildContract(overrides: Partial<ContractView> = {}): ContractView {
  return {
    contractId: 'banker',
    contractType: 'extract_n',
    name: 'Banker',
    description: 'Bank 3 extractions',
    params: { count: 3 },
    rewardDna: 400,
    rewardEnergy: 0,
    rewardXp: 150,
    offeredSlot: 1,
    picked: false,
    progress: { current: 0, target: 3 },
    completed: false,
    claimed: false,
    ...overrides,
  };
}

function buildBoard(): ContractView[] {
  return [
    buildContract(),
    buildContract({
      contractId: 'sprinter',
      contractType: 'extract_fast',
      name: 'Sprinter',
      description: 'Bank within 4 minutes of run start',
      rewardDna: 400,
      offeredSlot: 2,
      progress: { current: 0, target: 1 },
    }),
    buildContract({
      contractId: 'nerve',
      contractType: 'extract_nth_portal',
      name: 'Nerve',
      description: 'Pass 3 portals, bank the 4th - one run',
      rewardDna: 600,
      offeredSlot: 3,
      progress: { current: 0, target: 1 },
    }),
  ];
}

const noopPick = jest.fn(async () => true);
const noopClaim = jest.fn(async () => null);

function renderBoard(props: Partial<React.ComponentProps<typeof ContractsBoard>> = {}) {
  return render(
    <ContractsBoard
      isVisible
      contracts={buildBoard()}
      picksRemaining={2}
      streak={{ current: 5 }}
      onPick={noopPick}
      onClaim={noopClaim}
      onDismiss={jest.fn()}
      {...props}
    />
  );
}

describe('getContractCardState', () => {
  it('derives the full state ladder', () => {
    const base = { picked: false, completed: false, claimed: false };
    expect(getContractCardState(base, false)).toBe('offer');
    expect(getContractCardState(base, true)).toBe('selected');
    expect(getContractCardState({ ...base, picked: true }, false)).toBe('picked');
    expect(getContractCardState({ ...base, picked: true, completed: true }, false)).toBe(
      'complete'
    );
    expect(
      getContractCardState({ picked: true, completed: true, claimed: true }, false)
    ).toBe('claimed');
  });

  it('claimed wins over selection', () => {
    expect(
      getContractCardState({ picked: true, completed: true, claimed: true }, true)
    ).toBe('claimed');
  });
});

describe('summarizeContracts', () => {
  it('summarizes picked/completed/claimable for the mission line', () => {
    expect(
      summarizeContracts([
        { picked: true, completed: true, claimed: false },
        { picked: true, completed: false, claimed: false },
        { picked: false, completed: false, claimed: false },
      ])
    ).toEqual({ pickedCount: 2, completedCount: 1, claimable: true });
  });

  it('is not claimable when completed contracts are already claimed', () => {
    expect(
      summarizeContracts([
        { picked: true, completed: true, claimed: true },
        { picked: true, completed: false, claimed: false },
      ])
    ).toEqual({ pickedCount: 2, completedCount: 1, claimable: false });
  });

  it('handles an empty board', () => {
    expect(summarizeContracts([])).toEqual({
      pickedCount: 0,
      completedCount: 0,
      claimable: false,
    });
  });
});

describe('ContractsBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when hidden or empty', () => {
    const { container: hidden } = renderBoard({ isVisible: false });
    expect(hidden).toBeEmptyDOMElement();

    const { container: empty } = renderBoard({ contracts: [] });
    expect(empty).toBeEmptyDOMElement();
  });

  it('shows all 3 offers with objective, reward and the streak line', () => {
    renderBoard();

    expect(screen.getByText('Daily Contracts')).toBeInTheDocument();
    expect(screen.getByText('Bank 3 extractions')).toBeInTheDocument();
    expect(screen.getByText('Pass 3 portals, bank the 4th - one run')).toBeInTheDocument();
    expect(screen.getByText('600')).toBeInTheDocument();
    // WP-0.02: the streak is a count. It advertises no DNA multiplier
    // because there is no longer one to advertise (Constitution §8.5).
    expect(screen.getByText(/5-day streak/)).toBeInTheDocument();
    expect(screen.queryByText(/x1\.1/)).toBeNull();
    expect(screen.getByTestId('contract-card-banker')).toHaveAttribute('data-state', 'offer');
  });

  describe('pick phase (2 of 3)', () => {
    it('toggles selection and caps at picksRemaining', () => {
      renderBoard();

      fireEvent.click(screen.getByTestId('contract-card-banker'));
      fireEvent.click(screen.getByTestId('contract-card-sprinter'));
      expect(screen.getByTestId('contract-card-banker')).toHaveAttribute(
        'data-state',
        'selected'
      );
      expect(screen.getByTestId('contract-card-sprinter')).toHaveAttribute(
        'data-state',
        'selected'
      );

      // Third selection is refused at the cap
      fireEvent.click(screen.getByTestId('contract-card-nerve'));
      expect(screen.getByTestId('contract-card-nerve')).toHaveAttribute('data-state', 'offer');

      // Deselect frees a slot
      fireEvent.click(screen.getByTestId('contract-card-banker'));
      expect(screen.getByTestId('contract-card-banker')).toHaveAttribute('data-state', 'offer');
      fireEvent.click(screen.getByTestId('contract-card-nerve'));
      expect(screen.getByTestId('contract-card-nerve')).toHaveAttribute(
        'data-state',
        'selected'
      );
    });

    it('confirm button is disabled until a selection exists, then picks', async () => {
      const onPick = jest.fn(async () => true);
      renderBoard({ onPick });

      const confirm = screen.getByTestId('contracts-confirm');
      expect(confirm).toBeDisabled();
      expect(confirm).toHaveTextContent('Select Contracts');

      fireEvent.click(screen.getByTestId('contract-card-banker'));
      expect(confirm).toHaveTextContent('Start 1 Contract');
      fireEvent.click(screen.getByTestId('contract-card-nerve'));
      expect(confirm).toHaveTextContent('Start 2 Contracts');

      fireEvent.click(confirm);
      await waitFor(() => {
        expect(onPick).toHaveBeenCalledWith(['banker', 'nerve']);
      });
    });

    it('with one pick remaining only one card can be selected', () => {
      const contracts = buildBoard();
      contracts[0] = buildContract({ picked: true });
      renderBoard({ contracts, picksRemaining: 1 });

      fireEvent.click(screen.getByTestId('contract-card-sprinter'));
      fireEvent.click(screen.getByTestId('contract-card-nerve'));

      expect(screen.getByTestId('contract-card-sprinter')).toHaveAttribute(
        'data-state',
        'selected'
      );
      expect(screen.getByTestId('contract-card-nerve')).toHaveAttribute('data-state', 'offer');
      // Already-picked card is not selectable and keeps its state
      fireEvent.click(screen.getByTestId('contract-card-banker'));
      expect(screen.getByTestId('contract-card-banker')).toHaveAttribute(
        'data-state',
        'picked'
      );
    });
  });

  describe('progress phase', () => {
    function pickedBoard(): ContractView[] {
      const contracts = buildBoard();
      contracts[0] = buildContract({ picked: true, progress: { current: 1, target: 3 } });
      contracts[1] = buildContract({
        contractId: 'sprinter',
        contractType: 'extract_fast',
        name: 'Sprinter',
        offeredSlot: 2,
        picked: true,
        completed: true,
        progress: { current: 1, target: 1 },
      });
      return contracts;
    }

    it('shows progress bars for picked contracts and no confirm button', () => {
      renderBoard({ contracts: pickedBoard(), picksRemaining: 0 });

      expect(screen.queryByTestId('contracts-confirm')).not.toBeInTheDocument();
      expect(screen.getByText('1/3')).toBeInTheDocument();
      expect(
        screen.getByRole('progressbar', { name: /banker progress/i })
      ).toHaveAttribute('aria-valuenow', '1');
      // Unpicked leftover offer stays visible but is not selectable
      expect(screen.getByTestId('contract-card-nerve')).toHaveAttribute('data-state', 'offer');
    });

    it('claims a completed contract via its claim button', async () => {
      const onClaim = jest.fn(async () => ({
        contractId: 'sprinter',
        dnaGranted: 400,
        energyGranted: 0,
        xpGranted: 150,
      }));
      renderBoard({ contracts: pickedBoard(), picksRemaining: 0, onClaim });

      const claim = screen.getByTestId('contract-claim-sprinter');
      expect(claim).toHaveTextContent('Claim 400 DNA');
      fireEvent.click(claim);

      await waitFor(() => {
        expect(onClaim).toHaveBeenCalledWith('sprinter');
      });
    });

    it('renders claimed contracts as checked and buttonless', () => {
      const contracts = pickedBoard();
      contracts[1] = { ...contracts[1], claimed: true };
      renderBoard({ contracts, picksRemaining: 0 });

      expect(screen.getByTestId('contract-card-sprinter')).toHaveAttribute(
        'data-state',
        'claimed'
      );
      expect(screen.queryByTestId('contract-claim-sprinter')).not.toBeInTheDocument();
      expect(screen.getByLabelText('claimed')).toBeInTheDocument();
    });
  });

  it('dismiss calls onDismiss', () => {
    const onDismiss = jest.fn();
    renderBoard({ onDismiss });

    fireEvent.click(screen.getByText('Maybe Later'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
