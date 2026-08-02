import {
  GENOME_V2_CONFIG,
  GENOME_V2_SPLICE_IDS,
  GENOME_V2_SPLICES,
  assertGenomeV2OfferMatchesRoll,
  assertGenomeV2PersistenceBound,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  deriveGenomeV2FtuePresentation,
  genomeV2BodyGrowthDelta,
  genomeV2EventId,
  genomeV2FtueFromPresentation,
  genomeV2OfferInterval,
  genomeV2RunRecord,
  genomeV2SerializedBytes,
  genomeV2Yield,
  previewGenomeV2Recode,
  projectGenomeV2,
  projectGenomeV2Ladders,
  projectGenomeV2NextTarget,
  reduceGenomeV2Event,
  rollGenomeV2Offer,
  settleGenomeV2,
  type GenomeV2Cell,
  type GenomeV2Event,
  type GenomeV2State,
} from './genomeV2';
import {
  GENOME_V2_GENES,
  type GenomeV2ActiveGeneId,
} from './genes';
import { STRAIN_IDS, type StrainId } from './strains';

type EventFacts = Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>;

function event(state: GenomeV2State, facts: EventFacts): GenomeV2Event {
  const index = state.eventIndex + 1;
  return {
    ...facts,
    index,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, index),
  } as GenomeV2Event;
}

function apply(state: GenomeV2State, facts: EventFacts): GenomeV2State {
  return reduceGenomeV2Event(state, event(state, facts));
}

function acquire(
  state: GenomeV2State,
  geneId: GenomeV2ActiveGeneId,
  slot: 0 | 1 | 2 | 3 | 4 | 5,
  instanceId = `${geneId}:${slot}`
): GenomeV2State {
  const seen = new Set(Object.values(state.instances).map((entry) => entry.geneId));
  const alternative = state.genePool.find(
    (candidate) => candidate !== geneId && !seen.has(candidate)
  );
  if (!alternative) throw new Error('Test fixture has no legal alternative.');
  const offerId = `offer:${instanceId}`;
  let next = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: [geneId, alternative],
  });
  next = apply(next, {
    type: 'gene_acquired',
    offerId,
    instanceId,
    geneId,
    slot,
    source: 'offer',
  });
  return next;
}

interface SpawnOptions {
  cell?: GenomeV2Cell;
  secondaryCell?: GenomeV2Cell;
  optionalRouteCells?: readonly [GenomeV2Cell, GenomeV2Cell];
  shortestSafeMoves?: number;
  speedAtSpawnMs?: number;
  cadenceEligible?: boolean;
  crownRole?: 'current' | 'future' | 'crown';
}

function spawn(
  state: GenomeV2State,
  targetId: string,
  options: SpawnOptions = {}
): GenomeV2State {
  return apply(state, {
    type: 'target_spawned',
    targetId,
    cell: options.cell ?? { x: 1, z: 1 },
    secondaryCell: options.secondaryCell,
    optionalRouteCells: options.optionalRouteCells,
    speedAtSpawnMs: options.speedAtSpawnMs ?? 160,
    shortestSafeMoves: options.shortestSafeMoves ?? 2,
    cadenceEligible: options.cadenceEligible ?? true,
    crownRole: options.crownRole,
  });
}

interface ResolveOptions {
  resolution?: 'collected' | 'missed' | 'expired';
  movesUsed?: number;
  baseYield?: number;
  pressureBps?: number;
  usedOptionalRoute?: boolean;
  collectedUnits?: 0 | 1;
  circuitLegsCompleted?: 0 | 1 | 2;
}

function resolve(
  state: GenomeV2State,
  targetId: string,
  options: ResolveOptions = {}
): GenomeV2State {
  const resolution = options.resolution ?? 'collected';
  return apply(state, {
    type: 'target_resolved',
    targetId,
    resolution,
    movesUsed: options.movesUsed ?? 2,
    baseYield: resolution === 'collected'
      ? options.baseYield ?? genomeV2Yield(1)
      : 0,
    pressureBps: options.pressureBps ?? 0,
    usedOptionalRoute: options.usedOptionalRoute,
    collectedUnits: options.collectedUnits,
    circuitLegsCompleted: options.circuitLegsCompleted,
  });
}

function ordinary(state: GenomeV2State, targetId: string, pressureBps = 0): GenomeV2State {
  return resolve(spawn(state, targetId), targetId, { pressureBps });
}

