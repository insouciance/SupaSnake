/**
 * FTUE Starter Selection - pure card-building logic
 *
 * Builds one starter card per dynasty from the variants + dynasties
 * catalogs, with dynasty colors and the dynasty's ruleset identity line.
 * (Design v2: starters differ by RULESET, not by percentage stats - the
 * old "+5% Speed/DNA/Size" copy is gone.)
 */

import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';
import { normalizeDynastyName, rulesetExplainer } from '@/shared/game/rulesets';

export interface StarterCard {
  variant: SnakeVariant;
  dynastyName: string;
  dynastyDisplayName: string;
  primaryColor: string;
  secondaryColor: string;
  bonusText: string;
}

/**
 * The dynasty's one-line ruleset identity, e.g. for PRIMAL:
 * "Steady speed — every food worth more than the last".
 */
export function bonusTextFor(dynastyName: string): string {
  return rulesetExplainer[normalizeDynastyName(dynastyName)];
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
      bonusText: bonusTextFor(dynasty.name),
    });
  }

  return cards;
}
