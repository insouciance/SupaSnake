/**
 * @jest-environment jsdom
 */

import {
  destinationBadge,
  notificationList,
  useNotificationStore,
} from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationStore.setState({ notifications: {}, hasHydrated: false });
  });

  it('publishes exclamation and numeric notifications from one source of truth', () => {
    const { publish } = useNotificationStore.getState();
    publish({
      id: 'lab-discovery',
      title: 'The Lab is ready',
      description: 'Discover more snakes when you want to.',
      destination: 'lab',
      badgeKind: 'exclamation',
      href: '/lab',
    });
    publish({
      id: 'contracts',
      title: 'Contracts',
      description: 'Two rewards are ready.',
      destination: 'contracts',
      badgeKind: 'numeric',
      count: 2.9,
      href: '/?open=contracts',
    });

    const state = useNotificationStore.getState().notifications;
    expect(state.contracts.count).toBe(2);
    expect(destinationBadge(state, 'lab')).toEqual({ kind: 'exclamation' });
    expect(destinationBadge(state, 'contracts')).toEqual({ kind: 'numeric', count: 2 });
  });

  it('treats hidden and zero-count updates as clearing behavior', () => {
    const { publish } = useNotificationStore.getState();
    const base = {
      id: 'contracts',
      title: 'Contracts',
      description: 'Ready',
      destination: 'contracts' as const,
    };

    publish({ ...base, badgeKind: 'numeric', count: 3 });
    publish({ ...base, badgeKind: 'numeric', count: 0 });
    expect(useNotificationStore.getState().notifications.contracts).toBeUndefined();

    publish({ ...base, badgeKind: 'exclamation' });
    publish({ ...base, badgeKind: 'hidden' });
    expect(useNotificationStore.getState().notifications.contracts).toBeUndefined();
  });

  it('clears individual items and destinations without affecting other systems', () => {
    const store = useNotificationStore.getState();
    store.publish({
      id: 'lab',
      title: 'Lab',
      description: 'Ready',
      destination: 'lab',
      badgeKind: 'exclamation',
    });
    store.publish({
      id: 'save',
      title: 'Save progress',
      description: 'Optional',
      destination: 'account',
      badgeKind: 'exclamation',
    });

    useNotificationStore.getState().clearDestination('lab');
    expect(Object.keys(useNotificationStore.getState().notifications)).toEqual(['save']);
    useNotificationStore.getState().clear('save');
    expect(useNotificationStore.getState().notifications).toEqual({});
  });

  it('sorts dynamic updates by recency while preserving original creation time', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300);
    const { publish } = useNotificationStore.getState();
    publish({
      id: 'a',
      title: 'A',
      description: 'A',
      destination: 'global',
      badgeKind: 'exclamation',
    });
    publish({
      id: 'b',
      title: 'B',
      description: 'B',
      destination: 'global',
      badgeKind: 'exclamation',
    });
    publish({
      id: 'a',
      title: 'A updated',
      description: 'A',
      destination: 'global',
      badgeKind: 'exclamation',
    });

    const list = notificationList(useNotificationStore.getState().notifications);
    expect(list.map((item) => item.id)).toEqual(['a', 'b']);
    expect(list[0].createdAt).toBe(100);
    jest.restoreAllMocks();
  });
});
