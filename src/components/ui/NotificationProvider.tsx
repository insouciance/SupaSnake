'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  ATTENTION_REFRESH_EVENT,
  parseServerAttentionItem,
  useNotificationStore,
} from '@/lib/stores/notificationStore';

/**
 * Synchronizes the inbox from server authority. No notification or earned
 * moment is written to browser storage; signed-out discovery is memory-only.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const token = session?.access_token;
    let cancelled = false;

    const sync = async () => {
      if (!token) {
        useNotificationStore.getState().replaceServerItems([]);
        return;
      }
      try {
        const items: NonNullable<ReturnType<typeof parseServerAttentionItem>>[] = [];
        let offset = 0;
        do {
          const response = await fetch(
            offset === 0
              ? '/api/progression/attention'
              : `/api/progression/attention?offset=${offset}`,
            {
              cache: 'no-store',
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (!response.ok) {
            throw new Error(`Attention read failed (${response.status})`);
          }
          const body = await response.json();
          if (Array.isArray(body?.items)) {
            items.push(...body.items.map(parseServerAttentionItem).filter(
              (item: ReturnType<typeof parseServerAttentionItem>): item is NonNullable<typeof item> =>
                item !== null
            ));
          }
          const nextOffset = Number(body?.nextOffset);
          offset = Number.isInteger(nextOffset) && nextOffset > offset ? nextOffset : 0;
        } while (offset > 0);
        if (!cancelled) {
          useNotificationStore.getState().replaceServerItems(items);
        }
      } catch (error) {
        // An outage must not erase server-owned attention already visible in
        // this tab. Mark the in-memory surface ready and retry on the next
        // explicit refresh, auth change, or full navigation.
        console.error('Failed to synchronize attention:', error);
        if (!cancelled) useNotificationStore.getState().setHasHydrated(true);
      }
    };

    void sync();
    window.addEventListener(ATTENTION_REFRESH_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(ATTENTION_REFRESH_EVENT, sync);
    };
  }, [isLoading, session?.access_token]);

  return children;
}
