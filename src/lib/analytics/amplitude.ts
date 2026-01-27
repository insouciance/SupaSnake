/**
 * Amplitude Analytics
 * Event tracking and user analytics for OG Snake
 *
 * @see https://www.docs.developers.amplitude.com/data/sdks/browser-2/
 */

import * as amplitude from '@amplitude/analytics-browser';

export interface AmplitudeConfig {
  apiKey: string;
  userId?: string;
  serverUrl?: string;
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
 * Initialize Amplitude SDK
 * Should be called once at application startup
 */
export function initAmplitude(config: AmplitudeConfig): void {
  if (!config.apiKey) {
    console.warn('[Amplitude] API key not provided, analytics disabled');
    return;
  }

  amplitude.init(config.apiKey, config.userId, {
    defaultTracking: {
      sessions: true,
      pageViews: true,
      formInteractions: false,
      fileDownloads: false,
    },
    serverUrl: config.serverUrl,
  });
}

/**
 * Track a custom event
 */
export function trackEvent(eventName: string, properties?: EventProperties): void {
  amplitude.track(eventName, properties);
}

/**
 * Identify user by ID
 * Call on login, pass null on logout
 */
export function identifyUser(userId: string | null): void {
  amplitude.setUserId(userId ?? undefined);
}

/**
 * Set user properties for segmentation
 */
export function setUserProperties(properties: Record<string, unknown>): void {
  const identify = new amplitude.Identify();
  Object.entries(properties).forEach(([key, value]) => {
    identify.set(key, value as string | number | boolean);
  });
  amplitude.identify(identify);
}

/**
 * Reset user session (on logout)
 */
export function resetUser(): void {
  amplitude.reset();
}

/**
 * Track revenue event
 */
export function trackRevenue(data: RevenueData): void {
  const revenue = new amplitude.Revenue()
    .setProductId(data.productId)
    .setPrice(data.price)
    .setQuantity(data.quantity)
    .setRevenueType(data.revenueType);

  amplitude.revenue(revenue);
}

/**
 * Track game-specific events with standard properties
 */
export function trackGameEvent(
  eventName: string,
  properties: EventProperties
): void {
  amplitude.track(eventName, {
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
  amplitude.track(eventName, {
    ...properties,
    eventCategory: 'economy',
  });
}

/**
 * Get current session ID for correlation
 */
export function getSessionId(): number | undefined {
  return amplitude.getSessionId();
}
