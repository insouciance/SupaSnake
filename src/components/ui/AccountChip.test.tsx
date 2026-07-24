/**
 * AccountChip Tests
 * The persistent identity indicator: guest chip with save-progress
 * affordance, registered avatar with popover (email, Settings, Sign out),
 * signed-out authentication dialog.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountChip } from './AccountChip';
import {
  dispatchNotificationAction,
  NOTIFICATION_TARGETS,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/auth/UpgradePrompt', () => ({
  AccountUpgradeModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="account-upgrade-modal" /> : null,
}));

const mockSignOut = jest.fn();

function setAuth(state: {
  user: { id: string; email?: string; is_anonymous?: boolean } | null;
  isAnonymous?: boolean;
  isLoading?: boolean;
}) {
  mockUseAuth.mockReturnValue({
    user: state.user,
    isAuthenticated: !!state.user,
    isAnonymous: state.isAnonymous ?? false,
    isLoading: state.isLoading ?? false,
    signOut: mockSignOut,
  });
}

describe('AccountChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  });

  it('renders nothing while auth is loading', () => {
    setAuth({ user: null, isLoading: true });
    render(<AccountChip />);

    expect(screen.queryByTestId('account-chip')).not.toBeInTheDocument();
  });

  it('opens authentication choices in a viewport-level dialog when fully signed out', () => {
    setAuth({ user: null });
    render(
      <div className="animate-fade-up overflow-hidden" data-testid="navigation-context">
        <AccountChip />
      </div>
    );

    const chip = screen.getByTestId('account-chip');
    // Square icon chip matching the rail rhythm - no inline "Sign in" text
    expect(chip).toHaveAttribute('aria-label', 'Sign in');
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(chip).not.toHaveTextContent(/sign in/i);

    chip.focus();
    fireEvent.click(chip);
    const dialog = screen.getByRole('dialog', { name: /join the run/i });
    const layer = dialog.closest('[data-modal-layer="true"]');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(layer?.parentElement).toBe(document.body);
    expect(layer).toHaveClass('fixed', 'inset-0', 'z-[100]');
    expect(screen.getByTestId('navigation-context')).not.toContainElement(dialog);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(chip).toHaveAttribute('aria-controls', 'account-auth-dialog');
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute(
      'href',
      '/signup'
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /join the run/i })).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  describe('guest (anonymous session)', () => {
    beforeEach(() => {
      setAuth({ user: { id: 'anon-1', is_anonymous: true }, isAnonymous: true });
    });

    it('shows only the calm GUEST identity before a post-run notification', () => {
      render(<AccountChip />);

      const chip = screen.getByTestId('account-chip');
      expect(chip).toHaveTextContent(/guest/i);
      expect(chip).not.toHaveTextContent(/save progress/i);
      expect(chip).toHaveAccessibleName('Playing as guest');
    });

    it('surfaces save progress when the centralized post-run badge exists', () => {
      useNotificationStore.getState().publish({
        id: 'save-progress',
        title: 'Keep your collection',
        description: 'Optional account',
        ...NOTIFICATION_TARGETS.saveProgress,
        badgeKind: 'exclamation',
        attentionReason: 'action-required',
      });
      render(<AccountChip />);

      const chip = screen.getByTestId('account-chip');
      expect(chip).toHaveTextContent(/save progress/i);
      expect(chip).toHaveAccessibleName(/save progress available/i);
    });

    it('opens the account upgrade modal on tap', () => {
      render(<AccountChip />);

      expect(screen.queryByTestId('account-upgrade-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('account-chip'));
      expect(screen.getByTestId('account-upgrade-modal')).toBeInTheDocument();
    });

    it('opens the existing upgrade modal for a semantic notification action', () => {
      render(<AccountChip />);

      act(() => dispatchNotificationAction('open-save-progress'));

      expect(screen.getByTestId('account-upgrade-modal')).toBeInTheDocument();
    });
  });

  describe('registered account', () => {
    beforeEach(() => {
      setAuth({ user: { id: 'user-1', email: 'player@example.com' } });
    });

    it('shows the email-derived initial in the avatar square', () => {
      render(<AccountChip />);

      expect(screen.getByTestId('account-chip')).toHaveTextContent('P');
    });

    it('removes stale save-progress attention once the account is durable', async () => {
      useNotificationStore.getState().publish({
        id: 'save-progress',
        title: 'Keep your collection',
        description: 'Optional account',
        ...NOTIFICATION_TARGETS.saveProgress,
        badgeKind: 'exclamation',
        attentionReason: 'action-required',
      });

      render(<AccountChip />);

      await waitFor(() => {
        expect(useNotificationStore.getState().notifications['save-progress']).toBeUndefined();
      });
    });

    it('reveals email, Settings link and Sign out in the popover', () => {
      render(<AccountChip />);

      expect(screen.queryByTestId('account-chip-menu')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('account-chip'));

      const menu = screen.getByTestId('account-chip-menu');
      expect(menu).toHaveTextContent('player@example.com');
      expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
        'href',
        '/settings'
      );
      expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    });

    it('calls signOut from the popover', () => {
      render(<AccountChip />);

      fireEvent.click(screen.getByTestId('account-chip'));
      fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('account-chip-menu')).not.toBeInTheDocument();
    });

    it('toggles the popover closed on a second tap', () => {
      render(<AccountChip />);

      fireEvent.click(screen.getByTestId('account-chip'));
      expect(screen.getByTestId('account-chip-menu')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('account-chip'));
      expect(screen.queryByTestId('account-chip-menu')).not.toBeInTheDocument();
    });
  });
});
