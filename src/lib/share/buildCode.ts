/**
 * The build code — a Workbench plan, addressable as a URL (WP-2.08).
 *
 * WHY THE PLAN TRAVELS IN THE LINK RATHER THAN IN A LOOKUP
 *
 * The same argument `lineageCode.ts:12-15` makes for a snake, made for a
 * plan: a shared build has to render for a stranger who is not logged in,
 * from a link that outlives the session that made it, without exposing a
 * player's collection to enumeration and without a new public table. So the
 * plan's seven facts ride in the path segment, and `/b/<code>` is a pure
 * function of them. No DB, no auth, no migration.
 *
 * That means a build code is FORGEABLE, and the design accepts it — but the
 * acceptance costs one thing that a lineage card did not have to pay:
 *
 * ── THE CARD CARRIES NO PROJECTED YIELD ──────────────────────────────────
 *
 * A lineage card is a portrait, and portraits are not evidence. A build card
 * is a RECIPE, and a recipe is not evidence either — but a Yield number
 * printed on one would be, because Yield is the currency the whole metagame
 * settles in. Anyone could type "9,999" into a code and the card would render
 * it as though the game had said it, which is a leaderboard-shaped claim
 * arriving through a channel that settles nothing (Rule 11). So the card
 * carries what the code can honestly describe — the ordered genes, the
 * strains they reach, and the week they were planned against — and no
 * projection at all. The projection lives on the Workbench, where it is
 * computed from the reader's OWN inventory and labelled a floor.
 *
 * There is no Score on it either, for the reason `workbench.ts` explains at
 * length: Score is independent of build by Rule 2.
 *
 * ── FORMAT — deliberately readable, not base64 ───────────────────────────
 *
 *     Vyper~CYBER~4~gold_trail,tithe,loan_shark~gold_rush~clause:deep_apex~2
 *     └name┘ └dyn┘ │g│ └──── genes, in PICK ORDER ────┘ └anomaly┘ └clause┘ │
 *                                                                    infuses┘
 *
 * Seven `~`-separated, percent-encoded fields, so a code survives being read
 * aloud, is obvious in a log, and needs no binary codec that would have to
 * behave identically in Node, the browser and the Edge runtime the OG images
 * render in. The anomaly and clause fields may be EMPTY — that is a plan made
 * against a neutral week, which is a real thing to plan against — but the
 * field itself is never absent, because a variable field count is exactly the
 * fragility that made extending `decodeLineageCode` the worse option.
 *
 * ── IT REFUSES, IT NEVER REPAIRS ─────────────────────────────────────────
 *
 * `decodeBuildCode` returns `null` for anything malformed and the route 404s.
 * The difference from `decodeLineageCode` is deliberate and it is the whole
 * point of this file: that decoder SKIPS an unrecognised gene, because a
 * portrait missing one gene is still that snake. A PLAN missing one gene is a
 * different plan — the order is the plan, and dropping a link from the middle
 * of a chain silently changes which splices form and which tiers land. So an
 * unknown gene, a duplicate, an over-long list, an unknown clause, an unknown
 * anomaly and a generation of 0 are each a refusal. A card of guesses is
 * worse than a 404, because a 404 is honest about not knowing.
 */

import { GENES, GENOME_SPAWN, isGeneId, type GeneId } from '@/shared/game/genes';
import { isAnomalyId, type AnomalyId } from '@/shared/game/anomalies';
import { strainActivations } from '@/shared/game/genome';
import {
  STRAIN_PHYSICS,
  STRAIN_IDS,
  type StrainId,
  type StrainTier,
} from '@/shared/game/strains';
import { strainTierLabel } from '@/shared/game/lexicon';
import {
  conditionFromAnomaly,
  conditionStrainThresholdDelta,
  conditionSuppressedStrains,
  isConditionClauseId,
  worldConditionName,
  type ConditionClauseId,
  type WorldCondition,
} from '@/shared/game/worldCondition';

export interface BuildCardModel {
  snakeName: string;
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC';
  generation: number;
  /** Genes in PICK ORDER. The order is the plan. */
  genes: GeneId[];
  /** The week's anomaly the plan was made against, or null for a neutral one. */
  anomaly: AnomalyId | null;
  /** The week's clause, or null. */
  clause: ConditionClauseId | null;
  /** Portals spent on INFUSE rather than BANK or PASS. */
  infuses: number;
}

const DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'] as const;
type Dynasty = (typeof DYNASTIES)[number];

/** Names longer than this are truncated: a card has finite width. */
export const MAX_SNAKE_NAME = 24;
export const MAX_GENERATION = 9999;
/** A plan holds no more genes than a run can — the engine's own ceiling. */
export const MAX_BUILD_GENES: number = GENOME_SPAWN.maxHeld;
/** And no more infuses than a run allows. */
export const MAX_BUILD_INFUSES: number = STRAIN_PHYSICS.infuseMaxPerRun;
/**
 * The whole code, bounded. Generous enough for the longest legal plan with a
 * fully percent-encoded name, and short enough that no code can be used as a
 * payload. Anti-abuse only; a real code is a fraction of this.
 */
export const MAX_BUILD_CODE = 400;

