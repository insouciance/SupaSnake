describe('sitemap.xml', () => {
  const original = process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;
    } else {
      process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1 = original;
    }
    jest.resetModules();
  });

  function build(flag?: string) {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;
    else process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1 = flag;
    jest.resetModules();
    return (require('./sitemap').default as () => Array<{ url: string }>)();
  }

  it('emits absolute canonical URLs with a last-modified date', () => {
    const entries = build();
    expect(entries[0].url).toBe('https://supasnake.com/');
    for (const entry of entries) {
      expect(entry.url.startsWith('https://supasnake.com')).toBe(true);
      expect((entry as { lastModified?: Date }).lastModified).toBeInstanceOf(Date);
    }
  });

  it('omits /play with the growth flag off (the default)', () => {
    expect(build().map((entry) => entry.url)).not.toContain(
      'https://supasnake.com/play'
    );
  });

  it('includes /play with the growth flag on', () => {
    expect(build('true').map((entry) => entry.url)).toContain(
      'https://supasnake.com/play'
    );
  });
});
