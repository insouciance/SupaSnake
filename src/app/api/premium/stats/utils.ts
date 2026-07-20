/**
 * Premium stats utilities - pure aggregation over game_sessions rows
 * (Lab Analytics, SupaSnake Premium). Kept out of route.ts per the
 * App Router export rules; unit tested directly.
 */

export interface SessionRow {
  score: number | null;
  dna_earned: number | null;
  duration_seconds: number | null;
  foods_collected: number | null;
  extracted: boolean | null;
  dynasty: string | null;
  started_at: string;
}

export interface DynastyStats {
  dynasty: string;
  games: number;
  banked: number;
  bankRate: number;
  bestScore: number;
  bestFoods: number;
  avgFoods: number;
  totalDna: number;
}

export interface OverallStats {
  games: number;
  banked: number;
  bankRate: number;
  totalDna: number;
  totalFoods: number;
  bestScore: number;
  bestFoods: number;
  avgDurationSeconds: number;
}

/** Aggregate session rows into the dashboard shape. */
export function aggregateSessions(rows: SessionRow[]): {
  overall: OverallStats;
  dynasties: DynastyStats[];
} {
  const overall: OverallStats = {
    games: rows.length,
    banked: 0,
    bankRate: 0,
    totalDna: 0,
    totalFoods: 0,
    bestScore: 0,
    bestFoods: 0,
    avgDurationSeconds: 0,
  };
  const byDynasty = new Map<string, DynastyStats>();
  let totalDuration = 0;

  for (const row of rows) {
    const foods = row.foods_collected ?? 0;
    const score = row.score ?? 0;
    const dna = row.dna_earned ?? 0;
    const banked = row.extracted === true;

    if (banked) overall.banked += 1;
    overall.totalDna += dna;
    overall.totalFoods += foods;
    overall.bestScore = Math.max(overall.bestScore, score);
    overall.bestFoods = Math.max(overall.bestFoods, foods);
    totalDuration += row.duration_seconds ?? 0;

    const dynasty = (row.dynasty ?? 'UNKNOWN').toUpperCase();
    const entry = byDynasty.get(dynasty) ?? {
      dynasty,
      games: 0,
      banked: 0,
      bankRate: 0,
      bestScore: 0,
      bestFoods: 0,
      avgFoods: 0,
      totalDna: 0,
    };
    entry.games += 1;
    if (banked) entry.banked += 1;
    entry.bestScore = Math.max(entry.bestScore, score);
    entry.bestFoods = Math.max(entry.bestFoods, foods);
    entry.avgFoods += foods; // running sum; divided below
    entry.totalDna += dna;
    byDynasty.set(dynasty, entry);
  }

  overall.bankRate = overall.games > 0 ? overall.banked / overall.games : 0;
  overall.avgDurationSeconds =
    overall.games > 0 ? Math.round(totalDuration / overall.games) : 0;

  const dynasties = Array.from(byDynasty.values())
    .map((d) => ({
      ...d,
      bankRate: d.games > 0 ? d.banked / d.games : 0,
      avgFoods: d.games > 0 ? Math.round((d.avgFoods / d.games) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.games - a.games);

  return { overall, dynasties };
}
