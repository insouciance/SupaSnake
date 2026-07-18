/**
 * Run-event envelope validation (Player Identity v1 section 9.5).
 *
 * The client ships the engine recorder's output ({ events, truncated })
 * with the session-end request; this module turns it into the stored
 * envelope { v: 1, events, truncated, suspect } - or null.
 *
 * THE ONE STRUCTURAL RULE: run events NEVER affect payout or validation
 * outcomes. A bad payload stores null and the run completes normally -
 * every check below gates only what gets STORED.
 *
 * Reject (store null): parse failure, oversize (>32KB), too many events
 * (>600), non-monotonic times, times beyond duration+5s, more than one
 * terminal event, a terminal event inconsistent with the validated
 * ending, or mutation events outside the validated pick list.
 * Suspect (store with suspect:true): food-event count more than +/-2
 * from the validated food count - kept, because a merely miscounted
 * stream is still useful Analyst input, just untrusted.
 */

import { z } from 'zod';
import {
  RUN_EVENTS_MAX,
  RUN_EVENTS_MAX_BYTES,
  type RunEvent,
  type RunEventEnvelope,
} from '@/shared/game/runEvents';

const runEventSchema = z
  .object({
    t: z.number().int().min(0),
    e: z.enum(['f', 'p', 'b', 'm', 'w', 'x']),
    n: z.number().int().min(1).optional(),
    k: z.enum(['spawn', 'pass', 'enter']).optional(),
    id: z.string().max(64).optional(),
    d: z.number().int().min(1).optional(),
    c: z.enum(['wall', 'self', 'timeout', 'extracted']).optional(),
  })
  .strict();

const runEventRecordSchema = z
  .object({
    events: z.array(runEventSchema).max(RUN_EVENTS_MAX),
    truncated: z.boolean().optional(),
  })
  .strict();

/** The validated run facts the envelope is checked against. */
export interface RunEventValidationContext {
  /** Client-claimed duration in seconds (bounded upstream). */
  durationSeconds: number;
  /** Server-validated food count. */
  foodCount: number;
  /** Server-validated ending. */
  died: boolean;
  extracted: boolean;
  /** Server-validated mutation pick ids. */
  mutationIds: string[];
}

/**
 * Validate a raw run_events payload against the already-validated run
 * facts. Returns the storable envelope, or null when the payload is
 * structurally unacceptable. Never throws.
 */
export function validateRunEvents(
  raw: unknown,
  context: RunEventValidationContext
): RunEventEnvelope | null {
  if (raw === undefined || raw === null) return null;

  // Size bound first - never spend schema time on an oversized blob
  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return null;
  }
  if (!serialized || serialized.length > RUN_EVENTS_MAX_BYTES) {
    return null;
  }

  const parsed = runEventRecordSchema.safeParse(raw);
  if (!parsed.success) return null;

  const events = parsed.data.events as RunEvent[];
  const truncated = parsed.data.truncated === true;

  // Monotonic times, bounded by the run duration (+5s grace)
  const maxT = Math.max(0, Math.floor(context.durationSeconds + 5)) * 10;
  let lastT = -1;
  for (const event of events) {
    if (event.t < lastT) return null;
    if (event.t > maxT) return null;
    lastT = event.t;
  }

  // At most one terminal event, and it must agree with the validated
  // ending (extraction is server-decided; a claimed death cause on a
  // banked run - or vice versa - is a lie).
  const terminals = events.filter((event) => event.e === 'x');
  if (terminals.length > 1) return null;
  if (terminals.length === 1) {
    const cause = terminals[0].c;
    if (!cause) return null;
    if (context.extracted && cause !== 'extracted') return null;
    if (!context.extracted && cause === 'extracted') return null;
    if (!context.extracted && !context.died) return null;
  }

  // Mutation events must be a subset of the validated picks
  const allowedMutations = new Set(context.mutationIds);
  for (const event of events) {
    if (event.e === 'm') {
      if (!event.id || !allowedMutations.has(event.id)) return null;
    }
  }

  // Food-event count vs the validated food count: +/-2 tolerance, else
  // the envelope is kept but flagged suspect (unless truncation explains
  // an undercount).
  const foodEvents = events.filter((event) => event.e === 'f').length;
  const delta = foodEvents - context.foodCount;
  const suspect = truncated
    ? delta > 2
    : delta > 2 || delta < -2;

  return {
    v: 1,
    events,
    truncated,
    suspect,
  };
}
