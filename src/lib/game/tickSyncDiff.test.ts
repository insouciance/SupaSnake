import {
  sameDirections,
  sameFusedSplices,
  sameGildedCells,
  samePosition,
  samePositions,
  sameRevive,
  sameStrainMap,
  sameTerrain,
} from './tickSyncDiff';
import type { Position } from '@/lib/game/SnakeGameLogic';
import type { TerrainBlock } from '@/shared/game/terrain';

/**
 * ET-3's guards decide whether a store write happens at all, so the failure
 * that matters is the FALSE POSITIVE: a comparator that calls two different
 * values equal freezes whatever draws them. WP-3.05 already paid for a
 * version of that with terrain that was computed, lethal and invisible, so
 * every field these functions read has a case here that changes only it.
 */

const cell = (x: number, z: number): Position => ({ x, y: 0, z });

const block = (over: Partial<TerrainBlock> = {}): TerrainBlock => ({
  x: 1,
  z: 2,
  source: 'arena',
  formingTicks: 0,
  formingTotal: 0,
  solid: true,
  ...over,
} as TerrainBlock);

describe('samePosition', () => {
  it('compares by value, not identity', () => {
    expect(samePosition(cell(3, 4), { x: 3, y: 0, z: 4 })).toBe(true);
    expect(samePosition(cell(3, 4), cell(4, 3))).toBe(false);
  });

  it('treats absence as a value of its own', () => {
    expect(samePosition(null, null)).toBe(true);
    expect(samePosition(null, cell(0, 0))).toBe(false);
    expect(samePosition(cell(0, 0), null)).toBe(false);
  });

  it('does not ignore the y plane', () => {
    expect(samePosition({ x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 })).toBe(false);
  });
});

describe('samePositions', () => {
  it('is true for equal bodies with different identities', () => {
    expect(samePositions([cell(1, 1), cell(1, 2)], [cell(1, 1), cell(1, 2)]))
      .toBe(true);
  });

  it('catches a head that moved one cell', () => {
    expect(samePositions([cell(1, 1), cell(1, 2)], [cell(2, 1), cell(1, 2)]))
      .toBe(false);
  });

  it('catches growth', () => {
    expect(samePositions([cell(1, 1)], [cell(1, 1), cell(1, 2)])).toBe(false);
  });
});

describe('sameTerrain', () => {
  it('is true for an unchanged arena', () => {
    expect(sameTerrain([block()], [block()])).toBe(true);
  });

  it('catches the forming countdown, which is DRAWN', () => {
    // The fill that says how long a decal has before it turns lethal.
    expect(sameTerrain(
      [block({ formingTicks: 4, formingTotal: 6, solid: false })],
      [block({ formingTicks: 3, formingTotal: 6, solid: false })]
    )).toBe(false);
  });

  it('catches a block becoming lethal', () => {
    expect(sameTerrain([block({ solid: false })], [block({ solid: true })]))
      .toBe(false);
  });

  it('catches a new block and a moved one', () => {
    expect(sameTerrain([block()], [block(), block({ x: 9 })])).toBe(false);
    expect(sameTerrain([block()], [block({ z: 9 })])).toBe(false);
  });
});

describe('sameGildedCells', () => {
  it('catches the wake ageing by one tick', () => {
    expect(sameGildedCells(
      [{ x: 1, z: 1, ticks: 3 }],
      [{ x: 1, z: 1, ticks: 2 }]
    )).toBe(false);
  });

  it('is true for an unchanged wake', () => {
    expect(sameGildedCells(
      [{ x: 1, z: 1, ticks: 3 }],
      [{ x: 1, z: 1, ticks: 3 }]
    )).toBe(true);
  });
});

describe('sameDirections', () => {
  it('respects order, because consumption order is the meaning', () => {
    expect(sameDirections(['UP', 'LEFT'], ['LEFT', 'UP'])).toBe(false);
    expect(sameDirections(['UP', 'LEFT'], ['UP', 'LEFT'])).toBe(true);
  });

  it('catches a buffered input being consumed', () => {
    expect(sameDirections(['UP', 'LEFT'], ['LEFT'])).toBe(false);
  });
});

describe('sameStrainMap', () => {
  it('catches a point gained and a strain appearing', () => {
    expect(sameStrainMap({ AURUM: 1 }, { AURUM: 2 })).toBe(false);
    expect(sameStrainMap({ AURUM: 1 }, { AURUM: 1, VENOM: 1 })).toBe(false);
  });

  it('is true for an unchanged sparse map', () => {
    expect(sameStrainMap({ AURUM: 1, VENOM: 2 }, { AURUM: 1, VENOM: 2 }))
      .toBe(true);
  });

  it('does not call a renamed key equal on count alone', () => {
    expect(sameStrainMap({ AURUM: 1 }, { VENOM: 1 })).toBe(false);
  });
});

describe('sameFusedSplices', () => {
  it('catches a fusion, and a fusion at a different food', () => {
    expect(sameFusedSplices([], [{ id: 'splice_worldcoil', atFood: 4 }]))
      .toBe(false);
    expect(sameFusedSplices(
      [{ id: 'splice_worldcoil', atFood: 4 }],
      [{ id: 'splice_worldcoil', atFood: 5 }]
    )).toBe(false);
  });
});

describe('sameRevive', () => {
  it('catches the run\'s one revive firing', () => {
    expect(sameRevive(null, { kind: 'phoenix', atFood: 7 })).toBe(false);
    expect(sameRevive(
      { kind: 'phoenix', atFood: 7 },
      { kind: 'phoenix', atFood: 7 }
    )).toBe(true);
  });
});
