/**
 * The Analyst — deterministic fact computation (Identity v1 §9).
 *
 * PURE functions only: every number a player ever sees from the Analyst
 * is computed here, in tested TypeScript, from validated telemetry. The
 * LLM's only job (narrate.ts) is turning one of these fact sheets into
 * 2–3 sentences + ≤2 tips — it never sees raw tables, never computes,
 * never chats. The templated fallback (renderFallback.ts) renders the
 * same sheets, so every artifact works end-to-end without a key.
 *
 * Sources: game_sessions rows + the run_events envelope captured since
 * I1 (§9.5 — display/Analyst input ONLY, never payout math), the
 * economy_transactions game_reward metadata, and season aggregates.
 * Shared game math (outcome multipliers, mastery levels) is imported
 * from src/shared/game — never re-derived.
 */

import {
  RunEventEnvelope,
  RunEvent,
} from '@/shared/game/runEvents';
import { outcomeMultipliers, BANK } from '@/shared/game/rulesets';
import type { MutationPick } from '@/shared/game/mutations';
import type { AnomalyId } from '@/shared/game/anomalies';

// ---------------------------------------------------------------------------
// Artifact vocabulary
// ---------------------------------------------------------------------------

export type ArtifactKind =
  | 'run_insight'
  | 'archetype'
  | 'weekly_digest'
  | 'season_recall'
  | 'scout_narration';

/** The validated artifact shape every renderer (LLM or fallback) emits. */
export interface ArtifactContent {
  headline: string;
  body: string;
  tips: string[];
  badge?: string;
}

export type ArchetypeSlug =
  | 'surgeon'
  | 'daredevil'
  | 'loyalist'
  | 'polymath'
  | 'alchemist'
  | 'purist'
  | 'redliner'
  | 'metronome'
  | 'hatchling';

/** Doc §9.6 — display metadata + the seeded badge cosmetic ids (025). */
export const ARCHETYPES: Record<
  ArchetypeSlug,
  { name: string; fantasy: string; badgeId: string }
> = {
  surgeon: { name: 'The Surgeon', fantasy: 'Clinical extraction', badgeId: 'archetype_surgeon' },
  daredevil: { name: 'The Daredevil', fantasy: 'Greed as art', badgeId: 'archetype_daredevil' },
  loyalist: { name: 'The Loyalist', fantasy: 'One dynasty, mastered', badgeId: 'archetype_loyalist' },
  polymath: { name: 'The Polymath', fantasy: 'Fluent in all three', badgeId: 'archetype_polymath' },
  alchemist: { name: 'The Alchemist', fantasy: 'Build maximalist', badgeId: 'archetype_alchemist' },
  purist: { name: 'The Purist', fantasy: 'The snake, unassisted', badgeId: 'archetype_purist' },
  redliner: { name: 'The Redliner', fantasy: 'Lives at tier 4', badgeId: 'archetype_redliner' },
  metronome: { name: 'The Metronome', fantasy: 'Relentless rhythm', badgeId: 'archetype_metronome' },
  hatchling: { name: 'The Hatchling', fantasy: 'Still finding your shape', badgeId: 'archetype_hatchling' },
};

/**
 * Tie priority, specific beats general (doc §9.6). The Hatchling is not
 * in this list — it is the <20-earning-runs fallback, never a winner.
 */
export const ARCHETYPE_PRIORITY: readonly Exclude<ArchetypeSlug, 'hatchling'>[] = [
  'redliner',
  'purist',
  'alchemist',
  'surgeon',
  'daredevil',
  'polymath',
  'loyalist',
  'metronome',
];

// ---------------------------------------------------------------------------
// Small numeric helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Round to 1 decimal — the display precision of every Analyst ratio. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Integer percentage (0–100). */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Median of a numeric array (average of middle two when even). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Run-event stream extraction (portal decisions, near-wall, mutations)
// ---------------------------------------------------------------------------

export interface PortalStats {
  spawns: number;
  passes: number;
  entered: boolean;
  /** Portals passed up before banking; null when the run never banked. */
  passesBeforeBank: number | null;
  /** 1-based ordinal of the portal banked at (passesBeforeBank + 1). */
  bankingPortal: number | null;
}

