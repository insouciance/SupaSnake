/**
 * The cosmetic slot vocabulary — one authored list (LF-B).
 *
 * A slot is a place on a player where exactly one thing is worn. Six of them
 * are profile chrome shipped by Identity v1 (migration 022); three are on the
 * snake itself and ship with migration 069.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 *
 * The list is unavoidably written four times: two SQL CHECK constraints
 * (declarative integrity on `cosmetic_definitions` and `player_loadout`), one
 * guard inside the `equip_cosmetic` RPC, and the API route's request
 * validation. A CHECK constraint cannot delegate to a function without making
 * itself un-restorable in the wrong pg_restore order and un-revalidated when
 * the function changes, so the duplication is not removable.
 *
 * It is made MECHANICAL instead. THIS is the authored list; everything in
 * TypeScript imports it, and `cosmeticSlots.migration.test.ts` reads migration
 * 069's SQL text and fails the build the moment any of the four lists drifts
 * from it. Parity held by test, in the pattern the Constitution checklist
 * already uses for the growth fold.
 *
 * Adding a slot means: edit this file, add a migration that re-adds BOTH CHECK
 * constraints and re-creates `equip_cosmetic` with the new list, and point the
 * parity test at that migration. The test will tell you if you missed one.
 */

/** Identity v1 profile slots (migration 022). */
export const PROFILE_COSMETIC_SLOTS = [
  'title',
  'banner',
  'badge',
  'trail',
  'board_accent',
  'emblem',
] as const;

/**
 * Snake-anatomy slots (migration 069). These are the slots the chamber's
 * cosmetics menu browses and the ones the run render path reads.
 *
 * `food_skin` is a scaffold: the vocabulary and the storage accept it, and the
 * catalog is deliberately empty until the egg and cube assets are judged as
 * cosmetics. An empty category renders as an empty category.
 */
export const SNAKE_COSMETIC_SLOTS = ['face', 'crown', 'food_skin'] as const;

/** Every slot, in the order the SQL CHECK constraints list them. */
export const COSMETIC_SLOTS = [
  ...PROFILE_COSMETIC_SLOTS,
  ...SNAKE_COSMETIC_SLOTS,
] as const;

export type ProfileCosmeticSlot = (typeof PROFILE_COSMETIC_SLOTS)[number];
export type SnakeCosmeticSlot = (typeof SNAKE_COSMETIC_SLOTS)[number];
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
  return (
    typeof value === 'string' &&
    (COSMETIC_SLOTS as readonly string[]).includes(value)
  );
}

export function isSnakeCosmeticSlot(value: unknown): value is SnakeCosmeticSlot {
  return (
    typeof value === 'string' &&
    (SNAKE_COSMETIC_SLOTS as readonly string[]).includes(value)
  );
}

/**
 * How many positions a slot has. Badge curation is pick-3 (022 §6.5); every
 * other slot, profile or snake, wears exactly one thing. This mirrors the
 * `player_loadout_position_valid` CHECK, which 069 deliberately did not touch
 * because `slot <> 'badge' AND position = 1` already covers the snake slots.
 */
export function cosmeticSlotPositions(slot: CosmeticSlot): number {
  return slot === 'badge' ? 3 : 1;
}

/**
 * The category order the cosmetics menu renders, and the label each category
 * carries. Plain-language register: what it is, in the words a player would
 * use out loud. Kept here rather than in the component so the order is one
 * fact and the menu cannot disagree with a test about it.
 */
export interface SnakeCosmeticCategory {
  readonly slot: SnakeCosmeticSlot;
  readonly label: string;
  /** Shown under the label when the category has nothing in it yet. */
  readonly emptyNote: string;
}

export const SNAKE_COSMETIC_CATEGORIES: readonly SnakeCosmeticCategory[] = [
  { slot: 'face', label: 'Face', emptyNote: 'Nothing here yet.' },
  { slot: 'crown', label: 'Head', emptyNote: 'Nothing here yet.' },
  { slot: 'food_skin', label: 'Food', emptyNote: 'Nothing here yet.' },
] as const;
