/**
 * @jest-environment jsdom
 */

import {
  attentionBadge,
  dispatchNotificationAction,
  destinationBadge,
  NOTIFICATION_TARGETS,
  notificationList,
  subscribeNotificationAction,
  useNotificationStore,
  type NotificationInput,
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
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });
    publish({
      id: 'contracts',
      title: 'Contracts',
      description: 'Two rewards are ready.',
      ...NOTIFICATION_TARGETS.contracts,
      badgeKind: 'numeric',
      attentionReason: 'reward-available',
      count: 2.9,
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
      attentionReason: 'reward-available' as const,
      href: '/#contracts',
      action: 'open-contracts' as const,
    };

    publish({ ...base, badgeKind: 'numeric', count: 3 });
    publish({ ...base, badgeKind: 'numeric', count: 0 });
    expect(useNotificationStore.getState().notifications.contracts).toBeUndefined();

    publish({ ...base, badgeKind: 'exclamation' });
    publish({
      id: base.id,
      title: base.title,
      description: base.description,
      destination: base.destination,
      badgeKind: 'hidden',
    });
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
      attentionReason: 'progression-opportunity',
      href: '/lab',
    });
    store.publish({
      id: 'save',
      title: 'Save progress',
      description: 'Optional',
      destination: 'account',
      badgeKind: 'exclamation',
      attentionReason: 'action-required',
      href: '/#save-progress',
      action: 'open-save-progress',
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
      attentionReason: 'progression-opportunity',
      href: '/lab',
    });
    publish({
      id: 'b',
      title: 'B',
      description: 'B',
      destination: 'global',
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
      href: '/profile',
    });
    publish({
      id: 'a',
      title: 'A updated',
      description: 'A',
      destination: 'global',
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
      href: '/lab',
    });

    const list = notificationList(useNotificationStore.getState().notifications);
    expect(list.map((item) => item.id)).toEqual(['a', 'b']);
    expect(list[0].createdAt).toBe(100);
    jest.restoreAllMocks();
  });

  it('deduplicates unresolved attention by semantic id and aggregates all attention units', () => {
    const { publish } = useNotificationStore.getState();
    publish({
      id: 'contracts',
      title: 'Contracts ready',
      description: 'Choose two.',
      ...NOTIFICATION_TARGETS.contracts,
      badgeKind: 'exclamation',
      attentionReason: 'action-required',
    });
    publish({
      id: 'contracts',
      title: 'Contract rewards ready',
      description: 'Two can be claimed.',
      ...NOTIFICATION_TARGETS.contracts,
      badgeKind: 'numeric',
      attentionReason: 'reward-available',
      count: 2,
    });
    publish({
      id: 'lab-discovery',
      title: 'Lab ready',
      description: 'Visit the Lab.',
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'progression-opportunity',
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(Object.keys(notifications)).toEqual(['contracts', 'lab-discovery']);
    expect(attentionBadge(notifications)).toEqual({ kind: 'numeric', count: 3 });
  });

  it('suppresses records without a working target', () => {
    useNotificationStore.getState().publish({
      id: 'dead-end',
      title: 'Dead end',
      description: 'No destination.',
      destination: 'global',
      badgeKind: 'exclamation',
      attentionReason: 'action-required',
      href: '',
    } as NotificationInput);

    expect(useNotificationStore.getState().notifications['dead-end']).toBeUndefined();
  });

  it('dispatches semantic actions to existing destination interfaces', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeNotificationAction('open-contracts', listener);

    dispatchNotificationAction('open-contracts');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    dispatchNotificationAction('open-contracts');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
