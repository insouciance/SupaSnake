import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrivacySettingsPage from './page';

const mockUseAuth = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  };
});

function setAuth(isAnonymous: boolean) {
  mockUseAuth.mockReturnValue({
    user: {
      id: 'user-1',
      email: isAnonymous ? null : 'player@example.com',
    },
    session: { access_token: 'access-token' },
    isAuthenticated: true,
    isAnonymous,
    signOut: mockSignOut,
  });
}

describe('PrivacySettingsPage account deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockSignOut.mockResolvedValue(undefined);
  });

  it('schedules registered-account erasure and signs out', async () => {
    setAuth(false);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scheduledDeletion: '2026-08-21T12:00:00.000Z' }),
    }) as jest.Mock;
    render(<PrivacySettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Request Account Deletion' }));
    fireEvent.change(screen.getByPlaceholderText('player@example.com'), {
      target: { value: 'player@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Deletion' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/user/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ confirmEmail: 'player@example.com' }),
    });
    expect(
      screen.getByText(/account deletion scheduled/i)
    ).toBeInTheDocument();
  });

  it('immediately erases an anonymous account only after the exact phrase', async () => {
    setAuth(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true }),
    }) as jest.Mock;
    render(<PrivacySettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Request Account Deletion' }));
    fireEvent.change(screen.getByPlaceholderText('DELETE MY ACCOUNT'), {
      target: { value: 'DELETE MY ACCOUNT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Now' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/user/delete-account', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({
        confirm: true,
        confirmation: 'DELETE MY ACCOUNT',
      }),
    });
    expect(screen.getByText(/guest account.*deleted/i)).toBeInTheDocument();
  });

  it('keeps the session when the deletion request fails', async () => {
    setAuth(false);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Account deletion is temporarily unavailable' }),
    }) as jest.Mock;
    render(<PrivacySettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Request Account Deletion' }));
    fireEvent.change(screen.getByPlaceholderText('player@example.com'), {
      target: { value: 'player@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Deletion' }));

    expect(
      await screen.findByText('Account deletion is temporarily unavailable')
    ).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
