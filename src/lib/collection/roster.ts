/**
 * Collection roster — which snake generations are active in the Lab, how
 * equal-generation builds are ordered, and which one represents a variant.
 *
 * The Lab grid is a sticker book: one card per variant. Before this module
 * it built a `Map` keyed by variant id whose every `set()` overwrote the
 * last, so a player holding 43 snakes across 11 variants could see and equip
 * exactly 11 of them — and, because `/api/collection` returns rows newest
 * first, the surviving row was the OLDEST one, which is why every card read
 * "Gen 1".
 *
 * The owner's 2026-07-29 ruling makes breeding read as progression rather
 * than inventory accumulation: for each variant, only its highest owned
 * generation is playable/selectable in the main Lab. Lower generations are
 * NOT deleted — they remain permanent pedigree, breeding inputs and history
 * (Rules 5/6). If several distinct builds share the highest generation, all
 * remain available; hiding one would discard a real top-generation choice.
 *
 * ── The order ─────────────────────────────────────────────────────────────
 *
 *   highest generation only → equipped → favorited → acquiredAt desc → id
 *
 * `favorited` sits in the rule because the codebase already ships that
 * precedent: the identity avatar picks favorited → equipped → newest
 * (`supabase/migrations/022_identity_core.sql`, pinned by
 * `src/app/api/player/identity/migration.test.ts`). The Lab inverts the first
 * two — the snake you are about to play with should be the face of its card —
 * but keeps favouriting meaningful as the tiebreak the player controls.
 *
 * The final `id` comparison makes the order TOTAL. Two snakes bred in the
 * same second at the same generation would otherwise sort unstably, and React
 * keys plus assertions both need a single answer.
 *
 * The equipped id is PASSED IN rather than read from `OwnedSnake.isEquipped`
 * because the Lab's optimistic equip rewrites `isEquipped` on every row
 * before the server has answered; a rule reading the flag would reorder the
 * grid twice per equip and once more on rollback.
 */

import type { OwnedSnake } from '@/shared/types/snake-data-model';

/** Every active, highest-generation snake of one variant, with its face card. */
export interface VariantRoster {
  /** `snake_variants.id` these snakes share. */
  variantId: string;
  /** Highest-generation snakes of this variant, in display order. */
  snakes: OwnedSnake[];
  /** `snakes[0]` — the snake the collection card shows. */
  representative: OwnedSnake;
  /** `snakes.length`, the card's `xN` chip. */
  count: number;
}

/** Epoch milliseconds, or 0 for a missing or unparseable timestamp. */
function acquiredAtMs(snake: OwnedSnake): number {
  const parsed = Date.parse(snake.acquiredAt ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedGeneration(snake: OwnedSnake): number {
  return Number.isFinite(snake.generation)
    ? Math.max(1, Math.floor(snake.generation))
    : 1;
}

/**
 * Keep only the highest owned generation of each catalog variant. Historical
 * rows stay in the collection store and database; this is a presentation
 * projection, never a destructive mutation.
 */
export function highestGenerationSnakes(
  ownedSnakes: readonly OwnedSnake[]
): OwnedSnake[] {
  const maxima = new Map<string, number>();
  for (const snake of ownedSnakes) {
    if (!snake.snakeVariantId) continue;
    const generation = normalizedGeneration(snake);
    maxima.set(
      snake.snakeVariantId,
      Math.max(maxima.get(snake.snakeVariantId) ?? 0, generation)
    );
  }

  return ownedSnakes.filter(
    (snake) =>
      snake.snakeVariantId !== null &&
      normalizedGeneration(snake) === maxima.get(snake.snakeVariantId)
  );
}

/**
 * Total order over one variant's snakes: equipped → favorited → generation
 * desc → acquiredAt desc → id. Returns a negative number when `a` should be
 * shown first, matching `Array.prototype.sort`.
 */
export function compareOwnedSnakes(
  a: OwnedSnake,
  b: OwnedSnake,
  equippedSnakeId: string | null
): number {
  if (equippedSnakeId) {
    const aEquipped = a.id === equippedSnakeId ? 0 : 1;
    const bEquipped = b.id === equippedSnakeId ? 0 : 1;
    if (aEquipped !== bEquipped) return aEquipped - bEquipped;
  }

  const aFavorited = a.isFavorited ? 0 : 1;
  const bFavorited = b.isFavorited ? 0 : 1;
  if (aFavorited !== bFavorited) return aFavorited - bFavorited;

  const generation = normalizedGeneration(b) - normalizedGeneration(a);
  if (generation !== 0) return generation;

  const acquired = acquiredAtMs(b) - acquiredAtMs(a);
  if (acquired !== 0) return acquired;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group every owned snake by variant id. Snakes with no `snakeVariantId`
 * (legacy rows predating the catalog FK) belong to no card and are dropped —
 * the grid renders variants, and there is no variant to render them under.
 */
export function rostersByVariant(
  ownedSnakes: readonly OwnedSnake[],
  equippedSnakeId: string | null
): Map<string, VariantRoster> {
  const grouped = new Map<string, OwnedSnake[]>();

  for (const snake of ownedSnakes) {
    const variantId = snake.snakeVariantId;
    if (!variantId) continue;
    const bucket = grouped.get(variantId);
    if (bucket) {
      bucket.push(snake);
    } else {
      grouped.set(variantId, [snake]);
    }
  }

  const rosters = new Map<string, VariantRoster>();
  grouped.forEach((snakes, variantId) => {
    const active = highestGenerationSnakes(snakes);
    const ordered = [...active].sort((a, b) =>
      compareOwnedSnakes(a, b, equippedSnakeId)
    );
    rosters.set(variantId, {
      variantId,
      snakes: ordered,
      representative: ordered[0],
      count: ordered.length,
    });
  });

  return rosters;
}

/**
 * The roster for one variant, or `null` when the player owns none of it —
 * which is exactly the locked-card case the grid already handles.
 */
export function rosterForVariant(
  variantId: string,
  ownedSnakes: readonly OwnedSnake[],
  equippedSnakeId: string | null
): VariantRoster | null {
  const snakes = highestGenerationSnakes(
    ownedSnakes.filter((snake) => snake.snakeVariantId === variantId)
  );
  if (snakes.length === 0) return null;

  const ordered = [...snakes].sort((a, b) =>
    compareOwnedSnakes(a, b, equippedSnakeId)
  );
  return {
    variantId,
    snakes: ordered,
    representative: ordered[0],
    count: ordered.length,
  };
}

/** How many distinct variants a set of owned snakes covers. */
export function distinctVariantCount(
  ownedSnakes: readonly OwnedSnake[]
): number {
  const seen = new Set<string>();
  for (const snake of ownedSnakes) {
    if (snake.snakeVariantId) seen.add(snake.snakeVariantId);
  }
  return seen.size;
}
