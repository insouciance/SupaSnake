import { CANONICAL_ORIGIN, canonicalUrl } from './site';

describe('site config', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
    jest.resetModules();
  });

  function readDeploymentOrigin(value?: string): string {
    if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = value;
    jest.resetModules();
    return (require('./site') as typeof import('./site')).deploymentOrigin();
  }

  it('uses the product URL as the canonical origin', () => {
    expect(CANONICAL_ORIGIN).toBe('https://supasnake.com');
  });

  describe('canonicalUrl', () => {
    it('returns the bare origin for the root', () => {
      expect(canonicalUrl('/')).toBe('https://supasnake.com');
      expect(canonicalUrl()).toBe('https://supasnake.com');
    });

    it('joins paths with and without a leading slash', () => {
      expect(canonicalUrl('/play')).toBe('https://supasnake.com/play');
      expect(canonicalUrl('play')).toBe('https://supasnake.com/play');
    });

    it('never varies with the deployment origin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://preview.vercel.app';
      jest.resetModules();
      const site = require('./site') as typeof import('./site');
      expect(site.canonicalUrl('/play')).toBe('https://supasnake.com/play');
    });
  });

  describe('deploymentOrigin', () => {
    it('reads NEXT_PUBLIC_APP_URL', () => {
      expect(readDeploymentOrigin('http://localhost:3000')).toBe(
        'http://localhost:3000'
      );
    });

    it('strips a trailing slash', () => {
      expect(readDeploymentOrigin('https://supasnake.com/')).toBe(
        'https://supasnake.com'
      );
    });

    it('falls back to the canonical origin when unset or unusable', () => {
      expect(readDeploymentOrigin()).toBe('https://supasnake.com');
      expect(readDeploymentOrigin('not-a-url')).toBe('https://supasnake.com');
      expect(readDeploymentOrigin('javascript:alert(1)')).toBe(
        'https://supasnake.com'
      );
    });
  });
});
