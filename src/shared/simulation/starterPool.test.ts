/**
 * Pins the evidence in `docs/game/PLAYER_EVOLUTION_STARTER_POOL_SIMULATION.md`.
 *
 * These are not harness self-tests. Each assertion is a claim the results
 * document makes to the owner, expressed against the shipped offer engine, so
 * that a later change to weighting, legality, cadence, or the roster fails here
 * instead of quietly invalidating a ratified decision.
 */

import {
  genomeV2ActivePool,
  genomeV2PlayableVocabulary,
  type GenomeV2ActiveGeneId,
  type GenomeV2Dynasty,
} from '@/shared/game/genes';
import {
  GENOME_V2_CONFIG,
  GENOME_V2_TRIAL_OFFER_GUARANTEE,
  assertGenomeV2OfferMatchesRoll,
  createGenomeV2State,
  rollGenomeV2Offer,
} from '@/shared/game/genomeV2';
import {
  GENE_OFFER_CADENCE,
  rollGeneOfferInterval,
} from '@/shared/game/geneCadence';
import type { DynastyName } from '@/shared/game/rulesets';
import {
  COHORTS,
  CURRICULUM_ORDER,
  GENOME_LOCI,
  RECOMMENDED_STARTER_POOL_KEY,
  STARTER_POOL_CANDIDATES,
  compareToFullRoster,
  eligibilityPrefixes,
  measurePool,
  measurePrefixes,
  measureTrial,
  measureStrainReachability,
  offerCliff,
  reachableSplices,
  scoreStarterPool,
  simulationSeeds,
  traverseOffers,
  worstPrefixAcrossOrders,
} from '@/shared/simulation/starterPool';

const DYNASTIES: readonly DynastyName[] = ['CYBER', 'PRIMAL', 'COSMIC'];
const SEEDS = simulationSeeds(32);
const PREFIX_SEEDS = simulationSeeds(8);

