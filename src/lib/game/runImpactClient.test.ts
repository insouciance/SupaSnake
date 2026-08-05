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
import {
  RUN_IMPACT_KINDS,
  type RunImpactKind,
} from '@/shared/progression/runImpact';

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
    const canonical = envelope({ sessionId: 'session/one' });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ impact: canonical }),
    });
    await expect(recoverRunImpact('session/one', 'token', fetchFn)).resolves.toEqual(
      canonical
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
    const canonical = envelope({ sessionId: 'session/one' });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ impact: canonical }),
    });
    await expect(
      advancePendingRunImpact('session/one', 'token', fetchFn)
    ).resolves.toEqual(canonical);
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/progression/impact?sessionId=session%2Fone',
      {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      }
    );
  });

  it('rejects a valid impact envelope bound to a different session', async () => {
    const wrongSession = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ impact: envelope({ sessionId: 'other-session' }) }),
    });
    await expect(
      recoverRunImpact('requested-session', 'token', wrongSession)
    ).resolves.toBeNull();
    await expect(
      advancePendingRunImpact('requested-session', 'token', wrongSession)
    ).resolves.toBeNull();
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

/**
 * THE PARSER MUST KNOW EVERY KIND THE SERVER CAN EMIT (WP-F).
 *
 * `parseRunImpactEnvelope` rejects an envelope containing ANY impact it cannot
 * parse — deliberately, because partial progress must never be invented. That
 * makes an unknown kind catastrophic rather than lossy: one unrecognised beat
 * discards the player's whole Victory Lap and receipt.
 *
 * WP-D added `first_extraction` and `gene_unlocked` to the shared union and
 * the client's hand-written copy of it did not follow, so a new player's first
 * BANK and every Gene unlock would have produced exactly that. It never
 * reached a player only because both beats are unreachable until the
 * curriculum flag is armed — which is what WP-F does.
 */
describe('the client parser and the server fold agree on the beat vocabulary', () => {
  it('accepts every kind the shared contract declares', () => {
    for (const kind of RUN_IMPACT_KINDS) {
      const parsed = parseRunImpactEnvelope(
        envelope({
          impacts: [
            {
              key: `beat:${kind}`,
              pillar: 'mastery',
              kind,
              significance: 'milestone',
              headline: `A ${kind} beat`,
            },
          ],
          featuredImpactKeys: [`beat:${kind}`],
        })
      );
      expect(parsed).not.toBeNull();
      expect(parsed?.impacts[0]?.kind).toBe(kind);
    }
  });

  it('survives the two beats the curriculum flag makes reachable, together', () => {
    // The exact shape `buildRunImpactEnvelope` produces for a first BANK that
    // also promoted a trial: both destination-less, both `milestone`, the
    // unlock carrying its Gene in metadata.
    const parsed = parseRunImpactEnvelope(
      envelope({
        impacts: [
          {
            key: 'first-extraction:session-1',
            pillar: 'mastery',
            kind: 'first_extraction',
            significance: 'milestone',
            headline: 'First BANK secured',
            detail: 'You left with the run instead of losing it. That is the whole game.',
          },
          {
            key: 'curriculum:gene:coilkeeper',
            pillar: 'discovery',
            kind: 'gene_unlocked',
            significance: 'milestone',
            headline: 'Coilkeeper joined your Power Pods',
            metadata: { geneId: 'coilkeeper' },
          },
        ],
        featuredImpactKeys: [
          'first-extraction:session-1',
          'curriculum:gene:coilkeeper',
        ],
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.impacts.map((impact) => impact.kind)).toEqual([
      'first_extraction',
      'gene_unlocked',
    ]);
    expect(parsed?.impacts[1]?.metadata).toEqual({ geneId: 'coilkeeper' });
  });

  it('still discards an envelope carrying a kind nobody declared', () => {
    expect(
      parseRunImpactEnvelope(
        envelope({
          impacts: [
            {
              key: 'beat:invented',
              pillar: 'mastery',
              kind: 'not_a_declared_kind' as unknown as RunImpactKind,
              significance: 'milestone',
              headline: 'Invented',
            },
          ],
          featuredImpactKeys: ['beat:invented'],
        })
      )
    ).toBeNull();
  });
});
