import {
  createGenomeV2State,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';
import {
  buildGenomeV2PortalPresentation,
  buildGenomeV2TacticalLoomModel,
  type GenomeV2ActivationPresentation,
} from './genomeV2PresentationAdapter';

const ACTIVATION: GenomeV2ActivationPresentation = {
  continue: { unlocked: true },
  portalGenome: { unlocked: true },
  expressions: { unlocked: false, reason: 'Bank 2 runs', progress: '1 / 2' },
  splices: { unlocked: true },
  apex: { unlocked: false, reason: 'Bank 10 runs or reach M3', progress: '4 / 10' },
};

function apply(
  state: GenomeV2State,
  event: Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>
): GenomeV2State {
  return reduceGenomeV2Event(state, {
    ...event,
    index: state.eventIndex + 1,
    tick: state.tick + 1,
    eventId: `test:${state.eventIndex + 1}:${event.type}`,
  } as GenomeV2Event);
}

function acquire(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5
): GenomeV2State {
  const alternative = geneId === 'gold_trail' ? 'live_wire' : 'gold_trail';
  const offerId = `offer:${state.eventIndex}:${geneId}`;
  let next = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  next = apply(next, {
    type: 'gene_acquired',
    offerId,
    instanceId: `instance:${geneId}`,
    geneId,
    slot,
    source: 'offer',
  });
  return next;
}

describe('Genome v2 presentation adapter', () => {
  it('maps exact projector facts into the shared tactical consequence pane', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'live-offer',
      source: 'cadence',
      candidates: ['compound_interest', 'coilkeeper'],
    });
    const model = buildGenomeV2TacticalLoomModel({
      state,
      activation: ACTIVATION,
      spatial: { bodyLength: 28, occupiedSpace: '29 / 144 cells' },
    });

    expect(model).not.toBeNull();
    expect(model?.rulesVersion).toBe(2);
    expect(model?.currentGenome[0]).toMatchObject({ label: 'Gold Trail', kind: 'gene' });
    expect(model?.candidates[0].name).toBe('Compound Interest');
    expect(model?.candidates.map((candidate) => candidate.action)).toEqual(['THREAD', 'THREAD']);
    expect(model?.candidates[0].consequence.genomeAfter[1]).toMatchObject({
      label: 'Compound Interest',
      kind: 'gene',
    });
    expect(model?.candidates[0].consequence.splices).toEqual([
      expect.objectContaining({ name: 'Dragon Hoard', stage: 'immediate', activation: 'available' }),
    ]);
    expect(model?.candidates[0].consequence.strains[0].thresholds).toEqual([
      expect.objectContaining({ points: 3 }),
      expect.objectContaining({ points: 4, state: 'locked', lockedReason: 'Bank 2 runs · 1 / 2' }),
      expect.objectContaining({ points: 5, state: 'locked', lockedReason: 'Bank 10 runs or reach M3 · 4 / 10' }),
    ]);
    expect(model?.candidates[0].consequence.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'body-length', before: '28 segments' }),
      expect.objectContaining({ id: 'permanent-terrain', before: '0 formations' }),
    ]));
    expect(model?.candidates[0].consequence.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bank', before: '0 Yield' }),
      expect.objectContaining({ id: 'crash', before: '0 Yield' }),
    ]));
  });

  it('previews reachable Splices even before activation unlocks', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'future-depth-offer',
      source: 'cadence',
      candidates: ['compound_interest', 'coilkeeper'],
    });
    const model = buildGenomeV2TacticalLoomModel({
      state,
      activation: {
        ...ACTIVATION,
        splices: { unlocked: false, reason: 'Bank 6 runs', progress: '2 / 6' },
      },
    });

    expect(model?.candidates[0].consequence.splices).toEqual([
      expect.objectContaining({
        name: 'Dragon Hoard',
        activation: 'locked',
        lockedReason: 'Bank 6 runs · 2 / 6',
      }),
    ]);
  });

  it('uses the core reducer for DECLINE consequences instead of duplicating Bond arithmetic', () => {
    let state = acquire(createGenomeV2State('CYBER'), 'compound_interest', 0);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'bond-offer',
      source: 'cadence',
      candidates: ['live_wire', 'phase_gate'],
    });
    const model = buildGenomeV2TacticalLoomModel({ state, activation: ACTIVATION });
    const bonds = model?.decline.consequence.ledgers.find((fact) => fact.id === 'bonds');
    expect(model?.decline.consequence.effect).toContain('mint one prospective BANK Bond');
    expect(bonds).toMatchObject({ before: '0', after: '1' });
  });

  it('quotes exact Carry and opens the immutable portal candidates without consuming them', () => {
    let state = createGenomeV2State('COSMIC');
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'portal-1',
      genomeOffer: {
        offerId: 'portal-offer-1',
        candidates: ['constellation_crown', 'mirror_wager'],
      },
    });
    const portal = buildGenomeV2PortalPresentation({
      state,
      activation: ACTIVATION,
      sourceLabel: 'Portal 1 · immutable offer',
      spatial: { bodyLength: 18 },
    });
    expect(portal.carryProjection).toEqual({
      bankCurrent: '×1.25',
      bankNext: '×1.5625',
      salvageCurrent: '×1',
      salvageNext: '×0.74',
    });
    expect(portal.outcomeProjection).toEqual({
      bank: '0 Yield',
      crash: '0 Yield',
      label: 'Genome Yield · before run-stamped Ascendance and Energy',
    });
    expect(portal.mutationTerms).toMatchObject({ mode: 'mutate', growthCost: 3, actionOrdinal: 1 });
    expect(portal.mutationLoom?.candidates.map((candidate) => candidate.geneId)).toEqual([
      'constellation_crown',
      'mirror_wager',
    ]);
    expect(state.portal?.genomeOffer?.candidates).toEqual([
      'constellation_crown',
      'mirror_wager',
    ]);
  });

  it('exposes two-step Recode options with exact +8 growth and permanent Ash locks', () => {
    let state = createGenomeV2State('PRIMAL');
    const genes: readonly GenomeV2ActiveGeneId[] = [
      'loan_shark',
      'live_wire',
      'time_dilation',
      'coilkeeper',
      'loom_anchor',
      'heartwood',
    ];
    genes.forEach((gene, index) => {
      state = acquire(state, gene, index as 0 | 1 | 2 | 3 | 4 | 5);
    });
    state = apply(state, {
      type: 'portal_opened',
      portalId: 'full-portal',
      genomeOffer: {
        offerId: 'full-offer',
        candidates: ['wall_rush', 'overgrowth'],
      },
    });
    const portal = buildGenomeV2PortalPresentation({ state, activation: ACTIVATION });
    expect(portal.mutationTerms).toMatchObject({ mode: 'recode', growthCost: 8 });
    expect(portal.mutationLoom?.candidates.map((candidate) => candidate.action)).toEqual(['FORK', 'FORK']);
    expect(portal.mutationLoom?.candidates[0].replacementChoices).toHaveLength(6);
    expect(portal.mutationLoom?.candidates[0].replacementChoices?.[0]).toMatchObject({
      slotIndex: 0,
      growthCost: 8,
    });
    expect(portal.mutationLoom?.candidates[0].replacementChoices?.[0].consequence.retainedFacts).toEqual(
      expect.arrayContaining(['earned Yield', 'prior growth', 'Scars and seals'])
    );
  });
});
