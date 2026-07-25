describe('RUN_FLOW_V1_ENABLED', () => {
  const original = process.env.NEXT_PUBLIC_RUN_FLOW_V1;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_RUN_FLOW_V1;
    } else {
      process.env.NEXT_PUBLIC_RUN_FLOW_V1 = original;
    }
    jest.resetModules();
  });

  function readFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_RUN_FLOW_V1;
    } else {
      process.env.NEXT_PUBLIC_RUN_FLOW_V1 = value;
    }
    jest.resetModules();
    return require('./runFlow').RUN_FLOW_V1_ENABLED as boolean;
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
