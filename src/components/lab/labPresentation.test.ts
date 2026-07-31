import { partitionLabVariants } from './labPresentation';
import type {
  OwnedSnake,
  SnakeVariant,
} from '@/shared/types/snake-data-model';

function variant(id: string): SnakeVariant {
  return {
    id,
    dynastyId: 'dynasty-1',
    name: id,
    rarity: 'common',
    loreText: null,
    artUrl: null,
    baseStats: { speed: 10, size: 5, hp: 100 },
    unlockCostDna: 100,
    isStarter: false,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function snake(id: string, snakeVariantId: string, generation: number): OwnedSnake {
  return {
    id,
    playerId: 'player-1',
    variantId: snakeVariantId,
    snakeVariantId,
    generation,
    parent1Id: null,
    parent2Id: null,
    acquiredAt: '2026-01-01T00:00:00Z',
    acquiredMethod: 'bred',
    isEquipped: false,
    isFavorited: false,
  };
}

describe('Lab progressive disclosure', () => {
  it('keeps owned lineages in the everyday deck and locked variants in discovery', () => {
    const result = partitionLabVariants(
      [variant('owned-a'), variant('locked'), variant('owned-b')],
      [snake('a-11', 'owned-a', 11), snake('b-4', 'owned-b', 4)]
    );

    expect(result.active.map((entry) => entry.id)).toEqual(['owned-a', 'owned-b']);
    expect(result.undiscovered.map((entry) => entry.id)).toEqual(['locked']);
  });

  it('never turns several rows from one lineage into several variant cards', () => {
    const result = partitionLabVariants(
      [variant('one-lineage')],
      [
        snake('ancestor', 'one-lineage', 1),
        snake('active-a', 'one-lineage', 11),
        snake('active-b', 'one-lineage', 11),
      ]
    );

    expect(result.active).toHaveLength(1);
    expect(result.undiscovered).toHaveLength(0);
  });
});
