import { render, waitFor } from '@testing-library/react';
import { useRecognitionSeen } from './useRecognitionSeen';
import { useNotificationStore, type ServerAttentionItem } from '@/lib/stores/notificationStore';

jest.mock('@/lib/analytics/posthog', () => ({ trackEvent: jest.fn() }));

const recognition: ServerAttentionItem = {
  id: 'codex-moment',
  kind: 'recognition',
  status: 'unseen',
  destination: 'codex',
  headline: 'New splice',
  source: { type: 'moment', id: 'm1' },
  createdAt: '2026-07-30T10:00:00.000Z',
};

function Harness({ visible, token = 'token' }: { visible: boolean; token?: string }) {
  useRecognitionSeen('codex', visible, token);
  return null;
}

describe('useRecognitionSeen', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
    useNotificationStore.getState().replaceServerItems([recognition]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ item: { ...recognition, status: 'seen' } }),
    }) as jest.Mock;
  });

  it('does nothing until destination content is actually visible', () => {
    render(<Harness visible={false} />);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications[recognition.id]).toBeDefined();
  });

  it('transitions exactly the matching recognition to seen', async () => {
    render(<Harness visible />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/progression/attention',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ id: recognition.id, transition: 'seen' }),
      })
    ));
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications[recognition.id]).toBeUndefined();
    });
  });
});