/** Extract portal decisions from an event stream. Null-envelope safe. */
export function portalStats(envelope: RunEventEnvelope | null): PortalStats {
  const empty: PortalStats = {
    spawns: 0,
    passes: 0,
    entered: false,
    passesBeforeBank: null,
    bankingPortal: null,
  };
  if (!envelope || !Array.isArray(envelope.events)) return empty;

  let spawns = 0;
  let passes = 0;
  let entered = false;
  let passesBeforeBank: number | null = null;
  for (const ev of envelope.events) {
    if (ev.e === 'p') {
      if (ev.k === 'spawn') spawns += 1;
      else if (ev.k === 'pass') passes += 1;
      else if (ev.k === 'enter' && !entered) {
        entered = true;
        passesBeforeBank = passes;
      }
    }
  }
  return {
    spawns,
    passes,
    entered,
    passesBeforeBank,
    bankingPortal: passesBeforeBank !== null ? passesBeforeBank + 1 : null,
  };
}

export interface NearWallStats {
  episodes: number;
  totalDs: number;
  /** Share of the run spent inside the 1-cell wall margin (0..1). */
  ratio: number;
}

/** Near-wall episodes (`w` events carry duration `d` in deciseconds). */
export function nearWallStats(
  envelope: RunEventEnvelope | null,
  durationSeconds: number
): NearWallStats {
  if (!envelope || !Array.isArray(envelope.events) || durationSeconds <= 0) {
    return { episodes: 0, totalDs: 0, ratio: 0 };
  }
  let episodes = 0;
  let totalDs = 0;
  for (const ev of envelope.events) {
    if (ev.e === 'w') {
      episodes += 1;
      totalDs += Math.max(0, ev.d ?? 0);
    }
  }
  const runDs = durationSeconds * 10;
  return {
    episodes,
    totalDs,
    ratio: runDs > 0 ? Math.min(1, totalDs / runDs) : 0,
  };
}

/** Mutation pick ids from the stream (`m` events), in pick order. */
export function mutationEvents(envelope: RunEventEnvelope | null): string[] {
  if (!envelope || !Array.isArray(envelope.events)) return [];
  return envelope.events
    .filter((ev: RunEvent) => ev.e === 'm' && typeof ev.id === 'string')
    .map((ev) => ev.id as string);
}

// ---------------------------------------------------------------------------
// Run insight facts (§9.2 — "the one thing that cost you this run")
// ---------------------------------------------------------------------------

export interface RunFactsInput {
  session: {
    id: string;
    dynasty: string;
    score: number;
    dnaEarned: number;
    durationSeconds: number;
    foodsCollected: number;
    extracted: boolean;
    died: boolean;
    deathCause: string | null;
    isFreePlay?: boolean;
    anomalyId?: string | null;
  };
  runEvents: RunEventEnvelope | null;
  /** economy_transactions game_reward metadata (may be absent). */
  economy: {
    base_dna?: number;
    mutations?: string[];
    phoenix_triggered_at_food?: number | null;
  } | null;
  /** Validated mutation picks from game_sessions.mutations. */
  mutationPicks: MutationPick[];
  /** The player's last-30-day ended sessions (for personal medians). */
  recentSessions: Array<{
    foodsCollected: number;
    durationSeconds: number;
    extracted: boolean;
    dnaEarned: number;
    dynasty: string;
  }>;
}

export interface RunFacts {
  kind: 'run_insight';
  dynasty: string;
  outcome: 'extracted' | 'crashed';
  deathCause: string | null;
  score: number;
  dnaEarned: number;
  foods: number;
  durationSeconds: number;
  freePlay: boolean;
  /** Foods per minute this run vs the player's 30-day median. */
  pace: {
    foodsPerMinute: number;
    personalMedian: number | null;
    deltaPct: number | null;
  };
  nearWall: NearWallStats;
  portals: PortalStats;
  /** Envelope data quality — the narrator is told when data is partial. */
  events: { present: boolean; truncated: boolean; suspect: boolean };
  build: {
    picks: string[];
    held: number;
    phoenixTriggered: boolean;
    synergies: string[];
  };
  /** Deterministic bank-vs-crash arithmetic (shared outcome math). */
  outcomeMath: {
    bankMultiplier: number;
    deathMultiplier: number;
    /** Crashed: what banking would have paid instead of the salvage. */
    missedByCrashing: number | null;
    /** Extracted: what the same run would have salvaged on a crash. */
    protectedByBanking: number | null;
  };
  dynastyContext: {
    recentRuns: number;
    recentRunsInDynasty: number;
    sharePct: number;
  };
}

