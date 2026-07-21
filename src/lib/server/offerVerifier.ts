/**
 * Offer-trace verifier (Buildcraft: The Genome, §5) - ADVISORY.
 *
 * Gene offers are derived from counter-based streams of the session's
 * run_seed, so the server can replay every offer k independently and
 * check that each picked gene was actually offered. A mismatch flags the
 * session (validated:false via OFFER_SEED_MISMATCH) but NEVER changes the
 * payout at launch: offers gate OPTIONS, legality is separately enforced
 * by pool + cadence bounds. Hard enforcement (dropping unproven picks) is
 * a later config flip once telemetry confirms zero false positives.
 */

import { isGeneId, type GeneId, type GenePick } from '@/shared/game/genes';
import {
  rollGeneOffer,
  type LineageBias,
  type OfferTraceEntry,
} from '@/shared/game/offerGravity';
import { strainActivations, type StrainSurge } from '@/shared/game/genome';
import type {
  StrainId,
  StrainPoints,
  StrainTier,
} from '@/shared/game/strains';

export interface OfferVerifyContext {
  runSeed: string;
  pool: GeneId[];
  heirloom: StrainPoints;
  surges: StrainSurge[];
  lineage: LineageBias | null;
  anomalyStrain: StrainId | null;
  tierCap: StrainTier;
}

export interface OfferVerifyResult {
  ok: boolean;
  checked: number;
  mismatches: string[];
}

/** Parse an untrusted offer trace ([{k, atFood, picked}] in k order). */
export function sanitizeOfferTrace(raw: unknown): OfferTraceEntry[] {
  if (!Array.isArray(raw)) return [];
  const trace: OfferTraceEntry[] = [];
  let lastK = -1;
  for (const entry of raw) {
    if (trace.length >= 16) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { k, atFood, picked } = entry as {
      k?: unknown;
      atFood?: unknown;
      picked?: unknown;
    };
    if (
      typeof k !== 'number' ||
      !Number.isInteger(k) ||
      k <= lastK ||
      typeof atFood !== 'number' ||
      !Number.isInteger(atFood) ||
      atFood < 0
    ) {
      continue;
    }
    const pickedId = picked === null || picked === undefined
      ? null
      : isGeneId(picked)
        ? picked
        : undefined;
    if (pickedId === undefined) continue;
    lastK = k;
    trace.push({ k, atFood, picked: pickedId });
  }
  return trace;
}

/**
 * Replay the offer stream against the accepted picks: every picked entry
 * must name a gene that the replayed offer k actually contained. Declines
 * consume k without a pick. Purely advisory.
 */
export function verifyOfferTrace(
  rawTrace: unknown,
  picks: GenePick[],
  ctx: OfferVerifyContext
): OfferVerifyResult {
  const trace = sanitizeOfferTrace(rawTrace);
  const mismatches: string[] = [];
  const picksSoFar: GenePick[] = [];
  const recentOffers: GeneId[][] = [];
  for (const entry of trace) {
    const surgesBefore = ctx.surges.filter((s) => s.atFood <= entry.atFood);
    const activations = strainActivations(
      picksSoFar,
      ctx.heirloom,
      surgesBefore,
      ctx.tierCap
    );
    const points: StrainPoints = {};
    for (const strain of Object.keys(activations) as StrainId[]) {
      if (activations[strain].points > 0) {
        points[strain] = activations[strain].points;
      }
    }
    const offer = rollGeneOffer({
      runSeed: ctx.runSeed,
      offerIndex: entry.k,
      picks: picksSoFar,
      pool: ctx.pool,
      points,
      recentOffers: recentOffers.slice(-2),
      lineage: ctx.lineage,
      anomalyStrain: ctx.anomalyStrain,
    });
    if (!offer) {
      if (entry.picked !== null) {
        mismatches.push(`k=${entry.k}: no offer derivable but ${entry.picked} picked`);
      }
      continue;
    }
    recentOffers.push([...offer]);
    if (entry.picked !== null) {
      if (!offer.includes(entry.picked)) {
        mismatches.push(
          `k=${entry.k}: picked ${entry.picked} not in offered [${offer.join(', ')}]`
        );
      } else {
        const pick = picks.find(
          (p) => p.id === entry.picked && !picksSoFar.some((q) => q.id === p.id)
        );
        if (pick) picksSoFar.push(pick);
        else picksSoFar.push({ id: entry.picked, atFood: entry.atFood });
      }
    }
  }
  return { ok: mismatches.length === 0, checked: trace.length, mismatches };
}
