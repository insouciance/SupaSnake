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

let initialized = false;

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

  posthog.init(config.apiKey, {
    api_host: config.host || 'https://eu.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // game UI clicks are noise; we track a curated taxonomy
    persistence: 'localStorage+cookie',
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
