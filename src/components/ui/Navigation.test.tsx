/**
 * Navigation Rail Tests
 * Verifies rail nodes, feature-flagged social links (Leaderboard, Clan),
 * the contextual Home node and the You node (AccountChip).
 */

import { render, screen } from '@testing-library/react';
import { Navigation } from './Navigation';
import { GAME_CONFIG } from '@/shared/config/game';
import { useNotificationStore } from '@/lib/stores/notificationStore';

let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// The You node hosts the AccountChip (identity indicator)
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
  beforeEach(() => {
    mockPathname = '/';
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  });

  it('renders the core rail nodes with game aria labels', () => {
    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab');
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
  });

  it('omits the Home node on the home screen (the wordmark is home)', () => {
    render(<Navigation />);

    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('shows a Home node on non-home screens', () => {
    mockPathname = '/lab';
    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
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

  it('marks the active node with aria-current', () => {
    mockPathname = '/lab';
    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Shop' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('mounts the account identity chip (You node)', () => {
    render(<Navigation />);

    expect(screen.getByTestId('account-chip')).toBeInTheDocument();
  });

  it('renders Lab activity from the shared notification state', () => {
    useNotificationStore.getState().publish({
      id: 'lab-discovery',
      title: 'Lab ready',
      description: 'Discover more snakes',
      destination: 'lab',
      badgeKind: 'exclamation',
    });

    render(<Navigation />);

    expect(screen.getByRole('status', { name: 'New Lab activity' })).toHaveTextContent('!');
  });
});
