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
 * | activate   | The aha: first BANKED extraction           | portal BANK, once/page life |
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
import type { LadderRung } from '@/lib/growth/leadLadder';

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
 * Once-per-page-lifecycle stage marker for stages that describe a threshold
 * crossed rather than an action repeated (Activate, Identify). Durable
 * deduplication belongs in analytics, not in a browser copy of a progression
 * fact. This memory guard is only populated after analytics is initialised,
 * so it never appears for a visitor who declined analytics consent.
 *
 * Returns true when this call was the first crossing in this page lifecycle.
 */
const crossedStagesThisPage = new Set<FunnelStage>();

export function trackFunnelStageOnce(
  stage: FunnelStage,
  properties: FunnelProperties = {}
): boolean {
  if (!isAnalyticsInitialized()) return false;
  if (crossedStagesThisPage.has(stage)) return false;
  crossedStagesThisPage.add(stage);

  trackFunnelStage(stage, properties);
  return true;
}

/** Clear lifecycle-only guards when a runtime lifecycle or a test starts. */
export function resetFunnelStageMemory(): void {
  crossedStagesThisPage.clear();
}

/**
 * THE LEAD LADDER (§11.7), AND THE STAGE EVENT IT DELIBERATELY DOES NOT FIRE
 *
 * The ladder is not a second funnel. Its rungs are the identity slice of the
 * eight stages above, and each rung's stage event is ALREADY fired by the
 * mechanism that crosses it:
 *
 *   named      → HandleClaimModal fires IDENTIFY once per page lifecycle on a
 *                successful first claim.
 *   reachable  → the settings email opt-in.
 *   belonging  → clan founding / joining fires BELONG.
 *   advocate   → the share artifacts fire ADVOCATE.
 *
 * So the ladder adds a DIMENSION, not events: `setLadderRung` stamps the
 * person with the rung they have reached, which is what lets the weekly
 * review (§11.8) read D7 or conversion "by rung" without a second event
 * family and without inflating the stage counts. A `trackLadderRung` that
 * re-fired IDENTIFY after the claim modal had already fired it would make
 * "Activation → identity" wrong by exactly the number of people the ladder
 * succeeded with, which is the worst possible instrumentation bug: the
 * better the surface works, the more it lies.
 *
 * The two LADDER_PROMPT_* events measure the invitation itself — the ask and
 * the take-up — which nothing else measures.
 *
 * The `LadderRung` import at the top of this file is type-only on purpose:
 * leadLadder.ts imports FunnelStages from here at runtime, and a type-only
 * edge back is what keeps the two modules from forming a require cycle.
 */

/**
 * Stamp the person with the ladder rung they have reached. Idempotent by
 * nature — PostHog person properties are last-write-wins — so callers may
 * set it on every mount.
 */
export function setLadderRung(rung: LadderRung, height: number): void {
  setUserProperties({ ladder_rung: rung, ladder_rung_height: height });
}

/**
 * The invitation, measured separately from the crossing, so the weekly
 * review reads the ask and the answer as two numbers. `engaged` is the
 * player opening the ceremony or following the link — not completing it.
 * Completion is the mechanism's own stage event.
 */
export function trackLadderPrompt(
  rung: LadderRung,
  engaged: boolean,
  properties: FunnelProperties = {}
): void {
  trackEvent(
    engaged
      ? AnalyticsEvents.LADDER_PROMPT_ENGAGED
      : AnalyticsEvents.LADDER_PROMPT_SHOWN,
    {
      ...attributionProperties(readAttribution()),
      ...properties,
      ladder_rung: rung,
      category: EventCategories.GROWTH,
    }
  );
}
