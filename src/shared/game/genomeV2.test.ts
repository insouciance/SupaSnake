import {
  GENOME_RULES_V2,
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICE_IDS,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  genomeV2CarryBankBps,
  genomeV2CarrySalvageBps,
  genomeV2RunRecord,
  genomeV2Yield,
  projectGenomeV2,
  reduceGenomeV2Event,
  settleGenomeV2,
  type GenomeV2Event,
  type GenomeV2State,
} from './genomeV2';
import {
  GENOME_V2_GENES,
  geneDefinitionForRules,
  genomeV2ActivePool,
} from './genes';

let eventOrdinal = 0;

function event<T extends Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>>(
  state: GenomeV2State,
  facts: T
): GenomeV2Event {
  eventOrdinal += 1;
  return {
    ...facts,
    index: state.eventIndex + 1,
    tick: state.tick + 1,
    eventId: `event-${eventOrdinal}`,
  } as GenomeV2Event;
}

function apply<T extends Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>>(
  state: GenomeV2State,
  facts: T
): GenomeV2State {
  return reduceGenomeV2Event(state, event(state, facts));
}

function acquire(
  initial: GenomeV2State,
  geneId: keyof typeof GENOME_V2_GENES,
  slot: 0 | 1 | 2 | 3 | 4 | 5,
  instanceId = `${geneId}-${slot}`
): GenomeV2State {
  const offerId = `offer-${instanceId}`;
  const alternative = geneId === 'live_wire' ? 'loan_shark' : 'live_wire';
  let state = apply(initial, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  state = apply(state, {
    type: 'gene_acquired',
    offerId,
    instanceId,
    geneId,
    slot,
    source: 'offer',
  });
  return state;
}

function spawnAndResolve(
  initial: GenomeV2State,
  id: string,
  options: {
    base?: number;
    resolution?: 'collected' | 'missed' | 'expired';
    movesUsed?: number;
    shortest?: number;
    pressureBps?: number;
  } = {}
): GenomeV2State {
  let state = apply(initial, {
    type: 'target_spawned',
    targetId: id,
    cell: { x: 1, z: 1 },
    speedAtSpawnMs: 160,
    shortestSafeMoves: options.shortest ?? 2,
    cadenceEligible: true,
  });
  state = apply(state, {
    type: 'target_resolved',
    targetId: id,
    resolution: options.resolution ?? 'collected',
    movesUsed: options.movesUsed ?? 2,
    baseYield:
      options.resolution && options.resolution !== 'collected'
        ? 0
        : options.base ?? genomeV2Yield(1),
    pressureBps: options.pressureBps ?? 0,
  });
  return state;
}

beforeEach(() => {
  eventOrdinal = 0;
});

describe('Genome v2 frozen catalog and FTUE', () => {
  it('keeps v1 meanings separate and exposes only the curated dynasty pool', () => {
    expect(geneDefinitionForRules('mirror_wager', 1)?.effect).not.toBe(
      GENOME_V2_GENES.mirror_wager.effect
    );
    expect(geneDefinitionForRules('mirror_wager', 2)).toEqual(
      GENOME_V2_GENES.mirror_wager
    );
    expect(genomeV2ActivePool('CYBER')).not.toContain('time_dilation');
    expect(genomeV2ActivePool('PRIMAL')).toContain('time_dilation');
    expect(genomeV2ActivePool('CYBER')).toContain('zenith_protocol');
    expect(Object.keys(GENOME_V2_GENES)).toHaveLength(16);
    expect(GENOME_V2_SPLICE_IDS).toHaveLength(8);
  });

  it('shows tags and Minor at bank zero, then unlocks 1/2/4/6/10', () => {
    expect(deriveGenomeV2Ftue(0, 0)).toMatchObject({
      strainTagsUnlocked: true,
      minorUnlocked: true,
      continueUnlocked: false,
      expressionsUnlocked: false,
    });
    expect(deriveGenomeV2Ftue(1, 0).continueUnlocked).toBe(true);
    expect(deriveGenomeV2Ftue(2, 0).expressionsUnlocked).toBe(true);
    expect(deriveGenomeV2Ftue(4, 0).portalGenomeUnlocked).toBe(true);
    expect(deriveGenomeV2Ftue(6, 0)).toMatchObject({
      spawnPointsUnlocked: true,
      splicesUnlocked: true,
    });
    expect(deriveGenomeV2Ftue(10, 0).apexesUnlocked).toBe(true);
    expect(deriveGenomeV2Ftue(0, 3).apexesUnlocked).toBe(true);
  });
});

describe('Genome v2 Carry and decision vocabulary', () => {
  it('uses exact compounding through p5, then an uncapped +0.40 per pass', () => {
    expect(genomeV2CarryBankBps(0)).toBe(12_500);
    expect(genomeV2CarryBankBps(1)).toBe(15_625);
    expect(genomeV2CarryBankBps(5)).toBe(38_146);
    expect(genomeV2CarryBankBps(6)).toBe(42_146);
    expect(genomeV2CarryBankBps(20)).toBe(98_146);
    expect(genomeV2CarrySalvageBps(0)).toBe(10_000);
    expect(genomeV2CarrySalvageBps(1)).toBe(7_400);
    expect(genomeV2CarrySalvageBps(2)).toBe(5_840);
  });

  it('makes deliberate Loom DECLINE a Bond, expiry nothing, and only portal outcomes move Carry', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'compound_interest', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'decision-1',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
    });
    state = apply(state, { type: 'offer_declined', offerId: 'decision-1' });
    expect(state.bonds).toBe(1);
    expect(state.carryPasses).toBe(0);

    state = apply(state, {
      type: 'offer_opened',
      offerId: 'decision-2',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
    });
    state = apply(state, { type: 'offer_expired', offerId: 'decision-2' });
    expect(state.bonds).toBe(1);
    expect(state.carryPasses).toBe(0);

    state = apply(state, {
      type: 'portal_opened',
      portalId: 'portal-1',
      genomeOffer: null,
    });
    state = apply(state, {
      type: 'portal_expired',
      portalId: 'portal-1',
    });
    expect(state.carryPasses).toBe(1);
  });
});

