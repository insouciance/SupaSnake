/**
 * Offer-trace verifier (advisory): honest traces pass, tampered picks
 * flag, declines consume the counter without a pick.
 */

import { describe, it, expect } from '@jest/globals';
import {
  sanitizeOfferTrace,
  verifyOfferTrace,
  type OfferVerifyContext,
} from './offerVerifier';
import { GENE_POOL, type GeneId, type GenePick } from '@/shared/game/genes';
import { rollGeneOffer } from '@/shared/game/offerGravity';

const ctx = (over: Partial<OfferVerifyContext> = {}): OfferVerifyContext => ({
  runSeed: 'verify-seed',
  pool: [...GENE_POOL],
  heirloom: {},
  surges: [],
  lineage: null,
  anomalyStrain: null,
  tierCap: 3,
  ...over,
});

/** Play an honest client: roll offers with the same algorithm + pick slot 0. */
function honestTrace(seed: string, offers: number): {
  trace: { k: number; atFood: number; picked: GeneId | null }[];
  picks: GenePick[];
} {
  const trace: { k: number; atFood: number; picked: GeneId | null }[] = [];
  const picks: GenePick[] = [];
  const recentOffers: GeneId[][] = [];
  for (let k = 0; k < offers; k++) {
    const atFood = 16 + k * 16;
    const offer = rollGeneOffer({
      runSeed: seed,
      offerIndex: k,
      picks,
      pool: [...GENE_POOL],
      points: {},
      recentOffers: recentOffers.slice(-2),
      lineage: null,
      anomalyStrain: null,
    });
    if (!offer) break;
    recentOffers.push([...offer]);
    if (k % 3 === 2) {
      trace.push({ k, atFood, picked: null }); // decline every 3rd
    } else {
      trace.push({ k, atFood, picked: offer[0] });
      picks.push({ id: offer[0], atFood });
    }
  }
  return { trace, picks };
}

describe('sanitizeOfferTrace', () => {
  it('keeps well-formed entries in k order, drops junk', () => {
    const trace = sanitizeOfferTrace([
      { k: 0, atFood: 16, picked: 'gold_trail' },
      { k: 0, atFood: 20, picked: null }, // duplicate k - dropped
      { k: 2, atFood: 40, picked: 'not_a_gene' }, // unknown pick - dropped
      { k: 3, atFood: 55, picked: null },
      'junk',
    ]);
    expect(trace).toEqual([
      { k: 0, atFood: 16, picked: 'gold_trail' },
      { k: 3, atFood: 55, picked: null },
    ]);
    expect(sanitizeOfferTrace('nope')).toEqual([]);
  });
});

describe('verifyOfferTrace', () => {
  it('an honest replayed trace passes (declines consume k)', () => {
    const { trace, picks } = honestTrace('verify-seed', 5);
    const result = verifyOfferTrace(trace, picks, ctx());
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(trace.length);
  });

  it('a tampered pick (never offered at its k) flags', () => {
    const { trace, picks } = honestTrace('verify-seed', 4);
    const pickedEntry = trace.find((t) => t.picked !== null)!;
    // Swap the pick for a gene that was NOT in that offer.
    const offered = new Set(
      [rollGeneOffer({
        runSeed: 'verify-seed',
        offerIndex: pickedEntry.k,
        picks: [],
        pool: [...GENE_POOL],
        points: {},
      })].flatMap((o) => o ?? [])
    );
    const replacement = GENE_POOL.find((id) => !offered.has(id))!;
    pickedEntry.picked = replacement;
    const result = verifyOfferTrace(trace, picks, ctx());
    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it('an empty/absent trace verifies vacuously', () => {
    expect(verifyOfferTrace(undefined, [], ctx()).ok).toBe(true);
    expect(verifyOfferTrace([], [], ctx()).ok).toBe(true);
  });
});
