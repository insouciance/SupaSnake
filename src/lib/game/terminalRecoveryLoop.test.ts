/**
 * @jest-environment node
 *
 * The post-reload driver for a server-locked outcome (settlement recovery).
 *
 * What these prove is the property the incident lacked: a fresh page load
 * facing a terminal run keeps re-driving the settlement request instead of
 * taking one shot and stopping. The loop owns no tab memory, so a reload
 * re-arms it from server state alone.
 */

import {
  TERMINAL_RECOVERY_RETRY_BASE_MS,
  TERMINAL_RECOVERY_RETRY_MAX_MS,
  startTerminalRecoveryLoop,
  terminalRecoveryDelayMs,
} from './terminalRecoveryLoop';

describe('terminalRecoveryDelayMs', () => {
  it('backs off exponentially from the base delay', () => {
    expect(terminalRecoveryDelayMs(0)).toBe(TERMINAL_RECOVERY_RETRY_BASE_MS);
    expect(terminalRecoveryDelayMs(1)).toBe(TERMINAL_RECOVERY_RETRY_BASE_MS * 2);
    expect(terminalRecoveryDelayMs(2)).toBe(TERMINAL_RECOVERY_RETRY_BASE_MS * 4);
  });

  it('clamps to a ceiling so a long outage still retries regularly', () => {
    expect(terminalRecoveryDelayMs(50)).toBe(TERMINAL_RECOVERY_RETRY_MAX_MS);
    expect(Number.isFinite(terminalRecoveryDelayMs(Number.MAX_SAFE_INTEGER))).toBe(
      true
    );
  });

  it('never returns a negative or non-finite delay', () => {
    expect(terminalRecoveryDelayMs(-5)).toBe(TERMINAL_RECOVERY_RETRY_BASE_MS);
    expect(terminalRecoveryDelayMs(Number.NaN)).toBe(
      TERMINAL_RECOVERY_RETRY_BASE_MS
    );
  });
});

describe('startTerminalRecoveryLoop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps re-driving the fold after a failure instead of giving up once', async () => {
    const attempts: number[] = [];
    const fold = jest.fn(async () => {
      attempts.push(attempts.length);
      return false;
    });

    const cancel = startTerminalRecoveryLoop(fold);

    for (let i = 0; i < 5; i += 1) {
      await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS);
    }
    cancel();

    // The shipped behaviour was exactly one attempt per page load.
    expect(fold.mock.calls.length).toBeGreaterThan(1);
  });

  it('survives a rejected fold and schedules the next attempt', async () => {
    const onError = jest.fn();
    const fold = jest
      .fn<Promise<unknown>, []>()
      .mockRejectedValueOnce(new Error('settlement transport failed'))
      .mockResolvedValue(true);

    const cancel = startTerminalRecoveryLoop(fold, { onError });

    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_BASE_MS);
    expect(fold).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS);
    expect(fold.mock.calls.length).toBeGreaterThan(1);
    cancel();
  });

  it('never overlaps attempts while one is still in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let release: (() => void) | null = null;
    const fold = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      inFlight -= 1;
      return true;
    });

    const cancel = startTerminalRecoveryLoop(fold);
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_BASE_MS);
    // Time keeps passing while the first fold is still open.
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS * 3);

    expect(fold).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);

    release?.();
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS);
    expect(fold.mock.calls.length).toBeGreaterThan(1);
    cancel();
  });

  it('stops entirely once cancelled, and cancels a pending attempt', async () => {
    const fold = jest.fn(async () => true);
    const cancel = startTerminalRecoveryLoop(fold);

    cancel();
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS * 4);

    expect(fold).not.toHaveBeenCalled();
  });

  it('stops scheduling after a cancel that lands mid-flight', async () => {
    let release: (() => void) | null = null;
    const fold = jest.fn(
      async () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        })
    );

    const cancel = startTerminalRecoveryLoop(fold);
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_BASE_MS);
    expect(fold).toHaveBeenCalledTimes(1);

    cancel();
    release?.();
    await jest.advanceTimersByTimeAsync(TERMINAL_RECOVERY_RETRY_MAX_MS * 4);

    expect(fold).toHaveBeenCalledTimes(1);
  });
});
