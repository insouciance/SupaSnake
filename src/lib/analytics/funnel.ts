/**
 * The Acquisition Engine's funnel, as events (Constitution §11.5).
 *
 * Eight stages, one event each, all routed through trackFunnelStage() so
 * every stage carries the same shape: the stage label, the growth category,
 * and the session's channel attribution. That uniformity is the point — the
 * weekly funnel review (§11.8) reads one dashboard, not eight.
 *
 * | Stage      | Mechanism                                  | Fired by                    |
 * |------------|--------------------------------------------|-----------------------------|
 * | reach      | The channel portfolio (§11.6)              | landing, attributed arrival |
 * | arrive     | Every URL lands playing                    | landing page mount          |
 * | activate   | The aha: first BANKED extraction           | portal BANK, once/browser   |
 * | identify   | Claiming a handle / attaching an email     | signup + handle claim       |
 * | habituate  | Signal ritual, World Report, Dispatch      | WP-1.03 / WP-1.04           |
 * | belong     | Clan founding and joining (§9)             | WP-1.02 / WP-1.07           |
 * | advocate   | Share grids, challenge links, Broodmarks   | share artifacts             |
 * | patronize  | §10                                        | WP-0.09 successors          |
 *
 * The four stages without a shipped mechanism are not dead configuration:
 * they are the argument values later work packages pass to this same
 * function. Adding a parallel event system for them is forbidden.
 *
 * Nothing here is commercial (Rule 7): these are measurements, not surfaces.
 * Capture is inert until analytics consent initialises PostHog.
 */

import { AnalyticsEvents, EventCategories } from './events';
import { trackEvent, setUserProperties, isAnalyticsInitialized } from './posthog';
import {
  attributionProperties,
  channelOf,
  readAttribution,
} from '@/lib/growth/attribution';

export const FunnelStages = {
  REACH: 'reach',
  ARRIVE: 'arrive',
  ACTIVATE: 'activate',
  IDENTIFY: 'identify',
  HABITUATE: 'habituate',
  BELONG: 'belong',
  ADVOCATE: 'advocate',
  PATRONIZE: 'patronize',
} as const;

export type FunnelStage = (typeof FunnelStages)[keyof typeof FunnelStages];

const STAGE_EVENTS: Record<FunnelStage, string> = {
  [FunnelStages.REACH]: AnalyticsEvents.FUNNEL_REACH_ENTERED,
  [FunnelStages.ARRIVE]: AnalyticsEvents.FUNNEL_ARRIVE_ENTERED,
  [FunnelStages.ACTIVATE]: AnalyticsEvents.FUNNEL_ACTIVATE_ENTERED,
  [FunnelStages.IDENTIFY]: AnalyticsEvents.FUNNEL_IDENTIFY_ENTERED,
  [FunnelStages.HABITUATE]: AnalyticsEvents.FUNNEL_HABITUATE_ENTERED,
  [FunnelStages.BELONG]: AnalyticsEvents.FUNNEL_BELONG_ENTERED,
  [FunnelStages.ADVOCATE]: AnalyticsEvents.FUNNEL_ADVOCATE_ENTERED,
  [FunnelStages.PATRONIZE]: AnalyticsEvents.FUNNEL_PATRONIZE_ENTERED,
};

/** The PostHog event name for a stage. Exported for tests and dashboards. */
export function funnelEventName(stage: FunnelStage): string {
  return STAGE_EVENTS[stage];
}

export type FunnelProperties = Record<string, string | number | boolean>;

/**
 * Record entry into a funnel stage. Safe to call anywhere: a no-op until
 * analytics consent has initialised PostHog.
 */
export function trackFunnelStage(
  stage: FunnelStage,
  properties: FunnelProperties = {}
): void {
  trackEvent(funnelEventName(stage), {
    ...attributionProperties(readAttribution()),
    ...properties,
    funnel_stage: stage,
    category: EventCategories.GROWTH,
  });
}

/**
 * Stamp the identified person with their acquisition channel, so cohort
 * retention can be read by channel without joining on the arrival event.
 * Called at account creation — the Constitution's "attach at signup".
 */
export function attachAttributionToPerson(
  extra: Record<string, string | number | boolean> = {}
): void {
  const attribution = readAttribution();
  setUserProperties({
    acquisition_channel: channelOf(attribution),
    ...(attribution
      ? {
          acquisition_source: attribution.source ?? '',
          acquisition_medium: attribution.medium ?? '',
          acquisition_campaign: attribution.campaign ?? '',
          acquisition_referrer_host: attribution.referrerHost ?? '',
          acquisition_landing_path: attribution.landingPath,
        }
      : {}),
    ...extra,
  });
}

/**
 * Once-per-browser stage marker for stages that describe a threshold
 * crossed rather than an action repeated (Activate, Identify). The guard
 * lives in localStorage alongside PostHog's own persistence and is only
 * written once analytics is initialised, so it never appears for a visitor
 * who declined analytics consent.
 *
 * Returns true when this call was the crossing.
 */
export function trackFunnelStageOnce(
  stage: FunnelStage,
  properties: FunnelProperties = {}
): boolean {
  if (!isAnalyticsInitialized()) return false;

  const key = `supasnake-funnel-${stage}`;
  try {
    if (window.localStorage.getItem(key) === '1') return false;
    window.localStorage.setItem(key, '1');
  } catch {
    // Storage-restricted browsers report the stage every time rather than
    // never; an over-count is more honest than a silent gap.
  }

  trackFunnelStage(stage, properties);
  return true;
}
