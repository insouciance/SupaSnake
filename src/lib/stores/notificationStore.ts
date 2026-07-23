'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type NotificationBadgeKind = 'hidden' | 'exclamation' | 'numeric';
export type NotificationDestination =
  | 'global'
  | 'home'
  | 'lab'
  | 'contracts'
  | 'season'
  | 'account'
  | 'identity';

export interface GameNotification {
  id: string;
  title: string;
  description: string;
  destination: NotificationDestination;
  badgeKind: Exclude<NotificationBadgeKind, 'hidden'>;
  /** Required for numeric badges; values are normalized to positive integers. */
  count?: number;
  href?: string;
  actionLabel?: string;
  /** False for notifications that resolve only after a claim or mutation. */
  clearOnOpen?: boolean;
  /** False for ephemeral, same-page notices that must not survive reload. */
  persistent?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationInput
  extends Omit<GameNotification, 'createdAt' | 'updatedAt' | 'badgeKind'> {
  badgeKind: NotificationBadgeKind;
  createdAt?: number;
}

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
          const count = normalizeCount(input.count);
          if (input.badgeKind === 'hidden' || (input.badgeKind === 'numeric' && count === 0)) {
            const { [input.id]: _removed, ...remaining } = state.notifications;
            return { notifications: remaining };
          }

          const now = Date.now();
          const existing = state.notifications[input.id];
          const notification: GameNotification = {
            ...input,
            badgeKind: input.badgeKind,
            ...(input.badgeKind === 'numeric' ? { count } : { count: undefined }),
            clearOnOpen: input.clearOnOpen ?? true,
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
  return Object.values(notifications).sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)
  );
}

export function destinationBadge(
  notifications: Record<string, GameNotification>,
  destination: NotificationDestination
): { kind: NotificationBadgeKind; count?: number } {
  const matching = Object.values(notifications).filter(
    (notification) => notification.destination === destination
  );
  if (matching.length === 0) return { kind: 'hidden' };

  const numericCount = matching.reduce(
    (sum, notification) =>
      sum + (notification.badgeKind === 'numeric' ? normalizeCount(notification.count) : 0),
    0
  );

  if (numericCount > 0) return { kind: 'numeric', count: numericCount };
  return { kind: 'exclamation' };
}
