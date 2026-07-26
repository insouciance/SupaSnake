/**
 * THE TWO PUSH TRIGGERS. THERE ARE NO OTHERS AND THERE NEVER WILL BE.
 *
 * The Constitution permits a push notification for exactly two events:
 *
 *   1. a **Serpent settlement** — the week the player was already part of
 *      finished and its result exists;
 *   2. a **new Signal** — today's Signal day opened.
 *
 * That is the entire list. Not "to begin with", not "for now". §12.4 names
 * notification volume as a FORBIDDEN response to a retention dip, which means
 * the third trigger can never be justified by a number going down — the
 * situation in which somebody would want it is precisely the situation in
 * which it is forbidden.
 *
 * ── HOW A THIRD TRIGGER IS PREVENTED, IN FOUR INDEPENDENT LAYERS ───────────
 *
 * Layer 1 — TYPES. `PushTriggerId` is `keyof typeof PUSH_TRIGGERS`, and every
 *   function that can cause a send takes that type. A call site that invents
 *   `'daily-take-reminder'` does not compile. `npx tsc --noEmit` is the gate.
 *
 * Layer 2 — A LOAD-TIME INVARIANT. `PUSH_TRIGGER_CAP` is 2 and this module
 *   throws while being imported if the registry disagrees with it. Adding a
 *   third entry does not produce a subtly noisier product; it produces an
 *   application that will not boot and a `npm run build` that fails, because
 *   the cron route and the opt-in panel both import this file.
 *
 * Layer 3 — A RUNTIME GUARD AT THE EDGE. `isPushTriggerId` is applied to
 *   anything arriving from outside the module (a cron query parameter, a
 *   stored row), so an unknown id is rejected before it can reach a send.
 *
 * Layer 4 — THE DATABASE. Migration 053's `push_dispatch_log.trigger_id`
 *   carries a CHECK constraint enumerating these same two strings, and the
 *   send path claims a log row BEFORE it delivers. A third trigger therefore
 *   cannot even be recorded, and since it cannot be recorded it cannot be
 *   sent — the claim fails first.
 *
 *   `triggers.test.ts` asserts all four: the exact id set, the cap, the guard,
 *   and that the migration's CHECK lists the same two ids and no more.
 *
 * ── WHY THESE TWO AND NOT SOMETHING ELSE ───────────────────────────────────
 *
 * Both are WORLD events on a fixed schedule, not player-state events. Neither
 * can be triggered by a player's absence, neither fires more than once per
 * occurrence, and neither knows anything about how much the recipient has been
 * playing. A trigger that reads a player's recent activity is the mechanism by
 * which a notification becomes a nag, and there is no such trigger here.
 *
 * Cadence, therefore: at most one Serpent notification per week and one Signal
 * notification per day — an upper bound of eight per week for a player opted
 * into both, and both are separately opt-out-able.
 */

import type { PushMessage } from '@/lib/push/message';

/** Formats `YYYY-MM-DD` as `26 July 2026`. Nothing else is ever interpolated. */
function formatDay(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return isoDay;
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The context a trigger is allowed to see: one calendar key, and nothing else.
 * There is deliberately no player, no score and no history in this type — a
 * composer that cannot see the recipient cannot write to the recipient.
 */
export interface PushTriggerContext {
  /**
   * `YYYY-MM-DD`. The Monday of the settled Serpent week, or the Signal day.
   * Doubles as the idempotency key: one notification per subscriber per key.
   */
  occurrenceKey: string;
}

export interface PushTriggerDefinition {
  id: string;
  /** Where the Constitution permits this one. Cited, not paraphrased. */
  constitutionRef: string;
  /** The most often this trigger can possibly fire. */
  cadence: 'weekly' | 'daily';
  /** Human label for the opt-in panel. */
  consentLabel: string;
  /** What the player is agreeing to receive, in the opt-in panel. */
  consentDescription: string;
  compose(context: PushTriggerContext): PushMessage;
}

/**
 * The registry. Two entries. `as const` so the keys become the id union.
 *
 * The copy below is the complete set of sentences this product can push at
 * anybody, and both messages describe something that HAPPENED. Neither asks
 * for anything, neither mentions the recipient's absence, neither mentions a
 * clock, and neither carries a link out of the game.
 */
export const PUSH_TRIGGERS = {
  'serpent-settlement': {
    id: 'serpent-settlement',
    constitutionRef: '§7.3 — Sunday midnight UTC it submerges and the hunt settles',
    cadence: 'weekly',
    consentLabel: 'Serpent settlement',
    consentDescription:
      'One notification a week, after the Serpent submerges and the week is settled.',
    compose: ({ occurrenceKey }) => ({
      triggerId: 'serpent-settlement',
      title: 'Your week settled',
      body: `The Serpent submerged for the week of ${formatDay(occurrenceKey)}. The week's depths are on its page.`,
      url: '/serpent',
      tag: `serpent-settlement:${occurrenceKey}`,
    }),
  },
  'signal-new': {
    id: 'signal-new',
    constitutionRef: '§7.2 — one Signal a day, derived from the UTC calendar',
    cadence: 'daily',
    consentLabel: 'New Signal',
    consentDescription:
      'One notification a day, when the day’s Signal opens. Nothing about it is timed to you.',
    compose: ({ occurrenceKey }) => ({
      triggerId: 'signal-new',
      title: 'A new Signal is up',
      body: `The Signal for ${formatDay(occurrenceKey)} is on the board whenever you want it.`,
      url: '/',
      tag: `signal-new:${occurrenceKey}`,
    }),
  },
} as const satisfies Record<string, PushTriggerDefinition>;

/** The union of permitted trigger ids. A third string is a type error. */
export type PushTriggerId = keyof typeof PUSH_TRIGGERS;

/**
 * The cap, as a number the invariant below can compare against. Changing this
 * constant does not authorise a third trigger; the Constitution does, and it
 * does not.
 */
export const PUSH_TRIGGER_CAP = 2;

export const PUSH_TRIGGER_IDS = Object.keys(PUSH_TRIGGERS) as PushTriggerId[];

/**
 * Layer 2. Runs while this module is being imported — by the cron route, by
 * the subscription route and by the opt-in panel — so a third entry breaks the
 * build and the boot, not merely a test.
 */
if (PUSH_TRIGGER_IDS.length !== PUSH_TRIGGER_CAP) {
  throw new Error(
    `Constitution: push is permitted for exactly ${PUSH_TRIGGER_CAP} events ` +
      `(a Serpent settlement and a new Signal). Found ${PUSH_TRIGGER_IDS.length}: ` +
      `${PUSH_TRIGGER_IDS.join(', ')}.`
  );
}

/** Layer 3. The only way an outside string becomes a `PushTriggerId`. */
export function isPushTriggerId(value: unknown): value is PushTriggerId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PUSH_TRIGGERS, value);
}

/** The definition for a permitted id. Total over the union, so it cannot fail. */
export function pushTrigger(id: PushTriggerId): PushTriggerDefinition {
  return PUSH_TRIGGERS[id];
}

/** Compose the message for a trigger. The only composer in the codebase. */
export function composePushMessage(
  id: PushTriggerId,
  context: PushTriggerContext
): PushMessage {
  return PUSH_TRIGGERS[id].compose(context);
}
