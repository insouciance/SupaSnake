/**
 * PB timeline fixtures (Player Identity v1 section 7.1): weekly
 * MAX(score)-per-dynasty assembly + moment annotations - bucketing,
 * ordering, and the records/mastery-only annotation filter.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildPbTimeline,
  isoWeekStart,
  type AcquisitionRow,
  type PbTimelineRow,
} from '@/lib/chronicle/pbTimeline';

describe('isoWeekStart', () => {
  it('maps any timestamp to its ISO Monday (UTC), mirroring duel_week_start', () => {
    expect(isoWeekStart('2026-07-15T10:30:00.000Z')).toBe('2026-07-13'); // Wednesday
    expect(isoWeekStart('2026-07-13T00:00:00.000Z')).toBe('2026-07-13'); // Monday itself
    expect(isoWeekStart('2026-07-19T23:59:59.000Z')).toBe('2026-07-13'); // Sunday
    expect(isoWeekStart('2026-07-20T00:00:00.000Z')).toBe('2026-07-20'); // next Monday
  });

  it('handles Sunday as the last day of the ISO week (not the first)', () => {
    // 2026-07-12 is a Sunday -> belongs to the week of Monday 2026-07-06
    expect(isoWeekStart('2026-07-12T12:00:00.000Z')).toBe('2026-07-06');
  });
});

describe('buildPbTimeline', () => {
  const rows: PbTimelineRow[] = [
    { week_start: '2026-07-20', dynasty: 'CYBER', best_score: 420, runs: 5 },
    { week_start: '2026-07-13', dynasty: 'PRIMAL', best_score: 310, runs: 2 },
    { week_start: '2026-07-13', dynasty: 'CYBER', best_score: 250, runs: 3 },
  ];

  it('sorts points by week then dynasty', () => {
    const { points } = buildPbTimeline(rows, []);
    expect(points.map((p) => `${p.weekStart}:${p.dynasty}`)).toEqual([
      '2026-07-13:CYBER',
      '2026-07-13:PRIMAL',
      '2026-07-20:CYBER',
    ]);
    expect(points[0]).toEqual({
      weekStart: '2026-07-13',
      dynasty: 'CYBER',
      bestScore: 250,
      runs: 3,
    });
  });

  it('buckets record-tier and mastery acquisitions onto their ISO week', () => {
    const acquisitions: AcquisitionRow[] = [
      {
        cosmetic_id: 'record_high_water_t3',
        acquired_at: '2026-07-22T09:00:00.000Z', // Wednesday of the 07-20 week
        name: 'High Water — Gold',
        rarity: 'rare',
        source: 'records',
      },
      {
        cosmetic_id: 'mastery_cyber_emblem_2',
        acquired_at: '2026-07-14T18:00:00.000Z',
        name: 'Cyber Emblem II',
        rarity: 'rare',
        source: 'mastery',
      },
    ];
    const { annotations } = buildPbTimeline(rows, acquisitions);
    expect(annotations).toEqual([
      {
        weekStart: '2026-07-13',
        label: 'Cyber Emblem II',
        rarity: 'rare',
        cosmeticId: 'mastery_cyber_emblem_2',
      },
      {
        weekStart: '2026-07-20',
        label: 'High Water — Gold',
        rarity: 'rare',
        cosmeticId: 'record_high_water_t3',
      },
    ]);
  });

  it('only records/mastery moments annotate - season/founder grants are chapter content', () => {
    const acquisitions: AcquisitionRow[] = [
      {
        cosmetic_id: 'solstice_badge',
        acquired_at: '2026-07-21T00:00:00.000Z',
        name: 'Solstice Badge',
        rarity: 'rare',
        source: 'season_track',
      },
      {
        cosmetic_id: 'badge_founder',
        acquired_at: '2026-07-21T00:00:00.000Z',
        name: 'Founding Handler',
        rarity: 'legendary',
        source: 'founder_backfill',
      },
      {
        cosmetic_id: 'record_vault_t1',
        acquired_at: null, // no timestamp = no beat
        name: 'The Vault — Bronze',
        rarity: 'common',
        source: 'records',
      },
    ];
    const { annotations } = buildPbTimeline(rows, acquisitions);
    expect(annotations).toEqual([]);
  });

  it('empty inputs produce an empty timeline (the section renders its prompt)', () => {
    expect(buildPbTimeline([], [])).toEqual({ points: [], annotations: [] });
  });

  it('normalizes dynasty casing and defaults', () => {
    const { points } = buildPbTimeline(
      [{ week_start: '2026-07-13', dynasty: 'cyber', best_score: 10, runs: 1 }],
      []
    );
    expect(points[0].dynasty).toBe('CYBER');
  });
});
