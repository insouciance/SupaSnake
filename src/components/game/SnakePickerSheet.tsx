'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { compareOwnedSnakes, highestGenerationSnakes } from '@/lib/collection/roster';
import { sanitizeLineage } from '@/shared/game/lineage';
import { sanitizeTraits, TRAITS } from '@/shared/game/traits';
import type { OwnedSnake } from '@/shared/types/snake-data-model';
import type { StrainId } from '@/shared/game/strains';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { IconCheck, IconCrown, IconFlask, IconX } from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';

export const SETUP_DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'] as const;
export type SetupDynasty = (typeof SETUP_DYNASTIES)[number];

const DYNASTY_STRAIN: Record<SetupDynasty, StrainId> = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
};

const DYNASTY_COLOR: Record<SetupDynasty, string> = {
  CYBER: 'text-cyber',
  PRIMAL: 'text-primal-glow',
  COSMIC: 'text-cosmic-glow',
};

export interface SnakePickerSheetProps {
  isOpen: boolean;
  snakes: readonly OwnedSnake[];
  equippedSnakeId: string | null;
  selectingSnakeId: string | null;
  error: string | null;
  /** When present, this chooser fills that dynasty's empty cockpit dock. */
  favoriteDynasty?: SetupDynasty | null;
  /** Safe Lab doorway carrying only this unsent setup draft. */
  labHref?: string;
  onSelect: (snake: OwnedSnake) => void;
  onClose: () => void;
}

export function setupDynasty(value: unknown): SetupDynasty | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase();
  return SETUP_DYNASTIES.find((dynasty) => dynasty === normalized) ?? null;
}

function favoriteVariantIds(
  snakes: readonly OwnedSnake[],
  dynasty: SetupDynasty
): Set<string> {
  return new Set(
    snakes
      .filter(
        (snake) =>
          snake.isFavorited &&
          setupDynasty(snake.dynastyName) === dynasty &&
          snake.snakeVariantId !== null
      )
      .map((snake) => snake.snakeVariantId as string)
  );
}

function activeSnakeCarriesFavorite(
  snake: OwnedSnake,
  inheritedFavoriteVariants: ReadonlySet<string>
): boolean {
  return (
    snake.isFavorited ||
    (snake.snakeVariantId !== null && inheritedFavoriteVariants.has(snake.snakeVariantId))
  );
}

/**
 * Exactly one compact setup favorite per active dynasty.
 *
 * Favouriting predates the evolving-lineage presentation and is stored on a
 * collected row. If an older generation was favourited, this projection
 * follows that variant to its active highest generation rather than making
 * the dock mysteriously empty after breeding. Duplicate legacy favourites
 * resolve deterministically; this function never mutates authoritative data.
 */
export function favoriteSetupSnakesByDynasty(
  snakes: readonly OwnedSnake[],
  equippedSnakeId: string | null
): Record<SetupDynasty, OwnedSnake | null> {
  const active = highestGenerationSnakes(snakes);
  return SETUP_DYNASTIES.reduce<Record<SetupDynasty, OwnedSnake | null>>(
    (result, dynasty) => {
      const inherited = favoriteVariantIds(snakes, dynasty);
      const candidates = active
        .filter(
          (snake) =>
            setupDynasty(snake.dynastyName) === dynasty &&
            activeSnakeCarriesFavorite(snake, inherited)
        )
        .sort((a, b) => compareOwnedSnakes(a, b, equippedSnakeId));
      result[dynasty] = candidates[0] ?? null;
      return result;
    },
    { CYBER: null, PRIMAL: null, COSMIC: null }
  );
}

/**
 * The quick chooser is deliberately not the Collection. It exposes only the
 * active, highest generation of each variant (including genuinely distinct
 * equal-generation builds) and never locked catalog entries or pedigree rows.
 */
export function activeSetupSnakes(
  snakes: readonly OwnedSnake[],
  equippedSnakeId: string | null
): OwnedSnake[] {
  const favoriteVariants = new Set(
    snakes
      .filter((snake) => snake.isFavorited && snake.snakeVariantId !== null)
      .map((snake) => snake.snakeVariantId as string)
  );

  return highestGenerationSnakes(snakes).sort((a, b) => {
    const aEquipped = a.id === equippedSnakeId ? 0 : 1;
    const bEquipped = b.id === equippedSnakeId ? 0 : 1;
    if (aEquipped !== bEquipped) return aEquipped - bEquipped;

    const aFavorite = activeSnakeCarriesFavorite(a, favoriteVariants) ? 0 : 1;
    const bFavorite = activeSnakeCarriesFavorite(b, favoriteVariants) ? 0 : 1;
    if (aFavorite !== bFavorite) return aFavorite - bFavorite;

    const dynasty = (a.dynastyName ?? '').localeCompare(b.dynastyName ?? '');
    if (dynasty !== 0) return dynasty;
    const variant = (a.variantName ?? a.variantId).localeCompare(
      b.variantName ?? b.variantId
    );
    if (variant !== 0) return variant;
    return compareOwnedSnakes(a, b, equippedSnakeId);
  });
}

/** The useful distinction between equal-generation builds. */
export function snakeBuildSignature(snake: OwnedSnake): string {
  const traitNames = sanitizeTraits(snake.traits).map((trait) => TRAITS[trait].name);
  const lineage = sanitizeLineage(snake.lineage);
  const lineageLabel = lineage
    ? `${lineage.strains.join(' + ')} lineage${lineage.strength > 0 ? ` ${lineage.strength}` : ''}`
    : null;
  const parts = [...traitNames, ...(lineageLabel ? [lineageLabel] : [])];
  return parts.length > 0 ? parts.join(' · ') : 'Original genome';
}

