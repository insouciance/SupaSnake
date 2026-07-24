'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type NotificationBadgeKind = 'hidden' | 'exclamation' | 'numeric';
export type NotificationAttentionReason =
  | 'action-required'
  | 'reward-available'
  | 'progression-opportunity';
export type NotificationAction =
  | 'open-contracts'
  | 'open-season'
  | 'open-offline-rewards'
  | 'open-save-progress';
export type NotificationDestination =
  | 'global'
  | 'home'
  | 'lab'
  | 'contracts'
  | 'season'
  | 'account'
  | 'identity';

interface NotificationTarget {
  destination: NotificationDestination;
  href: string;
  action?: NotificationAction;
}

/**
 * Canonical destinations for every current attention item. Hashes remain a
 * reload/cross-route fallback; semantic actions make same-page modal opening
 * deterministic instead of depending on a browser hashchange.
 */
export const NOTIFICATION_TARGETS = {
  contracts: {
    destination: 'contracts',
    href: '/#contracts',
    action: 'open-contracts',
  },
  season: {
    destination: 'season',
    href: '/#season',
    action: 'open-season',
  },
  offlineRewards: {
    destination: 'home',
    href: '/#offline-rewards',
    action: 'open-offline-rewards',
  },
  saveProgress: {
    destination: 'account',
    href: '/#save-progress',
    action: 'open-save-progress',
  },
  lab: {
    destination: 'lab',
    href: '/lab',
  },
  identity: {
    destination: 'identity',
    href: '/profile',
  },
} as const satisfies Record<string, NotificationTarget>;

const NOTIFICATION_ACTION_EVENT = 'supasnake:notification-action';

export function notificationActionForHref(href: string): NotificationAction | undefined {
  const target = Object.values(NOTIFICATION_TARGETS).find(
    (candidate) => candidate.href === href
  );
  return target && 'action' in target ? target.action : undefined;
}

export function dispatchNotificationAction(action: NotificationAction): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_ACTION_EVENT, { detail: { action } })
  );
}

export function subscribeNotificationAction(
  action: NotificationAction,
  listener: () => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleAction = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      (event.detail as { action?: NotificationAction } | null)?.action === action
    ) {
      listener();
    }
  };

  window.addEventListener(NOTIFICATION_ACTION_EVENT, handleAction);
  return () => window.removeEventListener(NOTIFICATION_ACTION_EVENT, handleAction);
}

interface NotificationBase {
  id: string;
  title: string;
  description: string;
  destination: NotificationDestination;
}

export interface GameNotification extends NotificationBase {
  badgeKind: Exclude<NotificationBadgeKind, 'hidden'>;
  attentionReason: NotificationAttentionReason;
  /** Required for numeric badges; values are normalized to positive integers. */
  count?: number;
  href: string;
  action?: NotificationAction;
  actionLabel?: string;
  /** False for ephemeral, same-page notices that must not survive reload. */
  persistent?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NotificationInput =
  | (NotificationBase & { badgeKind: 'hidden' })
  | (Omit<GameNotification, 'createdAt' | 'updatedAt'> & { createdAt?: number });

interface NotificationState {
  notifications: Record<string, GameNotification>;
  hasHydrated: boolean;
  publish: (notification: NotificationInput) => void;
  clear: (id: string) => void;
  clearDestination: (destination: NotificationDestination) => void;
  clearAll: () => void;
  setHasHydrated: (value: boolean) => void;
}

function normalizeCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: {},
      hasHydrated: false,
      publish: (input) =>
        set((state) => {
          if (input.badgeKind === 'hidden') {
            const { [input.id]: _removed, ...remaining } = state.notifications;
            return { notifications: remaining };
          }

          const count = normalizeCount(input.count);
          if (
            (input.badgeKind === 'numeric' && count === 0) ||
            typeof input.href !== 'string' ||
            input.href.trim().length === 0
          ) {
            const { [input.id]: _removed, ...remaining } = state.notifications;
            return { notifications: remaining };
          }

          const now = Date.now();
          const existing = state.notifications[input.id];
          const notification: GameNotification = {
            ...input,
            badgeKind: input.badgeKind,
            ...(input.badgeKind === 'numeric' ? { count } : { count: undefined }),
            persistent: input.persistent ?? true,
            createdAt: existing?.createdAt ?? input.createdAt ?? now,
            updatedAt: now,
          };

          return {
            notifications: {
              ...state.notifications,
              [input.id]: notification,
            },
          };
        }),
      clear: (id) =>
        set((state) => {
          const { [id]: _removed, ...remaining } = state.notifications;
          return { notifications: remaining };
        }),
      clearDestination: (destination) =>
        set((state) => ({
          notifications: Object.fromEntries(
            Object.entries(state.notifications).filter(
              ([, notification]) => notification.destination !== destination
            )
          ),
        })),
      clearAll: () => set({ notifications: {} }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'supasnake-ui-notifications-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        notifications: Object.fromEntries(
          Object.entries(state.notifications).filter(
            ([, notification]) => notification.persistent !== false
          )
        ),
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);

export function notificationList(
  notifications: Record<string, GameNotification>
): GameNotification[] {
  return Object.values(notifications)
    .filter(
      (notification) =>
        typeof notification.href === 'string' && notification.href.trim().length > 0
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export function attentionBadge(
  notifications: Record<string, GameNotification>,
  destination?: NotificationDestination
): { kind: NotificationBadgeKind; count?: number } {
  const matching = notificationList(notifications).filter(
    (notification) => destination === undefined || notification.destination === destination
  );
  if (matching.length === 0) return { kind: 'hidden' };

  const numericCount = matching.reduce(
    (sum, notification) =>
      sum + (notification.badgeKind === 'numeric' ? normalizeCount(notification.count) : 0),
    0
  );

  if (numericCount > 0) {
    const exclamationCount = matching.filter(
      (notification) => notification.badgeKind === 'exclamation'
    ).length;
    return { kind: 'numeric', count: numericCount + exclamationCount };
  }
  return { kind: 'exclamation' };
}

export function destinationBadge(
  notifications: Record<string, GameNotification>,
  destination: NotificationDestination
): { kind: NotificationBadgeKind; count?: number } {
  return attentionBadge(notifications, destination);
}
