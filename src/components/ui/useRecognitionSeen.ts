'use client';

import { useEffect } from 'react';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog';
import {
  transitionServerNotification,
  useNotificationStore,
  type NotificationDestination,
} from '@/lib/stores/notificationStore';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';

const recognitionTransitionsInFlight = new Set<string>();

/**
 * Mark recognition seen only after its actual destination content is ready.
 * Route entry alone is intentionally insufficient. Action items are ignored.
 */
export function useRecognitionSeen(
  destination: NotificationDestination,
  contentIsVisible: boolean,
  token?: string,
  options?: {
    /** Artifact identifiers proven to be present in the rendered content. */
    artifactRefs?: readonly string[];
    /** Legacy/unscoped recognition may clear only when explicitly allowed. */
    includeUnscoped?: boolean;
  }
): void {
  const notifications = useNotificationStore((state) => state.notifications);
  const artifactRefsKey = JSON.stringify(
    Array.from(new Set(options?.artifactRefs ?? [])).sort()
  );
  const includeUnscoped = options?.includeUnscoped === true;

  useEffect(() => {
    if (!CAREER_SPINE_V1_ENABLED) return;
    if (!contentIsVisible) return;
    const renderedArtifacts = new Set<string>(JSON.parse(artifactRefsKey));
    const recognition = Object.values(notifications).filter(
      (item) =>
        item.notificationClass === 'recognition' &&
        item.destination === destination &&
        (item.artifactRef
          ? renderedArtifacts.has(item.artifactRef)
          : includeUnscoped)
    );
    for (const item of recognition) {
      if (item.serverManaged) {
        if (!token) continue;
        if (recognitionTransitionsInFlight.has(item.id)) continue;
        recognitionTransitionsInFlight.add(item.id);
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
          })
          .finally(() => {
            recognitionTransitionsInFlight.delete(item.id);
          });
      } else {
        useNotificationStore.getState().resolve(item.id);
      }
    }
  }, [artifactRefsKey, contentIsVisible, destination, includeUnscoped, notifications, token]);
}