function encodeField(value: string): string {
  // encodeURIComponent leaves `~` alone, and `~` is our separator.
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

function isDynasty(value: string): value is Dynasty {
  return (DYNASTIES as readonly string[]).includes(value);
}

export function encodeBuildCode(model: BuildCardModel): string {
  const name = model.snakeName.trim().slice(0, MAX_SNAKE_NAME) || 'Snake';
  const generation = Math.min(
    MAX_GENERATION,
    Math.max(1, Math.floor(model.generation) || 1)
  );
  const genes = model.genes.slice(0, MAX_BUILD_GENES).join(',');
  const infuses = Math.min(MAX_BUILD_INFUSES, Math.max(0, Math.floor(model.infuses) || 0));
  return [
    encodeField(name),
    model.dynasty,
    String(generation),
    encodeField(genes),
    encodeField(model.anomaly ?? ''),
    encodeField(model.clause ?? ''),
    String(infuses),
  ].join('~');
}

/**
 * Decode a code from a URL segment. Returns null for anything malformed — an
 * unreadable code must 404, never render a card of guesses.
 */
export function decodeBuildCode(raw: unknown): BuildCardModel | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_BUILD_CODE) {
    return null;
  }

  let decodedSegment: string;
  try {
    // Next hands route params already percent-decoded once; a code that
    // arrives raw (a hand-typed link, a test) decodes to the same thing.
    decodedSegment = raw.includes('~') ? raw : decodeURIComponent(raw);
  } catch {
    return null;
  }

  const parts = decodedSegment.split('~');
  if (parts.length !== 7) return null;

  let name: string;
  let geneField: string;
  let anomalyField: string;
  let clauseField: string;
  try {
    name = decodeURIComponent(parts[0]).trim().slice(0, MAX_SNAKE_NAME);
    geneField = decodeURIComponent(parts[3]).trim();
    anomalyField = decodeURIComponent(parts[4]).trim();
    clauseField = decodeURIComponent(parts[5]).trim();
  } catch {
    return null;
  }
  if (name.length === 0) return null;

  const dynasty = parts[1];
  if (!isDynasty(dynasty)) return null;

  // Generation 0 is refused rather than promoted to 1: a code that does not
  // name a real generation is malformed, and silently repairing it would put
  // a number on the card that nobody wrote.
  if (!/^\d{1,4}$/.test(parts[2])) return null;
  const generation = Number(parts[2]);
  if (generation < 1 || generation > MAX_GENERATION) return null;

  // The genes, refused whole. See the header: skipping one would change the
  // plan rather than abbreviate it.
  const genes: GeneId[] = [];
  if (geneField.length > 0) {
    for (const id of geneField.split(',')) {
      if (!isGeneId(id)) return null;
      if (genes.includes(id)) return null;
      genes.push(id);
    }
  }
  if (genes.length > MAX_BUILD_GENES) return null;

  // An empty context field is a neutral week, which is a real plan. A
  // non-empty one that this build cannot name is a refusal.
  let anomaly: AnomalyId | null = null;
  if (anomalyField.length > 0) {
    if (!isAnomalyId(anomalyField)) return null;
    anomaly = anomalyField;
  }
  let clause: ConditionClauseId | null = null;
  if (clauseField.length > 0) {
    if (!isConditionClauseId(clauseField)) return null;
    clause = clauseField;
  }

  if (!/^\d{1,2}$/.test(parts[6])) return null;
  const infuses = Number(parts[6]);
  if (infuses > MAX_BUILD_INFUSES) return null;

  return { snakeName: name, dynasty, generation, genes, anomaly, clause, infuses };
}

/** Display names for the card and the share text, in pick order. */
export function buildGeneNames(model: BuildCardModel): string[] {
  return model.genes.map((id) => GENES[id].name);
}

/** The condition the plan was made against, composed exactly as a run does. */
export function buildCondition(model: BuildCardModel): WorldCondition {
  return conditionFromAnomaly(model.anomaly, model.clause ? [model.clause] : []);
}

/** The week the plan names, in the words every other surface uses for it. */
export function buildContextName(model: BuildCardModel): string {
  return worldConditionName(buildCondition(model));
}

/** One strain the plan reaches, and how far. */
export interface BuildStrainReach {
  strain: StrainId;
  tier: StrainTier;
  label: string;
}

/**
 * The strains this PLAN reaches on its own.
 *
 * Resolved by `strainActivations` — the engine's own tier resolver, honouring
 * the week's suppressions and threshold shifts — never by comparing points to
 * a threshold here. What it deliberately does NOT include is the reader's
 * lineage, their Heirloom traits or their account's FTUE ceiling, because a
 * code carries none of those and inventing them would be the same forgery the
 * missing Yield number avoids. So this is the plan's own reach, and the card
 * says so in those words.
 *
 * Only strains that activate at all are returned, in catalogue order.
 */
export function buildStrainReach(model: BuildCardModel): BuildStrainReach[] {
  const picks = model.genes.map((id, index) => ({
    id,
    atFood: (index + 1) * GENOME_SPAWN.intervalBase,
  }));
  const condition = buildCondition(model);
  const activations = strainActivations(
    picks,
    {},
    [],
    3,
    conditionSuppressedStrains(condition),
    conditionStrainThresholdDelta(condition)
  );
  const reach: BuildStrainReach[] = [];
  for (const strain of STRAIN_IDS) {
    const activation = activations[strain];
    const tier: StrainTier =
      activation.apexAt !== null ? 3 : activation.expressionAt !== null ? 2 : activation.minorAt !== null ? 1 : 0;
    if (tier > 0) reach.push({ strain, tier, label: strainTierLabel(strain, tier) });
  }
  return reach;
}
