import { render, waitFor } from '@testing-library/react';
import { NotificationProvider } from './NotificationProvider';
import { useNotificationStore } from '@/lib/stores/notificationStore';

let token: string | undefined = 'token';
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: token ? { access_token: token } : null, isLoading: false }),
}));

describe('NotificationProvider', () => {
  beforeEach(() => {
    token = 'token';
    window.localStorage.clear();
    window.sessionStorage.clear();
    useNotificationStore.setState({ notifications: {}, hasHydrated: false });
    global.fetch = jest.fn() as jest.Mock;
  });

  it('loads server authority without persisting it in the browser', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{
          id: 'record',
          kind: 'recognition',
          status: 'unseen',
          destination: 'records',
          headline: 'Gold record',
          source: { type: 'moment', id: 'm1' },
          createdAt: '2026-07-30T10:00:00.000Z',
        }],
      }),
    }) as jest.Mock;
    render(<NotificationProvider><div>child</div></NotificationProvider>);
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications.record).toBeDefined();
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps guest state memory-only and makes the inbox ready', async () => {
    token = undefined;
    render(<NotificationProvider><div>child</div></NotificationProvider>);
    await waitFor(() => expect(useNotificationStore.getState().hasHydrated).toBe(true));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
