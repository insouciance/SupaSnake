import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OfflineProgressProvider } from './OfflineProgressProvider';
import {
  dispatchNotificationAction,
  NOTIFICATION_TARGETS,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

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
        href: '/#offline-rewards',
        action: 'open-offline-rewards',
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

  it('opens Review rewards through the semantic notification action', async () => {
    mockUseOfflineProgress.mockReturnValue(hookState({ progress, showModal: true }));

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications['offline-rewards']).toBeDefined();
    });

    act(() => dispatchNotificationAction('open-offline-rewards'));

    expect(screen.getByRole('dialog', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('clears the reward attention only after a successful claim', async () => {
    const claimRewards = jest.fn().mockResolvedValue(true);
    mockUseOfflineProgress.mockReturnValue(
      hookState({ progress, showModal: true, claimRewards })
    );

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications['offline-rewards']).toBeDefined();
    });
    act(() => dispatchNotificationAction('open-offline-rewards'));
    fireEvent.click(screen.getByRole('button', { name: 'Claim Rewards' }));

    await waitFor(() => expect(claimRewards).toHaveBeenCalledTimes(1));
    expect(useNotificationStore.getState().notifications['offline-rewards']).toBeUndefined();
  });

  it('removes a persisted reward link when rewards are no longer available', async () => {
    useNotificationStore.getState().publish({
      id: 'offline-rewards',
      title: 'Offline rewards ready',
      description: 'Claim your rewards.',
      ...NOTIFICATION_TARGETS.offlineRewards,
      badgeKind: 'exclamation',
      attentionReason: 'reward-available',
    });

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications['offline-rewards']).toBeUndefined();
    });
  });

  it('preserves unresolved rewards when availability cannot be refreshed', () => {
    useNotificationStore.getState().publish({
      id: 'offline-rewards',
      title: 'Offline rewards ready',
      description: 'Claim your rewards.',
      ...NOTIFICATION_TARGETS.offlineRewards,
      badgeKind: 'exclamation',
      attentionReason: 'reward-available',
    });
    mockUseOfflineProgress.mockReturnValue(
      hookState({ error: 'Failed to fetch player data' })
    );

    render(
      <OfflineProgressProvider>
        <div>Content</div>
      </OfflineProgressProvider>
    );

    expect(useNotificationStore.getState().notifications['offline-rewards']).toBeDefined();
  });
});