describe('Genome v2 target lifecycle and contracts', () => {
  it('pays a failed Live Wire target zero without throwing or losing its growth', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'live_wire', 0);
    for (let index = 0; index < 2; index += 1) {
      state = spawnAndResolve(state, `ordinary-${index}`);
    }
    state = spawnAndResolve(state, 'failed-live', {
      movesUsed: 99,
      shortest: 2,
    });
    expect(state.targets['failed-live'].kind).toBe('live_wire');
    expect(state.targets['failed-live'].lifecycle).toBe('burnt');
    expect(state.ledger.exclusiveTargetDelta).toBe(-genomeV2Yield(1));
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(2));
    expect(state.foodCount).toBe(3);
  });

  it('demotes an expired Gilded window to the same collectible ordinary target', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    for (let index = 0; index < 4; index += 1) {
      state = spawnAndResolve(state, `gold-charge-${index}`);
    }
    state = apply(state, {
      type: 'target_spawned',
      targetId: 'gilded',
      cell: { x: 3, z: 4 },
      speedAtSpawnMs: 175,
      shortestSafeMoves: 4,
      cadenceEligible: true,
    });
    expect(state.targets.gilded.kind).toBe('gold_trail');
    const originalCell = state.targets.gilded.cell;
    state = apply(state, { type: 'target_window_expired', targetId: 'gilded' });
    expect(state.targets.gilded).toMatchObject({
      kind: 'ordinary',
      lifecycle: 'active',
      cell: originalCell,
      moveBudget: null,
    });
    state = apply(state, {
      type: 'target_resolved',
      targetId: 'gilded',
      resolution: 'collected',
      movesUsed: 100,
      baseYield: genomeV2Yield(1),
      pressureBps: 0,
    });
    expect(state.targets.gilded.lifecycle).toBe('completed');
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(5));
  });

  it('advances Loan only for collected foods and releases exactly six ×2 values', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'loan_shark', 0);
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'loan-door',
      genomeOffer: null,
    });
    state = apply(state, {
      type: 'portal_continued',
      portalId: 'loan-door',
      activateMirror: false,
    });
    expect(state.loan?.foodsRemaining).toBe(6);
    state = spawnAndResolve(state, 'missed-food', { resolution: 'missed' });
    expect(state.loan?.foodsRemaining).toBe(6);
    for (let index = 0; index < 6; index += 1) {
      state = spawnAndResolve(state, `loan-${index}`);
    }
    expect(state.loan).toBeNull();
    expect(state.ledger.loanEscrowDeposited).toBe(genomeV2Yield(12));
    expect(state.ledger.loanEscrowReleased).toBe(genomeV2Yield(12));
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(12));
  });
});

