/**
 * Splices - Buildcraft: The Genome (BUILDCRAFT_GENOME_DESIGN.md section 4)
 *
 * A splice is the fusion of two specific genes: picking gene B while
 * holding gene A replaces both with the splice in ONE slot. The splice
 * carries both parents' strain tags (points preserved) and keeps
 * counting as TWO in-run genes for the threshold gates.
 *
 * TRUST DESIGN: splices are DERIVED, never claimed. The client reports
 * only raw parent picks; the engine and the server both run fusePicks -
 * zero new trust surface, and validators that predate splices still see
 * legal parent picks. A directly-claimed splice id is dropped + flagged.
 *
 * Recipe overlap (a gene appearing in two recipes) is resolved
 * deterministically: a new pick fuses with the EARLIEST-HELD eligible
 * partner; each held gene can fuse at most once.
 */

import { geneStrains, type GeneId, type GenePick } from '@/shared/game/genes';
import type { StrainId } from '@/shared/game/strains';

export type SpliceId =
  | 'splice_dragon_hoard'
  | 'splice_regenesis'
  | 'splice_styx_contract'
  | 'splice_gravity_bubble'
  | 'splice_ricochet'
  | 'splice_comet_tail'
  | 'splice_old_growth'
  | 'splice_all_in'
  | 'splice_black_magnet'
  | 'splice_molted_rebirth';

export interface SpliceDef {
  id: SpliceId;
  name: string;
  /** The two parent genes (order-free). */
  parents: readonly [GeneId, GeneId];
  effect: string;
  cost: string;
}

export const SPLICES: Record<SpliceId, SpliceDef> = {
  splice_dragon_hoard: {
    id: 'splice_dragon_hoard',
    name: 'Dragon Hoard',
    parents: ['gold_trail', 'compound_interest'],
    effect: 'Every 5th food ×3 +5 flat; bank +0.05 per gene held',
    cost: 'Exit portals despawn 30 ticks sooner',
  },
  splice_regenesis: {
    id: 'splice_regenesis',
    name: 'Regenesis',
    parents: ['overgrowth', 'shed'],
    effect: 'Food +20%; every 20 foods the tail resets to 8 and each shed segment pays 3 flat DNA',
    cost: 'Food −10% DNA',
  },
  splice_styx_contract: {
    id: 'splice_styx_contract',
    name: 'Styx Contract',
    parents: ['mirror_wager', 'phoenix'],
    effect: 'Bank ×1.50, survive one death — the revive keeps your benefits',
    cost: 'Salvage locked at ×0.30',
  },
  splice_gravity_bubble: {
    id: 'splice_gravity_bubble',
    name: 'Gravity Bubble',
    parents: ['time_dilation', 'magnet_pulse'],
    effect: 'Speed −1 tier AND pull radius 3',
    cost: 'Food −25% DNA',
  },
  splice_ricochet: {
    id: 'splice_ricochet',
    name: 'Ricochet',
    parents: ['wall_rush', 'splitter'],
    effect: 'Wall-slide; food in pairs; foods eaten while sliding +50%',
    cost: 'Each food worth 80%',
  },
  splice_comet_tail: {
    id: 'splice_comet_tail',
    name: 'Comet Tail',
    parents: ['gold_trail', 'afterburner'],
    effect: 'Every 5th food ×3, every 10th ×2 — aligned 10ths pay ×6',
    cost: 'Exit portals despawn 40 ticks sooner',
  },
  splice_old_growth: {
    id: 'splice_old_growth',
    name: 'Old Growth',
    parents: ['deep_roots', 'glacial_reserve'],
    effect: 'Ramp caps at +45%; +1 flat DNA per 20 foods after fusion',
    cost: 'Exit portals despawn 25 ticks sooner',
  },
  splice_all_in: {
    id: 'splice_all_in',
    name: 'All In',
    parents: ['compound_interest', 'mirror_wager'],
    effect: 'Bank +0.15 per gene held',
    cost: 'Salvage ×0.20',
  },
  splice_black_magnet: {
    id: 'splice_black_magnet',
    name: 'Black Magnet',
    parents: ['magnet_pulse', 'gravity_well'],
    effect: 'Pull radius 4',
    cost: 'Food −15%; exit portal interval +4 foods',
  },
  splice_molted_rebirth: {
    id: 'splice_molted_rebirth',
    name: 'Molted Rebirth',
    parents: ['shed', 'phoenix'],
    effect: 'Shed cycle; survive one death keeping your food multipliers',
    cost: 'Food −10% DNA',
  },
};

export const SPLICE_IDS = Object.keys(SPLICES) as SpliceId[];

export function isSpliceId(value: unknown): value is SpliceId {
  return typeof value === 'string' && value in SPLICES;
}

