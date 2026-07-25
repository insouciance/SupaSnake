import {
  ATTRIBUTION_STORAGE_KEY,
  attributionProperties,
  captureAttribution,
  channelOf,
  clearAttribution,
  marketingConsentGranted,
  parseAttribution,
  readAttribution,
} from './attribution';

const CONSENT_KEY = 'cookie-consent';

function grantMarketing(granted: boolean) {
  window.localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({
      essential: true,
      functional: false,
      analytics: granted,
      marketing: granted,
      timestamp: '2026-07-25T00:00:00.000Z',
    })
  );
}

describe('attribution', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe('marketingConsentGranted', () => {
    it('is false with no stored consent', () => {
      expect(marketingConsentGranted()).toBe(false);
    });

    it('is false when the marketing category was declined', () => {
      grantMarketing(false);
      expect(marketingConsentGranted()).toBe(false);
    });

    it('is true only for an explicit boolean true', () => {
      grantMarketing(true);
      expect(marketingConsentGranted()).toBe(true);

      window.localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ marketing: 'true' })
      );
      expect(marketingConsentGranted()).toBe(false);
    });

    it('is false for corrupt consent JSON', () => {
      window.localStorage.setItem(CONSENT_KEY, '{not json');
      expect(marketingConsentGranted()).toBe(false);
    });
  });

  describe('parseAttribution', () => {
    const NOW = new Date('2026-07-25T12:00:00.000Z');

    it('reads every utm parameter and the referrer host', () => {
      const result = parseAttribution(
        'https://supasnake.com/?utm_source=hn&utm_medium=social&utm_campaign=launch&utm_content=card&utm_term=snake+game',
        'https://news.ycombinator.com/item?id=1',
        NOW
      );
      expect(result).toEqual({
        source: 'hn',
        medium: 'social',
        campaign: 'launch',
        content: 'card',
        term: 'snake game',
        referrerHost: 'news.ycombinator.com',
        landingPath: '/',
        capturedAt: NOW.toISOString(),
      });
    });

    it('keeps only the referrer host, never the full referring URL', () => {
      const result = parseAttribution(
        'https://supasnake.com/play',
        'https://example.com/secret-path?token=abc',
        NOW
      );
      expect(result?.referrerHost).toBe('example.com');
      expect(JSON.stringify(result)).not.toContain('secret-path');
      expect(JSON.stringify(result)).not.toContain('token=abc');
    });

    it('ignores an internal referrer — a navigation is not a channel', () => {
      expect(
        parseAttribution('https://supasnake.com/', 'https://supasnake.com/lab', NOW)
      ).toBeNull();
    });

    it('returns null for a direct visit with no signal', () => {
      expect(parseAttribution('https://supasnake.com/', '', NOW)).toBeNull();
      expect(parseAttribution('https://supasnake.com/', null, NOW)).toBeNull();
    });

    it('returns null for an unparseable landing URL', () => {
      expect(parseAttribution('not a url', 'https://example.com', NOW)).toBeNull();
    });

    it('clamps oversized values and strips control characters', () => {
      const long = 'x'.repeat(400);
      const result = parseAttribution(
        `https://supasnake.com/?utm_source=${long}`,
        null,
        NOW
      );
      expect(result?.source).toHaveLength(96);

      const dirty = parseAttribution(
        'https://supasnake.com/?utm_campaign=a%00b%1Fc',
        null,
        NOW
      );
      expect(dirty?.campaign).toBe('abc');
    });
  });

  describe('captureAttribution', () => {
    it('stores nothing without marketing consent', () => {
      grantMarketing(false);
      const result = captureAttribution({
        landingUrl: 'https://supasnake.com/?utm_source=hn',
        referrer: null,
      });
      expect(result).toBeNull();
      expect(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    });

    it('stores the channel in sessionStorage once consent is granted', () => {
      grantMarketing(true);
      const result = captureAttribution({
        landingUrl: 'https://supasnake.com/?utm_source=hn',
        referrer: null,
      });
      expect(result?.source).toBe('hn');
      expect(readAttribution()?.source).toBe('hn');
      expect(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    });

    it('keeps the first touch of the session', () => {
      grantMarketing(true);
      captureAttribution({
        landingUrl: 'https://supasnake.com/?utm_source=hn',
        referrer: null,
      });
      const second = captureAttribution({
        landingUrl: 'https://supasnake.com/?utm_source=reddit',
        referrer: null,
      });
      expect(second?.source).toBe('hn');
      expect(readAttribution()?.source).toBe('hn');
    });

    it('stores nothing for a direct visit', () => {
      grantMarketing(true);
      expect(
        captureAttribution({ landingUrl: 'https://supasnake.com/', referrer: null })
      ).toBeNull();
      expect(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)).toBeNull();
    });
  });

  describe('readAttribution / clearAttribution', () => {
    it('rejects a corrupt stored value', () => {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, '{oops');
      expect(readAttribution()).toBeNull();
    });

    it('rejects a stored value of the wrong shape', () => {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, '{"source":"hn"}');
      expect(readAttribution()).toBeNull();
    });

    it('clears the stored value', () => {
      grantMarketing(true);
      captureAttribution({
        landingUrl: 'https://supasnake.com/?utm_source=hn',
        referrer: null,
      });
      clearAttribution();
      expect(readAttribution()).toBeNull();
    });
  });

  describe('channelOf / attributionProperties', () => {
    it('reports direct with no attribution', () => {
      expect(channelOf(null)).toBe('direct');
      expect(attributionProperties(null)).toEqual({ channel: 'direct' });
    });

    it('prefers the campaign source over the referrer host', () => {
      const attribution = parseAttribution(
        'https://supasnake.com/?utm_source=hn',
        'https://news.ycombinator.com/',
        new Date()
      );
      expect(channelOf(attribution)).toBe('hn');
    });

    it('falls back to the referrer host', () => {
      const attribution = parseAttribution(
        'https://supasnake.com/',
        'https://reddit.com/r/WebGames',
        new Date()
      );
      expect(channelOf(attribution)).toBe('reddit.com');
    });

    it('flattens only the fields that are present', () => {
      const attribution = parseAttribution(
        'https://supasnake.com/play?utm_source=hn&utm_medium=social',
        null,
        new Date()
      );
      expect(attributionProperties(attribution)).toEqual({
        channel: 'hn',
        utm_source: 'hn',
        utm_medium: 'social',
        landing_path: '/play',
      });
    });
  });
});
