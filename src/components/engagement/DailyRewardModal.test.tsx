/**
 * DailyRewardModal Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  DailyRewardModal,
  getDayState,
  type DailyRewardTier,
  type DailyClaimResult,
} from './DailyRewardModal';

function buildTiers(): DailyRewardTier[] {
  return Array.from({ length: 28 }, (_, i) => {
    const day = i + 1;
    const isMilestone = day === 7 || day === 14 || day === 21;
    const isCycleComplete = day === 28;
    return {
      day,
      dna: isCycleComplete ? 1000 : isMilestone ? 200 : 50,
      energy: isCycleComplete ? 10 : isMilestone ? 2 : 0,
      bonusType: isCycleComplete ? 'cycle_complete' : isMilestone ? 'milestone' : null,
    };
  });
}

describe('getDayState', () => {
  it('marks days before currentDay as claimed', () => {
    expect(getDayState(1, 3, true)).toBe('claimed');
    expect(getDayState(2, 3, true)).toBe('claimed');
  });

  it('marks the current day as today when claimable', () => {
    expect(getDayState(3, 3, true)).toBe('today');
  });

  it('marks the current day as future when already claimed today', () => {
    expect(getDayState(3, 3, false)).toBe('future');
  });

  it('marks later days as future', () => {
    expect(getDayState(4, 3, true)).toBe('future');
    expect(getDayState(28, 3, true)).toBe('future');
  });
});

describe('DailyRewardModal', () => {
  const claimResult: DailyClaimResult = {
    dayClaimed: 3,
    dnaGranted: 50,
    energyGranted: 0,
    nextDay: 4,
    cycleCompleted: false,
  };

  const defaultProps = {
    isVisible: true,
    currentDay: 3,
    canClaimToday: true,
    tiers: buildTiers(),
    streak: { current: 5, multiplier: 1.1 },
    onClaim: jest.fn().mockResolvedValue(claimResult),
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the calendar when visible', () => {
      render(<DailyRewardModal {...defaultProps} />);
      expect(screen.getByText('Daily Rewards')).toBeInTheDocument();
    });

    it('does not render when not visible', () => {
      render(<DailyRewardModal {...defaultProps} isVisible={false} />);
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });

    it('does not render without tiers', () => {
      render(<DailyRewardModal {...defaultProps} tiers={[]} />);
      expect(screen.queryByText('Daily Rewards')).not.toBeInTheDocument();
    });

    it('renders all 28 day cells', () => {
      render(<DailyRewardModal {...defaultProps} />);
      for (let day = 1; day <= 28; day++) {
        expect(screen.getByTestId(`day-${day}`)).toBeInTheDocument();
      }
    });

    it('shows streak info', () => {
      render(<DailyRewardModal {...defaultProps} />);
      expect(screen.getByText(/5-day streak/)).toBeInTheDocument();
    });
  });

  describe('day states', () => {
    it('marks past days claimed, current day today, later days future', () => {
      render(<DailyRewardModal {...defaultProps} />);
      expect(screen.getByTestId('day-1')).toHaveAttribute('data-state', 'claimed');
      expect(screen.getByTestId('day-2')).toHaveAttribute('data-state', 'claimed');
      expect(screen.getByTestId('day-3')).toHaveAttribute('data-state', 'today');
      expect(screen.getByTestId('day-4')).toHaveAttribute('data-state', 'future');
    });

    it('highlights milestone days (7/14/21/28)', () => {
      render(<DailyRewardModal {...defaultProps} />);
      for (const day of [7, 14, 21, 28]) {
        expect(screen.getByTestId(`day-${day}`)).toHaveAttribute('data-milestone', 'true');
      }
      expect(screen.getByTestId('day-5')).toHaveAttribute('data-milestone', 'false');
    });
  });

  describe('claim flow', () => {
    it('claims and shows the granted amounts', async () => {
      render(<DailyRewardModal {...defaultProps} />);

      fireEvent.click(screen.getByText('Claim Day 3 Reward'));

      await waitFor(() => {
        expect(screen.getByText('Day 3 Claimed!')).toBeInTheDocument();
      });
      expect(defaultProps.onClaim).toHaveBeenCalledTimes(1);
      expect(screen.getByText('+50')).toBeInTheDocument();
    });

    it('announces cycle completion on day 28', async () => {
      const onClaim = jest.fn().mockResolvedValue({
        dayClaimed: 28,
        dnaGranted: 1000,
        energyGranted: 10,
        nextDay: 1,
        cycleCompleted: true,
      });
      render(<DailyRewardModal {...defaultProps} currentDay={28} onClaim={onClaim} />);

      fireEvent.click(screen.getByText('Claim Day 28 Reward'));

      await waitFor(() => {
        expect(screen.getByText(/Cycle complete/)).toBeInTheDocument();
      });
      expect(screen.getByText('+1000')).toBeInTheDocument();
    });

    it('stays on the calendar when the claim fails', async () => {
      const onClaim = jest.fn().mockResolvedValue(null);
      render(<DailyRewardModal {...defaultProps} onClaim={onClaim} />);

      fireEvent.click(screen.getByText('Claim Day 3 Reward'));

      await waitFor(() => {
        expect(onClaim).toHaveBeenCalled();
      });
      expect(screen.getByText('Daily Rewards')).toBeInTheDocument();
      expect(screen.queryByText('Day 3 Claimed!')).not.toBeInTheDocument();
    });

    it('disables the claim button when already claimed today', () => {
      render(<DailyRewardModal {...defaultProps} canClaimToday={false} />);

      const button = screen.getByText('Come Back Tomorrow');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(defaultProps.onClaim).not.toHaveBeenCalled();
    });

    it('dismisses via Maybe Later', () => {
      render(<DailyRewardModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Maybe Later'));
      expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses from the success state', async () => {
      render(<DailyRewardModal {...defaultProps} />);
      fireEvent.click(screen.getByText('Claim Day 3 Reward'));

      await waitFor(() => {
        expect(screen.getByText('Awesome!')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Awesome!'));
      expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
