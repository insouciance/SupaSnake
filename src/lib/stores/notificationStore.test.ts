import {
  attentionBadge,
  destinationBadge,
  notificationList,
  parseServerAttentionItem,
  transitionServerNotification,
  useNotificationStore,
  type ServerAttentionItem,
} from './notificationStore';

const action: ServerAttentionItem = {
  id: 'save-account',
  kind: 'action',
  status: 'unseen',
  destination: 'account',
  headline: 'Keep your progress',
  detail: 'Add an email.',
  source: { type: 'account', id: 'user-1' },
  createdAt: '2026-07-30T10:00:00.000Z',
};

const recognition: ServerAttentionItem = {
  id: 'record-tier',
  kind: 'recognition',
  status: 'unseen',
  destination: 'records',
  headline: 'Risk Carrier reached Gold',
  source: { type: 'moment', id: 'moment-1' },
  momentId: 'moment-1',
  createdAt: '2026-07-30T11:00:00.000Z',
};

describe('attention and recognition store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useNotificationStore.setState({ notifications: {}, hasHydrated: false });
  });

  it('loads server items without browser persistence', () => {
    useNotificationStore.getState().replaceServerItems([action, recognition]);
    expect(useNotificationStore.getState().hasHydrated).toBe(true);
    expect(Object.keys(useNotificationStore.getState().notifications)).toEqual([
      'save-account',
      'record-tier',
    ]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('globally badges actions but not recognition', () => {
    useNotificationStore.getState().replaceServerItems([action, recognition]);
    const notifications = useNotificationStore.getState().notifications;
    expect(attentionBadge(notifications)).toEqual({ kind: 'exclamation' });
    expect(notificationList(notifications, 'attention').map((item) => item.id)).toEqual([
      'save-account',
    ]);
    expect(destinationBadge(notifications, 'records')).toEqual({ kind: 'dot' });
    expect(destinationBadge(notifications, 'identity')).toEqual({ kind: 'dot' });
    expect(destinationBadge(notifications, 'account')).toEqual({ kind: 'exclamation' });
  });

  it('gives action attention priority over a destination recognition dot', () => {
    useNotificationStore.getState().replaceServerItems([
      action,
      { ...recognition, id: 'account-milestone', destination: 'account' },
    ]);
    expect(destinationBadge(useNotificationStore.getState().notifications, 'account')).toEqual({
      kind: 'exclamation',
    });
  });

  it('maps legacy progression opportunities to memory-only recognition', () => {
    useNotificationStore.getState().publish({
      id: 'lab-discovery',
      title: 'The Lab is ready',
      description: 'A discovery waits.',
      destination: 'lab',
      href: '/lab',
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });
    const item = useNotificationStore.getState().notifications['lab-discovery'];
    expect(item.notificationClass).toBe('recognition');
    expect(item.badgeKind).toBe('dot');
    expect(attentionBadge(useNotificationStore.getState().notifications)).toEqual({ kind: 'hidden' });
  });

  it('does not let a route mount clear a server-owned item', () => {
    useNotificationStore.getState().replaceServerItems([recognition]);
    useNotificationStore.getState().clear('record-tier');
    expect(useNotificationStore.getState().notifications['record-tier']).toBeDefined();
  });

  it('applies an exact server transition after success', async () => {
    useNotificationStore.getState().replaceServerItems([recognition]);
    const seen = { ...recognition, status: 'seen' as const, seenAt: '2026-07-30T12:00:00.000Z' };
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ item: seen }),
    });
    await transitionServerNotification('record-tier', 'seen', 'token', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/progression/attention', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ id: 'record-tier', transition: 'seen' }),
    });
    expect(useNotificationStore.getState().notifications['record-tier']).toBeUndefined();
  });

  it('keeps a seen action unresolved', async () => {
    useNotificationStore.getState().replaceServerItems([action]);
    const seen = { ...action, status: 'seen' as const, seenAt: '2026-07-30T12:00:00.000Z' };
    await transitionServerNotification(
      action.id,
      'seen',
      'token',
      jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ item: seen }) })
    );
    expect(useNotificationStore.getState().notifications[action.id]).toMatchObject({
      serverStatus: 'seen',
      notificationClass: 'attention',
    });
  });

  it('validates server data and refuses dead destinations', () => {
    expect(parseServerAttentionItem({ ...action, source: null })).toBeNull();
    useNotificationStore.getState().replaceServerItems([
      { ...recognition, destination: 'unknown-system' },
    ]);
    expect(useNotificationStore.getState().notifications).toEqual({});
  });
});