/** Foods per minute at 1-decimal precision; null-safe on short runs. */
export function foodsPerMinute(foods: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return round1((foods / durationSeconds) * 60);
}

export function buildRunFacts(input: RunFactsInput): RunFacts {
  const s = input.session;
  const env = input.runEvents;
  const portals = portalStats(env);
  const nearWall = nearWallStats(env, s.durationSeconds);

  const picks =
    input.mutationPicks.length > 0
      ? input.mutationPicks.map((p) => p.id)
      : mutationEvents(env);
  const phoenixTriggered =
    (input.economy?.phoenix_triggered_at_food ?? null) !== null;

  const synergies: string[] = [];
  if (picks.includes('compound_interest') && picks.length >= 2) {
    synergies.push('compound_engine');
  }
  if (picks.includes('mirror_wager')) synergies.push('high_wire');
  if (phoenixTriggered) synergies.push('phoenix_rebirth');
  if (picks.length === 0) synergies.push('unassisted');

  // Bank-vs-crash math from the shared outcome multipliers (§10.1: the
  // Analyst never re-derives economy — it re-states the shared spec).
  const mults = outcomeMultipliers(
    input.mutationPicks,
    phoenixTriggered,
    [],
    (s.anomalyId ?? null) as AnomalyId | null
  );
  let missedByCrashing: number | null = null;
  let protectedByBanking: number | null = null;
  if (!s.isFreePlay && s.dnaEarned > 0 && mults.death > 0 && mults.bank > 0) {
    if (s.extracted) {
      const salvage = Math.floor(s.dnaEarned * (mults.death / mults.bank));
      protectedByBanking = Math.max(0, s.dnaEarned - salvage);
    } else {
      const banked = Math.floor(s.dnaEarned * (mults.bank / mults.death));
      missedByCrashing = Math.max(0, banked - s.dnaEarned);
    }
  }

  const thisPace = foodsPerMinute(s.foodsCollected, s.durationSeconds);
  const paces = input.recentSessions
    .filter((r) => r.durationSeconds >= 10 && r.foodsCollected > 0)
    .map((r) => foodsPerMinute(r.foodsCollected, r.durationSeconds));
  const med = median(paces);
  const personalMedian = med === null ? null : round1(med);
  const deltaPct =
    personalMedian && personalMedian > 0
      ? Math.round(((thisPace - personalMedian) / personalMedian) * 100)
      : null;

  const recentRuns = input.recentSessions.length;
  const recentRunsInDynasty = input.recentSessions.filter(
    (r) => r.dynasty === s.dynasty
  ).length;

  return {
    kind: 'run_insight',
    dynasty: s.dynasty,
    outcome: s.extracted ? 'extracted' : 'crashed',
    deathCause: s.deathCause,
    score: s.score,
    dnaEarned: s.dnaEarned,
    foods: s.foodsCollected,
    durationSeconds: s.durationSeconds,
    freePlay: Boolean(s.isFreePlay),
    pace: { foodsPerMinute: thisPace, personalMedian, deltaPct },
    nearWall: {
      episodes: nearWall.episodes,
      totalDs: nearWall.totalDs,
      ratio: round1(nearWall.ratio * 100) / 100,
    },
    portals,
    events: {
      present: Boolean(env),
      truncated: Boolean(env?.truncated),
      suspect: Boolean(env?.suspect),
    },
    build: { picks, held: picks.length, phoenixTriggered, synergies },
    outcomeMath: {
      bankMultiplier: mults.bank,
      deathMultiplier: mults.death,
      missedByCrashing,
      protectedByBanking,
    },
    dynastyContext: {
      recentRuns,
      recentRunsInDynasty,
      sharePct: pct(recentRunsInDynasty, recentRuns),
    },
  };
}

