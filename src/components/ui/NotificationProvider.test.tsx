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
          momentId: 'm1',
          artifactRef: 'risk_carrier',
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

  it('loads every server page before replacing the memory-only inbox', async () => {
    const first = {
      id: 'record-1',
      kind: 'recognition',
      status: 'unseen',
      destination: 'records',
      headline: 'First record',
      momentId: 'moment-1',
      artifactRef: 'record-1',
      source: { type: 'moment', id: 'moment-1' },
      createdAt: '2026-07-30T10:00:00.000Z',
    };
    const second = {
      ...first,
      id: 'record-2',
      headline: 'Second record',
      momentId: 'moment-2',
      artifactRef: 'record-2',
      source: { type: 'moment', id: 'moment-2' },
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [first], nextOffset: 100 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [second], nextOffset: null }),
      }) as jest.Mock;

    render(<NotificationProvider><div>child</div></NotificationProvider>);

    await waitFor(() => expect(useNotificationStore.getState().hasHydrated).toBe(true));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/progression/attention?offset=100',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(Object.keys(useNotificationStore.getState().notifications)).toEqual([
      'record-1',
      'record-2',
    ]);
  });
});
