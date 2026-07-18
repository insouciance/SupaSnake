/**
 * Run-event capture (Player Identity v1 section 9.5) - the compact
 * discrete-event vocabulary shared by the engine recorder
 * (SnakeGameLogic) and the server validator (runEventValidator).
 *
 * Events are ~25 bytes each: { t, e, ...one small field }.
 * - t: DECISECONDS since run start (compact, and coarse enough to be
 *   useless for replay-cheating).
 * - e: event code:
 *     f  food eaten            (n = food index, 1-based)
 *     p  portal                (k = 'spawn' | 'pass' | 'enter')
 *     b  bank                  (extraction committed)
 *     m  mutation pick         (id = mutation id)
 *     w  near-wall episode     (>=500ms inside the 1-cell wall margin;
 *                               emitted at episode END with t = end
 *                               time and d = duration in deciseconds,
 *                               so the stream stays monotonic in t)
 *     x  terminal              (c = death cause:
 *                               wall | self | timeout | extracted)
 *
 * Bounds (enforced by the recorder AND re-checked server-side): <=600
 * events then a truncated flag (the terminal event always survives -
 * it displaces the last non-terminal one at the cap), <=32KB envelope.
 *
 * RUN EVENTS NEVER INFLUENCE PAYOUTS, RECORDS, OR LEADERBOARDS -
 * display and Analyst input only. A bad payload stores NULL and the run
 * completes normally.
 */

export type RunEventCode = 'f' | 'p' | 'b' | 'm' | 'w' | 'x';

export type PortalAction = 'spawn' | 'pass' | 'enter';

/** How a run ended - game_sessions.death_cause values (migration 022). */
export type RunDeathCause = 'wall' | 'self' | 'timeout' | 'extracted';

export interface RunEvent {
  /** Deciseconds since run start. */
  t: number;
  e: RunEventCode;
  /** f: food index (1-based). */
  n?: number;
  /** p: portal action. */
  k?: PortalAction;
  /** m: mutation id. */
  id?: string;
  /** w: episode duration in deciseconds. */
  d?: number;
  /** x: death cause. */
  c?: RunDeathCause;
}

/** Recorder output - what the game page sends with the end request. */
export interface RunEventRecord {
  events: RunEvent[];
  truncated: boolean;
}

/** The stored envelope shape (game_sessions.run_events). */
export interface RunEventEnvelope {
  v: 1;
  events: RunEvent[];
  truncated: boolean;
  suspect: boolean;
}

/** Hard cap on captured events per run. */
export const RUN_EVENTS_MAX = 600;

/** Hard cap on the serialized envelope size. */
export const RUN_EVENTS_MAX_BYTES = 32 * 1024;

/** Minimum near-wall dwell (ms) before an episode is worth an event. */
export const NEAR_WALL_MIN_MS = 500;

export const RUN_DEATH_CAUSES: readonly RunDeathCause[] = [
  'wall',
  'self',
  'timeout',
  'extracted',
] as const;

export function isRunDeathCause(value: unknown): value is RunDeathCause {
  return (
    typeof value === 'string' &&
    (RUN_DEATH_CAUSES as readonly string[]).includes(value)
  );
}
