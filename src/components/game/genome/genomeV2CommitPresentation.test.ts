import {
  createGenomeV2State,
  genomeV2EventId,
  reduceGenomeV2Event,
  type GenomeV2Event,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';
import type { GenomeV2ActivationPresentation } from './genomeV2PresentationAdapter';
import { buildGenomeV2CommitPresentation } from './genomeV2CommitPresentation';

const ACTIVATION: GenomeV2ActivationPresentation = {
  continue: { unlocked: true },
  portalGenome: { unlocked: true },
  expressions: { unlocked: true },
  splices: { unlocked: true },
  apex: { unlocked: true },
};

function apply(
  state: GenomeV2State,
  event: Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>
): GenomeV2State {
  const index = state.eventIndex + 1;
  return reduceGenomeV2Event(state, {
    ...event,
    index,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, index),
  } as GenomeV2Event);
}

function acquire(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5
): GenomeV2State {
  const offerId = `offer:${state.eventIndex}:${geneId}`;
  const alternative = geneId === 'live_wire' ? 'gold_trail' : 'live_wire';
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

describe('Genome v2 post-commit presentation', () => {
  it('reports the newly formed rule and rung from canonical before/after states', () => {
    let state = createGenomeV2State('PRIMAL', { splicesEnabled: true });
    state = acquire(state, 'gold_trail', 0);
    state = acquire(state, 'loan_shark', 1);
    const offerId = 'offer:compound';
    const before = apply(state, {
      type: 'offer_opened',
      offerId,
      source: 'cadence',
      candidates: ['compound_interest', 'coilkeeper'],
    });
    const after = apply(before, {
      type: 'gene_acquired',
      offerId,
      instanceId: 'instance:compound',
      geneId: 'compound_interest',
      slot: 2,
      source: 'offer',
    });

    const presentation = buildGenomeV2CommitPresentation(before, after, ACTIVATION);
    expect(presentation).toMatchObject({
      title: 'Dragon Hoard',
      rule: expect.stringContaining('treasure that grows at BANK'),
    });
    expect(presentation?.moments).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Dragon Hoard formed' }),
      expect.objectContaining({ label: 'Gold 3 · Payday' }),
    ]));
  });

  it('keeps a reached but locked rung honest instead of calling it active', () => {
    let state = createGenomeV2State('PRIMAL');
    state = acquire(state, 'overgrowth', 0);
    state = acquire(state, 'phoenix', 1);
    state = acquire(state, 'time_dilation', 2);
    const before = state;
    const offerId = 'offer:heartwood';
    const opened = apply(before, {
      type: 'offer_opened',
      offerId,
      source: 'cadence',
      candidates: ['heartwood', 'wall_rush'],
    });
    const after = apply(opened, {
      type: 'gene_acquired',
      offerId,
      instanceId: 'instance:heartwood',
      geneId: 'heartwood',
      slot: 3,
      source: 'offer',
    });
    const activation = {
      ...ACTIVATION,
      apex: { unlocked: false, reason: 'Bank 10 runs', progress: '4 / 10' },
    };

    const presentation = buildGenomeV2CommitPresentation(opened, after, activation);
    expect(presentation?.moments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Coils 4 · Titan',
        detail: expect.stringContaining('activation remains locked'),
        tone: 'warning',
      }),
    ]));
  });

  it('uses the run-frozen effective threshold in an activation callout', () => {
    const state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 2 },
      strainThresholdDelta: { AURUM: 1 },
    });
    const offerId = 'offer:shifted-mint';
    const before = apply(state, {
      type: 'offer_opened',
      offerId,
      source: 'cadence',
      candidates: ['gold_trail', 'live_wire'],
    });
    const after = apply(before, {
      type: 'gene_acquired',
      offerId,
      instanceId: 'instance:shifted-mint',
      geneId: 'gold_trail',
      slot: 0,
      source: 'offer',
    });

    expect(buildGenomeV2CommitPresentation(before, after, ACTIVATION)?.moments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Gold 3 · Cut', tone: 'positive' }),
      ]));
  });

  it('reports a reached Dampened rung as locked while preserving Minor', () => {
    const state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 2 },
      suppressedStrains: ['AURUM'],
    });
    const offerId = 'offer:dampened-dividend';
    const before = apply(state, {
      type: 'offer_opened',
      offerId,
      source: 'cadence',
      candidates: ['gold_trail', 'live_wire'],
    });
    const after = apply(before, {
      type: 'gene_acquired',
      offerId,
      instanceId: 'instance:dampened-dividend',
      geneId: 'gold_trail',
      slot: 0,
      source: 'offer',
    });

    expect(buildGenomeV2CommitPresentation(before, after, ACTIVATION)?.moments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          label: 'Gold 3 · Payday',
          detail: expect.stringContaining('Dampened'),
          tone: 'warning',
        }),
      ]));
  });
});