// ---------------------------------------------------------------------------
// Weekly digest facts (§9.2)
// ---------------------------------------------------------------------------

export interface DigestSessionRow {
  dynasty: string;
  dnaEarned: number;
  score: number;
  extracted: boolean;
  died: boolean;
  foodsCollected: number;
  durationSeconds: number;
  deathCause: string | null;
  endedAt: string;
}

export interface DigestFactsInput {
  /** ISO date (Monday) of the week the digest covers. */
  weekStart: string;
  sessions: DigestSessionRow[];
  contracts: { completed: number; claimed: number } | null;
  streak: { current: number } | null;
  /** Records whose tier advanced during the week (name + new tier). */
  recordsAdvanced: Array<{ name: string; tier: number }>;
}

export interface DigestFacts {
  kind: 'weekly_digest';
  weekStart: string;
  runs: number;
  earningRuns: number;
  extractions: number;
  extractionRatePct: number;
  totalDna: number;
  bestScore: number;
  bestDnaRun: number;
  activeDays: number;
  dynastyRuns: Record<string, number>;
  topDynasty: string | null;
  deathCauses: Record<string, number>;
  contracts: { completed: number; claimed: number } | null;
  streak: number | null;
  recordsAdvanced: Array<{ name: string; tier: number }>;
}

export function buildDigestFacts(input: DigestFactsInput): DigestFacts {
  const sessions = input.sessions;
  const earning = sessions.filter((s) => s.dnaEarned > 0);
  const extractions = earning.filter((s) => s.extracted).length;

  const dynastyRuns: Record<string, number> = {};
  const deathCauses: Record<string, number> = {};
  const days = new Set<string>();
  let totalDna = 0;
  let bestScore = 0;
  let bestDnaRun = 0;
  for (const s of sessions) {
    days.add(s.endedAt.slice(0, 10));
    if (s.dnaEarned > 0) {
      dynastyRuns[s.dynasty] = (dynastyRuns[s.dynasty] ?? 0) + 1;
      totalDna += s.dnaEarned;
      if (s.dnaEarned > bestDnaRun) bestDnaRun = s.dnaEarned;
    }
    if (s.score > bestScore) bestScore = s.score;
    if (s.died && s.deathCause) {
      deathCauses[s.deathCause] = (deathCauses[s.deathCause] ?? 0) + 1;
    }
  }
  const topDynasty =
    Object.entries(dynastyRuns).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] ?? null;

  return {
    kind: 'weekly_digest',
    weekStart: input.weekStart,
    runs: sessions.length,
    earningRuns: earning.length,
    extractions,
    extractionRatePct: pct(extractions, earning.length),
    totalDna,
    bestScore,
    bestDnaRun,
    activeDays: days.size,
    dynastyRuns,
    topDynasty,
    deathCauses,
    contracts: input.contracts,
    streak: input.streak?.current ?? null,
    recordsAdvanced: input.recordsAdvanced,
  };
}

// ---------------------------------------------------------------------------
// Archetype facts + detection (§9.6 — the heuristics, EXACT)
// ---------------------------------------------------------------------------

export interface SeasonRunRow {
  dynasty: string;
  dnaEarned: number;
  score: number;
  extracted: boolean;
  died: boolean;
  foodsCollected: number;
  durationSeconds: number;
  endedAt: string;
  runEvents: RunEventEnvelope | null;
  /** Mutations held at run end (validated picks count); null = unknown. */
  mutationsHeld: number | null;
}

export interface ArchetypeFactsInput {
  seasonSeq: number;
  /** All ended, non-free sessions inside the season window. */
  runs: SeasonRunRow[];
  masteryLevels: Record<string, number>;
  /** Season contract tallies (picked vs completed); null pre-data. */
  contracts: { picked: number; completed: number } | null;
  /** Weeks of the season that have fully or partly elapsed (1..7). */
  seasonWeeks: number;
}

