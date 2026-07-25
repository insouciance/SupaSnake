const mockTrackEvent = jest.fn();
const mockSetUserProperties = jest.fn();
let analyticsInitialized = true;

jest.mock('./posthog', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  setUserProperties: (...args: unknown[]) => mockSetUserProperties(...args),
  isAnalyticsInitialized: () => analyticsInitialized,
}));

import {
  FunnelStages,
  attachAttributionToPerson,
  funnelEventName,
  trackFunnelStage,
  trackFunnelStageOnce,
} from './funnel';
import { AnalyticsEvents, EventCategories } from './events';
import { ATTRIBUTION_STORAGE_KEY } from '@/lib/growth/attribution';

function storeAttribution(source: string) {
  window.sessionStorage.setItem(
    ATTRIBUTION_STORAGE_KEY,
    JSON.stringify({
      source,
      medium: 'social',
      campaign: null,
      content: null,
      term: null,
      referrerHost: 'news.ycombinator.com',
      landingPath: '/',
      capturedAt: '2026-07-25T12:00:00.000Z',
    })
  );
}

describe('funnel taxonomy', () => {
  beforeEach(() => {
    mockTrackEvent.mockClear();
    mockSetUserProperties.mockClear();
    analyticsInitialized = true;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('maps all eight §11.5 stages onto declared taxonomy events', () => {
    expect(Object.values(FunnelStages)).toEqual([
      'reach',
      'arrive',
      'activate',
      'identify',
      'habituate',
      'belong',
      'advocate',
      'patronize',
    ]);
    expect(funnelEventName(FunnelStages.REACH)).toBe(
      AnalyticsEvents.FUNNEL_REACH_ENTERED
    );
    expect(funnelEventName(FunnelStages.ARRIVE)).toBe(
      AnalyticsEvents.FUNNEL_ARRIVE_ENTERED
    );
    expect(funnelEventName(FunnelStages.PATRONIZE)).toBe(
      AnalyticsEvents.FUNNEL_PATRONIZE_ENTERED
    );
    for (const stage of Object.values(FunnelStages)) {
      expect(funnelEventName(stage)).toMatch(/^funnel_[a-z]+_entered$/);
    }
  });

  describe('trackFunnelStage', () => {
    it('stamps the stage and the growth category', () => {
      trackFunnelStage(FunnelStages.ARRIVE);
      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvents.FUNNEL_ARRIVE_ENTERED,
        expect.objectContaining({
          funnel_stage: 'arrive',
          category: EventCategories.GROWTH,
          channel: 'direct',
        })
      );
    });

    it('carries the session channel onto every stage', () => {
      storeAttribution('hn');
      trackFunnelStage(FunnelStages.ACTIVATE, { bank_dna: 120 });
      expect(mockTrackEvent).toHaveBeenCalledWith(
        AnalyticsEvents.FUNNEL_ACTIVATE_ENTERED,
        expect.objectContaining({
          channel: 'hn',
          utm_source: 'hn',
          utm_medium: 'social',
          referrer_host: 'news.ycombinator.com',
          bank_dna: 120,
          funnel_stage: 'activate',
        })
      );
    });

    it('never lets a caller overwrite the stage label', () => {
      trackFunnelStage(FunnelStages.BELONG, {
        funnel_stage: 'patronize',
      } as never);
      expect(mockTrackEvent.mock.calls[0][1].funnel_stage).toBe('belong');
    });
  });

  describe('trackFunnelStageOnce', () => {
    it('reports a threshold crossing exactly once per browser', () => {
      expect(trackFunnelStageOnce(FunnelStages.ACTIVATE)).toBe(true);
      expect(trackFunnelStageOnce(FunnelStages.ACTIVATE)).toBe(false);
      expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    });

    it('keeps a separate guard per stage', () => {
      trackFunnelStageOnce(FunnelStages.ACTIVATE);
      expect(trackFunnelStageOnce(FunnelStages.IDENTIFY)).toBe(true);
      expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    });

    it('writes no guard and sends nothing before capture is live', () => {
      analyticsInitialized = false;
      expect(trackFunnelStageOnce(FunnelStages.ACTIVATE)).toBe(false);
      expect(mockTrackEvent).not.toHaveBeenCalled();
      expect(window.localStorage.length).toBe(0);
    });
  });

  describe('attachAttributionToPerson', () => {
    it('stamps direct when there is no channel', () => {
      attachAttributionToPerson({ identify_method: 'email_signup' });
      expect(mockSetUserProperties).toHaveBeenCalledWith({
        acquisition_channel: 'direct',
        identify_method: 'email_signup',
      });
    });

    it('stamps the captured channel onto the person', () => {
      storeAttribution('hn');
      attachAttributionToPerson();
      expect(mockSetUserProperties).toHaveBeenCalledWith(
        expect.objectContaining({
          acquisition_channel: 'hn',
          acquisition_source: 'hn',
          acquisition_medium: 'social',
          acquisition_referrer_host: 'news.ycombinator.com',
          acquisition_landing_path: '/',
        })
      );
    });
  });
});
