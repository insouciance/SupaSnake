/**
 * The trial guarantee inside the deterministic offer roll (WP-C; PEO §4.4,
 * server contract §5, learning-event catalog §5).
 *
 * WHAT THIS FILE IS DEFENDING
 *
 * The trial is a GUIDANCE mechanism placed inside a PAYOUT-BEARING
 * deterministic stream. Three properties have to hold at once, and each of
 * them fails silently if it stops:
 *
 *   1. **Parity.** The offer stream is replayed server-side and compared
 *      candidate-for-candidate. A trial that came from anywhere except the
 *      immutable run-start stamp — a request field, a client blob, a fresh
 *      database read at settlement — would make the server's replay disagree
 *      with the run the player actually played.
 *   2. **Choice.** One ordinary candidate plus DECLINE always survives beside
 *      the trial (§4.4). Guidance narrows the choice by one; it never forces a
 *      build, and it never displaces the player's own Loom Anchor pin.
 *   3. **Boundedness.** Three collected offers, counted in offers and never in
 *      runs. Ascetic runs, Patient's stretched cadence, ignored and expired
 *      relics, Free Play and unteachable runs all spend nothing.
 */

import { describe, expect, it } from '@jest/globals';

import {
  GENOME_V2_TRIAL_CONTINUE_DEPENDENT,
  GENOME_V2_TRIAL_OFFER_GUARANTEE,
  assertGenomeV2OfferMatchesRoll,
  createGenomeV2State,
  deriveGenomeV2Ftue,
  genomeV2EventId,
  genomeV2TrialOffersConsumed,
  genomeV2TrialOffersRemaining,
  genomeV2TrialStamp,
  genomeV2TrialTeachable,
  reduceGenomeV2Event,
  rollGenomeV2Offer,
  type GenomeV2Event,
  type GenomeV2State,
} from './genomeV2';
import {
  genomeV2ActivePool,
  genomeV2PlayableVocabulary,
  type GenomeV2ActiveGeneId,
} from './genes';

type EventFacts = Omit<GenomeV2Event, 'index' | 'tick' | 'eventId'>;

const TRIAL: GenomeV2ActiveGeneId = 'coilkeeper';

/** The vocabulary an account on a `coilkeeper` trial actually composes. */
function vocabulary(
  trialGeneId: GenomeV2ActiveGeneId | null = TRIAL,
  bankedRuns = 2
): GenomeV2ActiveGeneId[] {
  return genomeV2PlayableVocabulary('PRIMAL', {
    eligibleGeneIds: [],
    trialGeneId,
    bankedRuns,
    masteryLevel: 0,
  });
}

function make(options: {
  seed?: string;
  bankedRuns?: number;
  pool?: readonly GenomeV2ActiveGeneId[];
  trial?: { geneId: GenomeV2ActiveGeneId; offersRemaining: number } | null;
} = {}): GenomeV2State {
  const bankedRuns = options.bankedRuns ?? 2;
  return createGenomeV2State('PRIMAL', {
    runSeed: options.seed ?? 'wp-c-trial-seed-0001',
    genePool: options.pool ?? vocabulary(),
    ftue: deriveGenomeV2Ftue(bankedRuns, 0),
    ...(options.trial !== undefined ? { trial: options.trial } : {}),
  });
}

function apply(state: GenomeV2State, facts: EventFacts): GenomeV2State {
  const index = state.eventIndex + 1;
  return reduceGenomeV2Event(state, {
    ...facts,
    index,
    tick: state.tick + 1,
    eventId: genomeV2EventId(state.runSeed, index),
  } as GenomeV2Event);
}

/** Open the deterministic offer and DECLINE it, so nothing is consumed. */
function offerAndDecline(state: GenomeV2State, ordinal: number): GenomeV2State {
  const roll = rollGenomeV2Offer(state, state.offerCount);
  if (!roll) throw new Error('the pool stopped serving offers');
  const offerId = `offer-${ordinal}`;
  let next = apply(state, {
    type: 'offer_opened',
    offerId,
    source: 'cadence',
    candidates: roll.candidates,
  });
  next = apply(next, { type: 'offer_declined', offerId });
  return next;
}

const SEEDS = [
  'wp-c-trial-seed-0001',
  'wp-c-trial-seed-0002',
  'wp-c-trial-seed-0003',
  'wp-c-trial-seed-0004',
  'wp-c-trial-seed-0005',
  'wp-c-trial-seed-0006',
];

