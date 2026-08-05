/**
 * The snake cosmetic loadout — shared shapes and tolerant parsers (LF-B).
 *
 * This module is deliberately free of three.js and React so the API routes,
 * the session-start path and the chamber can all import it. The rendering
 * registry that turns a component key into geometry lives in
 * `src/components/home/SnakeCosmetics.tsx`.
 *
 * ── THE LAW THIS SERVES ──────────────────────────────────────────────────
 *
 * What you equip in the chamber is exactly what renders in play. That holds
 * because there is ONE answer to "what is this snake wearing" — the
 * `read_snake_loadout` RPC (migration 069) — and both surfaces read it. The
 * chamber reads it through `GET /api/player/cosmetics`; the run reads it
 * through the session-start manifest. Neither derives it, so neither can
 * drift from the other.
 *
 * ── WHY THE PARSERS ARE TOLERANT ─────────────────────────────────────────
 *
 * A component key the client build does not recognise resolves to nothing
 * worn in that slot, never to a throw. The catalog is data and the renderer
 * is code, and they deploy independently — a cosmetic added by a later
 * migration must not break a browser tab that has not reloaded (doctrine
 * FM-12: in-flight work completes under the version it started on). The
 * degradation is silent on purpose: an unknown hat is a missing hat, which is
 * the same thing a player sees when they have not equipped one.
 */

import {
  SNAKE_COSMETIC_SLOTS,
  isSnakeCosmeticSlot,
  type SnakeCosmeticSlot,
} from '@/shared/game/cosmeticSlots';

/** Slot → the client registry key of what is worn there, or null. */
export type SnakeCosmeticLoadout = Readonly<
  Record<SnakeCosmeticSlot, string | null>
>;

export interface SnakeCosmeticItem {
  /** `cosmetic_definitions.id` — what the equip call names. */
  readonly id: string;
  readonly slot: SnakeCosmeticSlot;
  /** The client registry key. Null for a catalog row with no renderer. */
  readonly component: string | null;
  readonly name: string;
  readonly rarity: string;
  /**
   * Presentation only. A TRUE item this player does not own is shown with a
   * supporter mark and its tap routes to /shop — the menu never prices it and
   * never sells it (Constitution R7: commerce stays in its district).
   */
  readonly supporterOnly: boolean;
  readonly owned: boolean;
  readonly equipped: boolean;
}

export interface SnakeCosmeticCatalog {
  /** False when migration 069 has not been applied yet. */
  readonly live: boolean;
  readonly loadout: SnakeCosmeticLoadout;
  readonly items: readonly SnakeCosmeticItem[];
}

/** Nothing worn in any slot — the honest answer for a signed-out visitor. */
export const EMPTY_SNAKE_LOADOUT: SnakeCosmeticLoadout = Object.freeze(
  Object.fromEntries(SNAKE_COSMETIC_SLOTS.map((slot) => [slot, null]))
) as SnakeCosmeticLoadout;

export const EMPTY_SNAKE_COSMETIC_CATALOG: SnakeCosmeticCatalog = Object.freeze({
  live: false,
  loadout: EMPTY_SNAKE_LOADOUT,
  items: Object.freeze([]) as readonly SnakeCosmeticItem[],
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read a `read_snake_loadout` payload. Every snake slot is always present in
 * the result, so an absent slot and an unequipped slot are one shape rather
 * than two — the renderer never has to ask which kind of nothing it got.
 */
export function parseSnakeLoadout(value: unknown): SnakeCosmeticLoadout {
  const row = asRecord(value);
  if (!row) return EMPTY_SNAKE_LOADOUT;
  const out: Record<string, string | null> = {};
  for (const slot of SNAKE_COSMETIC_SLOTS) {
    out[slot] = asNonEmptyString(row[slot]);
  }
  return Object.freeze(out) as SnakeCosmeticLoadout;
}

/** Read a `read_snake_cosmetic_catalog` items array, dropping malformed rows. */
export function parseSnakeCosmeticItems(
  value: unknown
): readonly SnakeCosmeticItem[] {
  if (!Array.isArray(value)) return [];
  const items: SnakeCosmeticItem[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = asNonEmptyString(row.id);
    const slot = row.slot;
    // A row with no id or an unrecognised slot cannot be equipped or shown in
    // a category, so it is dropped rather than rendered into a dead control.
    if (!id || !isSnakeCosmeticSlot(slot)) continue;
    items.push({
      id,
      slot,
      component: asNonEmptyString(row.component),
      name: asNonEmptyString(row.name) ?? id,
      rarity: asNonEmptyString(row.rarity) ?? 'common',
      supporterOnly: row.supporterOnly === true,
      owned: row.owned === true,
      equipped: row.equipped === true,
    });
  }
  return items;
}

export function parseSnakeCosmeticCatalog(value: unknown): SnakeCosmeticCatalog {
  const row = asRecord(value);
  if (!row) return EMPTY_SNAKE_COSMETIC_CATALOG;
  return {
    live: true,
    loadout: parseSnakeLoadout(row.loadout),
    items: parseSnakeCosmeticItems(row.items),
  };
}

/**
 * What the menu offers to do with an item. `equip` and `unequip` act; `shop`
 * navigates and never transacts; `locked` is an un-owned item with no store
 * behind it, which today means an earned item the player has not earned.
 */
export type SnakeCosmeticAction = 'equip' | 'unequip' | 'shop' | 'locked';

export function snakeCosmeticAction(item: SnakeCosmeticItem): SnakeCosmeticAction {
  if (item.owned) return item.equipped ? 'unequip' : 'equip';
  return item.supporterOnly ? 'shop' : 'locked';
}

/**
 * The loadout as it would be after `item` is equipped or unequipped — used to
 * preview a browse on the chamber snake before anything is written. The
 * server still decides: this is a picture, not a permission.
 */
export function previewLoadout(
  loadout: SnakeCosmeticLoadout,
  item: SnakeCosmeticItem
): SnakeCosmeticLoadout {
  const action = snakeCosmeticAction(item);
  if (action !== 'equip' && action !== 'unequip') return loadout;
  return Object.freeze({
    ...loadout,
    [item.slot]: action === 'equip' ? item.component : null,
  }) as SnakeCosmeticLoadout;
}
