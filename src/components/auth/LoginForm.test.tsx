/**
 * LoginForm - signup branch (auto-confirm vs verify-email) + error copy
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm, describeAuthError } from './LoginForm';

const mockSignUpWithEmail = jest.fn();
const mockSignInWithEmail = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuthMocks() {
  mockUseAuth.mockReturnValue({
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
    signInWithOAuth: jest.fn(),
    signInAnonymously: jest.fn(),
    isLoading: false,
  });
}

async function submitSignup(onSuccess?: () => void) {
  render(<LoginForm mode="signup" onSuccess={onSuccess} />);
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'Password123' },
  });
  // Terms acceptance is required before the signup button enables
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

beforeEach(() => {
  jest.clearAllMocks();
  setAuthMocks();
});

describe('signup submit', () => {
  it('skips the check-your-email screen and calls onSuccess when a session is returned (auto-confirm)', async () => {
    mockSignUpWithEmail.mockResolvedValue({
      error: null,
      session: { access_token: 'tok' },
    });
    const onSuccess = jest.fn();

    await submitSignup(onSuccess);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it('shows the check-your-email screen when no session is returned (verification required)', async () => {
    mockSignUpWithEmail.mockResolvedValue({ error: null, session: null });
    const onSuccess = jest.fn();

    await submitSignup(onSuccess);

    await waitFor(() =>
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces "already registered" with a sign-in shortcut', async () => {
    mockSignUpWithEmail.mockResolvedValue({
      error: new Error('User already registered'),
      session: null,
    });

    await submitSignup();

    await waitFor(() =>
      expect(
        screen.getByText(/already has a supasnake account/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('link', { name: /sign in with that email instead/i })
    ).toHaveAttribute('href', '/login');
  });
});

describe('login submit', () => {
  it('renders a friendly message for invalid credentials', async () => {
    mockSignInWithEmail.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    });

    render(<LoginForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'p1@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() =>
      expect(screen.getByText(/wrong email or password/i)).toBeInTheDocument()
    );
  });
});

describe('describeAuthError', () => {
  it('maps already-registered to a sign-in offer only on signup', () => {
    expect(describeAuthError('User already registered', 'signup').offerSignIn).toBe(true);
    expect(describeAuthError('User already registered', 'login').offerSignIn).toBe(false);
  });

  it('maps rate limits to friendly copy', () => {
    expect(describeAuthError('Email rate limit exceeded', 'signup').text).toMatch(
      /too many attempts/i
    );
  });

  it('passes unknown errors through', () => {
    expect(describeAuthError('Something odd', 'login').text).toBe('Something odd');
  });
});
