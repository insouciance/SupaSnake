import {
  buildRunImpactEnvelope,
  insertCurriculumAttention,
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
  bankedRunsBefore: null,
  curriculum: null,
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

  it('makes a clan top-five improvement durable Compete recognition', () => {
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
        significance: 'milestone',
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

// ---------------------------------------------------------------------------
// WP-D — the first BANK and the curriculum reveal (PEO §3.1, §4.4, §5)
// ---------------------------------------------------------------------------

describe('first-BANK recognition beat', () => {
  it('plays once, on the first validated BANK', () => {
    const envelope = buildRunImpactEnvelope({ ...base, bankedRunsBefore: 0 });
    const beat = envelope.impacts.find(
      (impact) => impact.kind === 'first_extraction'
    );
    expect(beat).toMatchObject({
      pillar: 'mastery',
      significance: 'milestone',
      headline: 'First BANK secured',
      detail: 'You left with the run instead of losing it. That is the whole game.',
    });
    expect(envelope.featuredImpactKeys).toContain(beat?.key);
  });

  it('creates no attention row of its own', () => {
    // `persist_run_impact_envelope` only mints recognition for a milestone
    // that carries BOTH a destination and an artifactRef. A first BANK is a
    // beat, not a badge — the next thing this player needs is the next run.
    const beat = buildRunImpactEnvelope({
      ...base,
      bankedRunsBefore: 0,
    }).impacts.find((impact) => impact.kind === 'first_extraction');
    expect(beat?.destination).toBeUndefined();
    expect(beat?.artifactRef).toBeUndefined();
  });

  it('is silent on a second bank, a crash, an invalid run, and an unstamped run', () => {
    const cases = [
      { ...base, bankedRunsBefore: 1 },
      { ...base, bankedRunsBefore: 0, extracted: false, died: true },
      { ...base, bankedRunsBefore: 0, validated: false },
      { ...base, bankedRunsBefore: null },
    ];
    for (const input of cases) {
      expect(
        buildRunImpactEnvelope(input).impacts.some(
          (impact) => impact.kind === 'first_extraction'
        )
      ).toBe(false);
    }
  });
});

describe('curriculum unlock beat', () => {
  const unlocked = () =>
    buildRunImpactEnvelope({ ...base, curriculum: { geneId: 'coilkeeper' } });

  it('reaches the Victory Lap and the Chronicle as a milestone', () => {
    const envelope = unlocked();
    const beat = envelope.impacts.find((impact) => impact.kind === 'gene_unlocked');
    expect(beat).toMatchObject({
      key: 'curriculum:gene:coilkeeper',
      pillar: 'discovery',
      significance: 'milestone',
      headline: 'Loop Trap joined your Power Pods',
      metadata: { geneId: 'coilkeeper' },
    });
    expect(envelope.featuredImpactKeys).toContain('curriculum:gene:coilkeeper');
  });

  it('carries no destination, so no undismissable recognition row is minted', () => {
    // Decision 14: the INVITATION must be an `action` row, because
    // `recognition_never_action_terminal` forbids the terminal states a
    // **Not now** needs. Keeping the beat destination-less is what stops the
    // settlement RPC from writing a competing recognition row for the same
    // lesson — and stops it becoming a second pointer via recommendedAction.
    const envelope = unlocked();
    const beat = envelope.impacts.find((impact) => impact.kind === 'gene_unlocked');
    expect(beat?.destination).toBeUndefined();
    expect(beat?.artifactRef).toBeUndefined();
    expect(envelope.recommendedAction).toBeNull();
  });

  it('promotes at most one Gene per run', () => {
    expect(
      unlocked().impacts.filter((impact) => impact.kind === 'gene_unlocked')
    ).toHaveLength(1);
  });

  it('is absent with no curriculum on the run (flag off)', () => {
    expect(
      buildRunImpactEnvelope(base).impacts.some(
        (impact) => impact.kind === 'gene_unlocked'
      )
    ).toBe(false);
  });

  it('produces a byte-identical envelope when both WP-D inputs are absent', () => {
    // The flag-off proof for the receipt itself: a run with no curriculum
    // stamp serializes exactly the bytes it serialized before WP-D.
    const withoutFields = buildRunImpactEnvelope({
      ...base,
      bankedRunsBefore: null,
      curriculum: null,
    });
    const legacy = buildRunImpactEnvelope({
      ...base,
      bankedRunsBefore: null,
      curriculum: null,
      extracted: true,
    });
    expect(JSON.stringify(withoutFields)).toBe(JSON.stringify(legacy));
    expect(withoutFields.impacts.map((impact) => impact.kind)).toEqual([
      'lineage_run',
    ]);
  });
});

describe('curriculum attention row', () => {
  function insertClient(result: { error: unknown }) {
    const insert = jest.fn(async () => result);
    return { client: { from: jest.fn(() => ({ insert })) }, insert };
  }

  it('writes a dismissible action row at the Workbench (decision 14)', async () => {
    const { client, insert } = insertClient({ error: null });
    await expect(
      insertCurriculumAttention(
        client as never,
        'player-1',
        base.sessionId,
        'coilkeeper'
      )
    ).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: 'player-1',
        source_type: 'curriculum',
        source_id: base.sessionId,
        attention_key: 'gene:coilkeeper',
        attention_kind: 'action',
        destination: 'codex',
        artifact_ref: 'gene:coilkeeper',
      })
    );
    const written = insert.mock.calls[0][0] as Record<string, string>;
    expect(written.attention_kind).not.toBe('recognition');
    expect(written.headline.length).toBeLessThanOrEqual(160);
  });

  it('treats a replayed settlement as an invitation already open', async () => {
    const { client } = insertClient({ error: { code: '23505', message: 'duplicate key' } });
    await expect(
      insertCurriculumAttention(client as never, 'p', base.sessionId, 'coilkeeper')
    ).resolves.toBe(true);
  });

  it('never fails a settlement when the invitation cannot be written', async () => {
    const { client } = insertClient({
      error: { code: '08006', message: 'connection failure' },
    });
    await expect(
      insertCurriculumAttention(client as never, 'p', base.sessionId, 'coilkeeper')
    ).resolves.toBe(false);

    const thrown = {
      from: jest.fn(() => {
        throw new Error('offline');
      }),
    };
    await expect(
      insertCurriculumAttention(thrown as never, 'p', base.sessionId, 'coilkeeper')
    ).resolves.toBe(false);
  });
});
