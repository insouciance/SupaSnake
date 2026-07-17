/**
 * AccountChip Tests
 * The persistent identity indicator: guest chip with save-progress
 * affordance, registered avatar with popover (email, Settings, Sign out),
 * signed-out fallback link.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { AccountChip } from './AccountChip';

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
  });

  it('renders nothing while auth is loading', () => {
    setAuth({ user: null, isLoading: true });
    render(<AccountChip />);

    expect(screen.queryByTestId('account-chip')).not.toBeInTheDocument();
  });

  it('links to /login when fully signed out', () => {
    setAuth({ user: null });
    render(<AccountChip />);

    const chip = screen.getByTestId('account-chip');
    expect(chip).toHaveAttribute('href', '/login');
    expect(chip).toHaveTextContent(/sign in/i);
  });

  describe('guest (anonymous session)', () => {
    beforeEach(() => {
      setAuth({ user: { id: 'anon-1', is_anonymous: true }, isAnonymous: true });
    });

    it('shows the GUEST identity with a save-progress affordance', () => {
      render(<AccountChip />);

      const chip = screen.getByTestId('account-chip');
      expect(chip).toHaveTextContent(/guest/i);
      expect(chip).toHaveTextContent(/save progress/i);
    });

    it('opens the account upgrade modal on tap', () => {
      render(<AccountChip />);

      expect(screen.queryByTestId('account-upgrade-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('account-chip'));
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
