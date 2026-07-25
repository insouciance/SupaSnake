'use client';

/**
 * Consent-gated PostHog initialization.
 *
 * Analytics only starts after the user grants the "analytics" consent
 * category in the ConsentBanner (stored under the cookie-consent key and
 * broadcast via the consent-updated CustomEvent). Revoking consent opts
 * the SDK out without a reload.
 */

import { useEffect } from 'react';
import {
  ANALYTICS_READY_EVENT,
  initAnalytics,
  enableAnalytics,
  disableAnalytics,
  isAnalyticsInitialized,
} from '@/lib/analytics/posthog';
import type { ConsentPreferences } from '@/components/legal/ConsentBanner';

const CONSENT_KEY = 'cookie-consent';

function applyConsent(analyticsGranted: boolean) {
  if (analyticsGranted) {
    if (isAnalyticsInitialized()) {
      enableAnalytics();
    } else {
      initAnalytics({
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      });
    }
    if (isAnalyticsInitialized()) {
      window.dispatchEvent(new CustomEvent(ANALYTICS_READY_EVENT));
    }
  } else {
    disableAnalytics();
  }
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Apply stored consent on mount
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const prefs = JSON.parse(stored) as ConsentPreferences;
        applyConsent(Boolean(prefs.analytics));
      }
    } catch {
      // Corrupt consent state - treat as no consent
    }

    // React to consent changes from the banner
    const onConsentUpdated = (event: Event) => {
      const prefs = (event as CustomEvent<ConsentPreferences>).detail;
      applyConsent(Boolean(prefs?.analytics));
    };

    window.addEventListener('consent-updated', onConsentUpdated);
    return () => window.removeEventListener('consent-updated', onConsentUpdated);
  }, []);

  return <>{children}</>;
}
