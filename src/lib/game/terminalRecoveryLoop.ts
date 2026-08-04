/**
 * The post-reload driver for a server-locked run outcome.
 *
 * A run the server has terminalized (`continuity_phase = 'terminal'`,
 * `ended_at IS NULL`) carries real, already-earned value, but nothing on the
 * server sweeps it into settlement: `expire_stale_game_sessions` skips every
 * continuity row, and both pending-settlement scans require a durable envelope
 * such a run never staged. The browser is its only driver.
 *
 * The shipped recovery took exactly one shot per page load and stored its
 * retry queue in tab memory, so a reload erased the queue while the server row
 * stayed open. One slow or failed fold therefore stranded the run permanently —
 * and an open row makes `action: 'start'` answer 409 on every device, which is
 * how a single interrupted run turned into an account that could not play.
 *
 * This loop is the missing driver: it keeps asking, with exponential backoff,
 * for as long as the surface is open, and it is re-armed by a fresh page load
 * because it is derived from server state rather than from tab memory.
 */

export const TERMINAL_RECOVERY_RETRY_BASE_MS = 2_000;
export const TERMINAL_RECOVERY_RETRY_MAX_MS = 30_000;

/** Exponential backoff, clamped so a long outage still retries twice a minute. */
export function terminalRecoveryDelayMs(attempt: number): number {
  const bounded = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  // Clamp the exponent before shifting: a very large attempt count must not
  // overflow into Infinity and hand `setTimeout` a non-finite delay.
  const exponent = Math.min(bounded, 16);
  return Math.min(
    TERMINAL_RECOVERY_RETRY_BASE_MS * 2 ** exponent,
    TERMINAL_RECOVERY_RETRY_MAX_MS
  );
}

export interface TerminalRecoveryLoopOptions {
  onError?: (error: unknown) => void;
  /** Injectable for tests; defaults to the DOM timers. */
  setTimeoutFn?: (handler: () => void, ms: number) => number;
  clearTimeoutFn?: (handle: number) => void;
}

/**
 * Drive `attemptFold` repeatedly with backoff until the returned canceller is
 * called. Attempts never overlap: the next one is scheduled only once the
 * previous settles, so a slow fold cannot stack duplicate settlement requests.
 * The loop never gives up on its own — only the caller's teardown stops it,
 * because the value it is recovering does not expire.
 */
export function startTerminalRecoveryLoop(
  attemptFold: () => Promise<unknown>,
  options: TerminalRecoveryLoopOptions = {}
): () => void {
  const setTimer =
    options.setTimeoutFn ??
    ((handler: () => void, ms: number) =>
      setTimeout(handler, ms) as unknown as number);
  const clearTimer =
    options.clearTimeoutFn ??
    ((handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));

  let cancelled = false;
  let attempt = 0;
  let handle: number | null = null;

  const schedule = () => {
    if (cancelled) return;
    const delay = terminalRecoveryDelayMs(attempt);
    attempt += 1;
    handle = setTimer(() => {
      handle = null;
      if (cancelled) return;
      void Promise.resolve()
        .then(attemptFold)
        .catch((error) => {
          if (cancelled) return;
          options.onError?.(error);
        })
        .then(() => {
          if (cancelled) return;
          schedule();
        });
    }, delay);
  };

  schedule();

  return () => {
    cancelled = true;
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  };
}
