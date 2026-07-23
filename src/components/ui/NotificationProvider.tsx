'use client';

import { useEffect, type ReactNode } from 'react';
import { useNotificationStore } from '@/lib/stores/notificationStore';

/** Hydrates the persistent UI inbox after the server render. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useNotificationStore.persist.rehydrate();
  }, []);

  return children;
}