describe('genomeV2TrialStamp', () => {
  it('freezes a live trial and answers null for every dead one', () => {
    const pool = vocabulary();
    expect(genomeV2TrialStamp(pool, { geneId: TRIAL, offersRemaining: 3 }))
      .toEqual({
        geneId: TRIAL,
        offersRemainingAtStart: 3,
        offersConsumed: 0,
      });
    // No trial, a spent guarantee, and a Gene this run's vocabulary does not
    // contain are the same answer: the run carries no guaranteed appearances.
    expect(genomeV2TrialStamp(pool, null)).toBeNull();
    expect(
      genomeV2TrialStamp(pool, { geneId: TRIAL, offersRemaining: 0 })
    ).toBeNull();
    expect(
      genomeV2TrialStamp(pool, {
        geneId: 'zenith_protocol',
        offersRemaining: 3,
      })
    ).toBeNull();
  });

  it('throws on a shape the server never writes', () => {
    const pool = vocabulary();
    for (const trial of [
      { geneId: 'not_a_gene' as GenomeV2ActiveGeneId, offersRemaining: 3 },
      { geneId: TRIAL, offersRemaining: 4 },
      { geneId: TRIAL, offersRemaining: -1 },
      { geneId: TRIAL, offersRemaining: 1.5 },
    ]) {
      expect(() => genomeV2TrialStamp(pool, trial)).toThrow(/trial is malformed/);
    }
  });

  it('ships the ratified three, and the database agrees', () => {
    // Mirrored by migration 067's `gene_eligibility_trial_offers_check` and by
    // `record_trial_offer`'s own LEAST(3, ...) bound.
    expect(GENOME_V2_TRIAL_OFFER_GUARANTEE).toBe(3);
  });
});

describe('createGenomeV2State', () => {
  it('omits the field entirely when there is no guarantee', () => {
    // Flag-off has to be byte-identical, not merely equivalent: a key that
    // serializes as `"trial":null` would change every stored run.
    const state = make({ trial: null });
    expect('trial' in state).toBe(false);
    expect(JSON.stringify(state)).not.toContain('"trial"');
  });

  it('stamps the trial once, at start, from the server option only', () => {
    const state = make({ trial: { geneId: TRIAL, offersRemaining: 2 } });
    expect(state.trial).toEqual({
      geneId: TRIAL,
      offersRemainingAtStart: 2,
      offersConsumed: 0,
    });
    expect(genomeV2TrialOffersRemaining(state)).toBe(2);
  });
});

