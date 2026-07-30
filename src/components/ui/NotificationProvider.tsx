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
        const response = await fetch('/api/progression/attention', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Attention read failed (${response.status})`);
        }
        const body = await response.json();
        const items = Array.isArray(body?.items)
          ? body.items.map(parseServerAttentionItem).filter(Boolean)
          : [];
        if (!cancelled) {
          useNotificationStore.getState().replaceServerItems(
            items as NonNullable<ReturnType<typeof parseServerAttentionItem>>[]
          );
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
