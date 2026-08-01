import {
  advancePendingRunImpact,
  groupRunImpacts,
  hasRecognitionCeremony,
  impactSummary,
  parseRunImpactEnvelope,
  recoverPendingRunImpactBounded,
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
      validated: true,
      score: 900,
      yieldDna: 600,
      dnaCredited: 600,
      energyCommitted: 1,
      commitmentMultiplierBps: 10_000,
      generation: 4,
      personalBest: { eligible: true, before: 800, after: 900, improved: true },
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
        kind: 'mastery_level',
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
    ['client-invented personal best', {
      receipt: {
        ...envelope().receipt,
        personalBest: { eligible: true, before: 900, after: 900, improved: true },
      },
    }],
    ['personal-best eligibility that disagrees with validation', {
      receipt: {
        ...envelope().receipt,
        validated: false,
        personalBest: { eligible: true, before: 800, after: 900, improved: true },
      },
    }],
    ['unknown pillar', {
      impacts: [{
        key: 'x', pillar: 'account-level', kind: 'mastery_xp', significance: 'routine', headline: 'x',
      }],
    }],
    ['unknown impact kind', {
      impacts: [{
        key: 'x', pillar: 'mastery', kind: 'account_level', significance: 'routine', headline: 'x',
      }],
    }],
    ['duplicate impact keys', {
      impacts: [
        { key: 'x', pillar: 'mastery', kind: 'mastery_xp', significance: 'routine', headline: 'x' },
        { key: 'x', pillar: 'lineage', kind: 'lineage_run', significance: 'notable', headline: 'y' },
      ],
    }],
    ['more than three featured impacts', {
      impacts: ['a', 'b', 'c', 'd'].map((key) => ({
        key, pillar: 'discovery', kind: 'codex_discovery', significance: 'notable', headline: key,
      })),
      featuredImpactKeys: ['a', 'b', 'c', 'd'],
    }],
  ])('rejects %s', (_label, override) => {
    expect(parseRunImpactEnvelope({ ...envelope(), ...override })).toBeNull();
  });

  it('groups a milestone storm into three ordered beats at most', () => {
    const impacts: RunImpactEnvelope['impacts'] = [
      { key: 'm', pillar: 'mastery', kind: 'mastery_level', significance: 'milestone', headline: 'M6' },
      { key: 'l', pillar: 'lineage', kind: 'lineage_run', significance: 'notable', headline: 'Gen 5' },
      { key: 'd', pillar: 'discovery', kind: 'codex_discovery', significance: 'historic', headline: 'World first' },
      { key: 'c', pillar: 'clan', kind: 'clan_top_five', significance: 'notable', headline: 'Entered five' },
      { key: 's', pillar: 'calendar', kind: 'signal_milestone', significance: 'milestone', headline: '30 Signals' },
    ];
    const groups = groupRunImpacts(envelope({
      impacts,
      featuredImpactKeys: ['m', 'd', 'c'],
    }));
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.id)).toEqual([
      'discovery',
      'growth',
      'clan-world',
    ]);
    expect(groups[0].impacts.map((impact) => impact.key)).toEqual(['d']);
  });

  it('does not invent ceremony for routine-only progress', () => {
    const value = envelope({
      impacts: [{
        key: 'xp', pillar: 'mastery', kind: 'mastery_xp', significance: 'routine', headline: '+20 XP',
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
      {
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      }
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

  it('uses an explicit write request to advance durable pending settlement', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ impact: envelope() }),
    });
    await expect(
      advancePendingRunImpact('session/one', 'token', fetchFn)
    ).resolves.toEqual(envelope());
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/progression/impact?sessionId=session%2Fone',
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      }
    );
  });

  it('keeps an accepted but unfinished receipt pending without client authority', async () => {
    await expect(
      advancePendingRunImpact('pending', 'token', jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
      }))
    ).resolves.toBeNull();
  });

  it('automatically resolves a reopened settling run into its canonical receipt', async () => {
    const canonical = envelope({ sessionId: 'settling-run' });
    const fetchFn = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockRejectedValueOnce(new Error('temporary network loss'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ impact: canonical }),
      });

    await expect(recoverPendingRunImpactBounded(
      'settling-run',
      'token',
      { fetchFn, delaysMs: [0, 0, 0] }
    )).resolves.toEqual(canonical);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('bounds automatic settling recovery and leaves a manual retry path', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    await expect(recoverPendingRunImpactBounded(
      'still-pending',
      'token',
      { fetchFn, delaysMs: [0, 0] }
    )).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('times out a hung recovery request and still reaches the manual path', async () => {
    const fetchFn = jest.fn().mockImplementation(
      (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      })
    );
    await expect(recoverPendingRunImpactBounded(
      'hung-pending',
      'token',
      { fetchFn, delaysMs: [0], attemptTimeoutMs: 1 }
    )).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
