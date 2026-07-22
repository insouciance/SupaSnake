/**
 * Clan Gauntlet - Design v2 (GAME_DESIGN_V2.md section 8)
 *
 * TS mirror of migration 020 (supabase/migrations/020_gauntlet.sql) - keep
 * in lockstep. Single source of truth for:
 *
 * - the weekly protocol boundaries (section 8.1): Mon pairing, Wed 00:00
 *   blind-pick lock + reveal, Thu 00:00 - Sun 24:00 scored window
 * - the ban & pick rules (section 8.2): EACH clan picks its OWN dynasty
 *   (its counted runs must be in it - no shared/coin-flipped dynasty),
 *   one self-scoring modifier lens, one mutation ban that is removed from
 *   the OPPONENTS' offer pools in their counted runs
 * - the research tree v1 (section 8.3): 3 branches x 4 nodes, tier costs
 *   6,000 / 14,000 / 24,000 / 40,000, tithe cap 500 DNA/member/week,
 *   exactly one numeric node (logistics_4: +1 counted run, 30 -> 31)
 * - the scoring lens math the SQL applies (mirrored here for tests + the
 *   counted-runs UI indicator) - weights change SCORING only, never DNA
 */

import { isMutationId, type MutationId } from '@/shared/game/mutations';
import { GENES, isGeneId, type GeneId } from '@/shared/game/genes';
import { STRAINS, isStrainId, type StrainId } from '@/shared/game/strains';
import type { DynastyName } from '@/shared/game/rulesets';

export type GauntletBan = `gene:${GeneId}` | `strain:${StrainId}`;
export type GauntletBanLike = GauntletBan | MutationId;

export type ParsedGauntletBan =
  | { kind: 'gene'; id: GeneId }
  | { kind: 'strain'; id: StrainId };

/** Parse migration-032 domains and legacy pre-032 bare mutation ids. */
export function parseGauntletBan(value: unknown): ParsedGauntletBan | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('gene:')) {
    const id = value.slice('gene:'.length);
    return isGeneId(id) ? { kind: 'gene', id } : null;
  }
  if (value.startsWith('strain:')) {
    const id = value.slice('strain:'.length);
    return isStrainId(id) ? { kind: 'strain', id } : null;
  }
  // Deploy window: migration 020/021 stored a bare mutation id.
  return isMutationId(value) ? { kind: 'gene', id: value } : null;
}

export function isGauntletBan(value: unknown): value is GauntletBanLike {
  return parseGauntletBan(value) !== null;
}

export function gauntletBanName(value: unknown): string {
  const parsed = parseGauntletBan(value);
  if (!parsed) return 'Unknown ban';
  return parsed.kind === 'gene'
    ? GENES[parsed.id].name
    : `${STRAINS[parsed.id].name} strain`;
}

/** Hard cap on tithes: 500 DNA per member per week (section 8.3). */
export const TITHE_WEEKLY_CAP = 500;

/** Per-branch node costs by tier (section 8.3). */
export const RESEARCH_TIER_COSTS = [6000, 14000, 24000, 40000] as const;

/** Full tree cost: 3 branches x (6k+14k+24k+40k) = 252,000 (doc anchor). */
export const RESEARCH_TREE_TOTAL = 3 * (6000 + 14000 + 24000 + 40000);

export type ResearchBranch = 'protocols' | 'logistics' | 'heraldry';

export type ResearchNodeId =
  | 'protocols_1' | 'protocols_2' | 'protocols_3' | 'protocols_4'
  | 'logistics_1' | 'logistics_2' | 'logistics_3' | 'logistics_4'
  | 'heraldry_1' | 'heraldry_2' | 'heraldry_3' | 'heraldry_4';

export interface ResearchNode {
  id: ResearchNodeId;
  branch: ResearchBranch;
  /** 1..4 within the branch; node N requires node N-1. */
  tier: 1 | 2 | 3 | 4;
  cost: number;
  name: string;
  description: string;
}

