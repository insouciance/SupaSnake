/**
 * The service worker is a notification worker and nothing else
 * (Constitution Rule 1, Rule 7, project rule: server authority).
 *
 * The worker is the last surface before a device's lock screen, so the things
 * it must NOT contain are asserted here by name.
 */

import { SERVICE_WORKER_SOURCE, SERVICE_WORKER_VERSION } from '@/lib/pwa/serviceWorkerSource';
import { commercialTerms } from '@/lib/growth/commercialLanguage';
import { lossTerms } from '@/lib/growth/lossLanguage';

describe('service worker source', () => {
  it('handles push and notificationclick', () => {
    expect(SERVICE_WORKER_SOURCE).toContain("addEventListener('push'");
    expect(SERVICE_WORKER_SOURCE).toContain("addEventListener('notificationclick'");
  });

  it('carries a version so an update actually replaces the installed worker', () => {
    expect(SERVICE_WORKER_SOURCE).toContain(SERVICE_WORKER_VERSION);
  });

  describe('what it must never do', () => {
    it('sets no badge — Rule 7 names badges alongside offers', () => {
      expect(SERVICE_WORKER_SOURCE).not.toMatch(/setAppBadge|app_badge|clearAppBadge/i);
    });

    it('has no fetch handler and caches nothing — server authority', () => {
      expect(SERVICE_WORKER_SOURCE).not.toContain("addEventListener('fetch'");
      expect(SERVICE_WORKER_SOURCE).not.toMatch(/caches\.|new Cache|cache\.put/);
    });

    it('registers no background wake-ups', () => {
      expect(SERVICE_WORKER_SOURCE).not.toContain("addEventListener('sync'");
      expect(SERVICE_WORKER_SOURCE).not.toContain("addEventListener('periodicsync'");
    });

    it('never pins a notification open', () => {
      expect(SERVICE_WORKER_SOURCE).toContain('requireInteraction: false');
      expect(SERVICE_WORKER_SOURCE).not.toContain('requireInteraction: true');
      expect(SERVICE_WORKER_SOURCE).toContain('renotify: false');
    });

    it('shows nothing at all when the payload is unreadable — no generic buzz', () => {
      expect(SERVICE_WORKER_SOURCE).toContain('if (!event.data) return;');
      // The only showNotification call is the one guarded by the shape check.
      expect(SERVICE_WORKER_SOURCE.match(/showNotification/g)).toHaveLength(1);
    });

    it('carries no fallback copy of its own to display', () => {
      // Every displayed string comes from the payload, which came from
      // `triggers.ts`. There is no second place notification words can live.
      expect(SERVICE_WORKER_SOURCE).toContain('payload.title');
      expect(SERVICE_WORKER_SOURCE).toContain('payload.body');
      expect(SERVICE_WORKER_SOURCE).not.toMatch(/showNotification\('/);
    });
  });

  describe('Rule 1 — it never navigates a live run away', () => {
    it('tracks run state from the page and defaults to "do not navigate"', () => {
      expect(SERVICE_WORKER_SOURCE).toContain('var runIsLive = false;');
      expect(SERVICE_WORKER_SOURCE).toContain("data.type === 'supasnake:run-state'");
      expect(SERVICE_WORKER_SOURCE).toContain('if (!runIsLive && typeof client.navigate');
    });

    it('refuses an off-origin notification target', () => {
      expect(SERVICE_WORKER_SOURCE).toContain("target.charAt(0) !== '/'");
      expect(SERVICE_WORKER_SOURCE).toContain("target.charAt(1) === '/'");
    });
  });

  it('contains no commercial or loss vocabulary anywhere in its source', () => {
    expect(commercialTerms(SERVICE_WORKER_SOURCE)).toEqual([]);
    expect(lossTerms(SERVICE_WORKER_SOURCE)).toEqual([]);
  });
});
