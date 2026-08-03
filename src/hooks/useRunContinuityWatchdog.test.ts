import { act, renderHook } from '@testing-library/react';
import {
  useRunContinuityWatchdog,
  type RunContinuityHeartbeat,
} from './useRunContinuityWatchdog';

const CONNECTION_BUDGET_MS = 10_000;

describe('useRunContinuityWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('re-arms the full safety budget for a resumed lease and each accepted checkpoint', () => {
    const onExpired = jest.fn();
    let heartbeat: RunContinuityHeartbeat = { acceptedAt: Date.now() };
    const { rerender } = renderHook(
      ({ currentHeartbeat }) => useRunContinuityWatchdog({
        enabled: true,
        heartbeat: currentHeartbeat,
        budgetMs: CONNECTION_BUDGET_MS,
        onExpired,
      }),
      { initialProps: { currentHeartbeat: heartbeat } }
    );

    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(onExpired).not.toHaveBeenCalled();

    // The rotated lease returned by resume is already authoritative. The next
    // successful checkpoint receipt renews that authority before the original
    // deadline, so the old timer must not manufacture a connection hold.
    heartbeat = { acceptedAt: Date.now() };
    rerender({ currentHeartbeat: heartbeat });
    act(() => {
      jest.advanceTimersByTime(1_001);
    });
    expect(onExpired).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(CONNECTION_BUDGET_MS - 1_001);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('holds at ten seconds when checkpoint renewal truly fails', () => {
    const onExpired = jest.fn();
    const heartbeat: RunContinuityHeartbeat = { acceptedAt: Date.now() };
    renderHook(() => useRunContinuityWatchdog({
      enabled: true,
      heartbeat,
      budgetMs: CONNECTION_BUDGET_MS,
      onExpired,
    }));

    act(() => {
      jest.advanceTimersByTime(CONNECTION_BUDGET_MS - 1);
    });
    expect(onExpired).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