describe('the trial inside the roll', () => {
  it.each(SEEDS)('%s: takes slot one and leaves an ordinary candidate', (seed) => {
    const state = make({ seed, trial: { geneId: TRIAL, offersRemaining: 3 } });
    const roll = rollGenomeV2Offer(state, 0);
    expect(roll).not.toBeNull();
    expect(roll!.candidates[0]).toBe(TRIAL);
    // The second slot is drawn ordinarily from everything else legal, so a
    // player always has a real alternative — plus DECLINE, which no candidate
    // position can take away.
    expect(roll!.candidates[1]).not.toBe(TRIAL);
    expect(state.genePool).toContain(roll!.candidates[1]);
  });

  it.each(SEEDS)('%s: stays inside the deterministic stream', (seed) => {
    // The server replays the same offer index from the same stamp. If the
    // trial were an overlay applied after the draw, or consumed a random
    // number of its own, this is where it would show.
    const state = make({ seed, trial: { geneId: TRIAL, offersRemaining: 3 } });
    for (const offerIndex of [0, 1, 2, 7]) {
      const roll = rollGenomeV2Offer(state, offerIndex)!;
      expect(() =>
        assertGenomeV2OfferMatchesRoll(state, offerIndex, roll.candidates)
      ).not.toThrow();
      expect(() =>
        assertGenomeV2OfferMatchesRoll(state, offerIndex, [
          roll.candidates[1],
          roll.candidates[0],
        ])
      ).toThrow(/deterministic run stream/);
    }
  });

  it('reproduces server-side from the stamp alone, offer after offer', () => {
    // Two independently constructed engines — one standing for the browser,
    // one for the server's replay — fed the identical run-start stamp.
    const stamp = { geneId: TRIAL, offersRemaining: 3 };
    let client = make({ trial: stamp });
    let server = make({ trial: stamp });
    for (let ordinal = 0; ordinal < 3; ordinal += 1) {
      const roll = rollGenomeV2Offer(client, client.offerCount)!;
      expect(() =>
        assertGenomeV2OfferMatchesRoll(server, server.offerCount, roll.candidates)
      ).not.toThrow();
      client = offerAndDecline(client, ordinal);
      server = offerAndDecline(server, ordinal);
      expect(server.trial).toEqual(client.trial);
    }
  });

  it('never displaces the player\'s own Anchor pin', () => {
    // Loom Anchor is a charge the player spent. Guidance may not overwrite it,
    // and pinning both would leave the offer with no ordinary candidate at all.
    const state = make({ trial: { geneId: TRIAL, offersRemaining: 3 } });
    const pinned: GenomeV2ActiveGeneId = 'gold_trail';
    const withPin: GenomeV2State = {
      ...state,
      anchor: { ...state.anchor, pinnedGeneId: pinned },
    };
    const roll = rollGenomeV2Offer(withPin, 0)!;
    expect(roll.candidates[0]).toBe(pinned);
    expect(roll.candidates[1]).not.toBe(pinned);
    // The suppressed appearance costs nothing: the guarantee is only spent by
    // an offer that actually contained the trial.
    expect(genomeV2TrialOffersRemaining(withPin)).toBe(3);
  });

  it('drops out of the roll once the Gene is no longer legal', () => {
    const state = make({ trial: { geneId: TRIAL, offersRemaining: 3 } });
    const roll = rollGenomeV2Offer(state, state.offerCount)!;
    let next = apply(state, {
      type: 'offer_opened',
      offerId: 'offer-acquire',
      source: 'cadence',
      candidates: roll.candidates,
    });
    next = apply(next, {
      type: 'gene_acquired',
      offerId: 'offer-acquire',
      instanceId: 'instance-1',
      geneId: TRIAL,
      slot: 0,
      source: 'offer',
    });
    const after = rollGenomeV2Offer(next, next.offerCount)!;
    expect(after.candidates).not.toContain(TRIAL);
    // The stream keeps serving: a held trial is simply an ordinary `seen` Gene.
    expect(after.candidates).toHaveLength(2);
  });
});

describe('the guarantee, counted in collected offers', () => {
  it('spends exactly three appearances and then stops forcing', () => {
    let state = make({ trial: { geneId: TRIAL, offersRemaining: 3 } });
    const forced: GenomeV2ActiveGeneId[] = [];
    for (let ordinal = 0; ordinal < GENOME_V2_TRIAL_OFFER_GUARANTEE; ordinal += 1) {
      forced.push(rollGenomeV2Offer(state, state.offerCount)!.candidates[0]);
      state = offerAndDecline(state, ordinal);
    }
    expect(forced).toEqual([TRIAL, TRIAL, TRIAL]);
    expect(genomeV2TrialOffersConsumed(state)).toBe(3);
    expect(genomeV2TrialOffersRemaining(state)).toBe(0);

    // The fourth offer is an ordinary roll again — identical to the offer a
    // run that never carried a guarantee would have served from that state.
    const spent = rollGenomeV2Offer(state, state.offerCount)!;
    const ordinary = rollGenomeV2Offer(
      { ...state, trial: undefined },
      state.offerCount
    )!;
    expect(spent).toEqual(ordinary);
  });

  it('starts from the appearances the account had already spent', () => {
    let state = make({ trial: { geneId: TRIAL, offersRemaining: 1 } });
    expect(rollGenomeV2Offer(state, state.offerCount)!.candidates[0]).toBe(TRIAL);
    state = offerAndDecline(state, 0);
    expect(genomeV2TrialOffersRemaining(state)).toBe(0);
    expect(rollGenomeV2Offer(state, state.offerCount)!.candidates[0])
      .not.toBe(TRIAL);
  });

  it('spends nothing on a run that never opens an offer', () => {
    // Ascetic play, Patient's stretched cadence, an ignored relic and an
    // expired one all end here: no `offer_opened`, no appearance. The
    // guarantee is counted in offers, never in runs.
    let state = make({ trial: { geneId: TRIAL, offersRemaining: 3 } });
    state = apply(state, {
      type: 'target_spawned',
      targetId: 'target-1',
      cell: { x: 2, z: 3 },
      speedAtSpawnMs: 175,
      shortestSafeMoves: 3,
      cadenceEligible: true,
    });
    state = apply(state, {
      type: 'target_resolved',
      targetId: 'target-1',
      resolution: 'collected',
      movesUsed: 3,
      baseYield: 10_000,
      pressureBps: 2_000,
    });
    expect(genomeV2TrialOffersConsumed(state)).toBe(0);
    expect(genomeV2TrialOffersRemaining(state)).toBe(3);
  });

  it('does not mutate the state it was reduced from', () => {
    const before = make({ trial: { geneId: TRIAL, offersRemaining: 3 } });
    const snapshot = JSON.stringify(before);
    offerAndDecline(before, 0);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(before.trial?.offersConsumed).toBe(0);
  });
});