describe('Genome v2 Mirror, Recode and second-life ownership', () => {
  it('activates Mirror only by choice and freezes the current leg at pre-CONTINUE Carry', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'mirror_wager', 0);
    state = spawnAndResolve(state, 'leg-one');
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'mirror-door',
      genomeOffer: null,
    });
    state = apply(state, {
      type: 'portal_continued',
      portalId: 'mirror-door',
      activateMirror: true,
    });
    expect(state.ledger.mirrorRawDiverted).toBe(0);
    expect(state.ledger.mirrorStake).toBe(0);
    expect(state.ledger.bankableYield).toBe(10_000);
    expect(state.mirrorLeg).toEqual({
      portalId: 'mirror-door',
      frozenCarryBps: 12_500,
    });
    expect(state.carryPasses).toBe(1);

    state = spawnAndResolve(state, 'leg-two');
    const bank = settleGenomeV2(state, 'bank');
    const crash = settleGenomeV2(state, 'crash');
    expect(bank.mirrorStakePaid).toBe(genomeV2Yield(1));
    expect(bank.genomeYield).toBe(35_000);
    expect(crash.mirrorStakeForfeited).toBe(5_000);
    expect(crash.genomeYield).toBe(11_840);
  });

  it('binds Recode to a frozen two-candidate portal offer and never reuses a seen id', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0, 'gold-1');
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'recode-door',
      genomeOffer: {
        offerId: 'mutate-1',
        candidates: ['live_wire', 'loan_shark'],
      },
    });
    expect(() => apply(state, {
      type: 'portal_recode_selected',
      portalId: 'recode-door',
      offerId: 'mutate-1',
      replacementGeneId: 'overgrowth',
      slot: 0,
    })).toThrow('immutable portal candidate');

    state = apply(state, {
      type: 'portal_recode_selected',
      portalId: 'recode-door',
      offerId: 'mutate-1',
      replacementGeneId: 'live_wire',
      slot: 0,
    });
    expect(state.portal?.pendingRecode).toMatchObject({
      replacementGeneId: 'live_wire',
      growthCost: 8,
    });
    state = apply(state, {
      type: 'portal_recode',
      portalId: 'recode-door',
      offerId: 'mutate-1',
      instanceId: 'live-1',
      growthCharged: 8,
    });
    expect(state.instances['gold-1'].status).toBe('replaced');
    expect(state.instances['live-1'].status).toBe('active');
    expect(state.recodeCount).toBe(1);

    expect(() => apply(state, {
      type: 'portal_opened',
      portalId: 'forged-door',
      genomeOffer: {
        offerId: 'mutate-2',
        candidates: ['gold_trail', 'overgrowth'],
      },
    })).toThrow('already-seen gene');
  });

  it.each([
    ['mirror_wager', 'phoenix', 'splice_styx_contract'],
    ['phoenix', 'mirror_wager', 'splice_styx_contract'],
    ['loan_shark', 'phoenix', 'splice_ashen_stake'],
    ['phoenix', 'loan_shark', 'splice_ashen_stake'],
  ] as const)(
    'gives %s + %s explicit Splice ownership, then consumes the locus into Ash',
    (first, second, spliceId) => {
      let state = acquire(createGenomeV2State('PRIMAL'), first, 0, 'first');
      state = acquire(state, second, 1, 'second');
      expect(state.activeSplices).toContain(spliceId);
      expect(state.secondLife?.owner).toMatchObject({
        kind: 'splice',
        spliceId,
        slot: 0,
      });
      const phoenixId = first === 'phoenix' ? 'first' : 'second';
      const partnerId = phoenixId === 'first' ? 'second' : 'first';
      state = apply(state, {
        type: 'phoenix_triggered',
        sourceInstanceId: phoenixId,
      });
      expect(state.activeSplices).not.toContain(spliceId);
      expect(state.slots[0].occupant).toEqual({
        kind: 'ash',
        sourceInstanceId: phoenixId,
      });
      expect(state.instances[phoenixId].status).toBe('ash');
      expect(state.instances[partnerId].status).toBe('replaced');

      state = apply(state, {
        type: 'portal_opened',
        portalId: 'post-ash',
        genomeOffer: {
          offerId: 'post-ash-offer',
          candidates: ['live_wire', 'overgrowth'],
        },
      });
      expect(() => apply(state, {
        type: 'portal_recode_selected',
        portalId: 'post-ash',
        offerId: 'post-ash-offer',
        replacementGeneId: 'live_wire',
        slot: 0,
      })).toThrow('non-Ash locus');
    }
  );
});

describe('Genome v2 Tactical Loom and persistence envelope', () => {
  it('projects n-order strain, Splice, liability and replacement consequences', () => {
    const state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    const loom = projectGenomeV2(state, ['compound_interest']);
    expect(loom.candidates[0]).toMatchObject({
      geneId: 'compound_interest',
      category: 'banking',
      completesSplice: 'splice_dragon_hoard',
      requiresReplacement: false,
      projectedPortalActionGrowth: { infuse: 3, recode: 8 },
    });
    expect(loom.candidates[0].resultingStrainPoints.AURUM).toBe(2);
    expect(loom.candidates[0].unlockDistance.AURUM).toEqual({
      to3: 1,
      to4: 2,
      to5: 3,
    });
  });

  it('serializes the canonical v2 state flat for SQL projectors', () => {
    const state = acquire(createGenomeV2State('COSMIC'), 'gold_trail', 0);
    const record = genomeV2RunRecord(state, settleGenomeV2(state, 'crash'));
    expect(record).toMatchObject({
      v: GENOME_RULES_V2,
      dynasty: 'COSMIC',
      instances: { 'gold_trail-0': { geneId: 'gold_trail' } },
      slots: expect.any(Array),
      journal: expect.any(Array),
      settlement: { terminal: 'crash' },
    });
    expect(record).not.toHaveProperty('state');
    expect(record.slots).toHaveLength(GENOME_V2_CONFIG.maxSlots);
  });
});
