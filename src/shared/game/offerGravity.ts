/**
 * Offer gravity - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md §5)
 *
 * Gene offers gravitate toward the strains a run has already committed
 * to, with a wildcard slot and a pity override that make lock-in
 * impossible. Everything is derived from a counter-based deterministic
 * stream: fnv1a(runSeed + ':' + offerIndex) seeding mulberry32 - so the
 * server can re-derive any offer k independently, without replaying
 * interval rolls or placement RNG.
 *
 * RNG DISCIPLINE UNCHANGED: offers gate OPTIONS, never payout math.
 * Legality is enforced by pool membership + cadence bounds; the offer
 * trace is verified server-side (advisory at launch).
 */

import { GENES, geneStrains, type GeneId, type GenePick } from '@/shared/game/genes';
import { spliceForPair } from '@/shared/game/splices';
import { STRAIN_IDS, type StrainId, type StrainPoints } from '@/shared/game/strains';

// =============================================================================
// DETERMINISTIC STREAM
// =============================================================================

/** FNV-1a 32-bit hash of a string - the offer-stream seed derivation. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 - tiny deterministic PRNG over a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The deterministic stream for offer k of a run: each offer index gets
 * its own independently-derivable generator (counter-based, so server
 * verification of offer k needs only (runSeed, k)).
 */
export function offerStream(runSeed: string, offerIndex: number): () => number {
  return mulberry32(fnv1a(`${runSeed}:${offerIndex}`));
}

// =============================================================================
// GRAVITY WEIGHTS (§5)
// =============================================================================

export const OFFER_GRAVITY = {
  /** Base weight per candidate gene. */
  baseWeight: 100,
  /** Extra weight per strain point the run holds in the gene's strains... */
  perStrainPoint: 60,
  /** ...capped per gene. */
  strainWeightCap: 180,
  /** Extra weight when the gene completes a splice with a held gene. */
  spliceCompletionWeight: 40,
  /** Chance slot 2 is a wildcard drawn uniformly from off-build genes. */
  wildcardChance: 0.25,
  /** Pity: offers without a top-strain gene before slot 1 is forced. */
  pityOfferWindow: 2,
  /** Lineage bias: extra weight on lineage-strain genes... */
  lineageBiasWeight: 80,
  /** ...for the first N offers of the run. */
  lineageBiasOffers: 2,
} as const;

export interface OfferTraceEntry {
  /** Offer index k (shared counter across cadence + infuse offers). */
  k: number;
  /** foodEaten when the offer was rolled. */
  atFood: number;
  /** The picked gene, or null when the offer was declined. */
  picked: GeneId | null;
}

export interface LineageBias {
  strains: readonly StrainId[];
  /** Strength 2 lineage: slot 1 of offer 0 must contain a lineage gene. */
  guaranteeFirstOffer: boolean;
}

export interface OfferContext {
  runSeed: string;
  offerIndex: number;
  /** Raw picks so far (fused parents included - they cannot re-offer). */
  picks: GenePick[];
  /** The player's unlocked pool (server-composed). */
  pool: GeneId[];
  /** Live strain points (spawn + genes + surges). */
  points: StrainPoints;
  /** Gene ids offered in the previous two offers (pity window). */
  recentOffers?: GeneId[][];
  /** Lineage offer bias (strength 0+ lineages). */
  lineage?: LineageBias | null;
  /** Anomaly strain week: +100 weight on this strain's genes. */
  anomalyStrain?: StrainId | null;
}

/** Anomaly strain-week weight (BUILDCRAFT_GENOME_DESIGN.md §9). */
export const ANOMALY_STRAIN_WEIGHT = 100;

function geneWeight(id: GeneId, ctx: OfferContext): number {
  let weight: number = OFFER_GRAVITY.baseWeight;
  let strainWeight = 0;
  for (const strain of geneStrains(id)) {
    strainWeight += OFFER_GRAVITY.perStrainPoint * (ctx.points[strain] ?? 0);
  }
  weight += Math.min(OFFER_GRAVITY.strainWeightCap, strainWeight);
  for (const pick of ctx.picks) {
    if (spliceForPair(pick.id, id) !== null) {
      weight += OFFER_GRAVITY.spliceCompletionWeight;
      break;
    }
  }
  if (
    ctx.lineage &&
    ctx.offerIndex < OFFER_GRAVITY.lineageBiasOffers &&
    geneStrains(id).some((s) => ctx.lineage!.strains.includes(s))
  ) {
    weight += OFFER_GRAVITY.lineageBiasWeight;
  }
  if (
    ctx.anomalyStrain &&
    geneStrains(id).includes(ctx.anomalyStrain)
  ) {
    weight += ANOMALY_STRAIN_WEIGHT;
  }
  return weight;
}