/** The 12-node tree (section 8.3 table), in branch/tier order. */
export const RESEARCH_NODES: readonly ResearchNode[] = [
  {
    id: 'protocols_1', branch: 'protocols', tier: 1, cost: 6000,
    name: 'Anomaly Doctrine',
    description: 'Modifier: anomaly-board runs count, x1.20 (needs the Anomaly board)',
  },
  {
    id: 'protocols_2', branch: 'protocols', tier: 2, cost: 14000,
    name: 'Sudden Death',
    description: 'Modifier: best 10 runs only, x1.40 - high variance',
  },
  {
    id: 'protocols_3', branch: 'protocols', tier: 3, cost: 24000,
    name: 'Second Ban Intel',
    description: 'Pick your ban from 2 slots\' worth of intel - still bans 1',
  },
  {
    id: 'protocols_4', branch: 'protocols', tier: 4, cost: 40000,
    name: 'Dynasty Split Pick',
    description: 'Score 2 dynasties, best-runs pooled',
  },
  {
    id: 'logistics_1', branch: 'logistics', tier: 1, cost: 6000,
    name: 'Scouting Detail',
    description: 'Opponents\' mastery deltas in scouting',
  },
  {
    id: 'logistics_2', branch: 'logistics', tier: 2, cost: 14000,
    name: 'Roster Substitution',
    description: '1 roster substitution per week (injury rule)',
  },
  {
    id: 'logistics_3', branch: 'logistics', tier: 3, cost: 24000,
    name: 'Early Scouting',
    description: 'Sunday 12:00 preview of the next pairing',
  },
  {
    id: 'logistics_4', branch: 'logistics', tier: 4, cost: 40000,
    name: '+1 Counted Run',
    description: '+1 counted run per member (30 -> 31) - the only numeric node',
  },
  {
    id: 'heraldry_1', branch: 'heraldry', tier: 1, cost: 6000,
    name: 'Clan Banner Frame',
    description: 'Cosmetic: clan banner frame',
  },
  {
    id: 'heraldry_2', branch: 'heraldry', tier: 2, cost: 14000,
    name: 'Victory Fanfare',
    description: 'Cosmetic: victory fanfare FX',
  },
  {
    id: 'heraldry_3', branch: 'heraldry', tier: 3, cost: 24000,
    name: 'Board Frame',
    description: 'Cosmetic: board frame in counted runs',
  },
  {
    id: 'heraldry_4', branch: 'heraldry', tier: 4, cost: 40000,
    name: 'Animated Clan Title',
    description: 'Cosmetic: animated clan title',
  },
] as const;

export function isResearchNodeId(value: unknown): value is ResearchNodeId {
  return (
    typeof value === 'string' &&
    RESEARCH_NODES.some((node) => node.id === value)
  );
}

