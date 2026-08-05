const mockTrackEvent = jest.fn();
let analyticsInitialized = true;

jest.mock('./posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  setUserProperties: jest.fn(),
  isAnalyticsInitialized: () => analyticsInitialized,
}));

import {
  trackClanContribution,
  trackClanRevealAccepted,
  trackClanRevealDeclined,
  trackClanRevealShown,
} from './clanReveal';
import { resetAnalyticsOnceGuards } from './onceGuard';
import { AnalyticsEvents, EventCategories } from './events';

function lastEvent(): [string, Record<string, unknown>] {
  const call = mockTrackEvent.mock.calls.at(-1);
  return [call?.[0] as string, (call?.[1] ?? {}) as Record<string, unknown>];
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  analyticsInitialized = true;
  resetAnalyticsOnceGuards();
});

describe('the clan handoff, measured as the ask (PEO §6, §9.3)', () => {
  it('records shown, taken and declined as three separate social events', () => {
    trackClanRevealShown('attention-clan');
    trackClanRevealAccepted('attention-clan');
    trackClanRevealDeclined('attention-clan');
    expect(mockTrackEvent.mock.calls.map((call) => call[0])).toEqual([
      AnalyticsEvents.CLAN_REVEAL_SHOWN,
      AnalyticsEvents.CLAN_REVEAL_ACCEPTED,
      AnalyticsEvents.CLAN_REVEAL_DECLINED,
    ]);
    for (const [, properties] of mockTrackEvent.mock.calls) {
      expect(properties).toMatchObject({
        category: EventCategories.SOCIAL,
        attention_id: 'attention-clan',
      });
    }
  });

  it('counts the ask once, however often Results re-renders', () => {
    // The row's `source_id` is a constant, so the reveal is once per ACCOUNT.
    // Counting it per render would make take-up look worse the more often a
    // player revisited Results.
    expect(trackClanRevealShown('attention-clan')).toBe(true);
    expect(trackClanRevealShown('attention-clan')).toBe(false);
    expect(
      mockTrackEvent.mock.calls.filter(
        (call) => call[0] === AnalyticsEvents.CLAN_REVEAL_SHOWN
      )
    ).toHaveLength(1);
  });

  it('fires no clan event at all before consent initialises capture', () => {
    analyticsInitialized = false;
    expect(trackClanRevealShown('attention-clan')).toBe(false);
    expect(
      trackClanContribution({
        sessionId: 's1',
        enteredTopFive: true,
        replaced: false,
      })
    ).toBe(false);
    // The unguarded pair still routes through `trackEvent`, which is itself
    // inert without initialisation — the real gate, asserted in posthog.test.
    expect(
      mockTrackEvent.mock.calls.filter(
        (call) => call[0] === AnalyticsEvents.CLAN_REVEAL_SHOWN
      )
    ).toHaveLength(0);
  });
});

describe('a run that counted for a clan', () => {
  it('separates entering an empty slot from displacing a weaker result', () => {
    // §9.3 asks whether new members "feel useful before they rank highly", and
    // a single "contributed" flag cannot tell those two experiences apart.
    trackClanContribution({
      sessionId: 's1',
      enteredTopFive: true,
      replaced: false,
      delta: 120,
    });
    expect(lastEvent()[0]).toBe(AnalyticsEvents.CLAN_CONTRIBUTION_COUNTED);
    expect(lastEvent()[1]).toMatchObject({
      entered_top_five: true,
      replaced: false,
      clan_depth_delta: 120,
      category: EventCategories.SOCIAL,
    });

    trackClanContribution({
      sessionId: 's2',
      enteredTopFive: true,
      replaced: true,
      delta: 40,
    });
    expect(lastEvent()[1]).toMatchObject({
      entered_top_five: true,
      replaced: true,
    });
  });

  it('omits a delta the server did not state rather than inventing a zero', () => {
    trackClanContribution({ sessionId: 's3', enteredTopFive: false, replaced: false });
    expect(lastEvent()[1]).not.toHaveProperty('clan_depth_delta');
    expect(lastEvent()[1]).toMatchObject({ entered_top_five: false });
  });

  it('counts one contribution per settled session', () => {
    // "First eligible contribution" (§9.3) is a question the event stream
    // answers per person. Deciding it in the browser would need a durable
    // record of a progression fact — boundary 9 puts that on the server.
    expect(
      trackClanContribution({ sessionId: 's1', enteredTopFive: true, replaced: false })
    ).toBe(true);
    expect(
      trackClanContribution({ sessionId: 's1', enteredTopFive: true, replaced: false })
    ).toBe(false);
    expect(
      trackClanContribution({ sessionId: 's2', enteredTopFive: true, replaced: false })
    ).toBe(true);
  });

  it('writes no browser copy of any of it', () => {
    trackClanRevealShown('attention-clan');
    trackClanContribution({ sessionId: 's1', enteredTopFive: true, replaced: false });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
