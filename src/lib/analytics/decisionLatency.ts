/**
 * How long a decision surface was held open before the player answered it
 * (WP-F, owner-adjacent addition to the TGv2 §11 catalog).
 *
 * WHY §11 NEEDED THIS. Its list records which option won every decision and
 * never how long the decision took. That makes "the game interrupts too much"
 * unfalsifiable: a surface opened often and answered in 900ms is a rhythm, and
 * the same surface answered in nine seconds is an interruption, and the shipped
 * telemetry cannot tell those two products apart. One number separates them.
 *
 * TWO SURFACES, TWO EVENTS. THE DROP pauses the board to compose a build; the
 * portal rail asks a risk question mid-flight. They cost the player different
 * things, so averaging them together would hide whichever is worse. Each event
 * carries the elapsed milliseconds and the option that won, so "slow" can
 * always be read as "slow on which answer".
 *
 * MEASUREMENT, NEVER A CLOCK THE PLAYER CAN FEEL. Nothing here is rendered,
 * nothing is a deadline, and nothing reads back into the run: R1 forbids new
 * in-run surfaces, and a timer that changed behaviour would be one. The open
 * stamp lives in module memory for the length of the decision and is discarded
 * when it resolves — no browser storage, so no second ledger (boundary 9).
 *
 * Consent-gated like everything else: `trackEvent` is inert until
 * AnalyticsProvider initialises PostHog from a granted analytics consent, and
 * `markDecisionOpened` records nothing before that.
 */

import { AnalyticsEvents, EventCategories } from './events';
import { isAnalyticsInitialized, trackEvent } from './posthog';

/** The two decision surfaces a run can present. */
export type DecisionSurface = 'drop' | 'portal';

const EVENT: Record<DecisionSurface, string> = {
  drop: AnalyticsEvents.DROP_DECISION_RESOLVED,
  portal: AnalyticsEvents.PORTAL_DECISION_RESOLVED,
};

/**
 * A decision's open stamp, keyed by the surface's own identity — the offer id
 * or the portal id — so a re-render cannot restart the clock and two decisions
 * cannot be confused for one.
 */
const openedAt = new Map<string, number>();

function key(surface: DecisionSurface, decisionId: string): string {
  return `${surface}:${decisionId}`;
}

function now(): number {
  return typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Stamp the moment a decision surface became answerable.
 *
 * Idempotent per decision id: the FIRST open wins, because a re-render is not
 * a new decision and treating it as one would report every slow decision as a
 * fast one.
 */
export function markDecisionOpened(
  surface: DecisionSurface,
  decisionId: string
): void {
  if (!isAnalyticsInitialized()) return;
  const id = key(surface, decisionId);
  if (openedAt.has(id)) return;
  openedAt.set(id, now());
}

/**
 * Report the answer and how long it took.
 *
 * Fires only when the open stamp exists, which is what keeps a resumed run
 * from reporting a decision that was opened before the reload as though it had
 * taken hours: no stamp, no event. A missing measurement is honest; an
 * invented one would poison the median it is meant to inform.
 *
 * Returns true when an event was captured.
 */
export function trackDecisionResolved(
  surface: DecisionSurface,
  decisionId: string,
  option: string,
  properties: Record<string, string | number | boolean> = {}
): boolean {
  const id = key(surface, decisionId);
  const opened = openedAt.get(id);
  openedAt.delete(id);
  if (opened === undefined) return false;
  const elapsed = Math.max(0, Math.round(now() - opened));
  trackEvent(EVENT[surface], {
    ...properties,
    decision_surface: surface,
    decision_option: option,
    decision_latency_ms: elapsed,
    category: EventCategories.GAMEPLAY,
  });
  return true;
}

/**
 * Drop a decision's stamp without reporting it — an abandoned run, a resume
 * that replaced the surface, or a test starting over.
 */
export function forgetDecision(
  surface: DecisionSurface,
  decisionId: string
): void {
  openedAt.delete(key(surface, decisionId));
}

/** Clear every open stamp. For a runtime lifecycle boundary or a test. */
export function resetDecisionLatencyMemory(): void {
  openedAt.clear();
}
