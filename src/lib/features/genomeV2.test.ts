import { genomeV2Enabled } from './genomeV2';

describe('Genome v2 rollout flag', () => {
  it('enables only the exact public value true', () => {
    expect(genomeV2Enabled('true')).toBe(true);
    expect(genomeV2Enabled(undefined)).toBe(false);
    expect(genomeV2Enabled('false')).toBe(false);
    expect(genomeV2Enabled('TRUE')).toBe(false);
    expect(genomeV2Enabled('1')).toBe(false);
    expect(genomeV2Enabled(' true ')).toBe(false);
  });
});