function openPortal(state: GenomeV2State, portalId: string): GenomeV2State {
  return apply(state, { type: 'portal_opened', portalId, genomeOffer: null });
}

function continuePortal(
  state: GenomeV2State,
  portalId: string,
  activateMirror = false
): GenomeV2State {
  return apply(state, { type: 'portal_continued', portalId, activateMirror });
}

describe('Genome v2 run-start authority and deterministic offers', () => {
  it('freezes the exact pool, derives deterministic cadence, and rolls two categories', () => {
    const state = createGenomeV2State('PRIMAL', {
      runSeed: 'run-seed-authority-001',
      genePool: ['gold_trail', 'loan_shark', 'live_wire', 'overgrowth'],
    });
    expect(state.genePool).toEqual([
      'gold_trail',
      'loan_shark',
      'live_wire',
      'overgrowth',
    ]);
    expect([0, 1].map((index) => genomeV2OfferInterval(state, index))).toEqual([4, 4]);
    expect([2, 3, 4, 5].map((index) => genomeV2OfferInterval(state, index)))
      .toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]));
    for (let index = 2; index < 20; index += 1) {
      expect(genomeV2OfferInterval(state, index)).toBeGreaterThanOrEqual(4);
      expect(genomeV2OfferInterval(state, index)).toBeLessThanOrEqual(6);
    }
    const first = rollGenomeV2Offer(state, 0);
    const again = rollGenomeV2Offer(state, 0);
    expect(first).toEqual(again);
    expect(first?.candidates).toHaveLength(2);
    expect(GENOME_V2_GENES[first!.candidates[0]].category).not.toBe(
      GENOME_V2_GENES[first!.candidates[1]].category
    );
    assertGenomeV2OfferMatchesRoll(state, 0, first!.candidates);
    expect(() => assertGenomeV2OfferMatchesRoll(
      state,
      0,
      [...first!.candidates].reverse()
    )).toThrow('deterministic run stream');
  });

  it('excludes seen genes, locked signatures, and Phoenix with an external life', () => {
    let state = createGenomeV2State('PRIMAL', {
      runSeed: 'run-seed-filter-001',
      externalSecondLife: 'iron_scales',
      ftue: deriveGenomeV2Ftue(0, 0),
    });
    for (let index = 0; index < 24; index += 1) {
      const offer = rollGenomeV2Offer(state, index);
      expect(offer?.candidates).not.toContain('phoenix');
      expect(offer?.candidates).not.toContain('heartwood');
    }
    state = acquire(state, 'gold_trail', 0, 'seen-gold');
    for (let index = 0; index < 24; index += 1) {
      expect(rollGenomeV2Offer(state, index)?.candidates).not.toContain('gold_trail');
    }
  });

  it('applies visible Splice gravity and honors an atomic Anchor pin', () => {
    let state = acquire(createGenomeV2State('PRIMAL', {
      runSeed: 'splice-gravity-seed-01',
    }), 'gold_trail', 0);
    const compound = Array.from({ length: 40 }, (_, index) =>
      rollGenomeV2Offer(state, index)
    ).flatMap((roll) => roll ? [...roll.weights] : [])
      .find((weight) => weight.geneId === 'compound_interest');
    expect(compound?.splice).toBe(GENOME_V2_CONFIG.offers.immediateSpliceWeight);

    state = acquire(state, 'loom_anchor', 1);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'anchor-source',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
    });
    state = apply(state, {
      type: 'offer_declined',
      offerId: 'anchor-source',
      pinGeneId: 'loan_shark',
    });
    expect(rollGenomeV2Offer(state, state.offerCount)?.candidates[0])
      .toBe('loan_shark');
  });

  it('binds every journal identity to seed and index, including after compaction', () => {
    let state = createGenomeV2State('PRIMAL', { runSeed: 'event-seed-000001' });
    const firstEventId = genomeV2EventId(state.runSeed, 1);
    for (let index = 0; index < 150; index += 1) {
      state = ordinary(state, `persistence-${index}`);
    }
    expect(state.compactedJournalEvents).toBeGreaterThan(0);
    expect(() => reduceGenomeV2Event(state, {
      type: 'portal_opened',
      portalId: 'forged',
      genomeOffer: null,
      index: state.eventIndex + 1,
      tick: state.tick + 1,
      eventId: firstEventId,
    })).toThrow('identity');
  });

  it('projects required geometry without letting non-primary spawns steal contracts', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'circuit_run', 0);
    for (let index = 0; index < 3; index += 1) state = ordinary(state, `projection-${index}`);
    expect(projectGenomeV2NextTarget(state, { cadenceEligible: true })).toMatchObject({
      kind: 'circuit_run',
      requiresSecondaryCell: true,
      requiresOptionalRouteCells: false,
    });
    const queuedBefore = state.targetQueue.length;
    state = spawn(state, 'decorative-future', {
      cadenceEligible: false,
    });
    expect(state.targetQueue).toHaveLength(queuedBefore);
    expect(projectGenomeV2NextTarget(state, { cadenceEligible: true }).kind)
      .toBe('circuit_run');
  });
});

