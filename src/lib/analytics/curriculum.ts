/**
 * Genome Discovery telemetry (WP-F; PEO §9.3, TGv2 §11).
 *
 * ONE MODULE, LIKE ./funnel.ts, and for the same reason: every curriculum
 * event has to carry the same three things — the eligibility contract
 * version, the curriculum category, and a `player_cohort` the analysis can
 * filter on — and a uniform shape is what lets the weekly review read one set
 * of numbers instead of nine unrelated ones.
 *
 * ── THE FOUR PROPERTIES THAT ARE NOT NEGOTIABLE ────────────────────────────
 *
 * 1. **Nothing is captured without consent.** Every function here ends in
 *    `trackEvent`/`setUserProperties`, and both return immediately unless
 *    `AnalyticsProvider` has initialised PostHog from a granted analytics
 *    consent. There is no second capture path, no beacon, no server-side
 *    mirror — so "no metric may be collected from a player who has not
 *    consented" (§9.3) is structural rather than reviewed.
 *
 * 2. **The cohort is the server's.** `player_cohort` is stamped from
 *    `players.cohort` (migration 045) as it is returned by
 *    `/api/genome/curriculum`; the browser never asserts its own. Every
 *    conclusion drawn from these events filters `player_cohort = 'player'`,
 *    which is how the dev/QA/fixture accounts stay out of them. The stamp is
 *    a PostHog PERSON property, so it applies to events fired later from
 *    Results and the board, not only to the read that carried it.
 *
 * 3. **No veteran is counted as a new account.** `curriculum_eligibility_read`
 *    carries `banked_runs` and the eligible-prefix size, which is what
 *    separates a genuinely staged account from one backfilled at graduation.
 *    Nothing here re-onboards anybody to manufacture a comparison.
 *
 * 4. **No browser copy of anything.** The once-per-lifecycle guards below are
 *    in-memory Sets, exactly like `trackFunnelStageOnce`'s. A reload re-arms
 *    them; deduplication of a durable fact belongs in the analytics warehouse,
 *    not in a `localStorage` key that would make this file a second, wrong
 *    curriculum ledger (PEO boundary 9).
 *
 * MEASUREMENT, NEVER AUTHORITY. Nothing in this module reads back into
 * gameplay, eligibility, offers or settlement. `verify:constitution`'s
 * score-independence and local-progress gates both hold trivially because
 * this file has no output other than a PostHog capture.
 */

import { AnalyticsEvents, EventCategories } from './events';
import { crossOnce, resetAnalyticsOnceGuards } from './onceGuard';
import { setUserProperties, trackEvent } from './posthog';
import { GENOME_V2_ELIGIBILITY_CONTRACT_VERSION } from '@/shared/game/genes';
import type { GenomeV2ActiveGeneId, GenomeV2Dynasty } from '@/shared/game/genes';

type Properties = Record<string, string | number | boolean>;

/**
 * The stamp every curriculum event carries.
 *
 * `contract_version` is the eligibility contract, not the app version: when it
 * bumps, the staged vocabulary means something different, and a dashboard that
 * mixes the two versions is comparing two products. Cutting on this property
 * is cheaper and more honest than backfilling.
 */
function stamp(properties: Properties): Properties {
  return {
    ...properties,
    contract_version: GENOME_V2_ELIGIBILITY_CONTRACT_VERSION,
    category: EventCategories.CURRICULUM,
  };
}

function capture(event: string, properties: Properties = {}): void {
  trackEvent(event, stamp(properties));
}

/**
 * Once-per-page-lifecycle guard for beats that describe a threshold crossed
 * rather than an action repeated. Shared with the clan reveal's telemetry so
 * the two cannot disagree about what "once" means — see `./onceGuard.ts`.
 */
const once = crossOnce;

/** Clear lifecycle-only guards when a runtime lifecycle or a test starts. */
export const resetCurriculumTelemetryMemory = resetAnalyticsOnceGuards;

// ---------------------------------------------------------------------------
// §9.3's first funnel: arrival → first input → first terminal result → BANK
// ---------------------------------------------------------------------------
// The two ends already fire (ARRIVE on the landing page, ACTIVATE on the first
// banked extraction). These are the two beats between them, which nothing
// measured, and they are fired once per page lifecycle for the same reason
// `trackFunnelStageOnce` is: they describe a threshold, not a repetition.

/** The player's deliberate first direction released the held board. */
export function trackFirstInput(properties: Properties = {}): boolean {
  if (!once('first_input')) return false;
  capture(AnalyticsEvents.ONBOARDING_FIRST_INPUT, properties);
  return true;
}

/** A run reached a terminal result — banked or crashed, both are results. */
export function trackFirstTerminalResult(properties: Properties = {}): boolean {
  if (!once('first_result')) return false;
  capture(AnalyticsEvents.ONBOARDING_FIRST_RESULT, properties);
  return true;
}

// ---------------------------------------------------------------------------
// The curriculum itself
// ---------------------------------------------------------------------------

export interface CurriculumEligibilityRead {
  dynasty: GenomeV2Dynasty;
  /** The account's offer-eligible prefix — the number staged, not the roster. */
  eligibleGeneCount: number;
  /** The Dynasty's complete legal roster, so the prefix has a denominator. */
  rosterSize: number;
  bankedRuns: number;
  trialsOpen: boolean;
  hasTrial: boolean;
  /** `players.cohort`, server-read. Absent when the route could not say. */
  cohort?: string | null;
}

