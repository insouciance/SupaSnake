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
  /** Selected strain eligible for the guarantee; dual lineage needs a primary. */
  guaranteeStrains?: readonly StrainId[];
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
  /**
   * The run's single offer tilt: +`ANOMALY_STRAIN_WEIGHT` on this strain's
   * genes. Named for the anomaly it began as; since WP-2.10b the SERVER
   * resolves it from the whole world condition (anomaly + clause) through
   * `conditionOfferTilt`, which collapses the composed weight map to its
   * heaviest strain. The engine and `verifyOfferTrace` both receive that one
   * resolved strain, so the drawn stream and the verified stream are the same
   * stream by construction.
   */
  anomalyStrain?: StrainId | null;
}

/** Anomaly strain-week weight (BUILDCRAFT_GENOME_DESIGN.md §9). */
export const ANOMALY_STRAIN_WEIGHT = 100;

/**
 * Every term of one gene's offer weight, itemised.
 *
 * WHY THE BREAKDOWN IS THE PRIMITIVE AND THE SCALAR IS DERIVED
 *
 * The Workbench explains to a player WHY a gene is likely to be offered, and
 * the draw decides WHETHER it is. If those were two calculations they would
 * drift — the explanation is the sort of code nobody re-reads once it looks
 * right. So `geneWeight` is defined as `geneWeightBreakdown(...).total` and
 * the draw calls the scalar: the number the calculator itemises IS the number
 * the stream weights by, and a divergence between them is not a bug that a
 * test might catch but a state the code cannot reach.
 */
export interface GeneWeightBreakdown {
  /** `OFFER_GRAVITY.baseWeight` — every candidate starts here. */
  base: number;
  /** Gravity before the per-gene cap: `perStrainPoint × points`, summed. */
  strainRaw: number;
  /** What the cap actually let through — the term that enters the total. */
  strain: number;
  /** True when `strainWeightCap` bound, i.e. `strain < strainRaw`. */
  strainCapped: boolean;
  /** `spliceCompletionWeight`, or 0 when this gene completes nothing held. */
  spliceCompletion: number;
  /** The held gene it would fuse with — the earliest such pick, or null. */
  spliceWith: GeneId | null;
  /** `lineageBiasWeight` while the run is inside `lineageBiasOffers`, else 0. */
  lineage: number;
  /** `ANOMALY_STRAIN_WEIGHT` when the run's condition tilts this gene, else 0. */
  condition: number;
  /** The sum. This is `geneWeight`. */
  total: number;
}

export function geneWeightBreakdown(
  id: GeneId,
  ctx: OfferContext
): GeneWeightBreakdown {
  const strains = geneStrains(id);
  const base: number = OFFER_GRAVITY.baseWeight;

  let strainRaw = 0;
  for (const strain of strains) {
    strainRaw += OFFER_GRAVITY.perStrainPoint * (ctx.points[strain] ?? 0);
  }
  const strain = Math.min(OFFER_GRAVITY.strainWeightCap, strainRaw);

  let spliceWith: GeneId | null = null;
  for (const pick of ctx.picks) {
    if (spliceForPair(pick.id, id) !== null) {
      spliceWith = pick.id;
      break;
    }
  }
  const spliceCompletion =
    spliceWith === null ? 0 : OFFER_GRAVITY.spliceCompletionWeight;

  const lineage =
    ctx.lineage &&
    ctx.offerIndex < OFFER_GRAVITY.lineageBiasOffers &&
    strains.some((s) => ctx.lineage!.strains.includes(s))
      ? OFFER_GRAVITY.lineageBiasWeight
      : 0;

  const condition =
    ctx.anomalyStrain && strains.includes(ctx.anomalyStrain)
      ? ANOMALY_STRAIN_WEIGHT
      : 0;

  return {
    base,
    strainRaw,
    strain,
    strainCapped: strain < strainRaw,
    spliceCompletion,
    spliceWith,
    lineage,
    condition,
    total: base + strain + spliceCompletion + lineage + condition,
  };
}

/** The scalar the draw weights by — the breakdown's total, never a restatement. */
export function geneWeight(id: GeneId, ctx: OfferContext): number {
  return geneWeightBreakdown(id, ctx).total;
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
 * The strain the pity rule will force into slot 1 of the NEXT offer, or
 * null when it will not fire.
 *
 * Pure, and reads exactly the inputs `rollGeneOffer` reads, so a PASS
 * affordance can state the real consequence of passing instead of a
 * generic promise. It is honest ONLY for the pass branch: declining leaves
 * `points` and `picks` untouched, which is precisely why the next offer's
 * slot 1 is knowable before it is rolled. Taking a gene can move the top
 * strain and the candidate set, so this must never describe a pick.
 *
 * Call it with the offer stream's state AFTER the current offer has been
 * pushed to `recentOffers` - the pity window counts offers, not picks, so
 * the offer on screen is already part of the window it is being measured
 * against.
 */
export function pityForecast(
  ctx: Pick<OfferContext, 'picks' | 'pool' | 'points' | 'recentOffers'>
): StrainId | null {
  const top = topStrain(ctx.points);
  if (top === null) return null;
  const recent = ctx.recentOffers ?? [];
  if (recent.length < OFFER_GRAVITY.pityOfferWindow) return null;
  const starved = recent
    .slice(-OFFER_GRAVITY.pityOfferWindow)
    .every((offer) => !offer.some((id) => geneStrains(id).includes(top)));
  if (!starved) return null;
  const held = new Set(ctx.picks.map((p) => p.id));
  const candidates = ctx.pool.filter((id) => !held.has(id) && id in GENES);
  // Under two candidates there is no next offer at all, and a forced slot 1
  // still needs a candidate carrying the strain - `rollGeneOffer` falls back
  // to the unforced roll when `bestOfStrain` finds none.
  if (candidates.length < 2) return null;
  return candidates.some((id) => geneStrains(id).includes(top)) ? top : null;
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
    (ctx.lineage.guaranteeStrains?.length ?? ctx.lineage.strains.length) > 0 &&
    !geneStrains(slot1Roll).some((s) =>
      (ctx.lineage!.guaranteeStrains ?? ctx.lineage!.strains).includes(s)
    )
  ) {
    const guaranteeStrain = (ctx.lineage.guaranteeStrains ?? ctx.lineage.strains)[0];
    slot1 = guaranteeStrain ? bestOfStrain(guaranteeStrain) ?? slot1Roll : slot1Roll;
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