describe('Genome v2 FTUE activation authority', () => {
  it.each(STRAIN_IDS)('%s ladders are visible but locked until Expressions/Apex', (strain) => {
    const locked = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { [strain]: 5 },
      ftue: deriveGenomeV2Ftue(0, 0),
    });
    expect(projectGenomeV2Ladders(locked)[strain]).toMatchObject({
      points: 5,
      activeTier: 0,
      tiers: [{ active: false }, { active: false }, { active: false }],
    });
    const expression = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { [strain]: 5 },
      ftue: deriveGenomeV2Ftue(2, 0),
    });
    expect(projectGenomeV2Ladders(expression)[strain].activeTier).toBe(4);
    const apex = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { [strain]: 5 },
      ftue: deriveGenomeV2Ftue(10, 0),
    });
    expect(projectGenomeV2Ladders(apex)[strain].activeTier).toBe(5);
  });

  it('publishes the Apex OR unlock with both progress tracks', () => {
    expect(deriveGenomeV2FtuePresentation(3, 2).capabilities.apex).toEqual({
      id: 'apex',
      unlocked: false,
      reason: 'banked_runs_or_mastery',
      progress: {
        bankedRuns: { current: 3, required: 10 },
        mastery: { current: 2, required: 3 },
      },
    });
    expect(deriveGenomeV2FtuePresentation(0, 3).capabilities.apex.unlocked).toBe(true);
    const presentation = deriveGenomeV2FtuePresentation(6, 2);
    expect(genomeV2FtueFromPresentation(presentation)).toEqual(
      deriveGenomeV2Ftue(6, 2)
    );
    expect(() => genomeV2FtueFromPresentation({
      ...presentation,
      capabilities: {
        ...presentation.capabilities,
        splices: { ...presentation.capabilities.splices, unlocked: false },
      },
    })).toThrow('disagrees');
  });

  it('rejects locked portal actions and locked Dynasty signatures', () => {
    const locked = createGenomeV2State('PRIMAL', {
      ftue: deriveGenomeV2Ftue(0, 0),
    });
    const portal = openPortal(locked, 'locked-door');
    expect(() => continuePortal(portal, 'locked-door')).toThrow('CONTINUE is locked');
    expect(() => apply(locked, {
      type: 'offer_opened',
      offerId: 'locked-signature',
      source: 'cadence',
      candidates: ['heartwood', 'gold_trail'],
    })).toThrow('signature is still locked');
  });
});

