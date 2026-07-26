/**
 * What a push notification is allowed to be (Constitution Rule 5, Rule 7, §12.4).
 *
 * A push is the most invasive surface this product has: it arrives on a locked
 * phone, uninvited, with no page for context. Everything about this module is
 * an attempt to make it impossible for that surface to become a lever.
 *
 * THE STRONGEST PROPERTY HERE: THE MESSAGE SET IS ENUMERABLE
 *
 *   Notification copy is never assembled from content. It is authored in
 *   `triggers.ts`, one message per trigger, and the ONLY value ever
 *   interpolated is a formatted calendar date. No condition name, no
 *   objective, no player number, no clan, no rank — nothing whose future value
 *   an author cannot see today.
 *
 *   That is not squeamishness about strings. It means the complete set of
 *   sentences this system can ever emit is finite and can be swept
 *   exhaustively by a test, rather than sampled. It also removes an ugly
 *   operational failure: if a future anomaly were named "Decay Field", an
 *   interpolating composer would trip the Rule 5 lint and silently stop
 *   sending the Signal notification. Content cannot break policy if content
 *   never reaches the copy.
 *
 * THE SWEEP RUNS IN PRODUCTION, NOT ONLY IN CI
 *
 *   `assertSendable` is called on the send path, not merely in tests, and it
 *   THROWS rather than logging. A message that trips either lint is not
 *   softened, truncated or replaced with a fallback — it is not sent, and the
 *   failure is loud. Rule 7's own precedent (`sendSettlementEmail`) refuses
 *   the same way for the same reason.
 *
 * WHAT A PUSH MESSAGE STRUCTURALLY CANNOT CARRY
 *
 *   - A badge. Rule 7 names badges alongside offers; there is no field for
 *     one on `PushMessage` and the service worker never sets `app_badge`.
 *   - An off-site link. `url` is validated as a same-origin path, so a
 *     notification cannot route somebody to a storefront, a survey or an
 *     external campaign page.
 *   - `requireInteraction`. A notification that will not dismiss itself is a
 *     notification that nags.
 */

import { sweepMessage } from '@/lib/growth/commercialLanguage';
import { sweepForLoss } from '@/lib/growth/lossLanguage';

export interface PushMessage {
  /** Which of the two permitted triggers produced this. */
  triggerId: string;
  title: string;
  body: string;
  /** A same-origin path the notification opens. Never an absolute URL. */
  url: string;
  /**
   * Collapse key. Two notifications with the same tag replace one another on
   * the device, so a retried dispatch can never stack two cards for the same
   * week or the same day.
   */
  tag: string;
}

/** Refusal, with the rules that tripped, so a failure names itself. */
export class PushCopyRefusal extends Error {
  readonly hits: readonly string[];
  constructor(hits: readonly string[]) {
    super(`Push copy refused: ${hits.join('; ')}`);
    this.name = 'PushCopyRefusal';
    this.hits = hits;
  }
}

/** A same-origin path: leading slash, no scheme, no protocol-relative prefix. */
export function isSameOriginPath(url: string): boolean {
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  if (/[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

/**
 * Every rule the message trips, across BOTH lints and every human-readable
 * part. Empty means the message may be sent.
 */
export function sweepPushMessage(message: PushMessage): string[] {
  const prose = { title: message.title, body: message.body };
  return [...sweepMessage(prose), ...sweepForLoss(prose)];
}

/**
 * The gate every sender must pass through. Throws `PushCopyRefusal` on a
 * vocabulary hit and a plain `Error` on a structurally invalid message.
 */
export function assertSendable(message: PushMessage): void {
  if (!message.title.trim() || !message.body.trim()) {
    throw new Error('Push message must carry a title and a body');
  }
  if (!isSameOriginPath(message.url)) {
    throw new Error(`Push message url must be a same-origin path: ${message.url}`);
  }
  const hits = sweepPushMessage(message);
  if (hits.length > 0) throw new PushCopyRefusal(hits);
}

/**
 * The wire payload. Deliberately minimal — a title, a body, a path and a tag.
 * There is no `image`, no `actions`, no `badge` and no `data` blob through
 * which something else could ride along.
 */
export function pushPayload(message: PushMessage): string {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
  });
}
