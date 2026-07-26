/**
 * Paired weeks — the symmetry rules (Constitution §9.4).
 *
 * What this file pins:
 *
 *   - a clan alone in the world is never paired, and that is not a failure;
 *   - two clans of one ARE a symmetric pairing — the owner's founding
 *     instinct, made mechanical;
 *   - clans only meet inside the same size AND activity band;
 *   - a standing rivalry is preferred while both sides stay in band, and
 *     dissolves silently when they do not;
 *   - pairing is deterministic, so re-running it cannot re-match anyone;
 *   - rivalry memory is a fold over settled weeks, never an accumulator;
 *   - nothing in this module returns anything a member could bank (Rule 8).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  clanActivityBand,
  clanSizeBand,
  foldRivalryMemory,
  pairClanWeek,
  resolvePairOutcome,
  rivalryKey,
  CLAN_ACTIVITY_WINDOW_WEEKS,
  type ClanPairingCandidate,
} from './pairing';

const candidate = (
  clanId: string,
  memberCount: number,
  weeksActive: number,
  standingRivalId: string | null = null
): ClanPairingCandidate => ({ clanId, memberCount, weeksActive, standingRivalId });

describe('bands', () => {
  it('makes the clan of one its own band', () => {
    expect(clanSizeBand(1)).toBe(0);
    expect(clanSizeBand(2)).toBe(1);
    expect(clanSizeBand(3)).toBe(1);
    expect(clanSizeBand(4)).toBe(2);
    expect(clanSizeBand(6)).toBe(2);
    expect(clanSizeBand(7)).toBe(3);
    expect(clanSizeBand(12)).toBe(3);
  });

  it('puts a grandfathered over-cap clan in the top band rather than nowhere', () => {
    // §12.2 caps new clans at 12, but a clan that already held more keeps
    // every member (migration 048 never removes one). It must still pair.
    expect(clanSizeBand(30)).toBe(3);
  });

  it('measures activity over the trailing four weeks', () => {
    expect(CLAN_ACTIVITY_WINDOW_WEEKS).toBe(4);
    expect(clanActivityBand(0)).toBe(0);
    expect(clanActivityBand(1)).toBe(1);
    expect(clanActivityBand(2)).toBe(2);
    expect(clanActivityBand(3)).toBe(2);
    expect(clanActivityBand(4)).toBe(3);
    expect(clanActivityBand(9)).toBe(3);
  });
});

describe('pairClanWeek', () => {
  it('pairs nobody when there is one clan in the world', () => {
    const result = pairClanWeek([candidate('c1', 1, 4)]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired).toEqual(['c1']);
  });

  it('pairs two clans of one — the founding case, made mechanical', () => {
    const result = pairClanWeek([candidate('c1', 1, 4), candidate('c2', 1, 4)]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      clanAId: 'c1',
      clanBId: 'c2',
      sizeBand: 0,
      activityBand: 3,
      standingRival: false,
    });
    expect(result.unpaired).toEqual([]);
  });

  it('refuses to pair across size bands — the walkover §9.4 opens by rejecting', () => {
    const result = pairClanWeek([candidate('solo', 1, 4), candidate('big', 10, 4)]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired.sort()).toEqual(['big', 'solo']);
  });

  it('refuses to pair across activity bands', () => {
    const result = pairClanWeek([candidate('busy', 3, 4), candidate('lapsed', 3, 1)]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired.sort()).toEqual(['busy', 'lapsed']);
  });

  it('leaves an odd clan out with no pairing and no shame', () => {
    const result = pairClanWeek([
      candidate('a', 2, 4),
      candidate('b', 2, 4),
      candidate('c', 2, 4),
    ]);
    expect(result.pairs).toHaveLength(1);
    expect(result.unpaired).toHaveLength(1);
    // The partition is total: everyone is either paired or listed once.
    const paired = result.pairs.flatMap((pair) => [pair.clanAId, pair.clanBId]);
    expect([...paired, ...result.unpaired].sort()).toEqual(['a', 'b', 'c']);
  });

  it('prefers the standing rival — sports leagues run on derbies', () => {
    const result = pairClanWeek([
      candidate('a', 2, 4, 'd'),
      candidate('b', 2, 4),
      candidate('c', 2, 4),
      candidate('d', 2, 4, 'a'),
    ]);
    const derby = result.pairs.find((pair) => pair.standingRival);
    expect(derby).toMatchObject({ clanAId: 'a', clanBId: 'd' });
    const fresh = result.pairs.find((pair) => !pair.standingRival);
    expect(fresh).toMatchObject({ clanAId: 'b', clanBId: 'c' });
  });

  it('ignores a one-sided claim of a standing rival', () => {
    const result = pairClanWeek([
      candidate('a', 2, 4, 'b'),
      candidate('b', 2, 4, 'c'),
      candidate('c', 2, 4, 'b'),
    ]);
    // b names c, c names b, a names b — only the mutual pair is a derby.
    const derby = result.pairs.find((pair) => pair.standingRival);
    expect(derby).toMatchObject({ clanAId: 'b', clanBId: 'c' });
    expect(result.unpaired).toEqual(['a']);
  });

  it('dissolves a rivalry whose clans drifted out of band, silently', () => {
    // §9.4: "sustained band divergence dissolves a mismatch automatically."
    const result = pairClanWeek([
      candidate('a', 1, 4, 'b'),
      candidate('b', 9, 4, 'a'),
    ]);
    expect(result.pairs).toEqual([]);
    expect(result.unpaired.sort()).toEqual(['a', 'b']);
  });

  it('is deterministic — the same input pairs the same way every time', () => {
    const clans = [
      candidate('c', 3, 4),
      candidate('a', 3, 4),
      candidate('d', 3, 4),
      candidate('b', 3, 4),
    ];
    const first = pairClanWeek(clans);
    const shuffled = [clans[2], clans[0], clans[3], clans[1]];
    const second = pairClanWeek(shuffled);
    expect(second).toEqual(first);
    expect(first.pairs.map((pair) => [pair.clanAId, pair.clanBId])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('never places a clan in two pairings', () => {
    const clans = Array.from({ length: 9 }, (_, index) =>
      candidate(`clan-${index}`, 5, 4)
    );
    const { pairs, unpaired } = pairClanWeek(clans);
    const seen = pairs.flatMap((pair) => [pair.clanAId, pair.clanBId]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length + unpaired.length).toBe(9);
  });
});

describe('rivalryKey', () => {
  it('is symmetric', () => {
    expect(rivalryKey('b', 'a')).toEqual(['a', 'b']);
    expect(rivalryKey('a', 'b')).toEqual(['a', 'b']);
  });
});

describe('resolvePairOutcome', () => {
  it('reads the week off Depth alone', () => {
    expect(resolvePairOutcome(10, 5)).toBe('a');
    expect(resolvePairOutcome(5, 10)).toBe('b');
  });

  it('calls an equal week a draw rather than breaking the tie', () => {
    // There is no rating to break and no reward to allocate, so a tiebreak
    // would be for nothing.
    expect(resolvePairOutcome(7, 7)).toBe('draw');
    expect(resolvePairOutcome(0, 0)).toBe('draw');
  });
});

describe('foldRivalryMemory', () => {
  const settled = [
    { clanAId: 'a', clanBId: 'b', depthA: 100, depthB: 90, weekStart: '2026-07-06' },
    { clanAId: 'a', clanBId: 'b', depthA: 80, depthB: 120, weekStart: '2026-07-13' },
    { clanAId: 'a', clanBId: 'b', depthA: 50, depthB: 50, weekStart: '2026-07-20' },
    { clanAId: 'b', clanBId: 'a', depthA: 200, depthB: 130, weekStart: '2026-07-27' },
  ];

  it('folds W–L–D, closest week and all-time margin', () => {
    const memory = foldRivalryMemory('a', 'b', settled);
    expect(memory.meetings).toBe(4);
    expect(memory.winsA).toBe(1);
    // 2026-07-13 (b by 40) and 2026-07-27 (rows reversed: b by 70)
    expect(memory.winsB).toBe(2);
    expect(memory.draws).toBe(1);
    expect(memory.closestMargin).toBe(0);
    expect(memory.largestMargin).toBe(70);
  });

  it('reads the streak from the most recent week backwards, and a draw ends it', () => {
    const memory = foldRivalryMemory('a', 'b', settled);
    expect(memory.streakClanId).toBe('b');
    expect(memory.streakLength).toBe(1);

    const noDraw = foldRivalryMemory('a', 'b', [settled[0], settled[1], settled[3]]);
    expect(noDraw.streakClanId).toBe('b');
    expect(noDraw.streakLength).toBe(2);
  });

  it('is a recompute, so folding twice gives the same answer', () => {
    expect(foldRivalryMemory('a', 'b', settled)).toEqual(
      foldRivalryMemory('a', 'b', settled)
    );
  });

  it('ignores weeks belonging to other rivalries', () => {
    const memory = foldRivalryMemory('a', 'b', [
      ...settled,
      { clanAId: 'a', clanBId: 'z', depthA: 999, depthB: 1, weekStart: '2026-08-03' },
    ]);
    expect(memory.meetings).toBe(4);
  });

  it('answers an empty history without inventing a record', () => {
    expect(foldRivalryMemory('a', 'b', [])).toEqual({
      meetings: 0,
      winsA: 0,
      winsB: 0,
      draws: 0,
      streakClanId: null,
      streakLength: 0,
      closestMargin: 0,
      largestMargin: 0,
    });
  });
});

describe('Rule 8 — pairing pays nothing', () => {
  it('names no currency, entitlement or reward anywhere in the module', () => {
    const source = readFileSync(join(__dirname, 'pairing.ts'), 'utf8');
    for (const forbidden of [
      'dna',
      'economy_transactions',
      'entitlement',
      'premium',
      'stripe',
      'multiplier',
      'threshold',
      'minimum',
    ]) {
      const code = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n');
      expect(code.toLowerCase()).not.toContain(forbidden);
    }
  });
});
