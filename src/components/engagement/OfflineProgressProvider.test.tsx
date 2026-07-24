import { render, screen, waitFor } from '@testing-library/react';
import { OfflineProgressProvider } from './OfflineProgressProvider';
import { useNotificationStore } from '@/lib/stores/notificationStore';

const mockUseOfflineProgress = jest.fn();
jest.mock('@/hooks/useOfflineProgress', () => ({
  useOfflineProgress: () => mockUseOfflineProgress(),
}));

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, isAuthenticated: false }),
}));

const progress = {
  elapsedMs: 2 * 60 * 60 * 1000,
  elapsedHours: 2,
  energyRestored: 3,
  passiveDnaEarned: 20,
  shouldShowModal: true,
  hasRewards: true,
};

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    progress: null,
    showModal: false,
    isLoading: false,
    error: null,
    claimed: false,
    claimRewards: jest.fn().mockResolvedValue(true),
    dismissModal: jest.fn(),
    confirmedRewards: null,
    ...overrides,
  };
}

describe('OfflineProgressProvider', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
    mockUseOfflineProgress.mockReturnValue(hookState());
  });

  it('renders children', () => {
    render(
      <OfflineProgressProvider>
        <div data-testid="child">Child Content</div>
      </OfflineProgressProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('publishes rewards without automatically opening a modal', async () => {
    mockUseOfflineProgress.mockReturnValue(hookState({ progress, showModal: true }));

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );

    expect(screen.queryByRole('dialog', { name: /welcome back/i })).toBeNull();
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications['offline-rewards']).toMatchObject({
        badgeKind: 'exclamation',
        clearOnOpen: false,
        href: '/#offline-rewards',
      });
    });
  });

  it('opens the reward dialog only after the player follows its notification', async () => {
    window.history.replaceState(null, '', '/#offline-rewards');
    mockUseOfflineProgress.mockReturnValue(hookState({ progress, showModal: true }));

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );

    expect(await screen.findByRole('dialog', { name: /welcome back/i })).toBeInTheDocument();
  });
});
