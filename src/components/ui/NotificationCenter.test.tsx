import { fireEvent, render, screen } from '@testing-library/react';
import {
  NOTIFICATION_TARGETS,
  subscribeNotificationAction,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { NotificationCenter } from './NotificationCenter';

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null }),
}));

jest.mock('@/lib/analytics/posthog', () => ({
  trackEvent: jest.fn(),
}));

function publishContracts() {
  useNotificationStore.getState().publish({
    id: 'contracts',
    title: 'Daily Contracts ready',
    description: 'Choose two contracts when you are ready.',
    ...NOTIFICATION_TARGETS.contracts,
    badgeKind: 'exclamation',
    attentionReason: 'action-required',
    actionLabel: 'Choose Contracts',
  });
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  });

  it('opens a viewport-fixed, internally scrollable dialog without clearing attention', () => {
    publishContracts();
    render(<NotificationCenter />);

    const trigger = screen.getByRole('button', {
      name: 'Notifications, 1 action available',
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0', 'overflow-hidden');
    expect(dialog).toHaveClass('max-h-full', 'overflow-hidden');
    expect(screen.getByTestId('notification-list')).toHaveClass(
      'overflow-y-auto',
      'overscroll-contain'
    );
    expect(screen.getByRole('button', { name: 'Close notifications' })).toBeInTheDocument();
    expect(useNotificationStore.getState().notifications.contracts).toBeDefined();
  });

  it('closes explicitly or with Escape and restores trigger focus', () => {
    publishContracts();
    render(<NotificationCenter />);

    const trigger = screen.getByRole('button', { name: /Notifications, 1 action/ });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }));
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('dispatches the semantic destination action and preserves unresolved attention', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNotificationAction('open-contracts', listener);
    publishContracts();
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications, 1 action/ }));
    fireEvent.click(screen.getByText('Choose Contracts'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().notifications.contracts).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    unsubscribe();
  });

  it('keeps long lists in one scroll region instead of growing beyond the viewport', () => {
    const publish = useNotificationStore.getState().publish;
    for (let index = 0; index < 30; index += 1) {
      publish({
        id: `attention-${index}`,
        title: `Action ${index + 1}`,
        description: 'A progression opportunity is available.',
        ...NOTIFICATION_TARGETS.lab,
        badgeKind: 'exclamation',
        attentionReason: 'action-required',
        actionLabel: 'Visit the Lab',
      });
    }
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: /Notifications, 30 actions/ }));

    expect(screen.getAllByRole('link')).toHaveLength(30);
    expect(screen.getByTestId('notification-list')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto'
    );
  });

  it('keeps recognition out of the global action inbox', () => {
    useNotificationStore.getState().publish({
      id: 'record-gold',
      title: 'Record reached Gold',
      description: 'See it in the Chronicle.',
      destination: 'records',
      href: '/profile#records',
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });
    render(<NotificationCenter />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    expect(screen.queryByText('Record reached Gold')).toBeNull();
  });
});
