/**
 * The save-account panel must never contain a path that loses the account
 * (WP-E; PEO §6 "adjacent defects", server contract §10.2).
 *
 * The removed OAuth buttons called `signInWithOAuth`, which signs into a
 * DIFFERENT user and strands the guest's DNA, snakes and records on an
 * anonymous id nobody can authenticate into again. These tests are the
 * regression guard: the panel offers the id-preserving email path and nothing
 * else, and it must not reacquire an OAuth control by accident.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountUpgrade } from './AccountUpgrade';

const mockUpgradeAnonymousToEmail = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('@/components/identity/HandleClaimModal', () => ({
  HandleClaimModal: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpgradeAnonymousToEmail.mockResolvedValue({
    error: null,
    pendingEmailConfirmation: false,
  });
  mockUseAuth.mockReturnValue({
    isAnonymous: true,
    upgradeAnonymousToEmail: mockUpgradeAnonymousToEmail,
    // Deliberately still provided by the context: `LoginForm` needs it. The
    // panel must simply never reach for it.
    signInWithOAuth: mockSignInWithOAuth,
    isLoading: false,
  });
});

describe('AccountUpgrade — the account-preserving path only', () => {
  it('offers no OAuth control that would sign into a different account', () => {
    render(<AccountUpgrade />);
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /apple/i })).toBeNull();
    expect(screen.queryByText(/or with email/i)).toBeNull();
  });

  it('never calls signInWithOAuth, whatever the player presses', () => {
    render(<AccountUpgrade />);
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button);
    }
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it('keeps the email upgrade, which preserves the anonymous user id', async () => {
    render(<AccountUpgrade />);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: 'player@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(mockUpgradeAnonymousToEmail).toHaveBeenCalledWith(
        'player@example.com',
        'Password123'
      )
    );
    expect(await screen.findByTestId('upgrade-success')).toBeInTheDocument();
  });

  it('still names the panel honestly for a guest', () => {
    render(<AccountUpgrade />);
    expect(screen.getByText(/protect your account/i)).toBeInTheDocument();
  });

  it('renders nothing for an account that is already saved', () => {
    mockUseAuth.mockReturnValue({
      isAnonymous: false,
      upgradeAnonymousToEmail: mockUpgradeAnonymousToEmail,
      signInWithOAuth: mockSignInWithOAuth,
      isLoading: false,
    });
    const { container } = render(<AccountUpgrade />);
    expect(container).toBeEmptyDOMElement();
  });
});