export function researchNode(id: ResearchNodeId): ResearchNode {
  const node = RESEARCH_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown research node ${id}`);
  return node;
}

/** Prerequisite node (tier N-1 of the same branch); null for tier 1. */
export function researchPrereq(id: ResearchNodeId): ResearchNodeId | null {
  const node = researchNode(id);
  if (node.tier === 1) return null;
  return `${node.branch}_${node.tier - 1}` as ResearchNodeId;
}

// ---------------------------------------------------------------------------
// Modifiers (section 8.2 item 2 + research options from section 8.3)
// ---------------------------------------------------------------------------

export type GauntletModifierId =
  | 'vanguard'
  | 'deep_bench'
  | 'extraction_doctrine'
  | 'anomaly_doctrine'
  | 'sudden_death';

export interface GauntletModifier {
  id: GauntletModifierId;
  name: string;
  description: string;
  /** Top members counted (vs base 10). */
  topMembers: number;
  /** Best runs per member counted (vs base 30, before the +1 node). */
  bestRuns: number;
  /** Weight applied to the summed counted DNA (scoring only, never DNA). */
  weight: number;
  /** Only banked (extracted) runs count. */
  extractedOnly: boolean;
  /**
   * Weekly-anomaly runs count too (Anomaly Doctrine, section 8.3 node
   * protocols_1). Every other lens excludes anomaly-board runs from the
   * counted pool (they score on their own weekly board).
   */
  includeAnomaly: boolean;
  /** Research node required to pick it; null = always available. */
  requiresNode: ResearchNodeId | null;
}

export const BASE_TOP_MEMBERS = 10;
export const BASE_BEST_RUNS = 30;

export const GAUNTLET_MODIFIERS: Record<GauntletModifierId, GauntletModifier> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    description: 'Top 8 members count (vs 10); their runs weigh x1.10',
    topMembers: 8, bestRuns: 30, weight: 1.10,
    extractedOnly: false, includeAnomaly: false, requiresNode: null,
  },
  deep_bench: {
    id: 'deep_bench',
    name: 'Deep Bench',
    description: '12 members count; best 25 runs each (vs 30)',
    topMembers: 12, bestRuns: 25, weight: 1.0,
    extractedOnly: false, includeAnomaly: false, requiresNode: null,
  },
  extraction_doctrine: {
    id: 'extraction_doctrine',
    name: 'Extraction Doctrine',
    description: 'Only banked runs count; weigh x1.15',
    topMembers: 10, bestRuns: 30, weight: 1.15,
    extractedOnly: true, includeAnomaly: false, requiresNode: null,
  },
  anomaly_doctrine: {
    id: 'anomaly_doctrine',
    name: 'Anomaly Doctrine',
    description: 'Anomaly-board runs count, x1.20',
    topMembers: 10, bestRuns: 30, weight: 1.20,
    extractedOnly: false, includeAnomaly: true, requiresNode: 'protocols_1',
  },
  sudden_death: {
    id: 'sudden_death',
    name: 'Sudden Death',
    description: 'Best 10 runs only, x1.40 - high variance',
    topMembers: 10, bestRuns: 10, weight: 1.40,
    extractedOnly: false, includeAnomaly: false, requiresNode: 'protocols_2',
  },
};

export function isGauntletModifierId(value: unknown): value is GauntletModifierId {
  return typeof value === 'string' && value in GAUNTLET_MODIFIERS;
}

// ---------------------------------------------------------------------------
// Weekly protocol (section 8.1) - all boundaries in UTC
// ---------------------------------------------------------------------------

export type GauntletPhase = 'picks_open' | 'locked' | 'scoring';

/** Monday 00:00 UTC of the ISO week containing `at` (duel_week_start mirror). */
export function gauntletWeekStart(at: Date = new Date()): Date {
  const utcMidnight = Date.UTC(
    at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()
  );
  const dayOfWeek = at.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(utcMidnight - daysSinceMonday * 86_400_000);
}

const DAY_MS = 86_400_000;

/** Wed 00:00 UTC: blind picks lock, then reveal. */
export function picksDeadline(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 2 * DAY_MS);
}

/** [Thu 00:00, next Mon 00:00) UTC - counted runs only inside it. */
export function scoredWindow(weekStart: Date): { from: Date; to: Date } {
  return {
    from: new Date(weekStart.getTime() + 3 * DAY_MS),
    to: new Date(weekStart.getTime() + 7 * DAY_MS),
  };
}

export function gauntletPhase(weekStart: Date, at: Date = new Date()): GauntletPhase {
  if (at.getTime() < picksDeadline(weekStart).getTime()) return 'picks_open';
  if (at.getTime() < scoredWindow(weekStart).from.getTime()) return 'locked';
  return 'scoring';
}

// ---------------------------------------------------------------------------
// Pick validation (mirror of the submit_gauntlet_picks RPC checks)
// ---------------------------------------------------------------------------

export interface GauntletPicksInput {
  dynasty: DynastyName;
  dynasty2?: DynastyName | null;
  modifier?: GauntletModifierId | null;
  ban?: GauntletBanLike | null;
}

const DYNASTIES: readonly string[] = ['PRIMAL', 'CYBER', 'COSMIC'];

/**
 * Validate a pick submission against the doc's rules + the clan's unlocked
 * research nodes. Returns RPC-style error codes (empty array = valid).
 */
export function validateGauntletPicks(
  input: GauntletPicksInput,
  unlockedNodes: readonly string[]
): string[] {
  const errors: string[] = [];

  if (!DYNASTIES.includes(input.dynasty)) {
    errors.push('INVALID_DYNASTY');
  }

  if (input.dynasty2 != null) {
    if (!DYNASTIES.includes(input.dynasty2) || input.dynasty2 === input.dynasty) {
      errors.push('INVALID_DYNASTY_SPLIT');
    } else if (!unlockedNodes.includes('protocols_4')) {
      errors.push('SPLIT_PICK_LOCKED');
    }
  }

  if (input.modifier != null) {
    const modifier = GAUNTLET_MODIFIERS[input.modifier];
    if (!modifier) {
      errors.push('INVALID_MODIFIER');
    } else if (
      modifier.requiresNode &&
      !unlockedNodes.includes(modifier.requiresNode)
    ) {
      // Anomaly Doctrine is pickable since the Weekly Anomaly board
      // shipped (Phase 4B) - it gates on protocols_1 like any research
      // option (the pre-4B ANOMALY_NOT_LIVE hard block is retired).
      errors.push(`MODIFIER_LOCKED:${modifier.requiresNode}`);
    }
  }

  if (input.ban != null && !isGauntletBan(input.ban)) {
    errors.push('INVALID_BAN');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Effective side rules + counted scoring (mirror of gauntlet_build_side +
// gauntlet_side_score in migration 020)
// ---------------------------------------------------------------------------

/** Per-side effective rules, baked at Wed reveal (JSONB shape from SQL). */
export interface EffectiveSideRules {
  /** null = side never picked: all dynasties count (neutral lens). */
  dynasty: DynastyName | null;
  dynasty2: DynastyName | null;
  modifier: GauntletModifierId | null;
  top_members: number;
  best_runs: number;
  weight: number;
  extracted_only: boolean;
  /**
   * Anomaly-board runs count for this side (Anomaly Doctrine). Absent in
   * pre-021 rules JSON - readers must treat missing as false.
   */
  include_anomaly?: boolean;
  /** Gene removed or strain tier-suppressed by the opponent. */
  banned: GauntletBanLike | null;
}

/**
 * Build a side's effective rules from its picks (or none). Mirrors
 * gauntlet_build_side: the +1 counted-run node (logistics_4) applies to
 * the base-30 lens only (doc: "30 -> 31").
 */
export function buildSideRules(
  picks: GauntletPicksInput | null,
  unlockedNodes: readonly string[],
  bannedAgainst: GauntletBanLike | null = null
): EffectiveSideRules {
  const modifier = picks?.modifier ? GAUNTLET_MODIFIERS[picks.modifier] : null;
  const topMembers = modifier?.topMembers ?? BASE_TOP_MEMBERS;
  let bestRuns = modifier?.bestRuns ?? BASE_BEST_RUNS;
  if (unlockedNodes.includes('logistics_4') && bestRuns === BASE_BEST_RUNS) {
    bestRuns += 1;
  }
  return {
    dynasty: picks?.dynasty ?? null,
    dynasty2: picks?.dynasty2 ?? null,
    modifier: picks?.modifier ?? null,
    top_members: topMembers,
    best_runs: bestRuns,
    weight: modifier?.weight ?? 1.0,
    extracted_only: modifier?.extractedOnly ?? false,
    include_anomaly: modifier?.includeAnomaly ?? false,
    banned: bannedAgainst,
  };
}

/** A completed run, as scoring sees it. */
export interface CountedRunInput {
  memberId: string;
  dnaEarned: number;
  endedAt: Date;
  dynasty: DynastyName;
  extracted: boolean;
  /**
   * True for weekly-anomaly-board runs (Phase 4B). Anomaly runs never
   * count for the Gauntlet unless the side picked Anomaly Doctrine.
   * Optional: pre-4B callers simply omit it.
   */
  anomaly?: boolean;
}

/**
 * Would this run count under the side's rules? (Also drives the UI
 * "counted run" indicator.) rules === null => duels v1 legacy: any
 * completed earning run inside the full week.
 */
export function runCountsForRules(
  run: CountedRunInput,
  rules: EffectiveSideRules | null,
  weekStart: Date
): boolean {
  if (run.dnaEarned <= 0) return false;
  // Anomaly-board runs are excluded from every lens except Anomaly
  // Doctrine (section 8.3 node 1: "anomaly-board runs count, x1.20") -
  // including the legacy no-rules lens.
  if (run.anomaly === true && rules?.include_anomaly !== true) return false;
  const weekEnd = weekStart.getTime() + 7 * DAY_MS;
  if (rules === null) {
    return run.endedAt.getTime() >= weekStart.getTime() && run.endedAt.getTime() < weekEnd;
  }
  const { from, to } = scoredWindow(weekStart);
  if (run.endedAt.getTime() < from.getTime() || run.endedAt.getTime() >= to.getTime()) {
    return false;
  }
  if (
    rules.dynasty !== null &&
    run.dynasty !== rules.dynasty &&
    run.dynasty !== rules.dynasty2
  ) {
    return false;
  }
  if (rules.extracted_only && !run.extracted) return false;
  return true;
}

/**
 * Counted clan score under a side's rules - TS mirror of
 * gauntlet_side_score: filter runs, best-N per member, top-M members,
 * floor(sum x weight). rules === null => legacy top-10/best-30 full week.
 */
export function countedSideScore(
  runs: readonly CountedRunInput[],
  rules: EffectiveSideRules | null,
  weekStart: Date
): number {
  const topMembers = rules?.top_members ?? BASE_TOP_MEMBERS;
  const bestRuns = rules?.best_runs ?? BASE_BEST_RUNS;
  const weight = rules?.weight ?? 1.0;

  const byMember = new Map<string, number[]>();
  for (const run of runs) {
    if (!runCountsForRules(run, rules, weekStart)) continue;
    const list = byMember.get(run.memberId) ?? [];
    list.push(run.dnaEarned);
    byMember.set(run.memberId, list);
  }

  const memberTotals: number[] = [];
  const memberEntries = Array.from(byMember.values());
  for (const dnaList of memberEntries) {
    dnaList.sort((a, b) => b - a);
    memberTotals.push(
      dnaList.slice(0, bestRuns).reduce((sum, dna) => sum + dna, 0)
    );
  }

  memberTotals.sort((a, b) => b - a);
  const total = memberTotals
    .slice(0, topMembers)
    .reduce((sum, dna) => sum + dna, 0);

  return Math.floor(total * weight);
}

/**
 * Remove the opponent's ban from an offer pool (section 8.2 item 3).
 * ban === null (no duel / not resolved / outside the counted window /
 * pre-migration-020) is a no-op - Free Play always passes null.
 */
export function applyGauntletBan<T extends GeneId>(
  pool: readonly T[],
  ban: GauntletBanLike | null
): T[] {
  const parsed = parseGauntletBan(ban);
  if (!parsed || parsed.kind === 'strain') return [...pool];
  return pool.filter((id) => id !== parsed.id);
}

/** A strain ban changes tier activation, not offer availability. */
export function gauntletSuppressedStrains(
  ban: GauntletBanLike | null
): StrainId[] {
  const parsed = parseGauntletBan(ban);
  return parsed?.kind === 'strain' ? [parsed.id] : [];
}
