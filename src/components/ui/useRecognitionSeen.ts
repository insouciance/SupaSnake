'use client';

import { useEffect } from 'react';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog';
import {
  transitionServerNotification,
  useNotificationStore,
  type NotificationDestination,
} from '@/lib/stores/notificationStore';

/**
 * Mark recognition seen only after its actual destination content is ready.
 * Route entry alone is intentionally insufficient. Action items are ignored.
 */
export function useRecognitionSeen(
  destination: NotificationDestination,
  contentIsVisible: boolean,
  token?: string
): void {
  const notifications = useNotificationStore((state) => state.notifications);

  useEffect(() => {
    if (!contentIsVisible) return;
    const recognition = Object.values(notifications).filter(
      (item) =>
        item.notificationClass === 'recognition' &&
        item.destination === destination
    );
    for (const item of recognition) {
      if (item.serverManaged) {
        if (!token) continue;
        void transitionServerNotification(item.id, 'seen', token)
          .then(() => {
            trackEvent(AnalyticsEvents.RECOGNITION_DESTINATION_SEEN, {
              recognition_id: item.id,
              destination,
              category: 'engagement',
            });
          })
          .catch((error) => {
            console.error(`Failed to mark ${destination} recognition seen:`, error);
          });
      } else {
        useNotificationStore.getState().resolve(item.id);
      }
    }
  }, [contentIsVisible, destination, notifications, token]);
}