describe('Genome v2 ladder mechanics', () => {
  const apexFtue = deriveGenomeV2Ftue(10, 3);

  it('AURUM Mint, Dividend, and Treasury each change settlement', () => {
    let state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 5 },
      ftue: apexFtue,
    });
    state = acquire(state, 'live_wire', 0);
    state = ordinary(state, 'aurum-1');
    state = ordinary(state, 'aurum-2');
    state = spawn(state, 'aurum-route');
    state = resolve(state, 'aurum-route');
    expect(state.executionChain).toBe(1);
    expect(state.treasuryReserve).toBeGreaterThan(0);
    const bank = settleGenomeV2(state, 'bank');
    expect(bank.exclusiveTargetDelta).toBe(genomeV2Yield(2));
    expect(bank.continuousDelta).toBeGreaterThan(0);
    expect(bank.ladderDividendBonus).toBeGreaterThan(0);
    expect(bank.treasuryPaid).toBeGreaterThan(state.treasuryReserve);
    expect(settleGenomeV2(state, 'crash').treasuryForfeited).toBe(state.treasuryReserve);
  });

  it('VOLT Telemetry is projected, Relay boosts a later route, and Overclock is voluntary', () => {
    let state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { VOLT: 5 },
      ftue: apexFtue,
    });
    state = acquire(state, 'live_wire', 0);
    expect(projectGenomeV2Ladders(state).VOLT.tiers[0]).toMatchObject({
      name: 'Telemetry',
      active: true,
    });
    state = ordinary(state, 'volt-1');
    state = ordinary(state, 'volt-2');
    state = resolve(spawn(state, 'volt-route-1'), 'volt-route-1');
    expect(state.relayCharges).toBe(1);
    state = ordinary(state, 'volt-4');
    state = ordinary(state, 'volt-5');
    const beforeSecond = state.ledger.bankableYield;
    state = spawn(state, 'volt-route-2');
    expect(state.targets['volt-route-2'].relayBonusBps).toBe(5_000);
    state = resolve(state, 'volt-route-2');
    expect(state.ledger.bankableYield - beforeSecond).toBeGreaterThan(genomeV2Yield(3));
    state = apply(state, {
      type: 'overclock_started',
      activationId: 'volt-overclock',
      source: 'volt_apex',
    });
    expect(state.overclock).toMatchObject({
      expiresAtTick: state.tick + 12,
      multiplierBps: 15_000,
      speedMultiplierBps: 11_500,
    });
    const beforeOverclock = state.ledger.bankableYield;
    state = ordinary(state, 'volt-overclock-food');
    expect(state.ledger.bankableYield - beforeOverclock).toBe(15_000);
  });

  it('FERAL Mass and claimed territory scale with pressure and Apex', () => {
    let expression = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { FERAL: 4 },
      ftue: apexFtue,
    });
    expression = apply(expression, {
      type: 'territory_claimed',
      territoryId: 'feral-territory',
      cells: [
        { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 2 },
      ],
      recoveryExitCount: 1,
      source: 'feral_ladder',
    });
    expression = resolve(
      spawn(expression, 'feral-food', { cell: { x: 1, z: 1 } }),
      'feral-food',
      { pressureBps: 7_500 }
    );
    const expressionYield = expression.ledger.bankableYield;
    let apex = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { FERAL: 5 },
      ftue: apexFtue,
    });
    apex = apply(apex, {
      type: 'territory_claimed',
      territoryId: 'feral-apex-territory',
      cells: [
        { x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 2 },
      ],
      recoveryExitCount: 1,
      source: 'feral_ladder',
    });
    apex = resolve(
      spawn(apex, 'feral-apex-food', { cell: { x: 1, z: 1 } }),
      'feral-apex-food',
      { pressureBps: 7_500 }
    );
    expect(expressionYield).toBeGreaterThan(15_000);
    expect(apex.ledger.bankableYield).toBeGreaterThan(expressionYield);
  });

  it('FLUX Vector is projected and Riftcraft/Topology reward deliberate route geometry', () => {
    let state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { FLUX: 5 },
      ftue: apexFtue,
    });
    state = acquire(state, 'phase_gate', 0);
    expect(projectGenomeV2Ladders(state).FLUX.tiers[0]).toMatchObject({
      name: 'Vector',
      active: true,
    });
    for (let index = 0; index < 4; index += 1) state = ordinary(state, `flux-${index}`);
    state = spawn(state, 'flux-gate', {
      optionalRouteCells: [{ x: 3, z: 3 }, { x: 5, z: 5 }],
    });
    state = apply(state, {
      type: 'phase_gate_used',
      terrainId: 'flux-scar',
      targetId: 'flux-gate',
      cells: [{ x: 3, z: 3 }, { x: 5, z: 5 }],
    });
    const before = state.ledger.bankableYield;
    state = resolve(state, 'flux-gate', { usedOptionalRoute: true });
    expect(state.ledger.bankableYield - before).toBeGreaterThan(genomeV2Yield(3));
  });

  it('UMBRA exposes risk, Covenant shields crash risk, and Afterlife extends Phoenix', () => {
    let state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { UMBRA: 5 },
      ftue: apexFtue,
    });
    state = acquire(state, 'loan_shark', 0);
    state = acquire(state, 'phoenix', 1);
    state = continuePortal(openPortal(state, 'umbra-door'), 'umbra-door');
    for (let index = 0; index < 6; index += 1) state = ordinary(state, `umbra-${index}`);
    expect(state.covenantShield).toBeGreaterThan(0);
    expect(projectGenomeV2(state).liabilities.ashenStakeReserve).toBeGreaterThan(0);
    const phoenixId = state.secondLife!.phoenixInstanceId;
    state = apply(state, { type: 'phoenix_triggered', sourceInstanceId: phoenixId });
    expect(state.lastPhoenixEffect?.phaseTicks).toBe(
      GENOME_V2_CONFIG.phoenix.phaseTicks +
      GENOME_V2_CONFIG.ladders.umbraAfterlifeExtraPhaseTicks
    );
  });
});

