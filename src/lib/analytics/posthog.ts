/**
 * PostHog Analytics
 * Event tracking, user analytics, feature flags and session replay.
 *
 * Initialization is consent-gated: call initAnalytics only after the user
 * has granted analytics consent (see AnalyticsProvider / ConsentBanner).
 *
 * @see https://posthog.com/docs/libraries/js
 */

import posthog from 'posthog-js';

export interface AnalyticsConfig {
  apiKey: string;
  host?: string;
  userId?: string;
}

export interface RevenueData {
  productId: string;
  price: number;
  quantity: number;
  revenueType: string;
}

export interface EventProperties {
  [key: string]: string | number | boolean | string[] | number[];
}

/**
 * Broadcast on `window` the moment capture becomes possible.
 *
 * Surfaces that record a once-per-visit fact — the funnel's Arrive stage,
 * for instance — mount as children of AnalyticsProvider, so their effects
 * run *before* the provider's. Without this signal they would sample
 * isAnalyticsInitialized() a tick too early and drop the event on every
 * first paint. Use onAnalyticsReady(), which handles both orderings.
 */
export const ANALYTICS_READY_EVENT = 'analytics-ready';

let initialized = false;

/**
 * Remove the SDK blob used before Constitution v1.6. PostHog stores person
 * properties in the same persistence record as its device id; some of those
 * properties described career/lifecycle state. Analytics is memory-only now,
 * so retaining that old blob would violate the no-browser-progress rule even
 * though new code never reads it as game authority.
 */
export function clearLegacyPostHogPersistence(apiKey: string): void {
  if (typeof window === 'undefined' || !apiKey) return;
  const key = `ph_${apiKey}_posthog`;
  try {
    // constitution-allow: local-progress destructive migration removes a legacy progress-bearing analytics blob
    window.localStorage.removeItem(key);
    // constitution-allow: local-progress destructive migration removes any legacy session-scoped analytics copy
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in hardened/private contexts. Memory-only
    // initialization below remains safe in that case.
  }
  if (typeof document !== 'undefined') {
    // constitution-allow: local-progress destructive migration expires the legacy analytics cookie copy
    document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

/**
 * Initialize PostHog SDK.
 * Safe to call multiple times - only the first call initializes.
 */
export function initAnalytics(config: AnalyticsConfig): void {
  if (!config.apiKey) {
    console.warn('[PostHog] API key not provided, analytics disabled');
    return;
  }
  if (initialized) return;

  clearLegacyPostHogPersistence(config.apiKey);

  posthog.init(config.apiKey, {
    api_host: config.host || 'https://eu.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // game UI clicks are noise; we track a curated taxonomy
    // Person properties can include lifecycle/progression segmentation. Keep
    // the SDK entirely in this document's memory so none can reach browser
    // persistence, even indirectly inside a dependency.
    persistence: 'memory',
    advanced_disable_flags: true,
  });

  if (config.userId) {
    posthog.identify(config.userId);
  }

  initialized = true;
}

/**
 * Whether analytics has been initialized (consent granted + key present).
 */
export function isAnalyticsInitialized(): boolean {
  return initialized;
}

/**
 * Run `callback` once capture is live — immediately if it already is, or on
 * the next ANALYTICS_READY_EVENT. Returns an unsubscribe function; calling
 * it after the callback ran is harmless.
 */
export function onAnalyticsReady(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (initialized) {
    callback();
    return () => {};
  }
  const handler = () => {
    window.removeEventListener(ANALYTICS_READY_EVENT, handler);
    callback();
  };
  window.addEventListener(ANALYTICS_READY_EVENT, handler);
  return () => window.removeEventListener(ANALYTICS_READY_EVENT, handler);
}

/**
 * Opt the user out and stop capturing (consent revoked).
 */
export function disableAnalytics(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
}

/**
 * Re-enable capturing after a previous opt-out (consent re-granted).
 */
export function enableAnalytics(): void {
  if (!initialized) return;
  posthog.opt_in_capturing();
}

/**
 * Track a custom event
 */
export function trackEvent(eventName: string, properties?: EventProperties): void {
  if (!initialized) return;
  posthog.capture(eventName, properties);
}

/**
 * Identify user by ID.
 * Call on login; pass null on logout to unlink the person.
 */
export function identifyUser(userId: string | null): void {
  if (!initialized) return;
  if (userId === null) {
    posthog.reset();
    return;
  }
  posthog.identify(userId);
}

/**
 * Set user properties for segmentation
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.setPersonProperties(properties as Record<string, string | number | boolean>);
}

/**
 * Reset user session (on logout)
 */
export function resetUser(): void {
  if (!initialized) return;
  posthog.reset();
}

/**
 * Track revenue event
 */
export function trackRevenue(data: RevenueData): void {
  if (!initialized) return;
  posthog.capture('revenue', {
    product_id: data.productId,
    price: data.price,
    quantity: data.quantity,
    revenue_type: data.revenueType,
    revenue: data.price * data.quantity,
  });
}

/**
 * Track game-specific events with standard properties
 */
export function trackGameEvent(
  eventName: string,
  properties: EventProperties
): void {
  trackEvent(eventName, {
    ...properties,
    eventCategory: 'gameplay',
  });
}

/**
 * Track economy events (DNA, energy, purchases)
 */
export function trackEconomyEvent(
  eventName: string,
  properties: EventProperties
): void {
  trackEvent(eventName, {
    ...properties,
    eventCategory: 'economy',
  });
}

/**
 * Get current session ID for correlation
 */
export function getSessionId(): string | undefined {
  if (!initialized) return undefined;
  return posthog.get_session_id();
}