const cohort = (id: string): (typeof COHORTS)[number] => {
  const found = COHORTS.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown cohort ${id}`);
  return found;
};

const recommended = (dynasty: DynastyName): readonly string[] =>
  STARTER_POOL_CANDIDATES[dynasty][RECOMMENDED_STARTER_POOL_KEY[dynasty]];

describe('harness fidelity', () => {
  it('drives the real deterministic offer stream, not a copy of it', () => {
    const dynasty: DynastyName = 'PRIMAL';
    const state = createGenomeV2State(dynasty, {
      runSeed: 'player-evolution-sim-0000',
      genePool: genomeV2ActivePool(dynasty),
    });
    const roll = rollGenomeV2Offer(state, 0);
    expect(roll).not.toBeNull();
    // The server's own parity guard accepts what the harness observes.
    expect(() =>
      assertGenomeV2OfferMatchesRoll(state, 0, roll!.candidates)
    ).not.toThrow();
  });

  it('is deterministic: the same seed and policy replay identically', () => {
    const pool = STARTER_POOL_CANDIDATES.CYBER['cyber-7'];
    const first = traverseOffers('CYBER', pool, cohort('bank2'), 'first', SEEDS[3]);
    const again = traverseOffers('CYBER', pool, cohort('bank2'), 'first', SEEDS[3]);
    expect(again).toEqual(first);
  });
});

describe('offer-exhaustion cliff', () => {
  it('needs seven legal entries to fill six loci, and six can never do it', () => {
    // legalSize - 1 acquisitions are reachable, because the last servable offer
    // is the one taken with legalSize - 2 entries already consumed.
    expect(offerCliff(new Array(6).fill('gold_trail'), {
      signatureLocked: false,
      signatureInPool: false,
    }).maximumAcquisitions).toBe(5);
    expect(offerCliff(new Array(7).fill('gold_trail'), {
      signatureLocked: false,
      signatureInPool: false,
    }).fillsAllLoci).toBe(true);
    expect(offerCliff(new Array(6).fill('gold_trail'), {
      signatureLocked: false,
      signatureInPool: false,
    }).fillsAllLoci).toBe(false);
  });

  it('loses one more entry while the shipped signature lock stands', () => {
    const locked = offerCliff(new Array(7).fill('gold_trail'), {
      signatureLocked: true,
      signatureInPool: true,
    });
    expect(locked.legalSize).toBe(6);
    expect(locked.maximumAcquisitions).toBe(5);
    expect(locked.fillsAllLoci).toBe(false);
  });
});

/**
 * THE OFFER STREAM IS OFFER-INDEXED; THE RUN IS FOOD-INDEXED.
 *
 * `traverseOffers` opens offers until the pool stops producing two legal
 * candidates, which is the right question for pool health and says nothing
 * about WHEN in a run those offers arrive. The relic cadence answers that, and
 * the 2026-08-05 ruling moved it (6 +/- 2 -> 8 +/- 2). These translate the
 * harness's offer counts into foods through the live constant, so a cadence
 * change either lands inside the pacing this document ratified or fails here.
 */
describe('relic pacing in foods (the 2026-08-05 cadence ruling)', () => {
  /** The k-th offer's expected food, at the authored mean. */
  const foodAtOffer = (index: number): number =>
    GENE_OFFER_CADENCE.intervalBase * index;

  /** Worst and best case for the k-th offer across the inclusive window. */
  const foodBounds = (index: number): { earliest: number; latest: number } => ({
    earliest:
      (GENE_OFFER_CADENCE.intervalBase - GENE_OFFER_CADENCE.intervalJitter) *
      index,
    latest:
      (GENE_OFFER_CADENCE.intervalBase + GENE_OFFER_CADENCE.intervalJitter) *
      index,
  });

  it('rolls only inside the window the pacing arithmetic assumes', () => {
    const bounds = foodBounds(1);
    for (let index = 0; index < 500; index += 1) {
      const rolled = rollGeneOfferInterval(() => index / 500);
      expect(rolled).toBeGreaterThanOrEqual(bounds.earliest);
      expect(rolled).toBeLessThanOrEqual(bounds.latest);
    }
  });

  it.each(DYNASTIES)(
    '%s: a complete six-locus Genome still fits inside the D1 median run',
    (dynasty) => {
      // D1's candidate median run is ~48 foods (REDESIGN_WAVE 1.3), and it is
      // the food count every food-indexed dial in the catalog is re-based
      // against. A pool that fills all six loci in exactly six offers must
      // still be able to do it inside that run at the mean cadence.
      const health = measurePool(
        dynasty,
        recommended(dynasty),
        cohort('bank0'),
        SEEDS
      );
      expect(health.meanAcquisitions).toBe(GENOME_LOCI);
      expect(foodAtOffer(GENOME_LOCI)).toBeLessThanOrEqual(48);
    }
  );

  it('spends the three guaranteed trial appearances inside a short run', () => {
    // PEO 4.4 ratified three guaranteed appearances. At 8 +/- 2 the worst case
    // is the third offer landing at food 30, which is well inside a run that
    // reaches the first portal (food 15) and then some.
    const guaranteed = GENOME_V2_TRIAL_OFFER_GUARANTEE;
    expect(guaranteed).toBe(3);
    expect(foodBounds(guaranteed).latest).toBe(30);
    expect(foodAtOffer(guaranteed)).toBe(24);
  });
});

describe('six-Gene starter pools are not viable', () => {
  it.each(DYNASTIES)(
    '%s: every six-Gene candidate starves before a complete Genome',
    (dynasty) => {
      const candidates = Object.entries(STARTER_POOL_CANDIDATES[dynasty]).filter(
        ([, pool]) => pool.length === 6
      );
      expect(candidates.length).toBeGreaterThanOrEqual(2);
      for (const [, pool] of candidates) {
        for (const entry of COHORTS) {
          const health = measurePool(dynasty, pool, entry, SEEDS);
          expect(health.starvedBeforeFullGenomeRate).toBe(1);
          expect(health.filledAllLociRate).toBe(0);
          expect(health.meanAcquisitions).toBeLessThanOrEqual(5);
        }
      }
    }
  );
});

describe('seven-Gene starter pools', () => {
  it.each(DYNASTIES)(
    '%s: never starves and always reaches six loci once the Signature is legal',
    (dynasty) => {
      for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
        const health = measurePool(dynasty, recommended(dynasty), entry, SEEDS);
        expect(health.starvedBeforeFullGenomeRate).toBe(0);
        expect(health.filledAllLociRate).toBe(1);
        expect(health.meanAcquisitions).toBe(GENOME_LOCI);
        // Different-category slot-two rule holds for nearly every served offer.
        expect(health.distinctCategoryOfferRate).toBeGreaterThan(0.95);
        expect(health.categoriesReachable.length).toBe(6);
      }
    }
  );

  it.each(DYNASTIES)(
    '%s: still starves if the shipped Signature lock is kept — ruling 1 is load-bearing',
    (dynasty) => {
      const health = measurePool(
        dynasty,
        recommended(dynasty),
        cohort('bank0-signature-locked'),
        SEEDS
      );
      expect(health.starvedBeforeFullGenomeRate).toBe(1);
      expect(health.meanAcquisitions).toBe(5);
    }
  );

  it.each(DYNASTIES)('%s: satisfies every §4.3 starter constraint', (dynasty) => {
    const key = RECOMMENDED_STARTER_POOL_KEY[dynasty];
    const card = scoreStarterPool(dynasty, key, recommended(dynasty));
    expect(card.size).toBe(7);
    expect(card.includesSignature).toBe(true);
    expect(card.coherentDirections).toBeGreaterThanOrEqual(2);
    expect(card.minorWithoutInheritance).toBe(true);
    expect(card.verbDependentGenes).toEqual([]);
    expect(card.lateLegibilityGenes).toEqual([]);
    expect(card.fillsAllLoci).toBe(true);
    expect(card.signatureStrainReachesMinor).toBe(true);
    expect(card.categories).toEqual([
      'banking',
      'body',
      'execution',
      'survival',
      'terrain',
      'yield',
    ]);
    expect(card.splices).toEqual(['splice_dragon_hoard', 'splice_gilded_fork']);
    expect(card.passes).toBe(true);
  });

  it('gives no Dynasty a neutral-tutorial advantage: the same shape, three identities', () => {
    const shapes = DYNASTIES.map((dynasty) => {
      const card = scoreStarterPool(
        dynasty,
        RECOMMENDED_STARTER_POOL_KEY[dynasty],
        recommended(dynasty)
      );
      return {
        size: card.size,
        categories: card.categories,
        splices: card.splices,
        directions: card.coherentDirections >= 2,
        signatureMinor: card.signatureStrainReachesMinor,
      };
    });
    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);
  });

  it('keeps the two verb-dependent Genes out of run one', () => {
    // Both rules read "portal CONTINUE", which activates at one validated bank.
    expect(GENOME_V2_CONFIG.ftue.continueAtBankedRuns).toBe(1);
    for (const dynasty of DYNASTIES) {
      expect(recommended(dynasty)).not.toContain('loan_shark');
      expect(recommended(dynasty)).not.toContain('mirror_wager');
    }
  });
});

describe('Strain routes and Splice reachability', () => {
  it.each(DYNASTIES)('%s: the Signature Strain reaches Minor in two', (dynasty) => {
    const signature = recommended(dynasty)[0];
    const reach = measureStrainReachability(recommended(dynasty));
    const signatureStrains = reach.filter((entry) =>
      genomeV2ActivePool(dynasty).includes(signature) ? entry.minorReachable : false
    );
    expect(signatureStrains.length).toBeGreaterThanOrEqual(2);
    for (const entry of reach) {
      if (entry.minorReachable) expect(entry.acquisitionsToMinor).toBe(2);
    }
  });

  it.each(DYNASTIES)(
    '%s: exactly two Splices are reachable at the six-bank gate, growing to all eight',
    (dynasty) => {
      expect(reachableSplices(recommended(dynasty))).toHaveLength(2);
      const prefixes = eligibilityPrefixes(dynasty, recommended(dynasty));
      const last = prefixes[prefixes.length - 1];
      expect(last).toHaveLength(genomeV2ActivePool(dynasty).length);
      expect(reachableSplices(last)).toHaveLength(8);
      // Monotonic: an unlock never removes a reachable Splice.
      let previous = 0;
      for (const prefix of prefixes) {
        const count = reachableSplices(prefix).length;
        expect(count).toBeGreaterThanOrEqual(previous);
        previous = count;
      }
    }
  );

  it('reaches at least nine eligible Genes before Splices activate, so a spliced run can rebuild', () => {
    // A Splice fuses two instances and frees a locus (genomeV2.ts:1711-1716),
    // so a splicing run consumes MORE than six Genes: the complete roster
    // averages ~8 acquisitions at the six-bank cohort.
    for (const dynasty of DYNASTIES) {
      const roster = genomeV2ActivePool(dynasty);
      const rosterHealth = measurePool(
        dynasty,
        roster,
        cohort('bank6-splices'),
        SEEDS
      );
      expect(rosterHealth.meanAcquisitions).toBeGreaterThan(GENOME_LOCI + 1);
      const ninth = eligibilityPrefixes(dynasty, recommended(dynasty))[2];
      expect(ninth).toHaveLength(9);
      expect(
        offerCliff(ninth, { signatureLocked: false, signatureInPool: true })
          .maximumAcquisitions + offerCliff(ninth, {
          signatureLocked: false,
          signatureInPool: true,
        }).headroomForRecodes
      ).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('eligibility prefixes', () => {
  it.each(DYNASTIES)('%s: no prefix starves, in any cohort', (dynasty) => {
    for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
      for (const measurement of measurePrefixes(
        dynasty,
        recommended(dynasty),
        entry,
        PREFIX_SEEDS
      )) {
        expect(measurement.health.starvedBeforeFullGenomeRate).toBe(0);
        expect(measurement.health.filledAllLociRate).toBe(1);
        expect(measurement.health.categoriesReachable.length).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it.each(DYNASTIES)(
    '%s: the result does not depend on the order the player chooses trials in',
    (dynasty) => {
      const worst = worstPrefixAcrossOrders(
        dynasty,
        recommended(dynasty),
        cohort('bank6-splices'),
        CURRICULUM_ORDER[dynasty].length,
        simulationSeeds(4)
      );
      expect(worst.worstStarvedBeforeFullGenomeRate).toBe(0);
      expect(worst.worstFilledAllLociRate).toBe(1);
      expect(worst.worstDistinctCategoryOfferRate).toBeGreaterThan(0.9);
      expect(worst.worstCategoriesReachable).toBeGreaterThanOrEqual(6);
    }
  );

  it.each(DYNASTIES)('%s: the curriculum order only names roster Genes', (dynasty) => {
    const roster = genomeV2ActivePool(dynasty);
    const starter = recommended(dynasty);
    for (const geneId of CURRICULUM_ORDER[dynasty]) {
      expect(roster).toContain(geneId);
      expect(starter).not.toContain(geneId);
    }
    expect(starter.length + CURRICULUM_ORDER[dynasty].length).toBe(roster.length);
  });
});

describe('full-pool fairness (§4.5)', () => {
  it.each(DYNASTIES)(
    '%s: no prefix beats the complete roster where the advantage could be live',
    (dynasty) => {
      // Splice weighting is inert until splicesUnlocked, so the bank-six cohort
      // is the only one where a concentration advantage could actually pay.
      const live = compareToFullRoster(
        dynasty,
        recommended(dynasty),
        cohort('bank6-splices'),
        SEEDS
      );
      expect(live.spliceConcentrationAdvantage).toBeLessThan(0);
      expect(live.strainConcentrationAdvantage).toBeLessThanOrEqual(0);
      expect(live.filledAllLociAdvantage).toBeLessThanOrEqual(0);
    }
  );

  it.each(DYNASTIES)(
    '%s: the complete roster is never the worse place to be',
    (dynasty) => {
      const roster = genomeV2ActivePool(dynasty);
      for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
        const rosterHealth = measurePool(dynasty, roster, entry, SEEDS);
        const starterHealth = measurePool(
          dynasty,
          recommended(dynasty),
          entry,
          SEEDS
        );
        expect(rosterHealth.starvedBeforeFullGenomeRate).toBe(0);
        expect(rosterHealth.filledAllLociRate).toBeGreaterThanOrEqual(
          starterHealth.filledAllLociRate
        );
        expect(rosterHealth.categoriesReachable.length).toBeGreaterThanOrEqual(
          starterHealth.categoriesReachable.length
        );
      }
    }
  );
});

// ---------------------------------------------------------------------------
// The trial guarantee (WP-C — PEO §4.4)
// ---------------------------------------------------------------------------

/** The first curriculum trial each Dynasty's starter pool leads into. */
const FIRST_TRIAL: Readonly<Record<DynastyName, GenomeV2ActiveGeneId>> = {
  CYBER: 'circuit_run',
  PRIMAL: 'circuit_run',
  COSMIC: 'live_wire',
};

/** Starter seven plus the trial: the vocabulary the composer actually builds. */
function trialPool(dynasty: DynastyName): GenomeV2ActiveGeneId[] {
  return genomeV2PlayableVocabulary(dynasty as GenomeV2Dynasty, {
    eligibleGeneIds: [],
    trialGeneId: FIRST_TRIAL[dynasty],
    bankedRuns: 2,
    masteryLevel: 0,
  });
}

describe('the trial guarantee costs the player nothing', () => {
  it.each(DYNASTIES)('%s: guaranteeing a trial never starves a run', (dynasty) => {
    // The whole point of measuring this: guidance is placed INSIDE the offer
    // stream, so it could in principle change which builds are reachable. The
    // gate is the same one the pools themselves pass.
    for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
      const measured = measureTrial(
        dynasty,
        trialPool(dynasty),
        FIRST_TRIAL[dynasty],
        entry,
        PREFIX_SEEDS
      );
      expect(measured.health.starvedBeforeFullGenomeRate).toBe(0);
      expect(measured.health.filledAllLociRate).toBe(1);
      expect(measured.health.categoriesReachable.length)
        .toBeGreaterThanOrEqual(6);
    }
  });

  it.each(DYNASTIES)('%s: every trial offer keeps an ordinary alternative', (dynasty) => {
    // PEO §4.4: one ordinary candidate plus DECLINE, so guidance narrows the
    // choice by one and never forces a build.
    for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
      const measured = measureTrial(
        dynasty,
        trialPool(dynasty),
        FIRST_TRIAL[dynasty],
        entry,
        PREFIX_SEEDS
      );
      expect(measured.ordinaryAlternativeRate).toBe(1);
      expect(measured.firstOfferRate).toBe(1);
    }
  });

  it.each(DYNASTIES)('%s: spends at most the ratified three appearances', (dynasty) => {
    for (const entry of COHORTS.filter((c) => !c.signatureLocked)) {
      const measured = measureTrial(
        dynasty,
        trialPool(dynasty),
        FIRST_TRIAL[dynasty],
        entry,
        PREFIX_SEEDS
      );
      expect(measured.maxGuaranteeConsumed).toBeLessThanOrEqual(3);
      expect(measured.meanTrialOffers).toBeGreaterThan(0);
    }
  });

  it.each(DYNASTIES)('%s: the player may still decline it every time', (dynasty) => {
    // `decline-alternate` refuses every second offer and the guarantee does
    // not trap it: a declined trial stays available and costs nothing.
    for (const seed of PREFIX_SEEDS) {
      const result = traverseOffers(
        dynasty,
        trialPool(dynasty),
        cohort('bank2'),
        'decline-alternate',
        seed,
        { geneId: FIRST_TRIAL[dynasty], offersRemaining: 3 }
      );
      expect(result.trialGuaranteeConsumed).toBeLessThanOrEqual(3);
      expect(result.trialOffersWithAlternative).toBe(result.trialOffers);
      expect(result.exhaustedAtAcquisitions).toBeNull();
    }
  });

  it('an unteachable trial is suppressed and spends nothing', () => {
    // Catalog §5: `mirror_wager` reads "portal CONTINUE", which activates at
    // one validated bank. In a run-one cohort the trial does not enter the
    // roll and the guarantee is not decremented.
    for (const dynasty of DYNASTIES) {
      const pool = genomeV2PlayableVocabulary(dynasty as GenomeV2Dynasty, {
        eligibleGeneIds: [],
        trialGeneId: 'mirror_wager',
        bankedRuns: 0,
        masteryLevel: 0,
      });
      const measured = measureTrial(
        dynasty,
        pool,
        'mirror_wager',
        cohort('bank0'),
        PREFIX_SEEDS
      );
      expect(measured.maxGuaranteeConsumed).toBe(0);
      // Suppression is INVISIBLE, not merely harmless: the measured run is the
      // same run the same pool produces with no trial stamped at all. The Gene
      // is still in the vocabulary, so the ordinary draw may still offer it —
      // and those appearances cost the account nothing.
      expect(measured.health).toEqual(
        measurePool(dynasty, pool, cohort('bank0'), PREFIX_SEEDS)
      );
    }
  });
});
