describe('CAREER_SPINE_V1_ENABLED', () => {
  const original = process.env.NEXT_PUBLIC_CAREER_SPINE_V1;

  afterEach(() => {
    jest.resetModules();
    if (original === undefined) delete process.env.NEXT_PUBLIC_CAREER_SPINE_V1;
    else process.env.NEXT_PUBLIC_CAREER_SPINE_V1 = original;
  });

  function enabled(value?: string): boolean {
    jest.resetModules();
    if (value === undefined) delete process.env.NEXT_PUBLIC_CAREER_SPINE_V1;
    else process.env.NEXT_PUBLIC_CAREER_SPINE_V1 = value;
    return require('./careerSpine').CAREER_SPINE_V1_ENABLED as boolean;
  }

  it('is off when omitted or malformed', () => {
    expect(enabled()).toBe(false);
    expect(enabled('false')).toBe(false);
    expect(enabled('TRUE')).toBe(false);
  });

  it('arms only for the exact reviewed value', () => {
    expect(enabled('true')).toBe(true);
  });
});
