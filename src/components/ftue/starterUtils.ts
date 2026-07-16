/**
 * FTUE Starter Selection - pure card-building logic
 *
 * Builds one starter card per dynasty from the variants + dynasties
 * catalogs, with dynasty colors and human-readable bonus text.
 */

import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';

export interface StarterCard {
  variant: SnakeVariant;
  dynastyName: string;
  dynastyDisplayName: string;
  primaryColor: string;
  secondaryColor: string;
  bonusText: string;
}

const BONUS_LABELS: Record<string, string> = {
  speed: 'Speed',
  dna_generation: 'DNA',
  size: 'Size',
};

/**
 * Human-readable dynasty bonus, e.g. "+5% DNA".
 * Accepts fractional (0.05) or percent-style (5) bonus values.
 */
export function bonusTextFor(
  statBonusType: string,
  statBonusValue: number
): string {
  const percent =
    Number.isFinite(statBonusValue) && statBonusValue > 0
      ? statBonusValue < 1
        ? Math.round(statBonusValue * 100)
        : Math.round(statBonusValue)
      : 0;
  const label = BONUS_LABELS[statBonusType] ?? statBonusType;
  return `+${percent}% ${label}`;
}

/**
 * One starter card per active dynasty: the lowest sort-order starter
 * variant of each dynasty, ordered by dynasty sort order.
 */
export function buildStarterCards(
  variants: SnakeVariant[],
  dynasties: Dynasty[]
): StarterCard[] {
  const cards: StarterCard[] = [];

  const sortedDynasties = [...dynasties]
    .filter((d) => d.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const dynasty of sortedDynasties) {
    const starter = variants
      .filter((v) => v.isStarter && v.dynastyId === dynasty.id && v.isActive !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];

    if (!starter) continue;

    cards.push({
      variant: starter,
      dynastyName: dynasty.name,
      dynastyDisplayName: dynasty.displayName || dynasty.name,
      primaryColor: dynasty.colorPrimary,
      secondaryColor: dynasty.colorSecondary,
      bonusText: bonusTextFor(dynasty.statBonusType, dynasty.statBonusValue),
    });
  }

  return cards;
}
