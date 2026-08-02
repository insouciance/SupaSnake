import { genomeResearchHref } from './genomeResearchLink';

const READY = {
  genomeV2Enabled: true,
  workbenchEnabled: true,
  sessionId: '123e4567-e89b-42d3-a456-426614174000',
  hasGenomeRecap: true,
  practice: false,
  settlementPending: false,
};

describe('Genome Research Results link', () => {
  it('uses only the opaque session identifier when both rollout surfaces are live', () => {
    expect(genomeResearchHref(READY)).toBe(
      '/codex?view=workbench&result=123e4567-e89b-42d3-a456-426614174000'
    );
  });

  it.each([
    ['Genome v2 off', { genomeV2Enabled: false }],
    ['Workbench off', { workbenchEnabled: false }],
    ['no session', { sessionId: null }],
    ['no recap', { hasGenomeRecap: false }],
    ['practice', { practice: true }],
    ['pending settlement', { settlementPending: true }],
  ])('stays absent for %s', (_label, override) => {
    expect(genomeResearchHref({ ...READY, ...override })).toBeNull();
  });
});