describe('Genome v2 Splices', () => {
  it('keeps all eight recipes unique and structurally reachable', () => {
    expect(new Set(GENOME_V2_SPLICE_IDS).size).toBe(8);
    expect(new Set(
      GENOME_V2_SPLICE_IDS.map((id) => [...GENOME_V2_SPLICES[id].parents].sort().join('|'))
    ).size).toBe(8);
  });

  it('Dragon Hoard moves a successful Gilded premium into a BANK-only Crown Bond', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    state = acquire(state, 'compound_interest', 1);
    expect(state.activeSplices).toContain('splice_dragon_hoard');
    for (let index = 0; index < 4; index += 1) state = ordinary(state, `dragon-${index}`);
    state = resolve(spawn(state, 'dragon-gold'), 'dragon-gold');
    expect(state.crownBondReserve).toBe(genomeV2Yield(2));
    expect(settleGenomeV2(state, 'bank').crownBondPaid).toBe(genomeV2Yield(3));
    expect(settleGenomeV2(state, 'crash').crownBondForfeited).toBe(genomeV2Yield(2));
  });

  it('Gilded Fork makes a no-timer exclusive greed/body choice', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'gold_trail', 0);
    state = acquire(state, 'overgrowth', 1);
    for (let index = 0; index < 4; index += 1) state = ordinary(state, `fork-${index}`);
    state = spawn(state, 'fork-choice');
    expect(state.targets['fork-choice']).toMatchObject({
      kind: 'gold_trail',
      moveBudget: null,
      expiresAtTick: null,
    });
    state = apply(state, {
      type: 'gilded_fork_chosen',
      targetId: 'fork-choice',
      choice: 'gilded',
    });
    const before = state;
    state = resolve(state, 'fork-choice');
    expect(genomeV2BodyGrowthDelta(before, state)).toBe(2);
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(8));
  });

  it('Styx Contract consumes visible Mirror Stake when Phoenix fires', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'mirror_wager', 0);
    state = acquire(state, 'phoenix', 1);
    state = continuePortal(openPortal(state, 'styx-door'), 'styx-door', true);
    state = ordinary(state, 'styx-food');
    expect(state.ledger.mirrorStake).toBeGreaterThan(0);
    const stake = state.ledger.mirrorStake;
    const phoenixId = state.secondLife!.phoenixInstanceId;
    state = apply(state, { type: 'phoenix_triggered', sourceInstanceId: phoenixId });
    expect(state.ledger.mirrorStake).toBe(0);
    expect(state.lastPhoenixEffect?.consumedMirrorStake).toBe(stake);
  });

  it('Perfect Circuit requires two visible legs and pays ×5 only on a full clear', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'live_wire', 0);
    state = acquire(state, 'circuit_run', 1);
    state = ordinary(state, 'circuit-1');
    state = ordinary(state, 'circuit-2');
    state = spawn(state, 'perfect-circuit', {
      secondaryCell: { x: 4, z: 4 },
    });
    expect(state.targets['perfect-circuit'].circuitLegsRequired).toBe(2);
    state = resolve(state, 'perfect-circuit', {
      circuitLegsCompleted: 2,
      collectedUnits: 1,
    });
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(7));
  });

  it('Worldcoil keeps sealed terrain permanent and raises the charged target ceiling', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'coilkeeper', 0);
    state = acquire(state, 'overgrowth', 1);
    for (let index = 0; index < 8; index += 1) state = ordinary(state, `worldcoil-${index}`);
    const cells = Array.from({ length: 8 }, (_, index) => ({ x: index, z: 2 }));
    state = apply(state, { type: 'coil_sealed', terrainId: 'worldcoil-seal', cells });
    expect(state.permanentTerrain[0]).toMatchObject({ permanent: true, cells });
    const before = state.ledger.bankableYield;
    state = resolve(spawn(state, 'worldcoil-target'), 'worldcoil-target');
    expect(state.ledger.bankableYield - before).toBeGreaterThan(genomeV2Yield(7));
  });

  it('Riftline spends Wall Rush and turns its exact optional route into permanent Scars', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'wall_rush', 0, 'wall');
    state = acquire(state, 'phase_gate', 1, 'phase');
    expect(state.wallRushCharges).toBe(1);
    state = apply(state, { type: 'wall_redirected', sourceInstanceId: 'wall' });
    const route = [{ x: 7, z: 7 }, { x: 2, z: 5 }] as const;
    state = spawn(state, 'riftline-target', { optionalRouteCells: route });
    state = apply(state, {
      type: 'phase_gate_used',
      terrainId: 'riftline-scar',
      targetId: 'riftline-target',
      cells: route,
    });
    state = resolve(state, 'riftline-target', { usedOptionalRoute: true });
    expect(state.permanentTerrain.at(-1)).toMatchObject({
      source: 'phase_gate_scar',
      cells: route,
    });
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(4));
  });

  it('Loom Bond offers one plain and two atomic pin consequences, then matures on take', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'compound_interest', 0);
    state = acquire(state, 'loom_anchor', 1);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'loom-bond-offer',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
    });
    expect(projectGenomeV2(state).decline.options.map((option) => option.id)).toEqual([
      'decline', 'pin:loan_shark', 'pin:live_wire',
    ]);
    state = apply(state, {
      type: 'offer_declined',
      offerId: 'loom-bond-offer',
      pinGeneId: 'loan_shark',
    });
    expect(state.loomBond).toEqual({ pinnedGeneId: 'loan_shark', matured: false });
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'loom-bond-return',
      source: 'cadence',
      candidates: ['loan_shark', 'live_wire'],
      pinnedGeneId: 'loan_shark',
    });
    const declinedReturn = apply(state, {
      type: 'offer_declined',
      offerId: 'loom-bond-return',
    });
    expect(declinedReturn).toMatchObject({ bonds: 0, loomBond: null });
    state = apply(state, {
      type: 'gene_acquired',
      offerId: 'loom-bond-return',
      instanceId: 'loan-returned',
      geneId: 'loan_shark',
      slot: 1,
      source: 'offer',
    });
    expect(state.loomBond?.matured).toBe(true);
  });

  it('Ashen Stake defers completed Loan Yield and can fund Phoenix', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'loan_shark', 0);
    state = acquire(state, 'phoenix', 1);
    state = continuePortal(openPortal(state, 'ashen-door'), 'ashen-door');
    for (let index = 0; index < 6; index += 1) state = ordinary(state, `ashen-${index}`);
    expect(state.ledger.bankableYield).toBe(0);
    expect(state.ashenStakeReserve).toBe(genomeV2Yield(12));
    const phoenixId = state.secondLife!.phoenixInstanceId;
    state = apply(state, { type: 'phoenix_triggered', sourceInstanceId: phoenixId });
    expect(state.lastPhoenixEffect?.consumedAshenStake).toBe(genomeV2Yield(12));
    expect(state.ashenStakeReserve).toBe(0);
  });
});