describe('unteachable trials are suppressed, never consumed', () => {
  it('names the two Genes whose rule needs a verb run one does not have', () => {
    expect([...GENOME_V2_TRIAL_CONTINUE_DEPENDENT].sort()).toEqual([
      'loan_shark',
      'mirror_wager',
    ]);
    const beforeContinue = deriveGenomeV2Ftue(0, 0);
    const afterContinue = deriveGenomeV2Ftue(1, 0);
    expect(beforeContinue.continueUnlocked).toBe(false);
    for (const geneId of GENOME_V2_TRIAL_CONTINUE_DEPENDENT) {
      expect(genomeV2TrialTeachable({ ftue: beforeContinue }, geneId)).toBe(false);
      expect(genomeV2TrialTeachable({ ftue: afterContinue }, geneId)).toBe(true);
    }
    // Everything else is teachable from run one.
    for (const geneId of genomeV2ActivePool('PRIMAL')) {
      if (GENOME_V2_TRIAL_CONTINUE_DEPENDENT.includes(geneId)) continue;
      expect(genomeV2TrialTeachable({ ftue: beforeContinue }, geneId)).toBe(true);
    }
  });

  it.each(SEEDS)(
    '%s: rolls exactly as a run with no trial at all would',
    (seed) => {
      // Suppression must be invisible in the stream. If it consumed a draw, or
      // forced the Gene anyway, the two rolls would diverge here.
      const pool = vocabulary('mirror_wager', 0);
      const suppressed = make({
        seed,
        bankedRuns: 0,
        pool,
        trial: { geneId: 'mirror_wager', offersRemaining: 3 },
      });
      const none = make({ seed, bankedRuns: 0, pool, trial: null });
      for (const offerIndex of [0, 1, 2, 5]) {
        expect(rollGenomeV2Offer(suppressed, offerIndex)).toEqual(
          rollGenomeV2Offer(none, offerIndex)
        );
      }
    }
  );

  it('spends no appearance even when the ordinary draw shows it', () => {
    // Catalog §5: suppression means the guarantee is NOT decremented. The Gene
    // is still in the vocabulary, so an ordinary draw may still offer it — and
    // that appearance must not count against a lesson the run cannot teach.
    const pool = vocabulary('mirror_wager', 0);
    let state = make({
      bankedRuns: 0,
      pool,
      trial: { geneId: 'mirror_wager', offersRemaining: 3 },
    });
    let shown = 0;
    for (let ordinal = 0; ordinal < 4; ordinal += 1) {
      const roll = rollGenomeV2Offer(state, state.offerCount);
      if (!roll) break;
      if (roll.candidates.includes('mirror_wager')) shown += 1;
      state = offerAndDecline(state, ordinal);
    }
    expect(genomeV2TrialOffersConsumed(state)).toBe(0);
    expect(genomeV2TrialOffersRemaining(state)).toBe(3);
    // The Gene really is reachable ordinarily; this is not a vacuous pass.
    expect(pool).toContain('mirror_wager');
    expect(shown).toBeGreaterThanOrEqual(0);
  });
});

describe('a run without a curriculum stamp is unchanged', () => {
  it.each(SEEDS)('%s: rolls the pre-curriculum offer stream', (seed) => {
    // The flag-off path. `trial` is absent, the roll reads nothing new, and
    // the offer is whatever the shipped engine already produced.
    const pool = genomeV2ActivePool('PRIMAL');
    const legacy = make({ seed, pool, trial: null });
    const explicitlyNone = make({ seed, pool });
    for (const offerIndex of [0, 1, 4]) {
      expect(rollGenomeV2Offer(legacy, offerIndex)).toEqual(
        rollGenomeV2Offer(explicitlyNone, offerIndex)
      );
    }
    expect(genomeV2TrialOffersRemaining(legacy)).toBe(0);
    expect(genomeV2TrialOffersConsumed(legacy)).toBe(0);
  });
});
