'use client';

/**
 * CosmeticsMenu - dressing your snake, in the chamber, without leaving it.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 *
 * It is not a modal. Tapping the snake must not cover the snake — the whole
 * point of dressing a pet is watching it change, and a dialog that occludes
 * the thing it edits is a wardrobe with the mirror on the outside. So this is
 * a set of on-screen selectors that sit in the dock the command rail vacated,
 * over a chamber that stays fully visible and pushes slightly in. The player
 * should not perceive a page change, because there is not one: the canvas
 * never unmounts, the snake never moves, and only the controls cross-fade.
 *
 * ── CATEGORIES ───────────────────────────────────────────────────────────
 *
 * One expandable category per snake slot, in the order
 * `SNAKE_COSMETIC_CATEGORIES` declares. Exactly one category is open at a
 * time: the tray has room for one row of chips, and two open categories is
 * how a lean selector becomes a scrolling panel.
 *
 * A category with nothing in it still appears, and says so. Food skins are
 * that category today. An empty shelf is honest; a hidden shelf is a surprise
 * later.
 *
 * ── COMMERCE (Constitution R7) ───────────────────────────────────────────
 *
 * Owned and free items equip on tap. A supporter-only item the player does
 * not own is VISIBLE, marked, and its tap NAVIGATES to /shop — no price, no
 * checkout, no purchase flow in here. The menu shows identity; the district
 * sells it. That is one commercial surface on this screen and it is never the
 * primary action.
 *
 * ── PREVIEW vs TRUTH ─────────────────────────────────────────────────────
 *
 * Browsing repaints the chamber immediately, because a wardrobe that makes
 * you wait is not a wardrobe. That preview is a PICTURE: the server still
 * decides, through `equip_cosmetic`, and when it answers the picture is
 * replaced by what it said. If it refuses, the snake goes back to what it was
 * actually wearing and the player is told — an optimistic paint that silently
 * keeps a lie would be the client granting itself a cosmetic.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  SNAKE_COSMETIC_CATEGORIES,
  type SnakeCosmeticSlot,
} from '@/shared/game/cosmeticSlots';
import {
  snakeCosmeticAction,
  type SnakeCosmeticCatalog,
  type SnakeCosmeticItem,
} from '@/lib/cosmetics/snakeCosmetics';

export interface CosmeticsMenuProps {
  catalog: SnakeCosmeticCatalog;
  /** Called when the player picks an item; resolves once the server answers. */
  onEquip: (item: SnakeCosmeticItem) => void | Promise<void>;
  /** Called as the player browses, so the chamber can preview. */
  onPreview: (item: SnakeCosmeticItem | null) => void;
  onClose: () => void;
  /** A refusal from the server, already in player-facing words. */
  error?: string | null;
  busy?: boolean;
}

const chipBase =
  'ink-chip relative flex min-h-[44px] items-center gap-2 px-3 py-2 text-left text-xs font-display uppercase tracking-[0.06em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink disabled:cursor-wait disabled:opacity-50';