describe('Genome v2 Dynasty signatures', () => {
  it('Heartwood rewards clean PRIMAL territory and scales a large claim', () => {
    let state = acquire(createGenomeV2State('PRIMAL'), 'heartwood', 0);
    const cells = Array.from({ length: 10 }, (_, index) => ({ x: index, z: 4 }));
    state = apply(state, {
      type: 'territory_claimed',
      territoryId: 'heartwood-territory',
      cells,
      recoveryExitCount: 1,
      source: 'heartwood',
    });
    state = resolve(
      spawn(state, 'heartwood-food', { cell: cells[0] }),
      'heartwood-food'
    );
    expect(state.ledger.bankableYield).toBe(35_000);
  });

  it('Zenith Protocol activates only by player event and pays its bounded CYBER window', () => {
    let state = acquire(createGenomeV2State('CYBER'), 'zenith_protocol', 0);
    expect(state.overclock).toBeNull();
    state = apply(state, {
      type: 'overclock_started',
      activationId: 'zenith-window',
      source: 'zenith_protocol',
    });
    expect(state.overclock).toMatchObject({
      expiresAtTick: state.tick + 14,
      multiplierBps: 17_500,
      speedMultiplierBps: 12_000,
    });
    state = ordinary(state, 'zenith-food');
    expect(state.ledger.bankableYield).toBe(17_500);
    state = apply(state, {
      type: 'overclock_ended',
      activationId: 'zenith-window',
    });
    expect(state.overclock).toBeNull();
  });

  it('Constellation Crown keeps future stars non-edible and pays a perfect clear', () => {
    let state = acquire(createGenomeV2State('COSMIC'), 'constellation_crown', 0);
    state = spawn(state, 'star-a', { cell: { x: 1, z: 1 }, crownRole: 'current' });
    state = spawn(state, 'star-b', { cell: { x: 2, z: 2 }, crownRole: 'current' });
    state = spawn(state, 'star-future', { cell: { x: 3, z: 3 }, crownRole: 'future' });
    expect(state.targets['star-future']).toMatchObject({ edible: false, collidable: false });
    expect(() => resolve(state, 'star-future')).toThrow('future Crown objects');
    state = apply(state, {
      type: 'crown_wave_opened',
      waveId: 'constellation-1',
      currentTargetIds: ['star-a', 'star-b'],
      futureCells: [{ x: 3, z: 3 }],
    });
    state = resolve(state, 'star-a');
    state = resolve(state, 'star-b');
    state = apply(state, {
      type: 'crown_wave_closed',
      waveId: 'constellation-1',
      outcome: 'perfect',
    });
    expect(state.ledger.bankableYield).toBe(genomeV2Yield(8));
  });

  it('closes a failed Crown wave so later waves remain available', () => {
    let state = acquire(createGenomeV2State('COSMIC'), 'constellation_crown', 0);
    state = spawn(state, 'failed-star-a', { crownRole: 'current' });
    state = spawn(state, 'failed-star-b', {
      cell: { x: 2, z: 2 },
      crownRole: 'current',
    });
    state = apply(state, {
      type: 'crown_wave_opened',
      waveId: 'failed-wave',
      currentTargetIds: ['failed-star-a', 'failed-star-b'],
      futureCells: [],
    });
    state = resolve(state, 'failed-star-a', { resolution: 'missed' });
    state = apply(state, {
      type: 'crown_wave_closed',
      waveId: 'failed-wave',
      outcome: 'failed',
    });
    expect(state.crownWave).toBeNull();
    expect(state.targets['failed-star-b']).toMatchObject({
      lifecycle: 'expired',
      edible: false,
      collidable: false,
    });
  });
});

