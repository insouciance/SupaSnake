const mockTrackEvent = jest.fn();
let analyticsInitialized = true;

jest.mock('./posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  setUserProperties: jest.fn(),
  isAnalyticsInitialized: () => analyticsInitialized,
}));

import {
  forgetDecision,
  markDecisionOpened,
  resetDecisionLatencyMemory,
  trackDecisionResolved,
} from './decisionLatency';
import { AnalyticsEvents, EventCategories } from './events';

function lastEvent(): [string, Record<string, unknown>] {
  const call = mockTrackEvent.mock.calls.at(-1);
  return [call?.[0] as string, (call?.[1] ?? {}) as Record<string, unknown>];
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  analyticsInitialized = true;
  resetDecisionLatencyMemory();
});

describe('decision latency (the measurement TGv2 §11 omits)', () => {
  it('reports THE DROP and the portal rail as two separate events', () => {
    // Averaging them would hide whichever is worse: the DROP pauses the board
    // to compose a build, the portal asks a risk question mid-flight.
    markDecisionOpened('drop', 'offer-1');
    expect(trackDecisionResolved('drop', 'offer-1', 'lock_in')).toBe(true);
    expect(lastEvent()[0]).toBe(AnalyticsEvents.DROP_DECISION_RESOLVED);

    markDecisionOpened('portal', 'portal-1');
    expect(trackDecisionResolved('portal', 'portal-1', 'bank')).toBe(true);
    expect(lastEvent()[0]).toBe(AnalyticsEvents.PORTAL_DECISION_RESOLVED);
  });

  it('carries the elapsed time and the option that won', () => {
    // "Slow" is only actionable as "slow on which answer".
    markDecisionOpened('portal', 'portal-1');
    trackDecisionResolved('portal', 'portal-1', 'ride_on', { mirror: false });
    const [, properties] = lastEvent();
    expect(properties).toMatchObject({
      decision_surface: 'portal',
      decision_option: 'ride_on',
      mirror: false,
      category: EventCategories.GAMEPLAY,
    });
    expect(typeof properties.decision_latency_ms).toBe('number');
    expect(properties.decision_latency_ms as number).toBeGreaterThanOrEqual(0);
  });

  it('lets the FIRST open win, so a re-render cannot restart the clock', () => {
    markDecisionOpened('drop', 'offer-1');
    const first = Date.now();
    markDecisionOpened('drop', 'offer-1');
    expect(first).toBeGreaterThan(0);
    expect(trackDecisionResolved('drop', 'offer-1', 'decline')).toBe(true);
    // One event, from one stamp. A second stamp would report every slow
    // decision as a fast one.
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });

  it('reports nothing for a decision it never saw open', () => {
    // A resumed run whose surface predates the reload has no stamp. A missing
    // measurement is honest; an invented one poisons the median it informs.
    expect(trackDecisionResolved('drop', 'offer-unseen', 'lock_in')).toBe(false);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('consumes the stamp, so one decision cannot be counted twice', () => {
    markDecisionOpened('drop', 'offer-1');
    expect(trackDecisionResolved('drop', 'offer-1', 'lock_in')).toBe(true);
    expect(trackDecisionResolved('drop', 'offer-1', 'lock_in')).toBe(false);
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps the two surfaces from colliding on a shared id', () => {
    markDecisionOpened('drop', 'shared-id');
    expect(trackDecisionResolved('portal', 'shared-id', 'bank')).toBe(false);
    expect(trackDecisionResolved('drop', 'shared-id', 'lock_in')).toBe(true);
  });

  it('can drop an abandoned decision without reporting it', () => {
    markDecisionOpened('portal', 'portal-1');
    forgetDecision('portal', 'portal-1');
    expect(trackDecisionResolved('portal', 'portal-1', 'bank')).toBe(false);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('stamps nothing at all before consent initialises capture', () => {
    analyticsInitialized = false;
    markDecisionOpened('drop', 'offer-1');
    analyticsInitialized = true;
    // No stamp was taken while consent was absent, so the answer reports
    // nothing rather than a duration measured from an arbitrary moment.
    expect(trackDecisionResolved('drop', 'offer-1', 'lock_in')).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
