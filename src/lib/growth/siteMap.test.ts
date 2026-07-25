import {
  DISALLOWED_PREFIXES,
  absoluteSitemapUrl,
  sitemapEntries,
} from './siteMap';

describe('DISALLOWED_PREFIXES', () => {
  it('excludes the API, the dev fixtures, and the auth round-trip', () => {
    expect(DISALLOWED_PREFIXES).toEqual(expect.arrayContaining(['/api/']));
    expect(DISALLOWED_PREFIXES).toEqual(expect.arrayContaining(['/dev/']));
    expect(DISALLOWED_PREFIXES).toEqual(expect.arrayContaining(['/auth/']));
  });

  it('excludes the account and in-app surfaces', () => {
    for (const path of ['/settings', '/profile', '/game', '/lab', '/shop']) {
      expect(DISALLOWED_PREFIXES).toContain(path);
    }
  });

  it('never disallows the root or an indexable page', () => {
    expect(DISALLOWED_PREFIXES).not.toContain('/');
    for (const entry of sitemapEntries(true)) {
      const blocked = DISALLOWED_PREFIXES.some(
        (prefix) => entry.path !== '/' && entry.path.startsWith(prefix)
      );
      expect(blocked).toBe(false);
    }
  });
});

describe('sitemapEntries', () => {
  it('always lists the root and the legal pages', () => {
    const paths = sitemapEntries(false).map((entry) => entry.path);
    expect(paths[0]).toBe('/');
    expect(paths).toContain('/legal/privacy');
    expect(paths).toContain('/legal/impressum');
  });

  it('omits /play while the growth flag is off — never advertise a 404', () => {
    expect(sitemapEntries(false).map((entry) => entry.path)).not.toContain('/play');
  });

  it('lists /play once the growth flag is on', () => {
    const paths = sitemapEntries(true).map((entry) => entry.path);
    expect(paths).toContain('/play');
    expect(paths.filter((path) => path === '/play')).toHaveLength(1);
  });

  it('lists no path twice', () => {
    const paths = sitemapEntries(true).map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps every priority within the sitemap protocol range', () => {
    for (const entry of sitemapEntries(true)) {
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});

describe('absoluteSitemapUrl', () => {
  it('emits canonical absolute URLs', () => {
    expect(absoluteSitemapUrl('/')).toBe('https://supasnake.com/');
    expect(absoluteSitemapUrl('/play')).toBe('https://supasnake.com/play');
  });
});
