import robots from './robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it('invites every crawler to the public site', () => {
    expect(rules.userAgent).toBe('*');
    expect(rules.allow).toBe('/');
  });

  it('keeps crawlers out of the API, the dev fixtures and the auth round-trip', () => {
    const disallow = rules.disallow as string[];
    expect(disallow).toContain('/api/');
    expect(disallow).toContain('/dev/');
    expect(disallow).toContain('/auth/');
  });

  it('points at the canonical sitemap and host', () => {
    expect(result.sitemap).toBe('https://supasnake.com/sitemap.xml');
    expect(result.host).toBe('https://supasnake.com');
  });
});