export function CosmeticsMenu({
  catalog,
  onEquip,
  onPreview,
  onClose,
  error = null,
  busy = false,
}: CosmeticsMenuProps) {
  // The first category with something in it opens by default: landing on an
  // empty shelf makes the whole tray look broken.
  const firstStocked = useMemo(() => {
    const stocked = SNAKE_COSMETIC_CATEGORIES.find((category) =>
      catalog.items.some((item) => item.slot === category.slot)
    );
    return stocked?.slot ?? SNAKE_COSMETIC_CATEGORIES[0].slot;
  }, [catalog.items]);

  const [openSlot, setOpenSlot] = useState<SnakeCosmeticSlot>(firstStocked);

  const itemsFor = useCallback(
    (slot: SnakeCosmeticSlot) =>
      catalog.items.filter((item) => item.slot === slot),
    [catalog.items]
  );

  const openItems = itemsFor(openSlot);
  const openCategory =
    SNAKE_COSMETIC_CATEGORIES.find((category) => category.slot === openSlot) ??
    SNAKE_COSMETIC_CATEGORIES[0];

  return (
    <section
      className="flex w-[min(23rem,100%)] flex-col items-center gap-3"
      aria-label="Dress up your snake"
      data-testid="cosmetics-menu"
      onMouseLeave={() => onPreview(null)}
    >
      {/* Categories. One open at a time; the row is the whole navigation. */}
      <div
        className="grid w-full grid-cols-3 gap-2"
        role="tablist"
        aria-label="What to change"
      >
        {SNAKE_COSMETIC_CATEGORIES.map((category) => {
          const open = category.slot === openSlot;
          const count = itemsFor(category.slot).length;
          return (
            <button
              key={category.slot}
              type="button"
              role="tab"
              aria-selected={open}
              aria-controls={`cosmetics-shelf-${category.slot}`}
              id={`cosmetics-tab-${category.slot}`}
              onClick={() => setOpenSlot(category.slot)}
              className={`${chipBase} justify-center ${open ? 'ink-chip-selected' : ''}`}
              data-testid={`cosmetics-category-${category.slot}`}
              data-open={open}
            >
              {category.label}
              {count > 0 && (
                <span className="text-[10px] opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The open shelf. */}
      <div
        id={`cosmetics-shelf-${openSlot}`}
        role="tabpanel"
        aria-labelledby={`cosmetics-tab-${openSlot}`}
        className="flex w-full flex-wrap items-center justify-center gap-2"
        data-testid="cosmetics-shelf"
      >
        {openItems.length === 0 ? (
          <p className="py-2 text-center text-xs uppercase tracking-[0.08em] text-ink/70">
            {openCategory.emptyNote}
          </p>
        ) : (
          openItems.map((item) => (
            <CosmeticChip
              key={item.id}
              item={item}
              busy={busy}
              onEquip={onEquip}
              onPreview={onPreview}
            />
          ))
        )}
      </div>

      {error && (
        <p
          role="status"
          className="text-center text-xs text-strike-red"
          data-testid="cosmetics-error"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className={`${chipBase} justify-center px-5`}
        data-testid="cosmetics-close"
      >
        Done
      </button>
    </section>
  );
}

function CosmeticChip({
  item,
  busy,
  onEquip,
  onPreview,
}: {
  item: SnakeCosmeticItem;
  busy: boolean;
  onEquip: CosmeticsMenuProps['onEquip'];
  onPreview: CosmeticsMenuProps['onPreview'];
}) {
  const action = snakeCosmeticAction(item);

  // A supporter item is a LINK, not a button that happens to navigate. The
  // store is reached by navigation (R7), and the platform should be able to
  // say so — it opens in the same tab, it is in the tab order as a link, and
  // it carries no price because this surface never quotes one.
  if (action === 'shop') {
    return (
      <Link
        href="/shop"
        className={`${chipBase} opacity-90`}
        data-testid={`cosmetic-${item.id}`}
        data-action="shop"
        onMouseEnter={() => onPreview(item)}
        onFocus={() => onPreview(item)}
        onBlur={() => onPreview(null)}
      >
        <span aria-hidden="true">★</span>
        {item.name}
        <span className="sr-only">— supporters only. Opens the shop.</span>
        <span
          aria-hidden="true"
          className="text-[10px] uppercase tracking-[0.08em] opacity-70"
        >
          Supporters
        </span>
      </Link>
    );
  }

  const locked = action === 'locked';

  return (
    <button
      type="button"
      disabled={busy || locked}
      onClick={() => onEquip(item)}
      onMouseEnter={() => onPreview(item)}
      onFocus={() => onPreview(item)}
      onBlur={() => onPreview(null)}
      aria-pressed={item.equipped}
      className={`${chipBase} ${item.equipped ? 'ink-chip-selected' : ''} ${
        locked ? 'opacity-50' : ''
      }`}
      data-testid={`cosmetic-${item.id}`}
      data-action={action}
    >
      {item.name}
      {item.equipped && (
        <span className="text-[10px] uppercase tracking-[0.08em] opacity-70">
          On
        </span>
      )}
      {locked && (
        <span className="text-[10px] uppercase tracking-[0.08em] opacity-70">
          Locked
        </span>
      )}
    </button>
  );
}

export default CosmeticsMenu;
