import { fireEvent, render, screen } from '@testing-library/react';
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

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', is_anonymous: true },
    session: null,
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

  it('keeps the same four primary destinations on every route', () => {
    const { rerender } = render(<Navigation />);
    const expected = [
      ['Play', '/'],
      ['Lab', '/lab'],
      ['Compete', '/leaderboard'],
      ['You', '/profile'],
    ] as const;

    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }

    mockPathname = '/lab';
    rerender(<Navigation />);
    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('marks grouped competition routes as Compete without moving the destination', () => {
    mockPathname = '/clan/battle';
    render(<Navigation />);

    expect(screen.getByRole('link', { name: 'Compete' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Play' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('uses five fixed, unscaled mobile cells with at least 44px targets', () => {
    render(<Navigation />);

    const destinations = screen.getByTestId('primary-navigation-destinations');
    expect(destinations).toHaveClass('grid-cols-5');
    expect(destinations.className).not.toMatch(/scale-(?:75|\[)/);

    for (const name of ['Play', 'Lab', 'Compete', 'You', 'More']) {
      const target =
        name === 'More'
          ? screen.getByLabelText('More')
          : screen.getByRole('link', { name });
      expect(target).toHaveClass('min-w-[44px]');
      expect(target).not.toHaveClass('border');
    }
  });

  it('keeps secondary utilities and social shortcuts inside More', () => {
    expect(GAME_CONFIG.features.clans).toBe(true);
    render(<Navigation />);

    fireEvent.click(screen.getByLabelText('More'));
    expect(screen.getByTestId('navigation-more-menu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Clan/i })).toHaveAttribute('href', '/clan');
    expect(screen.getByRole('link', { name: /Shop/i })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(screen.getByTestId('account-chip')).toBeInTheDocument();
  });

  it('does not signpost Serpent from More while its flag is off', () => {
    expect(SERPENT_V1_ENABLED).toBe(false);
    render(<Navigation />);
    fireEvent.click(screen.getByLabelText('More'));
    expect(screen.queryByRole('link', { name: /Serpent/i })).not.toBeInTheDocument();
  });

  it('renders Lab attention from the shared notification state', () => {
    useNotificationStore.getState().publish({
      id: 'lab-discovery',
      title: 'Lab ready',
      description: 'Discover more snakes',
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });

    render(<Navigation />);
    expect(screen.getByRole('status', { name: 'New Lab activity' })).toBeInTheDocument();
  });

  it('makes a quiet Lab recognition dot open its exact artifact', () => {
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