/**
 * The eligibility prefix and contract version (TGv2 §11), read whenever the
 * Workbench composes its annotation.
 *
 * This is also where the cohort reaches PostHog. It is stamped as a person
 * property rather than repeated on every event so that a Results invitation —
 * fired from a surface that never reads eligibility — is still filterable.
 */
export function trackCurriculumEligibility(
  read: CurriculumEligibilityRead
): void {
  if (typeof read.cohort === 'string' && read.cohort.length > 0) {
    setUserProperties({ player_cohort: read.cohort });
  }
  capture(AnalyticsEvents.CURRICULUM_ELIGIBILITY_READ, {
    dynasty: read.dynasty,
    eligible_gene_count: read.eligibleGeneCount,
    roster_size: read.rosterSize,
    banked_runs: read.bankedRuns,
    trials_open: read.trialsOpen,
    has_trial: read.hasTrial,
  });
}

/**
 * Full-roster graduation (TGv2 §11): every Gene in this Dynasty is offer
 * eligible, so the curriculum has nothing left to stage.
 *
 * Fired once per Dynasty per page lifecycle. The durable "when did this
 * account graduate" question is answered by the first occurrence in the
 * warehouse, not by a flag this module would have to keep.
 */
export function trackCurriculumGraduation(
  dynasty: GenomeV2Dynasty,
  rosterSize: number
): boolean {
  if (!once(`graduated:${dynasty}`)) return false;
  capture(AnalyticsEvents.CURRICULUM_GRADUATED, {
    dynasty,
    roster_size: rosterSize,
  });
  return true;
}

/**
 * The INVITATION was shown on Results (§5). Once per attention row: Results
 * re-renders on every settlement tick, and an invitation counted twice makes
 * the **Show me** rate look half as good as it is.
 */
export function trackTrialInvitationShown(
  attentionId: string,
  geneId: GenomeV2ActiveGeneId
): boolean {
  if (!once(`invited:${attentionId}`)) return false;
  capture(AnalyticsEvents.CURRICULUM_TRIAL_INVITED, {
    attention_id: attentionId,
    gene_id: geneId,
  });
  return true;
}

/** **Show me** taken — the attention row transitions to `resolved`. */
export function trackTrialInvitationAccepted(
  attentionId: string,
  geneId: GenomeV2ActiveGeneId
): void {
  capture(AnalyticsEvents.CURRICULUM_TRIAL_ACCEPTED, {
    attention_id: attentionId,
    gene_id: geneId,
  });
}

/**
 * **Not now** — the row transitions to `dismissed`.
 *
 * §9.4 says that if declining correlates with healthier retention the
 * autonomy is preserved, so this event exists to be able to answer that
 * question. It is never an input to whether the invitation appears.
 */
export function trackTrialInvitationDeclined(
  attentionId: string,
  geneId: GenomeV2ActiveGeneId
): void {
  capture(AnalyticsEvents.CURRICULUM_TRIAL_DECLINED, {
    attention_id: attentionId,
    gene_id: geneId,
  });
}

/**
 * REFERENCE (§5): the player reached the Workbench with the invitation still
 * open and the banner introduced the Gene. Once per attention row — a second
 * visit is a reference reopen, which the durable event stream already shows as
 * a second `curriculum_eligibility_read` without inflating this count.
 */
export function trackReferenceOpened(
  attentionId: string,
  geneId: GenomeV2ActiveGeneId
): boolean {
  if (!once(`reference:${attentionId}`)) return false;
  capture(AnalyticsEvents.CURRICULUM_REFERENCE_OPENED, {
    attention_id: attentionId,
    gene_id: geneId,
  });
  return true;
}

/**
 * A trial was set or switched (§4.4). `switched` separates the two, which is
 * the difference between "the player chose" and "the player changed their
 * mind" — §9.4 reads repeated declines and repeated switches differently.
 */
export function trackTrialSelected(
  dynasty: GenomeV2Dynasty,
  geneId: GenomeV2ActiveGeneId,
  switched: boolean
): void {
  capture(AnalyticsEvents.CURRICULUM_TRIAL_SELECTED, {
    dynasty,
    gene_id: geneId,
    switched,
  });
}

/**
 * GUARANTEE CONSUMPTION (§13 decision 7), measured where it is actually
 * spent: a collected offer that contained the trial.
 *
 * Counted in offers, never in runs — so an Ascetic run, Patient's stretched
 * cadence, an ignored or expired relic, Free Play, and a relic-less run all
 * produce nothing here, exactly as they consume nothing server-side. This is
 * the client's own observation of the offer it rendered; the authority is
 * `record_trial_offer`, and the two are compared rather than conflated.
 */
export function trackTrialOfferShown(
  geneId: GenomeV2ActiveGeneId,
  offerId: string,
  source: string
): boolean {
  if (!once(`offer:${offerId}`)) return false;
  capture(AnalyticsEvents.CURRICULUM_TRIAL_OFFERED, {
    gene_id: geneId,
    offer_source: source,
  });
  return true;
}

/**
 * The learning event resolved and the server PROMOTED the Gene.
 *
 * Sourced from the settled run-impact envelope's `gene_unlocked` beat, which
 * only exists when `resolve_learning_event` actually returned — so this
 * measures promotions, never predictions.
 */
export function trackLearningEventResolved(
  sessionId: string,
  geneId: string
): boolean {
  if (!once(`resolved:${sessionId}:${geneId}`)) return false;
  capture(AnalyticsEvents.CURRICULUM_LEARNING_EVENT_RESOLVED, {
    session_id: sessionId,
    gene_id: geneId,
  });
  return true;
}
