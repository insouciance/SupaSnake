/**
 * Signup page - journey fork tests
 *
 * An anonymous player with an active session must go through the UPGRADE
 * path (email attached to the SAME user id -> progress preserved), never a
 * fresh signUp that would orphan their guest progress.
 */

import { render, screen, waitFor } from '@testing-library/react';
import SignupPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(state: {
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading?: boolean;
}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: state.isAuthenticated,
    isAnonymous: state.isAnonymous,
    isLoading: state.isLoading ?? false,
    // Consumed by the embedded AccountUpgrade in the guest branch
    upgradeAnonymousToEmail: jest.fn(),
    signInWithOAuth: jest.fn(),
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    signInAnonymously: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  // Skip the age gate: this browser already verified 13+
  window.localStorage.setItem('age_verified', 'true');
});

describe('SignupPage journey fork', () => {
  it('routes an active guest through the upgrade path, not a fresh signup', async () => {
    setAuth({ isAuthenticated: true, isAnonymous: true });

    render(<SignupPage />);

    // Upgrade surface with progress-preserving copy
    await waitFor(() =>
      expect(screen.getByTestId('signup-upgrade-note')).toBeInTheDocument()
    );
    expect(
      screen.getByText(/progress will be attached to this account/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/protect your account/i)).toBeInTheDocument();

    // The plain signup form must NOT render for guests
    expect(
      screen.queryByRole('heading', { name: /create account/i })
    ).not.toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the regular signup form for signed-out visitors', async () => {
    setAuth({ isAuthenticated: false, isAnonymous: false });

    render(<SignupPage />);

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /create account/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByTestId('signup-upgrade-note')).not.toBeInTheDocument();
  });

  it('redirects already-registered users to the game', async () => {
    setAuth({ isAuthenticated: true, isAnonymous: false });

    render(<SignupPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/game'));
  });
});
