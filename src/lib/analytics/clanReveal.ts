/**
 * Clan-handoff telemetry (WP-F item 5; PEO §6, §9.3).
 *
 * The sibling of `./curriculum.ts`, written separately for the same reason
 * `clanRevealAttention.ts` is separate from `curriculumAttention.ts`: the two
 * invitations share a row shape and nothing else. Folding their measurement
 * together would make a change to Gene copy able to move a clan number.
 *
 * WHAT §9.3 ASKS FOR, AND WHAT IS ALREADY ANSWERED
 *
 *   "clan reveal open, join/found/solo/Not now, first eligible contribution,
 *    and D30 retention by clan status"
 *
 * Founding, joining and the clan of one are OUTCOMES, and the taxonomy already
 * names them (`CLAN_CREATED`, `CLAN_JOINED`) with `BELONG` as their funnel
 * stage. Re-firing them here would inflate exactly the counts the reveal is
 * supposed to be measured against. What nothing measured is the **ask** —
 * shown, taken, declined — and the first run that actually counted for a clan.
 * Those four are what this module adds.
 *
 * Same four properties as the curriculum's: consent-gated to the last
 * function, cohort-filterable through the person property the curriculum read
 * stamps, promotions rather than predictions (the contribution beat is read
 * from the settled clan result, never from a client guess), and no browser
 * copy of anything.
 */

import { AnalyticsEvents, EventCategories } from './events';
import { crossOnce } from './onceGuard';
import { trackEvent } from './posthog';

type Properties = Record<string, string | number | boolean>;

function capture(event: string, properties: Properties = {}): void {
  trackEvent(event, { ...properties, category: EventCategories.SOCIAL });
}

/**
 * The reveal was shown as Results' single recommended action.
 *
 * Once per attention row, and the row is once per ACCOUNT — its `source_id` is
 * a constant, so a replayed settlement, the recovery sweep and every later
 * bank all collide with the same row. Counting it per render would make the
 * take-up rate look worse the more often a player revisited Results.
 */
export function trackClanRevealShown(attentionId: string): boolean {
  if (!crossOnce(`clan-reveal:shown:${attentionId}`)) return false;
  capture(AnalyticsEvents.CLAN_REVEAL_SHOWN, { attention_id: attentionId });
  return true;
}

/** **Show me** taken — the row transitions to `resolved` and routes to /clan. */
export function trackClanRevealAccepted(attentionId: string): void {
  capture(AnalyticsEvents.CLAN_REVEAL_ACCEPTED, { attention_id: attentionId });
}

/**
 * **Not now** — the row transitions to `dismissed` and never re-nags.
 *
 * §9.4's rule applies here as it does to the curriculum: if declining
 * correlates with healthier retention, the autonomy is preserved. This event
 * exists so that question is answerable, and it is never an input to whether
 * the reveal appears.
 */
export function trackClanRevealDeclined(attentionId: string): void {
  capture(AnalyticsEvents.CLAN_REVEAL_DECLINED, { attention_id: attentionId });
}

export interface ClanContributionBeat {
  sessionId: string;
  /** The run entered the player's five rather than merely being valid. */
  enteredTopFive: boolean;
  /** It replaced a weaker counted result instead of filling an empty slot. */
  replaced: boolean;
  /** Clan Depth this run added, when the server stated one. */
  delta?: number;
}

/**
 * A run that COUNTED for a clan (§6 step 5).
 *
 * §9.3 asks for the "first eligible contribution", and this fires on every
 * one: "first" is a question the event stream answers per person, and a client
 * that tried to decide it for itself would need a durable browser record of a
 * progression fact — the thing boundary 9 forbids. One event per settled
 * session, sourced from the server's own clan result.
 *
 * `entered_top_five` and `replaced` are separated because §9.3 asks whether
 * new members "feel useful before they rank highly": entering an empty slot
 * and displacing your own weaker run are different experiences, and a single
 * "contributed" flag cannot tell them apart.
 */
export function trackClanContribution(beat: ClanContributionBeat): boolean {
  if (!crossOnce(`clan-contribution:${beat.sessionId}`)) return false;
  capture(AnalyticsEvents.CLAN_CONTRIBUTION_COUNTED, {
    entered_top_five: beat.enteredTopFive,
    replaced: beat.replaced,
    ...(typeof beat.delta === 'number' && Number.isFinite(beat.delta)
      ? { clan_depth_delta: beat.delta }
      : {}),
  });
  return true;
}