export interface ArchetypeFacts {
  kind: 'archetype';
  seasonSeq: number;
  earningRuns: number;
  extractionRatePct: number;
  medianBankingPortal: number | null;
  meanPortalsPassed: number;
  dnaLostToSalvagePct: number;
  dynastySharesPct: Record<string, number>;
  masteryLevels: Record<string, number>;
  meanMutationsHeld: number;
  /** Estimated offer acceptance (offers modeled from the §7 cadence). */
  offerAcceptPct: number | null;
  cyber: { runs: number; tier4Pct: number; tier4Banked: number };
  rhythm: {
    weeksActive: number;
    seasonWeeks: number;
    fiveDayWeeks: number;
    fiveDayWeekSharePct: number;
  };
  contractCompletionPct: number | null;
}

/**
 * Deterministic offer estimate from the shared cadence (§GDv2 7): first
 * mutation food eligible at 15, then every ~20 foods. Offers are not in
 * telemetry, so the acceptance axis uses this model — documented, exact,
 * testable.
 */
export function estimatedOffers(foods: number): number {
  if (foods < 15) return 0;
  return Math.floor((foods - 15) / 20) + 1;
}

export function buildArchetypeFacts(input: ArchetypeFactsInput): ArchetypeFacts {
  const earning = input.runs.filter((r) => r.dnaEarned > 0);

  // Extraction + banking-portal axes
  const extractions = earning.filter((r) => r.extracted);
  const bankingPortals: number[] = [];
  const passedCounts: number[] = [];
  for (const r of earning) {
    const p = portalStats(r.runEvents);
    if (r.runEvents) passedCounts.push(p.passes);
    if (r.extracted && p.bankingPortal !== null) {
      bankingPortals.push(p.bankingPortal);
    }
  }
  const medBankPortal = median(bankingPortals);

  // Salvage-loss axis: potential = what each run would have paid banked
  // (baseline BANK multipliers — per-run builds average out over a season)
  let potential = 0;
  let lost = 0;
  for (const r of earning) {
    if (r.extracted) {
      potential += r.dnaEarned;
    } else {
      const banked = Math.floor(
        r.dnaEarned * (BANK.extractMultiplier / BANK.deathMultiplier)
      );
      potential += banked;
      lost += Math.max(0, banked - r.dnaEarned);
    }
  }

  // Dynasty shares
  const dynastyCounts: Record<string, number> = {};
  for (const r of earning) {
    dynastyCounts[r.dynasty] = (dynastyCounts[r.dynasty] ?? 0) + 1;
  }
  const dynastySharesPct: Record<string, number> = {};
  for (const d of ['PRIMAL', 'CYBER', 'COSMIC']) {
    dynastySharesPct[d] = pct(dynastyCounts[d] ?? 0, earning.length);
  }

  // Build axes
  const heldCounts = earning.map((r) =>
    r.mutationsHeld !== null
      ? r.mutationsHeld
      : mutationEvents(r.runEvents).length
  );
  const meanHeld =
    heldCounts.length > 0
      ? round1(heldCounts.reduce((a, b) => a + b, 0) / heldCounts.length)
      : 0;
  const offers = earning.reduce(
    (sum, r) => sum + estimatedOffers(r.foodsCollected),
    0
  );
  const accepted = heldCounts.reduce((a, b) => a + b, 0);
  const offerAcceptPct =
    offers > 0 ? Math.min(100, pct(accepted, offers)) : null;

  // Redliner axes (CYBER tier 4 = ≥20 foods, shared cyberTier math)
  const cyberRuns = earning.filter((r) => r.dynasty === 'CYBER');
  const tier4Runs = cyberRuns.filter((r) => r.foodsCollected >= 20);
  const tier4Banked = tier4Runs.filter((r) => r.extracted).length;

  // Metronome axes: distinct play days per season week
  const daysByWeek = new Map<number, Set<string>>();
  for (const r of earning) {
    const day = r.endedAt.slice(0, 10);
    const week = weekIndexOf(day, input.runs);
    if (!daysByWeek.has(week)) daysByWeek.set(week, new Set());
    daysByWeek.get(week)!.add(day);
  }
  const fiveDayWeeks = Array.from(daysByWeek.values()).filter(
    (days) => days.size >= 5
  ).length;
  const seasonWeeks = Math.max(1, input.seasonWeeks);

  const contractCompletionPct =
    input.contracts && input.contracts.picked > 0
      ? pct(input.contracts.completed, input.contracts.picked)
      : null;

  return {
    kind: 'archetype',
    seasonSeq: input.seasonSeq,
    earningRuns: earning.length,
    extractionRatePct: pct(extractions.length, earning.length),
    medianBankingPortal: medBankPortal === null ? null : round1(medBankPortal),
    meanPortalsPassed:
      passedCounts.length > 0
        ? round1(
            passedCounts.reduce((a, b) => a + b, 0) / passedCounts.length
          )
        : 0,
    dnaLostToSalvagePct: pct(lost, potential),
    dynastySharesPct,
    masteryLevels: input.masteryLevels,
    meanMutationsHeld: meanHeld,
    offerAcceptPct,
    cyber: {
      runs: cyberRuns.length,
      tier4Pct: pct(tier4Runs.length, cyberRuns.length),
      tier4Banked,
    },
    rhythm: {
      weeksActive: daysByWeek.size,
      seasonWeeks,
      fiveDayWeeks,
      fiveDayWeekSharePct: pct(fiveDayWeeks, seasonWeeks),
    },
    contractCompletionPct,
  };
}

