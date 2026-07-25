describe('GROWTH_SURFACES_V1_ENABLED', () => {
  const original = process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;
    } else {
      process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1 = original;
    }
    jest.resetModules();
  });

  function readFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1;
    } else {
      process.env.NEXT_PUBLIC_GROWTH_SURFACES_V1 = value;
    }
    jest.resetModules();
    return require('./growth').GROWTH_SURFACES_V1_ENABLED as boolean;
  }

  it('is opt-in and false when omitted — CI never infers the rollback path', () => {
    expect(readFlag()).toBe(false);
  });

  it('enables only for the exact true value', () => {
    expect(readFlag('true')).toBe(true);
    expect(readFlag('false')).toBe(false);
    expect(readFlag('TRUE')).toBe(false);
    expect(readFlag('1')).toBe(false);
    expect(readFlag('')).toBe(false);
  });
});
