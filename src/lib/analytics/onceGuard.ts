/**
 * "Count this threshold once per page lifecycle" (WP-F).
 *
 * Two measurement modules need the identical guard — the curriculum's beats
 * and the clan reveal's — and `funnel.ts` already has a third, keyed on its
 * own stage type. A third hand-written copy is how they start disagreeing
 * about whether a reload re-arms, so the shared half lives here and the
 * per-module part is only the key.
 *
 * IN MEMORY, DELIBERATELY. Durable "already counted" deduplication belongs in
 * the analytics warehouse, which can answer "first occurrence per person"
 * across devices. A browser-persistent copy would be a second, wrong ledger of
 * a progression fact — exactly what PEO boundary 9 and Rule 11 forbid, and
 * what `verify:constitution`'s local-progress gate fails the build over.
 *
 * The guard is only populated after analytics is initialised, so a visitor who
 * declined consent leaves no trace here either.
 */

import { isAnalyticsInitialized } from './posthog';

const crossedThisPage = new Set<string>();

/**
 * True when this call is the first crossing of `key` in this page lifecycle.
 * Always false before consent has initialised capture.
 */
export function crossOnce(key: string): boolean {
  if (!isAnalyticsInitialized()) return false;
  if (crossedThisPage.has(key)) return false;
  crossedThisPage.add(key);
  return true;
}

/** Clear lifecycle-only guards when a runtime lifecycle or a test starts. */
export function resetAnalyticsOnceGuards(): void {
  crossedThisPage.clear();
}