/**
 * ISO-week bucket of a day relative to the earliest run in the season
 * window (weeks are Monday-aligned upstream; the bucket index only needs
 * to be stable within a season, not calendar-exact).
 */
function weekIndexOf(day: string, runs: SeasonRunRow[]): number {
  let earliest: string | null = null;
  for (const r of runs) {
    const d = r.endedAt.slice(0, 10);
    if (earliest === null || d < earliest) earliest = d;
  }
  if (earliest === null) return 0;
  const ms = Date.parse(day + 'T00:00:00Z') - Date.parse(earliest + 'T00:00:00Z');
  return Math.floor(ms / (7 * 24 * 3600 * 1000));
}

export interface ArchetypeDetection {
  archetype: ArchetypeSlug;
  /** Every archetype whose floor was met, in priority order. */
  qualified: Exclude<ArchetypeSlug, 'hatchling'>[];
  /** Ratio-to-floor score per archetype (≥1 = qualified). */
  scores: Record<Exclude<ArchetypeSlug, 'hatchling'>, number>;
}

/**
 * Doc §9.6, EXACT: compute every axis score, assign the highest above
 * its floor; ties break by ARCHETYPE_PRIORITY; fewer than 20 earning
 * runs ⇒ The Hatchling. AND-conditions score as the min of their
 * component ratios, OR-conditions as the max — so score ≥ 1 iff the
 * heuristic passes. When nothing reaches its floor, the highest partial
 * score wins (priority on ties) so every ≥20-run season resolves.
 */