export function SnakePickerSheet({
  isOpen,
  snakes,
  equippedSnakeId,
  selectingSnakeId,
  error,
  favoriteDynasty = null,
  labHref = '/lab?returnTo=%2Fgame',
  onSelect,
  onClose,
}: SnakePickerSheetProps) {
  const activeSnakes = useMemo(() => {
    const active = activeSetupSnakes(snakes, equippedSnakeId);
    return favoriteDynasty
      ? active.filter((snake) => setupDynasty(snake.dynastyName) === favoriteDynasty)
      : active;
  }, [snakes, equippedSnakeId, favoriteDynasty]);

  const favoriteVariants = useMemo(
    () =>
      new Set(
        snakes
          .filter((snake) => snake.isFavorited && snake.snakeVariantId !== null)
          .map((snake) => snake.snakeVariantId as string)
      ),
    [snakes]
  );

  if (!isOpen) return null;

  const title = favoriteDynasty
    ? `Choose ${favoriteDynasty} favorite`
    : 'Choose your snake';
  const description = favoriteDynasty
    ? 'Pick the active lineage that should live in this launch dock. It will also equip for this setup.'
    : 'Your active lineages. Choosing equips the snake here; the run starts only when you press Play.';

  return (
    <ModalDialog
      onClose={onClose}
      ariaLabelledBy="snake-picker-title"
      ariaDescribedBy="snake-picker-description"
      testId="snake-picker-sheet"
      panelClassName="max-w-lg overflow-hidden rounded-[26px] border border-cyber/40 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.16),transparent_42%),linear-gradient(180deg,#16202b,#06090d)] shadow-glow-lg shadow-cyber/15 animate-pop-in"
    >
      <header className="flex items-start justify-between gap-3 border-b border-scale-blue-light/30 px-4 py-4 text-left sm:px-5">
        <div className="min-w-0">
          <p className="label-arcade text-cyber">Launch roster</p>
          <h2 id="snake-picker-title" className="mt-0.5 truncate heading-display text-xl text-bone-white">
            {title}
          </h2>
          <p id="snake-picker-description" className="mt-1 max-w-md font-body text-xs leading-snug text-beige/65">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close snake picker"
          className="-m-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-beige transition-colors hover:bg-bone-white/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber"
        >
          <IconX size={19} />
        </button>
      </header>

      <div className="max-h-[min(62dvh,34rem)] space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {activeSnakes.length === 0 ? (
          <p className="px-3 py-8 text-center font-body text-sm text-beige/65">
            {favoriteDynasty
              ? `No active ${favoriteDynasty} snake is available yet.`
              : 'No active snake could be loaded. Open the Lab to review your collection.'}
          </p>
        ) : (
          activeSnakes.map((snake) => {
            const equipped = snake.id === equippedSnakeId;
            const selecting = snake.id === selectingSnakeId;
            const name = snake.variantName ?? snake.variantId ?? 'Snake';
            const dynasty = setupDynasty(snake.dynastyName) ?? 'PRIMAL';
            const signature = snakeBuildSignature(snake);
            const favorite = activeSnakeCarriesFavorite(snake, favoriteVariants);

            return (
              <button
                key={snake.id}
                type="button"
                onClick={() => onSelect(snake)}
                disabled={selectingSnakeId !== null}
                aria-label={`${favoriteDynasty ? 'Set favorite' : 'Choose'} ${name}, generation ${snake.generation}, ${signature}`}
                aria-pressed={equipped}
                data-testid={`snake-picker-option-${snake.id}`}
                className={`group flex min-h-[68px] w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-[border-color,background-color,transform] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber disabled:cursor-wait ${
                  equipped
                    ? 'border-cyber/70 bg-cyber/10 shadow-glow-sm shadow-cyber/20'
                    : 'border-scale-blue-light/35 bg-void-deep/65 hover:border-cosmic/55 hover:bg-cosmic/10'
                }`}
              >
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current/35 bg-void/80 ${DYNASTY_COLOR[dynasty]}`}>
                  <span className="h-6 w-6">
                    <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-display text-sm text-bone-white">{name}</span>
                    <span className={`shrink-0 font-mono text-[9px] uppercase ${DYNASTY_COLOR[dynasty]}`}>
                      {dynasty}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-body text-xs text-beige/70">
                    {signature}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-beige/50">
                    <span>Gen {snake.generation}</span>
                    {favorite ? (
                      <span className="inline-flex items-center gap-1 text-rarity-legendary">
                        <IconCrown size={11} /> Favorite
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="inline-flex shrink-0 justify-end font-body text-xs font-semibold text-cyber whitespace-nowrap">
                  {selecting ? 'Saving…' : equipped && !favoriteDynasty ? (
                    <span className="inline-flex items-center gap-1">
                      <IconCheck size={14} /> Current
                    </span>
                  ) : favoriteDynasty ? 'Set favorite' : 'Choose'}
                </span>
              </button>
            );
          })
        )}
      </div>

      {error && (
        <p className="mx-4 mb-3 font-body text-sm text-strike-red" role="alert">
          {error}
        </p>
      )}

      <footer className="border-t border-scale-blue-light/30 px-4 py-3 text-center">
        <Link
          href={labHref}
          className="btn-neutral inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs whitespace-nowrap sm:w-auto"
        >
          <IconFlask size={16} />
          Open Snake Lab
        </Link>
      </footer>
    </ModalDialog>
  );
}

export default SnakePickerSheet;
