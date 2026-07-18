/**
 * PB timeline assembly (Player Identity v1 section 7.1) - pure logic,
 * fixture-tested: merge the weekly MAX(score)-per-dynasty rows from
 * chronicle_pb_timeline with cosmetic-acquisition moments (record tiers,
 * mastery rungs) bucketed onto their ISO week.
 */

import type {
  PbAnnotation,
  PbTimelinePoint,
  PbTimelineData,
} from '@/lib/chronicle/types';

/** Raw RPC row (snake_case, as Supabase returns it). */
export interface PbTimelineRow {
  week_start: string;
  dynasty: string;
  best_score: number;
  runs: number;
}

/** Cosmetic acquisition source row (player_cosmetics x definitions). */
export interface AcquisitionRow {
  cosmetic_id: string;
  acquired_at: string | null;
  name: string;
  rarity: string;
  source: string | null;
}

/**
 * Monday 00:00 UTC of the ISO week containing the timestamp - mirrors
 * duel_week_start (011): date_trunc('week', ts AT TIME ZONE 'UTC').
 */
export function isoWeekStart(timestamp: string | Date): string {
  const date = new Date(timestamp);
  const day = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
}

/**
 * Build the timeline: points sorted by week then dynasty, annotations
 * bucketed onto their acquisition week. Only record-tier and mastery
 * moments annotate (the "Gold - High Water" and "M7" beats); other
 * sources (season track, founder backfill) are chapter content, not
 * timeline beats.
 */
export function buildPbTimeline(
  rows: PbTimelineRow[],
  acquisitions: AcquisitionRow[]
): PbTimelineData {
  const points: PbTimelinePoint[] = rows
    .map((row) => ({
      weekStart: String(row.week_start).slice(0, 10),
      dynasty: (row.dynasty || 'CYBER').toUpperCase(),
      bestScore: row.best_score ?? 0,
      runs: row.runs ?? 0,
    }))
    .sort((a, b) =>
      a.weekStart === b.weekStart
        ? a.dynasty.localeCompare(b.dynasty)
        : a.weekStart.localeCompare(b.weekStart)
    );

  const annotations: PbAnnotation[] = acquisitions
    .filter(
      (row) =>
        row.acquired_at &&
        (row.source === 'records' || row.source === 'mastery')
    )
    .map((row) => ({
      weekStart: isoWeekStart(row.acquired_at as string),
      label: row.name,
      rarity: row.rarity,
      cosmeticId: row.cosmetic_id,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return { points, annotations };
}
