/**
 * Navigation Rail Tests
 * Verifies rail nodes, feature-flagged social links (Leaderboard, Clan),
 * the flag-gated Serpent node (off by default), the contextual Home node and
 * the You node (AccountChip).
 */

import { render, screen } from '@testing-library/react';
import { Navigation } from './Navigation';
import { GAME_CONFIG } from '@/shared/config/game';
import { SERPENT_V1_ENABLED } from '@/lib/serpent/config';
import {
  NOTIFICATION_TARGETS,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

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

  it('omits the Serpent node while NEXT_PUBLIC_SERPENT_V1 is off (the default)', () => {
    // The rollback path is tested, never inferred from an omitted flag. With
    // the flag down the rail must not signpost the hunt — while /serpent
    // itself still resolves, because Rule 14 makes a Serpent week a linkable
    // artifact and a link that dies on a flag flip is not one.
    expect(SERPENT_V1_ENABLED).toBe(false);

    render(<Navigation />);

    expect(screen.queryByRole('link', { name: 'Serpent' })).not.toBeInTheDocument();
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
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });

    render(<Navigation />);

    expect(screen.getByRole('status', { name: 'New Lab activity' })).toHaveTextContent('');
  });

  it('makes a quiet recognition dot open its newest exact artifact', () => {
    useNotificationStore.getState().replaceServerItems([{
      id: 'mastery-moment',
      kind: 'recognition',
      status: 'unseen',
      destination: 'mastery',
      headline: 'PRIMAL M4',
      momentId: 'moment-1',
      artifactRef: 'PRIMAL',
      source: { type: 'run', id: 'session-1' },
      createdAt: '2026-07-30T12:00:00.000Z',
    }]);

    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute(
      'href',
      '/lab?dynasty=PRIMAL#mastery-PRIMAL'
    );
  });
});