function weightedDraw(
  candidates: GeneId[],
  ctx: OfferContext,
  rng: () => number
): GeneId {
  const weights = candidates.map((id) => geneWeight(id, ctx));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** The run's highest-point strain (catalog order breaks ties), or null. */
export function topStrain(points: StrainPoints): StrainId | null {
  let best: StrainId | null = null;
  let bestPoints = 0;
  for (const strain of STRAIN_IDS) {
    const value = points[strain] ?? 0;
    if (value > bestPoints) {
      best = strain;
      bestPoints = value;
    }
  }
  return best;
}

/**
 * Roll the choice-of-2 offer for offer index k - deterministic in
 * (runSeed, k, picks, pool, points, recentOffers, lineage, anomaly).
 *
 * Slot 1: weighted gravity draw, with two overrides (in priority order):
 *   - Lineage guarantee (strength 2): offer 0 slot 1 is the
 *     highest-weight lineage-strain gene.
 *   - Pity: if the previous 2 offers held zero genes of the run's
 *     top-point strain, slot 1 is forced to that strain's best gene.
 * Slot 2: wildcard (25%): uniform over candidates whose strains all have
 * 0 points; otherwise weighted draw excluding slot 1.
 */
export function rollGeneOffer(ctx: OfferContext): [GeneId, GeneId] | null {
  const held = new Set(ctx.picks.map((p) => p.id));
  const candidates = ctx.pool.filter((id) => !held.has(id) && id in GENES);
  if (candidates.length < 2) return null;
  const rng = offerStream(ctx.runSeed, ctx.offerIndex);

  const bestOfStrain = (strain: StrainId): GeneId | null => {
    const ofStrain = candidates.filter((id) => geneStrains(id).includes(strain));
    if (ofStrain.length === 0) return null;
    let best = ofStrain[0];
    let bestWeight = -1;
    for (const id of ofStrain) {
      const weight = geneWeight(id, ctx);
      if (weight > bestWeight) {
        best = id;
        bestWeight = weight;
      }
    }
    return best;
  };

  // Slot 1 - draw first so the stream consumption is fixed, then apply
  // overrides (overrides replace the RESULT, never the stream position).
  const slot1Roll = weightedDraw(candidates, ctx, rng);
  let slot1: GeneId = slot1Roll;
  if (
    ctx.lineage?.guaranteeFirstOffer &&
    ctx.offerIndex === 0 &&
    !geneStrains(slot1Roll).some((s) => ctx.lineage!.strains.includes(s))
  ) {
    slot1 = bestOfStrain(ctx.lineage.strains[0]) ?? slot1Roll;
  } else {
    const top = topStrain(ctx.points);
    const recent = ctx.recentOffers ?? [];
    if (
      top !== null &&
      recent.length >= OFFER_GRAVITY.pityOfferWindow &&
      recent
        .slice(-OFFER_GRAVITY.pityOfferWindow)
        .every((offer) => !offer.some((id) => geneStrains(id).includes(top)))
    ) {
      slot1 = bestOfStrain(top) ?? slot1Roll;
    }
  }

  // Slot 2 - wildcard or weighted, excluding slot 1.
  const rest = candidates.filter((id) => id !== slot1);
  if (rest.length === 0) return null;
  let slot2: GeneId;
  if (rng() < OFFER_GRAVITY.wildcardChance) {
    const offBuild = rest.filter((id) =>
      geneStrains(id).every((s) => (ctx.points[s] ?? 0) === 0)
    );
    if (offBuild.length > 0) {
      slot2 = offBuild[Math.floor(rng() * offBuild.length)];
    } else {
      slot2 = weightedDraw(rest, ctx, rng);
    }
  } else {
    slot2 = weightedDraw(rest, ctx, rng);
  }
  return [slot1, slot2];
}