export function detectArchetype(f: ArchetypeFacts): ArchetypeDetection {
  const scores: Record<Exclude<ArchetypeSlug, 'hatchling'>, number> = {
    // ≥30% of CYBER runs reach tier 4 AND ≥5 banked from tier 4
    redliner:
      f.cyber.runs > 0
        ? Math.min(f.cyber.tier4Pct / 30, f.cyber.tier4Banked / 5)
        : 0,
    // Mean mutations held ≤0.5 across ≥20 runs (lower is better)
    purist:
      f.earningRuns >= 20
        ? (0.5 + 0.1) / (f.meanMutationsHeld + 0.1)
        : 0,
    // Mean held ≥2.5 AND ≥70% of offers accepted
    alchemist: Math.min(
      f.meanMutationsHeld / 2.5,
      (f.offerAcceptPct ?? 0) / 70
    ),
    // Extraction rate ≥65% AND median banking portal ≤2
    surgeon:
      f.medianBankingPortal !== null && f.medianBankingPortal > 0
        ? Math.min(f.extractionRatePct / 65, 2 / f.medianBankingPortal)
        : 0,
    // Mean portals passed ≥2.5 OR ≥40% of potential DNA lost to salvage
    daredevil: Math.max(
      f.meanPortalsPassed / 2.5,
      f.dnaLostToSalvagePct / 40
    ),
    // Every dynasty ≥20% of runs AND every mastery ≥M3
    polymath: Math.min(
      Math.min(
        ...['PRIMAL', 'CYBER', 'COSMIC'].map(
          (d) => (f.dynastySharesPct[d] ?? 0) / 20
        )
      ),
      Math.min(
        ...['PRIMAL', 'CYBER', 'COSMIC'].map(
          (d) => (f.masteryLevels[d] ?? 0) / 3
        )
      )
    ),
    // ≥80% of earning runs in a single dynasty
    loyalist:
      Math.max(...Object.values(f.dynastySharesPct), 0) / 80,
    // ≥5 days/week on ≥60% of season weeks AND contract completion ≥80%
    metronome: Math.min(
      f.rhythm.fiveDayWeekSharePct / 60,
      (f.contractCompletionPct ?? 0) / 80
    ),
  };

  if (f.earningRuns < 20) {
    return { archetype: 'hatchling', qualified: [], scores };
  }

  const qualified = ARCHETYPE_PRIORITY.filter((slug) => scores[slug] >= 1);
  if (qualified.length > 0) {
    return { archetype: qualified[0], qualified, scores };
  }

  // Nothing above its floor: highest partial score, priority on ties.
  let best: Exclude<ArchetypeSlug, 'hatchling'> = ARCHETYPE_PRIORITY[0];
  for (const slug of ARCHETYPE_PRIORITY) {
    if (scores[slug] > scores[best]) best = slug;
  }
  return { archetype: best, qualified: [], scores };
}

// ---------------------------------------------------------------------------
// Season Recall facts (§9.2 — the shareable Wrapped-style card)
// ---------------------------------------------------------------------------

export interface RecallFactsInput {
  seasonSeq: number;
  seasonName: string | null;
  /** All ended, non-free sessions inside the season window. */
  runs: Array<{
    dynasty: string;
    dnaEarned: number;
    score: number;
    extracted: boolean;
    endedAt: string;
  }>;
  /** Variants first acquired during the season. */
  variantsAcquired: number;
  /** Mastery levels at season end. */
  masteryLevels: Record<string, number>;
  /** Cosmetic names earned during the season (badges, titles, trails). */
  badgesEarned: string[];
  clan: {
    name: string;
    tag: string;
    duelWins: number;
    duelLosses: number;
    champion: boolean;
  } | null;
  archetype: ArchetypeSlug | null;
}

export interface RecallFacts {
  kind: 'season_recall';
  seasonSeq: number;
  seasonName: string | null;
  totalRuns: number;
  earningRuns: number;
  totalDna: number;
  bestScore: number;
  bestDnaRun: number;
  extractions: number;
  extractionRatePct: number;
  activeDays: number;
  favoriteDynasty: string | null;
  dynastyRuns: Record<string, number>;
  variantsAcquired: number;
  masteryLevels: Record<string, number>;
  badgesEarned: string[];
  clan: RecallFactsInput['clan'];
  archetype: ArchetypeSlug | null;
  archetypeName: string | null;
}

