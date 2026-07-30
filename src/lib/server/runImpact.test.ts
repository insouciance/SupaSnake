import {
  buildRunImpactEnvelope,
  isMissingRunImpactInfra,
} from './runImpact';

const base = {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  settledAt: '2026-07-30T12:00:00.000Z',
  dynasty: 'PRIMAL' as const,
  extracted: true,
  died: false,
  score: 1234,
  yieldDna: 800,
  dnaCredited: 1760,
  energyCommitted: 2,
  commitmentMultiplierBps: 22000,
  generation: 5,
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
        score: 1234,
        yieldDna: 800,
        dnaCredited: 1760,
        energyCommitted: 2,
        commitmentMultiplierBps: 22000,
        generation: 5,
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

  it('reports exact before/after Record and Mastery crossings', () => {
    const envelope = buildRunImpactEnvelope({
      ...base,
      mastery: {
        dynasty: 'PRIMAL',
        xpGained: 200,
        xp: 7100,
        level: 3,
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
          before: 2,
          after: 3,
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
        xp: 175000,
        level: 10,
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

  it('recognizes deploy-before-migration errors without hiding real failures', () => {
    expect(isMissingRunImpactInfra({ code: '42P01', message: 'missing relation' })).toBe(true);
    expect(
      isMissingRunImpactInfra({ code: 'PGRST202', message: 'persist_run_impact_envelope absent' })
    ).toBe(true);
    expect(isMissingRunImpactInfra({ code: '08006', message: 'connection failure' })).toBe(false);
  });
});
