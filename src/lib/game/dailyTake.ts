/**
 * The Daily Take slot on Results Layer 1 (Constitution §7.2, §5).
 *
 * WP-1.06 owns the *surface*; **WP-1.04 owns the mechanism**. This module is
 * the seam between them, and it is deliberately shaped so that WP-1.04 can
 * land without touching Results at all:
 *
 *   - The run-end settlement (`POST /api/game/session { action: 'end' }`)
 *     MAY include a `dailyTake` object. Until WP-1.04 ships, it does not, and
 *     `parseDailyTake` returns `null` — so the slot simply does not render.
 *     That is the "day's first run" gate: the server decides, never the client
 *     (Rule 11), and "no answer" means "not the first run of the day".
 *
 *   - Collecting posts to `TAKE_COLLECT_ENDPOINT`. Until WP-1.04 creates that
 *     route, Next.js answers 404 and `collectDailyTake` reports `unavailable`
 *     — a clean no-op, not an error: no toast, no Sentry, no red state. The
 *     Take is never lost by not being collected here; §7.2 forbids destructive
 *     absence and WP-1.04's endpoint is idempotent by its own acceptance.
 *
 * The Take is the game's ONE sanctioned collect moment (§7.2). Nothing else on
 * Results claims anything.
 */

/** The single collect route. WP-1.04 implements it; nothing else may claim. */
export const TAKE_COLLECT_ENDPOINT = '/api/daily-take/collect';

/**
 * The read route (ruling D2). Strictly read-only — it reports the slot and can
 * never grant it. The Take moved off Results and onto a floating Home element,
 * and a surface with no settlement payload behind it needs somewhere to ask.
 */
export const TAKE_READ_ENDPOINT = '/api/daily-take';

/**
 * The settlement's optional `dailyTake` block, normalised.
 *
 * `firstRunOfDay` is authoritative: the slot renders only when the server says
 * this run was the day's first. Everything else is display.
 */
export interface DailyTakeSlot {
  /** Server's answer to "was this the day's first run?". */
  firstRunOfDay: boolean;
  /** DNA the Take pays, already multiplied by the streak tier. */
  amount: number;
  /** Current Take streak in days (0 when the streak is starting today). */
  streakDays: number;
  /** Streak tier multiplier applied to `amount` (1 = base). */
  multiplier: number;
  /** True when the server already settled it (double-collect is impossible). */
  collected: boolean;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Read the Take slot out of a settlement payload.
 *
 * Returns `null` for every shape that is not an explicit, first-run-of-day
 * Take — including the current server, which sends no `dailyTake` at all.
 */
export function parseDailyTake(payload: unknown): DailyTakeSlot | null {
  if (!payload || typeof payload !== 'object') return null;
  return normalizeTakeSlot((payload as { dailyTake?: unknown }).dailyTake);
}

/**
 * The same normalisation, applied to a slot that arrived on its own.
 *
 * `GET /api/daily-take` answers with the slot itself rather than wrapping it in
 * a settlement, because the surface that reads it (the Home float, ruling D2)
 * has no run to settle. The rules are identical: no explicit
 * `firstRunOfDay: true`, no slot.
 */
function normalizeTakeSlot(raw: unknown): DailyTakeSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const take = raw as Record<string, unknown>;
  if (take.firstRunOfDay !== true) return null;
  const amount = finiteNumber(take.amount, 0);
  if (amount < 0) return null;
  return {
    firstRunOfDay: true,
    amount: Math.floor(amount),
    streakDays: Math.max(0, Math.floor(finiteNumber(take.streakDays, 0))),
    multiplier: Math.max(1, finiteNumber(take.multiplier, 1)),
    collected: take.collected === true,
  };
}

/**
 * Read today's Take without collecting it.
 *
 * Returns `null` for every shape that is not an offerable Take — flag off,
 * already collected, unauthenticated, unreachable, or a server that does not
 * carry the route. The caller renders nothing in all of those cases, which is
 * the same safe direction the run path takes: an unoffered Take is never a
 * lost one (§7.2, Rule 5).
 */
export async function fetchDailyTake(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DailyTakeSlot | null> {
  let response: Response;
  try {
    response = await fetchImpl(TAKE_READ_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return normalizeTakeSlot(await response.json());
  } catch {
    return null;
  }
}

export type TakeCollectOutcome =
  | { status: 'collected'; amount: number }
  /** The mechanism is not deployed yet (WP-1.04). Treat as a no-op. */
  | { status: 'unavailable' }
  /** A real failure worth telling the player about, inline and once. */
  | { status: 'error' };

/**
 * Collect the day's Take.
 *
 * A missing endpoint (404/405) or an explicitly not-implemented answer (501)
 * is `unavailable`, never `error`: before WP-1.04 lands there is nothing to
 * collect and nothing has gone wrong.
 */
export async function collectDailyTake(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<TakeCollectOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(TAKE_COLLECT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    });
  } catch {
    return { status: 'error' };
  }

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    return { status: 'unavailable' };
  }
  if (!response.ok) return { status: 'error' };

  try {
    const body = (await response.json()) as { amount?: unknown };
    return { status: 'collected', amount: Math.max(0, finiteNumber(body?.amount, 0)) };
  } catch {
    // A 2xx with an unreadable body still means the server settled it.
    return { status: 'collected', amount: 0 };
  }
}
