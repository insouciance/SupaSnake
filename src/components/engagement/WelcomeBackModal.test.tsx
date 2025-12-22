/**
 * WelcomeBackModal Component Tests
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeBackModal } from './WelcomeBackModal';
import type { OfflineProgress } from '@/lib/progression/offlineProgress';

describe('WelcomeBackModal', () => {
  const defaultProgress: OfflineProgress = {
    elapsedMs: 2 * 60 * 60 * 1000, // 2 hours
    elapsedHours: 2,
    energyRestored: 3,
    passiveDnaEarned: 20,
    shouldShowModal: true,
    hasRewards: true,
  };

  const defaultProps = {
    isVisible: true,
    progress: defaultProgress,
    onClaim: jest.fn(),
    onDismiss: jest.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders when isVisible is true', () => {
      render(<WelcomeBackModal {...defaultProps} />);
      expect(screen.getByText('Welcome Back!')).toBeInTheDocument();
    });

    it('does not render when isVisible is false', () => {
      render(<WelcomeBackModal {...defaultProps} isVisible={false} />);
      expect(screen.queryByText('Welcome Back!')).not.toBeInTheDocument();
    });

    it('displays elapsed time', () => {
      render(<WelcomeBackModal {...defaultProps} />);
      expect(screen.getByText(/2 hours/)).toBeInTheDocument();
    });

    it('displays energy restored', () => {
      render(<WelcomeBackModal {...defaultProps} />);
      expect(screen.getByText('+3')).toBeInTheDocument();
      expect(screen.getByText('Energy Restored')).toBeInTheDocument();
    });

    it('displays DNA earned', () => {
      render(<WelcomeBackModal {...defaultProps} />);
      expect(screen.getByText('+20')).toBeInTheDocument();
      expect(screen.getByText('DNA Gathered')).toBeInTheDocument();
    });
  });

  describe('formatDuration', () => {
    it('formats singular hour', () => {
      const progress = { ...defaultProgress, elapsedMs: 1 * 60 * 60 * 1000 };
      render(<WelcomeBackModal {...defaultProps} progress={progress} />);
      expect(screen.getByText(/1 hour/)).toBeInTheDocument();
    });

    it('formats hours and minutes', () => {
      const progress = { ...defaultProgress, elapsedMs: 1.5 * 60 * 60 * 1000 };
      render(<WelcomeBackModal {...defaultProps} progress={progress} />);
      expect(screen.getByText(/1 hour 30 minutes/)).toBeInTheDocument();
    });

    it('caps display at 24+ hours', () => {
      const progress = { ...defaultProgress, elapsedMs: 48 * 60 * 60 * 1000 };
      render(<WelcomeBackModal {...defaultProps} progress={progress} />);
      expect(screen.getByText(/24\+ hours/)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClaim when claim button is clicked', () => {
      const onClaim = jest.fn();
      render(<WelcomeBackModal {...defaultProps} onClaim={onClaim} />);

      fireEvent.click(screen.getByRole('button', { name: /claim rewards/i }));
      expect(onClaim).toHaveBeenCalledTimes(1);
    });

    it('calls onDismiss when dismiss button is clicked', () => {
      const onDismiss = jest.fn();
      render(<WelcomeBackModal {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /later/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('disables claim button when isLoading is true', () => {
      render(<WelcomeBackModal {...defaultProps} isLoading={true} />);

      const claimButton = screen.getByRole('button', { name: /claiming/i });
      expect(claimButton).toBeDisabled();
    });
  });

  describe('edge cases', () => {
    it('handles zero energy restored', () => {
      const progress = { ...defaultProgress, energyRestored: 0 };
      render(<WelcomeBackModal {...defaultProps} progress={progress} />);

      expect(screen.getByText('+0')).toBeInTheDocument();
    });

    it('handles zero DNA earned', () => {
      const progress = { ...defaultProgress, passiveDnaEarned: 0 };
      render(<WelcomeBackModal {...defaultProps} progress={progress} />);

      // Should still render with 0 DNA
      expect(screen.getByText('Welcome Back!')).toBeInTheDocument();
    });

    it('renders with null progress gracefully', () => {
      render(<WelcomeBackModal {...defaultProps} progress={null} />);
      expect(screen.queryByText('Welcome Back!')).not.toBeInTheDocument();
    });
  });
});
