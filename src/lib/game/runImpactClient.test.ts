import {
  groupRunImpacts,
  hasRecognitionCeremony,
  impactSummary,
  parseRunImpactEnvelope,
  recoverRunImpact,
  type RunImpactEnvelope,
} from './runImpactClient';

function envelope(overrides: Partial<RunImpactEnvelope> = {}): RunImpactEnvelope {
  return {
    version: 1,
    sessionId: 'session-1',
    settledAt: '2026-07-30T10:00:00.000Z',
    outcome: 'extracted',
    dynasty: 'CYBER',
    receipt: {
      score: 900,
      yieldDna: 600,
      dnaCredited: 600,
      energyCommitted: 1,
      commitmentMultiplierBps: 10_000,
      generation: 4,
    },
    impacts: [],
    featuredImpactKeys: [],
    recommendedAction: null,
    ...overrides,
  };
}

describe('Run Impact client contract', () => {
  it('accepts the complete v1 server envelope', () => {
    const value = envelope({
      impacts: [{
        key: 'mastery:cyber:6',
        pillar: 'mastery',
        kind: 'mastery-level',
        significance: 'milestone',
        headline: 'CYBER Mastery M6',
        before: 5,
        after: 6,
        delta: 1,
        destination: 'mastery',
      }],
      featuredImpactKeys: ['mastery:cyber:6'],
    });
    expect(parseRunImpactEnvelope(value)).toEqual(value);
  });

  it.each([
    ['unknown version', { version: 2 }],
    ['unknown dynasty', { dynasty: 'VOID' }],
    ['malformed recommended action', { recommendedAction: 'chronicle' }],
    ['invalid receipt', { receipt: { ...envelope().receipt, dnaCredited: -1 } }],
    ['unknown pillar', {
      impacts: [{
        key: 'x', pillar: 'account-level', kind: 'x', significance: 'routine', headline: 'x',
      }],
    }],
    ['duplicate impact keys', {
      impacts: [
        { key: 'x', pillar: 'mastery', kind: 'x', significance: 'routine', headline: 'x' },
        { key: 'x', pillar: 'lineage', kind: 'y', significance: 'notable', headline: 'y' },
      ],
    }],
    ['more than three featured impacts', {
      impacts: ['a', 'b', 'c', 'd'].map((key) => ({
        key, pillar: 'discovery', kind: key, significance: 'notable', headline: key,
      })),
      featuredImpactKeys: ['a', 'b', 'c', 'd'],
    }],
  ])('rejects %s', (_label, override) => {
    expect(parseRunImpactEnvelope({ ...envelope(), ...override })).toBeNull();
  });

  it('groups a milestone storm into three ordered beats at most', () => {
    const impacts: RunImpactEnvelope['impacts'] = [
      { key: 'm', pillar: 'mastery', kind: 'xp', significance: 'milestone', headline: 'M6' },
      { key: 'l', pillar: 'lineage', kind: 'gen', significance: 'notable', headline: 'Gen 5' },
      { key: 'd', pillar: 'discovery', kind: 'codex', significance: 'historic', headline: 'World first' },
      { key: 'c', pillar: 'clan', kind: 'five', significance: 'notable', headline: 'Entered five' },
      { key: 's', pillar: 'calendar', kind: 'signal', significance: 'milestone', headline: '30 Signals' },
    ];
    const groups = groupRunImpacts(envelope({
      impacts,
      featuredImpactKeys: ['m', 'd', 'c'],
    }));
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.id)).toEqual([
      'growth',
      'discovery',
      'clan-world',
    ]);
    expect(groups[0].impacts.map((impact) => impact.key)).toEqual(['m']);
  });

  it('does not invent ceremony for routine-only progress', () => {
    const value = envelope({
      impacts: [{
        key: 'xp', pillar: 'mastery', kind: 'xp', significance: 'routine', headline: '+20 XP',
      }],
    });
    expect(hasRecognitionCeremony(value)).toBe(false);
    expect(impactSummary(value)).toBe('+20 XP');
  });

  it('recovers the canonical receipt from server authority', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ impact: envelope() }),
    });
    await expect(recoverRunImpact('session/one', 'token', fetchFn)).resolves.toEqual(
      envelope()
    );
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/progression/impact?sessionId=session%2Fone',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('treats an absent receipt as absent and reports other failures', async () => {
    await expect(recoverRunImpact('missing', 'token', jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))).resolves.toBeNull();
    await expect(recoverRunImpact('broken', 'token', jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }))).rejects.toThrow('Impact recovery failed (503)');
  });
});
