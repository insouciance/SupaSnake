import { genomeV2Enabled } from './genomeV2';

describe('Genome v2 rollout flag', () => {
  const original = process.env.NEXT_PUBLIC_GENOME_V2;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_GENOME_V2;
    } else {
      process.env.NEXT_PUBLIC_GENOME_V2 = original;
    }
    jest.resetModules();
  });

  function readBuildFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_GENOME_V2;
    } else {
      process.env.NEXT_PUBLIC_GENOME_V2 = value;
    }
    jest.resetModules();
    return require('./genomeV2').GENOME_V2_ENABLED as boolean;
  }

  it('keeps both direct and build-time evaluation opt-in', () => {
    expect(genomeV2Enabled('true')).toBe(true);
    expect(genomeV2Enabled(undefined)).toBe(false);
    expect(readBuildFlag('true')).toBe(true);
    expect(readBuildFlag()).toBe(false);
  });

  it.each(['false', 'TRUE', '1', ' true '])(
    'rejects the non-exact value %s',
    (value) => {
      expect(genomeV2Enabled(value)).toBe(false);
      expect(readBuildFlag(value)).toBe(false);
    }
  );
});