describe('Genome v2 Recode and persistence', () => {
  it('projects one deterministic Splice when a THREAD candidate has two held partners', () => {
    let state = createGenomeV2State('PRIMAL');
    state = acquire(state, 'compound_interest', 0, 'compound-first');
    state = acquire(state, 'overgrowth', 1, 'overgrowth-second');

    const candidate = projectGenomeV2(state, ['gold_trail']).candidates[0];
    expect(candidate.completesSplice).toBe('splice_dragon_hoard');
    expect(candidate.splicePaths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spliceId: 'splice_dragon_hoard',
        state: 'completes_now',
      }),
      expect.objectContaining({
        spliceId: 'splice_gilded_fork',
        state: 'closed_by_completion',
      }),
    ]));
    expect(candidate.resultingActiveSplices).toEqual([
      'splice_dragon_hoard',
    ]);
    expect(candidate.resultingSlots?.[0]).toEqual({
      index: 0,
      occupant: {
        kind: 'splice',
        spliceId: 'splice_dragon_hoard',
        parentGeneIds: ['compound_interest', 'gold_trail'],
      },
    });
    expect(candidate.resultingSlots?.[1]).toEqual({
      index: 1,
      occupant: { kind: 'gene', geneId: 'overgrowth' },
    });

    state = acquire(state, 'gold_trail', 2, 'gold-threaded');
    expect(state.activeSplices).toEqual(['splice_dragon_hoard']);
    expect(state.instances['overgrowth-second'].status).toBe('active');
  });

  it('defers multi-recipe truth to the chosen Recode locus when the Loom is full', () => {
    let state = createGenomeV2State('PRIMAL');
    const genes: GenomeV2ActiveGeneId[] = [
      'compound_interest',
      'overgrowth',
      'loan_shark',
      'live_wire',
      'wall_rush',
      'mirror_wager',
    ];
    genes.forEach((geneId, index) => {
      state = acquire(state, geneId, index as 0 | 1 | 2 | 3 | 4 | 5);
    });

    const candidate = projectGenomeV2(state, ['gold_trail']).candidates[0];
    expect(candidate.requiresReplacement).toBe(true);
    expect(candidate.completesSplice).toBeNull();
    expect(candidate.splicePaths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        spliceId: 'splice_dragon_hoard',
        state: 'depends_on_recode',
      }),
      expect.objectContaining({
        spliceId: 'splice_gilded_fork',
        state: 'depends_on_recode',
      }),
    ]));
    expect(candidate.replacementOptions.find((option) => option.slot === 0))
      .toMatchObject({ createsSplice: 'splice_gilded_fork' });
    expect(candidate.replacementOptions.find((option) => option.slot === 1))
      .toMatchObject({ createsSplice: 'splice_dragon_hoard' });
    expect(candidate.replacementOptions.find((option) => option.slot === 2))
      .toMatchObject({ createsSplice: 'splice_dragon_hoard' });
  });

  it('supports generic full-Loom Recode at +8/+10 without spending portal actions', () => {
    let state = createGenomeV2State('PRIMAL');
    const genes: GenomeV2ActiveGeneId[] = [
      'gold_trail', 'loan_shark', 'live_wire', 'time_dilation', 'wall_rush', 'mirror_wager',
    ];
    genes.forEach((geneId, index) => {
      state = acquire(state, geneId, index as 0 | 1 | 2 | 3 | 4 | 5);
    });
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'loom-recode-one',
      source: 'cadence',
      candidates: ['coilkeeper', 'overgrowth'],
    });
    const first = previewGenomeV2Recode(state, {
      source: 'loom',
      offerId: 'loom-recode-one',
      replacementGeneId: 'coilkeeper',
      slot: 0,
    });
    expect(first.growthCharged).toBe(8);
    expect(first.consequence.resultingSlots[0]).toEqual({
      index: 0,
      occupant: { kind: 'gene', geneId: 'coilkeeper' },
    });
    expect(first.consequence.resultingActiveSplices).toEqual([]);
    state = apply(state, {
      type: 'offer_recoded',
      source: 'loom',
      offerId: 'loom-recode-one',
      instanceId: 'coilkeeper-recode',
      replacementGeneId: 'coilkeeper',
      slot: 0,
      growthCharged: 8,
    });
    expect(state.portalGenomeActions).toBe(0);
    expect(state.recodeCount).toBe(1);
    expect(state.bodyGrowthAdded).toBe(8);
    state = apply(state, {
      type: 'offer_opened',
      offerId: 'loom-recode-two',
      source: 'cadence',
      candidates: ['overgrowth', 'circuit_run'],
    });
    expect(previewGenomeV2Recode(state, {
      source: 'loom',
      offerId: 'loom-recode-two',
      replacementGeneId: 'overgrowth',
      slot: 1,
    }).growthCharged).toBe(10);
  });

  it.each([100, 500, 1_000])('stays inside its checkpoint envelope after %i foods', (count) => {
    let state = createGenomeV2State('PRIMAL', { runSeed: `persistence-seed-${count}` });
    for (let index = 0; index < count; index += 1) {
      state = ordinary(state, `long-${count}-${index}`);
    }
    assertGenomeV2PersistenceBound(state);
    expect(genomeV2SerializedBytes(state)).toBeLessThanOrEqual(
      GENOME_V2_CONFIG.persistence.maximumSerializedBytes
    );
    expect(state.journal.length).toBeLessThanOrEqual(
      GENOME_V2_CONFIG.persistence.retainedJournalEvents
    );
    expect(Object.keys(state.targets)).toHaveLength(
      Math.min(count, GENOME_V2_CONFIG.persistence.retainedResolvedTargets)
    );
    expect(genomeV2RunRecord(state, settleGenomeV2(state, 'bank')).runSeed)
      .toBe(`persistence-seed-${count}`);
  });
});

describe('Genome v2 World Condition buildcraft', () => {
  it('freezes offer tilt, suppression, and shifted ladder thresholds', () => {
    const shifted = createGenomeV2State('PRIMAL', {
      offerTiltStrain: 'AURUM',
      startingStrainPoints: { AURUM: 3 },
      strainThresholdDelta: { AURUM: 1 },
    });
    expect(projectGenomeV2Ladders(shifted).AURUM.activeTier).toBe(0);

    const reached = createGenomeV2State('PRIMAL', {
      offerTiltStrain: 'AURUM',
      startingStrainPoints: { AURUM: 4 },
      strainThresholdDelta: { AURUM: 1 },
    });
    expect(projectGenomeV2Ladders(reached).AURUM.activeTier).toBe(3);

    const suppressed = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 8 },
      suppressedStrains: ['AURUM'],
    });
    expect(projectGenomeV2Ladders(suppressed).AURUM.activeTier).toBe(0);

    const conditionWeight = Array.from({ length: 20 }, (_, offerIndex) =>
      rollGenomeV2Offer(reached, offerIndex)
    )
      .flatMap((offer) => offer?.weights ?? [])
      .find((weight) => weight.condition > 0);
    expect(conditionWeight).toMatchObject({ condition: 100 });
  });
});
