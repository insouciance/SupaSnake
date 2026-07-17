/**
 * Navigation Component Tests
 * Verifies feature-flagged social links (Leaderboard, Clan)
 */

import { render, screen } from '@testing-library/react';
import { Navigation } from './Navigation';
import { GAME_CONFIG } from '@/shared/config/game';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

jest.mock('@/lib/store/gameStore', () => ({
  useGameStore: () => ({ energy: 3 }),
}));

// The command bar hosts the AccountChip (identity indicator)
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', is_anonymous: true },
    isAuthenticated: true,
    isAnonymous: true,
    isLoading: false,
    signOut: jest.fn(),
  }),
}));

describe('Navigation', () => {
  it('renders core links', () => {
    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/game');
    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab');
  });

  it('renders Leaderboard link when leaderboards flag is enabled', () => {
    expect(GAME_CONFIG.features.leaderboards).toBe(true);

    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute(
      'href',
      '/leaderboard'
    );
  });

  it('renders Clan link when clans flag is enabled', () => {
    expect(GAME_CONFIG.features.clans).toBe(true);

    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Clan' })).toHaveAttribute('href', '/clan');
  });

  it('displays current energy against the cap', () => {
    render(<Navigation />);

    expect(
      screen.getByText(`3/${GAME_CONFIG.economy.energy.maxEnergy}`)
    ).toBeInTheDocument();
  });

  it('mounts the account identity chip', () => {
    render(<Navigation />);

    expect(screen.getByTestId('account-chip')).toBeInTheDocument();
  });
});
