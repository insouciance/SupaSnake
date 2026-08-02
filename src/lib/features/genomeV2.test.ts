describe('GENOME_V2_ENABLED', () => {
  const original = process.env.NEXT_PUBLIC_GENOME_V2;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_GENOME_V2;
    } else {
      process.env.NEXT_PUBLIC_GENOME_V2 = original;
    }
    jest.resetModules();
  });

  function readFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_GENOME_V2;
    } else {
      process.env.NEXT_PUBLIC_GENOME_V2 = value;
    }
    jest.resetModules();
    return require('./genomeV2').GENOME_V2_ENABLED as boolean;
  }

  it('is opt-in and false when omitted', () => {
    expect(readFlag()).toBe(false);
  });

  it('enables only for the exact true value', () => {
    expect(readFlag('true')).toBe(true);
    expect(readFlag('false')).toBe(false);
    expect(readFlag('TRUE')).toBe(false);
  });
});