export function buildRecallFacts(input: RecallFactsInput): RecallFacts {
  const earning = input.runs.filter((r) => r.dnaEarned > 0);
  const extractions = earning.filter((r) => r.extracted).length;
  const dynastyRuns: Record<string, number> = {};
  const days = new Set<string>();
  let totalDna = 0;
  let bestScore = 0;
  let bestDnaRun = 0;
  for (const r of input.runs) {
    days.add(r.endedAt.slice(0, 10));
    if (r.score > bestScore) bestScore = r.score;
    if (r.dnaEarned > 0) {
      totalDna += r.dnaEarned;
      dynastyRuns[r.dynasty] = (dynastyRuns[r.dynasty] ?? 0) + 1;
      if (r.dnaEarned > bestDnaRun) bestDnaRun = r.dnaEarned;
    }
  }
  const favoriteDynasty =
    Object.entries(dynastyRuns).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] ?? null;

  return {
    kind: 'season_recall',
    seasonSeq: input.seasonSeq,
    seasonName: input.seasonName,
    totalRuns: input.runs.length,
    earningRuns: earning.length,
    totalDna,
    bestScore,
    bestDnaRun,
    extractions,
    extractionRatePct: pct(extractions, earning.length),
    activeDays: days.size,
    favoriteDynasty,
    dynastyRuns,
    variantsAcquired: input.variantsAcquired,
    masteryLevels: input.masteryLevels,
    badgesEarned: input.badgesEarned.slice(0, 12),
    clan: input.clan,
    archetype: input.archetype,
    archetypeName: input.archetype ? ARCHETYPES[input.archetype].name : null,
  };
}

// ---------------------------------------------------------------------------
// Gauntlet scouting facts (§9.2 — from the get_gauntlet scouting block)
// ---------------------------------------------------------------------------

export interface ScoutFactsInput {
  weekStart: string;
  opponent: { name: string; tag: string; rating: number };
  scouting: {
    roster: Array<{
      name: string;
      mastery: Record<string, { level: number; xp?: number }>;
    }>;
    lastPicks: Array<{
      weekStart: string;
      dynasty: string | null;
      dynasty2?: string | null;
      modifier?: string | null;
      ban?: string | null;
    }>;
    detail: boolean;
  };
}

export interface ScoutFacts {
  kind: 'scout_narration';
  weekStart: string;
  opponent: { name: string; tag: string; rating: number };
  rosterSize: number;
  /** Per dynasty: members at M5+ and the highest level fielded. */
  masteryProfile: Record<string, { m5Plus: number; maxLevel: number }>;
  /** The dynasty their roster is deepest in (by summed levels). */
  deepestDynasty: string | null;
  pickHistory: {
    weeks: number;
    dynastyCounts: Record<string, number>;
    repeatedDynasty: string | null;
    modifiers: string[];
    bans: string[];
  };
  detail: boolean;
}

export function buildScoutFacts(input: ScoutFactsInput): ScoutFacts {
  const masteryProfile: Record<string, { m5Plus: number; maxLevel: number }> =
    {};
  const depth: Record<string, number> = {};
  for (const member of input.scouting.roster) {
    for (const [dynasty, m] of Object.entries(member.mastery ?? {})) {
      const level = m?.level ?? 0;
      if (!masteryProfile[dynasty]) {
        masteryProfile[dynasty] = { m5Plus: 0, maxLevel: 0 };
      }
      if (level >= 5) masteryProfile[dynasty].m5Plus += 1;
      if (level > masteryProfile[dynasty].maxLevel) {
        masteryProfile[dynasty].maxLevel = level;
      }
      depth[dynasty] = (depth[dynasty] ?? 0) + level;
    }
  }
  const deepestDynasty =
    Object.entries(depth).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0]?.[0] ?? null;

  const dynastyCounts: Record<string, number> = {};
  const modifiers: string[] = [];
  const bans: string[] = [];
  for (const pick of input.scouting.lastPicks) {
    for (const d of [pick.dynasty, pick.dynasty2]) {
      if (d) dynastyCounts[d] = (dynastyCounts[d] ?? 0) + 1;
    }
    if (pick.modifier) modifiers.push(pick.modifier);
    if (pick.ban) bans.push(pick.ban);
  }
  const repeated = Object.entries(dynastyCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    kind: 'scout_narration',
    weekStart: input.weekStart,
    opponent: input.opponent,
    rosterSize: input.scouting.roster.length,
    masteryProfile,
    deepestDynasty,
    pickHistory: {
      weeks: input.scouting.lastPicks.length,
      dynastyCounts,
      repeatedDynasty: repeated[0]?.[0] ?? null,
      modifiers,
      bans,
    },
    detail: input.scouting.detail,
  };
}

export type AnalystFacts =
  | RunFacts
  | DigestFacts
  | ArchetypeFacts
  | RecallFacts
  | ScoutFacts;