function pairKey(a: GeneId, b: GeneId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** sorted "a|b" -> splice id. */
export const SPLICE_BY_PAIR: ReadonlyMap<string, SpliceId> = new Map(
  SPLICE_IDS.map((id) => [
    pairKey(SPLICES[id].parents[0], SPLICES[id].parents[1]),
    id,
  ])
);

/** The splice a pair of genes would fuse into, or null. */
export function spliceForPair(a: GeneId, b: GeneId): SpliceId | null {
  return SPLICE_BY_PAIR.get(pairKey(a, b)) ?? null;
}

/** Both parents' tags, deduplicated - the splice's strain contribution. */
export function spliceStrains(id: SpliceId): StrainId[] {
  const [a, b] = SPLICES[id].parents;
  return Array.from(new Set([...geneStrains(a), ...geneStrains(b)]));
}

/** A fused pick in the derived (fused) view of a run's picks. */
export interface FusedSplice {
  spliceId: SpliceId;
  /** Fusion food index = the SECOND parent's atFood. */
  atFood: number;
  /** Parent picks with their original atFood (their [E] effects apply
   *  individually for foods up to the fusion index). */
  parents: readonly [GenePick, GenePick];
}

export interface FusedView {
  /** Picks that did not fuse, original order. */
  loose: GenePick[];
  /** Fusions in fusion order. */
  splices: FusedSplice[];
}

/**
 * Derive the fused view of a raw pick sequence - deterministic and
 * identical on client and server. Walk picks in order; each new pick
 * fuses with the EARLIEST-HELD unfused gene it forms a recipe with.
 */
export function fusePicks(picks: GenePick[]): FusedView {
  const loose: GenePick[] = [];
  const splices: FusedSplice[] = [];
  for (const pick of picks) {
    let fusedAt = -1;
    for (let i = 0; i < loose.length; i++) {
      if (spliceForPair(loose[i].id, pick.id) !== null) {
        fusedAt = i;
        break;
      }
    }
    if (fusedAt >= 0) {
      const partner = loose[fusedAt];
      loose.splice(fusedAt, 1);
      const spliceId = spliceForPair(partner.id, pick.id);
      if (spliceId) {
        splices.push({
          spliceId,
          atFood: pick.atFood,
          parents: [partner, pick] as const,
        });
      }
    } else {
      loose.push(pick);
    }
  }
  return { loose, splices };
}

/** Slots occupied in the fused view (a splice occupies one slot). */
export function fusedSlotCount(view: FusedView): number {
  return view.loose.length + view.splices.length;
}

/** Splice economic tuning, exported for tests + UI copy. */
export const SPLICE_ECONOMICS = {
  /** Dragon Hoard: golden (every 5th) foods +5 flat; bank +0.05/gene. */
  dragonHoardGoldenFlat: 5,
  dragonHoardBankPerHeld: 0.05,
  dragonHoardBankCap: 0.3,
  /** Regenesis: shed cycle 20 foods; +3 flat per shed segment. */
  regenesisShedEveryFoods: 20,
  regenesisFlatPerSegment: 3,
  regenesisResetLength: 8,
  /** Gravity Bubble: food x0.75 total (replaces Time Dilation's x0.8). */
  gravityBubbleFoodPenalty: 0.75,
  /** Ricochet: food x0.8 (replaces Splitter's x0.7); slide-eats +50% [BT]. */
  ricochetFoodPenalty: 0.8,
  ricochetSlideBonusRatio: 0.5,
  ricochetMaxBonusRatio: 0.4,
  /** Comet Tail: every 5th x3, every 10th x2 (both anchored at fusion). */
  cometTailFifth: 5,
  cometTailFifthMultiplier: 3,
  cometTailTenth: 10,
  cometTailTenthMultiplier: 2,
  /** Old Growth: glacial ramp cap 0.30 -> 0.45; +1 flat per 20 foods. */
  oldGrowthRampCap: 0.45,
  oldGrowthRampPerFood: 0.01,
  oldGrowthFlatEveryFoods: 20,
  /** All In: bank +0.15 per gene held; salvage set x0.20. */
  allInBankPerHeld: 0.15,
  allInSalvage: 0.2,
  /** Styx Contract: Mirror Wager numbers, revive keeps benefits. */
  styxBank: 1.5,
  styxSalvage: 0.3,
  /** Black Magnet: food x0.85. */
  blackMagnetFoodPenalty: 0.85,
  /** Molted Rebirth: food x0.9 (Shed's cost carried forward). */
  moltedRebirthFoodPenalty: 0.9,
} as const;

/** Splice physical tuning (engine-side), exported for tests. */
export const SPLICE_PHYSICS = {
  /** Dragon Hoard cost: portals 30 ticks sooner (Gold Trail's cost). */
  dragonHoardPortalTicksPenalty: 30,
  /** Comet Tail cost: portals 40 ticks sooner. */
  cometTailPortalTicksPenalty: 40,
  /** Old Growth cost: portals 25 ticks sooner. */
  oldGrowthPortalTicksPenalty: 25,
  /** Gravity Bubble: pull radius 3 (Time Dilation slow carried forward). */
  gravityBubblePullRadius: 3,
  /** Black Magnet: pull radius 4; portal interval +4 foods. */
  blackMagnetPullRadius: 4,
  blackMagnetPortalIntervalPenalty: 4,
  /** Molted Rebirth: shed cycle stays 25 foods (Shed's cadence). */
  moltedRebirthShedEveryFoods: 25,
  moltedRebirthResetLength: 8,
} as const;
