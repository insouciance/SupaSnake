import type {
  OwnedSnake,
  SnakeVariant,
} from '@/shared/types/snake-data-model';

export interface LabVariantPartition {
  active: SnakeVariant[];
  undiscovered: SnakeVariant[];
}

/**
 * Separates the normal playable deck from the catalog discovery layer. The
 * caller supplies the already-projected active owned rows, so this function
 * never mutates or discards ancestry; it only decides which variant card is
 * shown at which disclosure level.
 */
export function partitionLabVariants(
  variants: readonly SnakeVariant[],
  activeOwned: readonly OwnedSnake[]
): LabVariantPartition {
  const activeVariantIds = new Set(
    activeOwned
      .map((snake) => snake.snakeVariantId)
      .filter((id): id is string => typeof id === 'string')
  );

  return variants.reduce<LabVariantPartition>(
    (partition, variant) => {
      if (activeVariantIds.has(variant.id)) {
        partition.active.push(variant);
      } else {
        partition.undiscovered.push(variant);
      }
      return partition;
    },
    { active: [], undiscovered: [] }
  );
}
