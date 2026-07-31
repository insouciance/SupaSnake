import {
  buildRunImpactEnvelope,
  isMissingRunImpactInfra,
  loadRunImpactEnvelope,
  persistRunImpactEnvelope,
} from './runImpact';

const base = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  settledAt: '2026-07-30T12:00:00.000Z',
  dynasty: 'PRIMAL' as const,
  extracted: true,
  died: false,
  validated: true,
  score: 1234,
  yieldDna: 800,
  dnaCredited: 1760,
  energyCommitted: 2,
  commitmentMultiplierBps: 22000,
  generation: 5,
  personalBest: { eligible: true, before: 2000, after: 2000, improved: false },
  snakeId: '550e8400-e29b-41d4-a716-446655440001',
  mastery: null,
  recordsBefore: null,
  recordsAfter: null,
  ladder: null,
  codex: null,
  signal: null,
  clan: null,
};

describe('Career Spine run impact envelope', () => {
  it('records the exact server receipt and a routine lineage trace without inventing a claim', () => {
    const envelope = buildRunImpactEnvelope(base);
    expect(envelope).toMatchObject({
      version: 1,
      sessionId: base.sessionId,
      outcome: 'extracted',
      dynasty: 'PRIMAL',
      receipt: {
        validated: true,
        score: 1234,
        yieldDna: 800,
        dnaCredited: 1760,
        energyCommitted: 2,
        commitmentMultiplierBps: 22000,
        generation: 5,
        personalBest: {
          eligible: true,
          before: 2000,
          after: 2000,
          improved: false,
        },
      },
      featuredImpactKeys: [],
      recommendedAction: null,
    });
    expect(envelope.impacts).toEqual([
      expect.objectContaining({
        key: `lineage:${base.snakeId}:run`,
        kind: 'lineage_run',
        significance: 'routine',
      }),
    ]);
    expect(JSON.stringify(envelope)).not.toMatch(/claim/i);
  });

  it('carries server-authored personal-best before/after truth', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      personalBest: { eligible: true, before: 900, after: 1234, improved: true },
    });
    expect(envelope.receipt.personalBest).toEqual({
      eligible: true,
      before: 900,
      after: 1234,
      improved: true,
    });
    expect(envelope.impacts).toContainEqual(
      expect.objectContaining({
        kind: 'personal_best',
        before: 900,
        after: 1234,
        delta: 334,
      })
    );
  });

  it('reports exact before/after Record and Mastery crossings', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      mastery: {
        dynasty: 'PRIMAL',
        xpGained: 200,
        xpBefore: 6900,
        xp: 7100,
        levelBefore: 1,
        level: 3,
        levelsGained: 2,
        leveledUp: true,
        unlocks: [{ level: 3, kind: 'mutation', label: 'Deep Roots' }],
      },
      recordsBefore: { extractor: { value: 99, tier: 1 } },
      recordsAfter: { extractor: { value: 100, tier: 2 } },
    });
    expect(envelope.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'mastery:PRIMAL:level:3',
          before: 1,
          after: 3,
          delta: 2,
          significance: 'milestone',
        }),
        expect.objectContaining({
          key: 'record:extractor:tier:2',
          before: 1,
          after: 2,
          significance: 'milestone',
        }),
      ])
    );
  });

  it('honors the three-beat budget by significance then stable source order', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      mastery: {
        dynasty: 'PRIMAL',
        xpGained: 1000,
        xpBefore: 174000,
        xp: 175000,
        levelBefore: 9,
        level: 10,
        levelsGained: 1,
        leveledUp: true,
        unlocks: [{ level: 10, kind: 'emblem', label: 'Sovereign' }],
      },
      recordsBefore: {
        extractor: { value: 999, tier: 4 },
        survivor: { value: 499, tier: 3 },
      },
      recordsAfter: {
        extractor: { value: 1000, tier: 5 },
        survivor: { value: 500, tier: 4 },
      },
      codex: {
        discoveries: [
          { type: 'apex', entryId: 'AURUM', rewardDna: 400, worldFirst: true },
        ],
        rewardDna: 400,
        genomeWeaverUnlocked: true,
      },
    });
    expect(envelope.featuredImpactKeys).toHaveLength(3);
    expect(envelope.featuredImpactKeys).toEqual([
      'mastery:PRIMAL:level:10',
      'record:extractor:tier:5',
      'codex:apex:AURUM',
    ]);
  });

  it('keeps a clan top-five improvement notable, not a global badge milestone', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      clan: {
        eligible: true,
        enteredTopFive: true,
        replacedSessionId: null,
        scoreDelta: 800,
        clanTotal: 5000,
        fifthBest: 800,
      },
    });
    expect(envelope.impacts).toContainEqual(
      expect.objectContaining({
        kind: 'clan_top_five',
        significance: 'notable',
        delta: 800,
      })
    );
  });

  it('never presents invalid-run lineage or PB advancement', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      validated: false,
      personalBest: { eligible: false, before: 900, after: 900, improved: false },
    });
    expect(envelope.receipt.validated).toBe(false);
    expect(envelope.receipt.personalBest).toEqual({
      eligible: false,
      before: 900,
      after: 900,
      improved: false,
    });
    expect(envelope.impacts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'lineage_run' }),
        expect.objectContaining({ kind: 'personal_best' }),
      ])
    );
  });

  it('recognizes deploy-before-migration errors without hiding real failures', () => {
    expect(isMissingRunImpactInfra({ code: '42P01', message: 'missing relation' })).toBe(true);
    expect(
      isMissingRunImpactInfra({ code: 'PGRST202', message: 'persist_run_impact_envelope absent' })
    ).toBe(true);
    expect(isMissingRunImpactInfra({ code: '08006', message: 'connection failure' })).toBe(false);
  });
});

describe('run impact durability results', () => {
  const envelope = () => buildRunImpactEnvelope(base);

  function readClient(result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      chain[method] = jest.fn(() => chain);
    }
    chain.maybeSingle = jest.fn(async () => result);
    return { from: jest.fn(() => chain) };
  }

  it('distinguishes a true absent receipt from a failed read', async () => {
    await expect(
      loadRunImpactEnvelope(
        readClient({ data: null, error: null }) as never,
        'player-1',
        base.sessionId
      )
    ).resolves.toEqual({ status: 'absent' });

    const failed = await loadRunImpactEnvelope(
      readClient({ data: null, error: { code: '08006', message: 'connection failure' } }) as never,
      'player-1',
      base.sessionId
    );
    expect(failed).toMatchObject({ status: 'unavailable' });
  });

  it('treats malformed stored settlement truth as unavailable, never absent', async () => {
    const malformed = {
      ...envelope(),
      receipt: { ...envelope().receipt, score: '1234' },
    };
    const result = await loadRunImpactEnvelope(
      readClient({ data: { envelope: malformed }, error: null }) as never,
      'player-1',
      base.sessionId
    );
    expect(result).toMatchObject({ status: 'unavailable' });
  });

  it('never treats an unpersisted envelope as canonical success', async () => {
    const failed = await persistRunImpactEnvelope(
      {
        rpc: jest.fn(async () => ({
          data: null,
          error: { code: '08006', message: 'connection failure' },
        })),
      } as never,
      'player-1',
      envelope()
    );
    expect(failed).toMatchObject({ status: 'unavailable' });

    const persisted = await persistRunImpactEnvelope(
      { rpc: jest.fn(async () => ({ data: envelope(), error: null })) } as never,
      'player-1',
      envelope()
    );
    expect(persisted).toMatchObject({ status: 'persisted', impact: envelope() });
  });
});
