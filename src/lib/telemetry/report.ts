/**
 * The fail-open reporting primitive (CE-5).
 *
 * Every telemetry call in this codebase routes through here. It exists for one
 * reason, and it is the doctrine's named trap (FM-3, validation-couples-
 * availability) in its cheapest form: a diagnostic must never be able to end a
 * run. The governor's breadcrumb (`useRenderQuality.ts:63-72`) already wrapped
 * its single Sentry call in a `try/catch` with exactly that comment. CE-5 adds
 * capture to the engine tick, the reducer, every continuity rejection and the
 * settlement path — dozens of sites, several of them inside the hot loop — and
 * repeating that guard by hand at each one is how the guard eventually gets
 * forgotten at the site that needed it most.
 *
 * So the guard lives here, once, and the rule is mechanical: nothing in this
 * module throws, for any input, ever. Both exported functions swallow their own
 * failures deliberately — that is not FM-2 (silent swallow), because there is no
 * caller-visible consequence to record and no player-visible behaviour to
 * degrade. A telemetry sink that is down is a telemetry problem.
 *
 * Isomorphic on purpose: `@sentry/nextjs` initialises in both runtimes
 * (`src/instrumentation-client.ts` for the browser, `sentry.server.config.ts`
 * via `src/instrumentation.ts` for Node), and the engine reducer this reports
 * from runs in BOTH — live in the tab and again server-side inside the replay
 * validator. Nothing here may import a server-only or browser-only symbol.
 */

import * as Sentry from '@sentry/nextjs';

export type TelemetryLevel = 'info' | 'warning' | 'error';

/**
 * A stable namespace for a family of telemetry. Adding a channel is adding a
 * queryable dataset, so they are enumerated rather than free-form: the whole
 * point of CE-5 is that a dashboard can name what it reads.
 */
export type TelemetryChannel =
  | 'engine-tick'
  | 'engine-reducer'
  | 'run-continuity'
  | 'run-settlement'
  | 'run-dilation'
  | 'run-governor'
  | 'run-input'
  | 'run-death';

export interface TelemetryReport {
  channel: TelemetryChannel;
  /** Short, stable, human-first. Variable parts belong in `data`, not here. */
  message: string;
  level?: TelemetryLevel;
  /**
   * Low-cardinality only — Sentry indexes these. Session and player ids are
   * NOT tags; they go in `data`.
   */
  tags?: Record<string, string | number | boolean | null | undefined>;
  /** Arbitrary structured context. Serialised by Sentry, not by us. */
  data?: Record<string, unknown>;
  /**
   * Grouping key. Defaults to `[channel, message]`, which keeps one channel's
   * events in one issue instead of one issue per distinct variable value.
   */
  fingerprint?: string[];
  /** When present the report is captured as an exception, keeping the stack. */
  error?: unknown;
}

/** Sentry tags must be primitives; anything else is dropped rather than sent. */
function tagValues(
  tags: TelemetryReport['tags']
): Record<string, string> | undefined {
  if (!tags) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Development gets the line on the console too. Production does not: Next's
 * `compiler.removeConsole` (next.config.js:38) strips every `console.*` from
 * the production build in BOTH runtimes, so a production log line is not a
 * channel that exists. Sentry is the only queryable sink there, which is why
 * CE-5 routes the facts through it rather than through structured logging.
 */
function devLog(level: TelemetryLevel, channel: string, message: string, data?: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  const line = `[${channel}] ${message}`;
  if (level === 'error') console.error(line, data ?? '');
  else if (level === 'warning') console.warn(line, data ?? '');
  else console.info(line, data ?? '');
}

/**
 * Emit one telemetry event. Never throws.
 *
 * Use for facts worth an issue: a fault, a refusal, a per-run summary. For
 * per-tick or per-segment volume use {@link telemetryBreadcrumb} instead — a
 * breadcrumb costs an array push and rides along on whatever event comes next.
 */
export function reportTelemetry(report: TelemetryReport): void {
  const level = report.level ?? 'error';
  try {
    devLog(level, report.channel, report.message, report.data);
  } catch {
    // A console that rejects its own arguments must not stop the capture below.
  }
  try {
    const context = {
      level,
      tags: { telemetry_channel: report.channel, ...(tagValues(report.tags) ?? {}) },
      extra: report.data,
      fingerprint: report.fingerprint ?? [report.channel, report.message],
    } as const;
    if (report.error !== undefined) {
      Sentry.captureException(report.error, context);
    } else {
      Sentry.captureMessage(report.message, context);
    }
  } catch {
    // Diagnostics. It must never be able to break a run. (The governor's rule,
    // now the whole codebase's — see this file's header.)
  }
}

/**
 * Record a breadcrumb. Never throws.
 *
 * The cheap channel: no event is sent, the crumb is buffered in-process and
 * attached to the next captured event from the same scope. This is what the
 * high-frequency instruments (dilation segments, tier changes, input samples)
 * use, so that when something DOES fail the trail is already there.
 */
export function telemetryBreadcrumb(
  crumb: Pick<TelemetryReport, 'channel' | 'message' | 'level' | 'data'>
): void {
  const level = crumb.level ?? 'info';
  try {
    Sentry.addBreadcrumb({
      category: crumb.channel,
      level,
      message: crumb.message,
      data: crumb.data,
    });
  } catch {
    // As above: a breadcrumb is diagnostics.
  }
}
