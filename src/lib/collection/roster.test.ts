/**
 * Roster rule tests — WP-2.06.
 *
 * The order is equipped → favorited → generation desc → acquiredAt desc → id,
 * and it must be TOTAL: every tier is asserted in isolation and the whole
 * chain is asserted once end to end.
 */

import {
  compareOwnedSnakes,
  distinctVariantCount,
  rosterForVariant,
  rostersByVariant,
} from './roster';
import type { OwnedSnake } from '@/shared/types/snake-data-model';

function snake(overrides: Partial<OwnedSnake> & { id: string }): OwnedSnake {
  return {
    playerId: 'player-1',
    variantId: 'PRIMAL SEED',
    snakeVariantId: 'variant-1',
    generation: 1,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-01-01T00:00:00Z',
    acquiredMethod: 'bred',
    isEquipped: false,
    isFavorited: false,
    ...overrides,
  };
}

function orderIds(
  snakes: OwnedSnake[],
  equippedSnakeId: string | null = null
): string[] {
  return [...snakes]
    .sort((a, b) => compareOwnedSnakes(a, b, equippedSnakeId))
    .map((entry) => entry.id);
}

describe('compareOwnedSnakes', () => {
  it('puts the equipped snake first, even against a higher generation', () => {
    const equipped = snake({ id: 'a', generation: 1 });
    const newer = snake({ id: 'b', generation: 9 });
    expect(orderIds([newer, equipped], 'a')).toEqual(['a', 'b']);
  });

  it('reads the equipped id from the argument, not from isEquipped', () => {
    // The optimistic equip path rewrites isEquipped on every row before the
    // server answers; the rule must ignore the flag entirely.
    const lying = snake({ id: 'a', isEquipped: true, generation: 1 });
    const target = snake({ id: 'b', isEquipped: false, generation: 1 });
    expect(orderIds([lying, target], 'b')).toEqual(['b', 'a']);
  });

  it('ranks favorited above unfavorited once neither is equipped', () => {
    const plain = snake({ id: 'a', generation: 9 });
    const favorited = snake({ id: 'b', generation: 1, isFavorited: true });
    expect(orderIds([plain, favorited])).toEqual(['b', 'a']);
  });

  it('ranks a higher generation first', () => {
    const low = snake({ id: 'a', generation: 2 });
    const high = snake({ id: 'b', generation: 7 });
    expect(orderIds([low, high])).toEqual(['b', 'a']);
  });

  it('ranks the more recently acquired first at equal generation', () => {
    const older = snake({ id: 'a', acquiredAt: '2026-01-01T00:00:00Z' });
    const newer = snake({ id: 'b', acquiredAt: '2026-06-01T00:00:00Z' });
    expect(orderIds([older, newer])).toEqual(['b', 'a']);
  });

  it('falls back to the id so the order is total and stable', () => {
    const first = snake({ id: 'aaa' });
    const second = snake({ id: 'bbb' });
    expect(orderIds([second, first])).toEqual(['aaa', 'bbb']);
    expect(compareOwnedSnakes(first, first, null)).toBe(0);
  });

  it('treats an unparseable acquiredAt as the oldest rather than throwing', () => {
    const broken = snake({ id: 'a', acquiredAt: 'not-a-date' });
    const real = snake({ id: 'b', acquiredAt: '2020-01-01T00:00:00Z' });
    expect(orderIds([broken, real])).toEqual(['b', 'a']);
  });

  it('applies every tier in order on a mixed roster', () => {
    const roster = [
      snake({ id: 's1', generation: 1, acquiredAt: '2026-01-01T00:00:00Z' }),
      snake({ id: 's2', generation: 4, acquiredAt: '2026-02-01T00:00:00Z' }),
      snake({
        id: 's3',
        generation: 2,
        isFavorited: true,
        acquiredAt: '2026-03-01T00:00:00Z',
      }),
      snake({ id: 's4', generation: 4, acquiredAt: '2026-05-01T00:00:00Z' }),
      snake({ id: 's5', generation: 1, acquiredAt: '2026-01-01T00:00:00Z' }),
    ];
    // equipped s4? no - equip s1 to prove it outranks favorited and Gen 4.
    expect(orderIds(roster, 's1')).toEqual(['s1', 's3', 's4', 's2', 's5']);
  });
});

describe('rostersByVariant', () => {
  it('keeps every snake of every variant instead of overwriting', () => {
    const owned = [
      snake({ id: 'a', snakeVariantId: 'v1' }),
      snake({ id: 'b', snakeVariantId: 'v1' }),
      snake({ id: 'c', snakeVariantId: 'v2' }),
    ];
    const rosters = rostersByVariant(owned, null);

    expect(rosters.size).toBe(2);
    expect(rosters.get('v1')?.count).toBe(2);
    expect(rosters.get('v1')?.snakes.map((s) => s.id).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(rosters.get('v2')?.count).toBe(1);
  });

  it('names the ordered head as the representative', () => {
    const owned = [
      snake({ id: 'old', snakeVariantId: 'v1', generation: 1 }),
      snake({ id: 'new', snakeVariantId: 'v1', generation: 6 }),
    ];
    expect(rostersByVariant(owned, null).get('v1')?.representative.id).toBe(
      'new'
    );
  });

  it('drops rows with no variant id — there is no card to file them under', () => {
    const owned = [
      snake({ id: 'a', snakeVariantId: 'v1' }),
      snake({ id: 'legacy', snakeVariantId: null }),
    ];
    const rosters = rostersByVariant(owned, null);
    expect(rosters.size).toBe(1);
    expect(rosters.get('v1')?.count).toBe(1);
  });

  it('does not mutate the input array', () => {
    const owned = [
      snake({ id: 'b', snakeVariantId: 'v1', generation: 1 }),
      snake({ id: 'a', snakeVariantId: 'v1', generation: 9 }),
    ];
    const ids = owned.map((entry) => entry.id);
    rostersByVariant(owned, null);
    expect(owned.map((entry) => entry.id)).toEqual(ids);
  });
});

describe('rosterForVariant', () => {
  it('returns null when the player owns none of the variant', () => {
    expect(rosterForVariant('v9', [snake({ id: 'a' })], null)).toBeNull();
  });

  it('returns only that variant, ordered', () => {
    const owned = [
      snake({ id: 'a', snakeVariantId: 'v1', generation: 1 }),
      snake({ id: 'b', snakeVariantId: 'v2', generation: 5 }),
      snake({ id: 'c', snakeVariantId: 'v1', generation: 3 }),
    ];
    const roster = rosterForVariant('v1', owned, null);
    expect(roster?.snakes.map((entry) => entry.id)).toEqual(['c', 'a']);
    expect(roster?.representative.id).toBe('c');
    expect(roster?.count).toBe(2);
  });
});

describe('distinctVariantCount', () => {
  it('counts variants, not rows — 43 snakes across 11 variants is 11', () => {
    const owned: OwnedSnake[] = [];
    for (let variant = 0; variant < 11; variant += 1) {
      const copies = variant === 0 ? 33 : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        owned.push(
          snake({ id: `v${variant}-s${copy}`, snakeVariantId: `v${variant}` })
        );
      }
    }
    expect(owned).toHaveLength(43);
    expect(distinctVariantCount(owned)).toBe(11);
  });

  it('ignores rows with no variant id', () => {
    expect(
      distinctVariantCount([
        snake({ id: 'a', snakeVariantId: 'v1' }),
        snake({ id: 'b', snakeVariantId: null }),
      ])
    ).toBe(1);
  });
});
