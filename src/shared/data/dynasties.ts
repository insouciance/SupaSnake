/**
 * Placeholder Dynasty Data - MVP Content
 * 3 Dynasties × 10 Variants = 30 Total Collectibles
 *
 * Naming: [DYNASTY] n/N format
 * Rarity Distribution:
 *  - 1-3: Common (30%)
 *  - 4-6: Uncommon (30%)
 *  - 7-8: Rare (20%)
 *  - 9: Epic (10%)
 *  - 10: Legendary (10%)
 */

import { Dynasty, SnakeVariant, Rarity, DynastyId, SnakeStats } from '../types/game';

/**
 * Helper: Determine rarity based on variant number
 * Exported for testing
 */
export function getRarityForVariant(variantNum: number): Rarity {
  if (variantNum <= 3) return 'common';
  if (variantNum <= 6) return 'uncommon';
  if (variantNum <= 8) return 'rare';
  if (variantNum === 9) return 'epic';
  return 'legendary';
}

/**
 * Helper: Generate stats based on rarity
 * Exported for testing
 */
export function getStatsForRarity(rarity: Rarity): SnakeStats {
  const statsMap: Record<Rarity, SnakeStats> = {
    common: { dnaBonus: 0.0, speedBonus: 0.0, sizeBonus: 0 },
    uncommon: { dnaBonus: 0.1, speedBonus: 0.05, sizeBonus: 0 },
    rare: { dnaBonus: 0.25, speedBonus: 0.1, sizeBonus: 1 },
    epic: { dnaBonus: 0.5, speedBonus: 0.15, sizeBonus: 1 },
    legendary: { dnaBonus: 1.0, speedBonus: 0.25, sizeBonus: 2 },
  };
  return statsMap[rarity];
}

/**
 * Helper: Create a snake variant
 * Exported for testing
 */
export function createVariant(
  dynastyId: DynastyId,
  variantNumber: number,
  colorPrimary: string,
  colorSecondary: string,
): SnakeVariant {
  const rarity = getRarityForVariant(variantNumber);
  const stats = getStatsForRarity(rarity);

  return {
    id: `${dynastyId}_${variantNumber}`,
    dynastyId,
    variantNumber,
    totalInDynasty: 10,
    displayName: `${dynastyId} ${variantNumber}/10`,
    rarity,
    description: `A ${rarity} ${dynastyId} snake. Placeholder description for variant ${variantNumber}.`,
    stats,
    colorPrimary,
    colorSecondary,
  };
}

/**
 * EMBER Dynasty - Fire/Heat Theme
 */
const EMBER_COLORS = {
  primary: '#FF4500',
  secondary: '#FFD700',
  variants: [
    ['#FF6347', '#FFA500'],
    ['#FF4500', '#FF8C00'],
    ['#FF6B6B', '#FFB347'],
    ['#DC143C', '#FF1493'],
    ['#8B0000', '#B22222'],
    ['#FF0000', '#FF4500'],
    ['#C41E3A', '#FFD700'],
    ['#8B4513', '#D2691E'],
    ['#800000', '#FF6347'],
    ['#FF0000', '#FFD700'],
  ] as [string, string][],
};

const emberDynasty: Dynasty = {
  id: 'EMBER',
  name: 'EMBER',
  description: 'Born from volcanic fury. These serpents embody raw elemental power.',
  theme: 'Fire & Heat',
  colorPrimary: EMBER_COLORS.primary,
  variants: Array.from({ length: 10 }, (_, i) => {
    const variantNum = i + 1;
    const [primary, secondary] = EMBER_COLORS.variants[i];
    return createVariant('EMBER', variantNum, primary, secondary);
  }),
  unlocked: true,
};

/**
 * CRYSTAL Dynasty - Ice/Precision Theme
 */
const CRYSTAL_COLORS = {
  primary: '#00CED1',
  secondary: '#E0FFFF',
  variants: [
    ['#87CEEB', '#B0E0E6'],
    ['#00BFFF', '#87CEFA'],
    ['#1E90FF', '#6495ED'],
    ['#00CED1', '#48D1CC'],
    ['#20B2AA', '#5F9EA0'],
    ['#4682B4', '#4169E1'],
    ['#0000CD', '#191970'],
    ['#000080', '#00008B'],
    ['#1434A4', '#0F52BA'],
    ['#0000FF', '#E0FFFF'],
  ] as [string, string][],
};

const crystalDynasty: Dynasty = {
  id: 'CRYSTAL',
  name: 'CRYSTAL',
  description: 'Forged in eternal glaciers. Masters of precision and control.',
  theme: 'Ice & Clarity',
  colorPrimary: CRYSTAL_COLORS.primary,
  variants: Array.from({ length: 10 }, (_, i) => {
    const variantNum = i + 1;
    const [primary, secondary] = CRYSTAL_COLORS.variants[i];
    return createVariant('CRYSTAL', variantNum, primary, secondary);
  }),
  unlocked: false,
};

/**
 * VOID Dynasty - Shadow/Mystery Theme
 */
const VOID_COLORS = {
  primary: '#4B0082',
  secondary: '#9370DB',
  variants: [
    ['#696969', '#808080'],
    ['#708090', '#778899'],
    ['#2F4F4F', '#556B2F'],
    ['#483D8B', '#6A5ACD'],
    ['#663399', '#8B008B'],
    ['#4B0082', '#8A2BE2'],
    ['#9400D3', '#9932CC'],
    ['#8B00FF', '#9400D3'],
    ['#6A0DAD', '#7F00FF'],
    ['#000000', '#9370DB'],
  ] as [string, string][],
};

const voidDynasty: Dynasty = {
  id: 'VOID',
  name: 'VOID',
  description: 'Emerged from primordial darkness. Enigmatic and unpredictable.',
  theme: 'Shadow & Mystery',
  colorPrimary: VOID_COLORS.primary,
  variants: Array.from({ length: 10 }, (_, i) => {
    const variantNum = i + 1;
    const [primary, secondary] = VOID_COLORS.variants[i];
    return createVariant('VOID', variantNum, primary, secondary);
  }),
  unlocked: false,
};

/**
 * Export all dynasties
 */
export const ALL_DYNASTIES: Dynasty[] = [
  emberDynasty,
  crystalDynasty,
  voidDynasty,
];

/**
 * Quick lookup maps
 */
export const DYNASTIES_BY_ID: Record<DynastyId, Dynasty> = {
  EMBER: emberDynasty,
  CRYSTAL: crystalDynasty,
  VOID: voidDynasty,
};

export const ALL_VARIANTS: SnakeVariant[] = ALL_DYNASTIES.flatMap(d => d.variants);

export const VARIANTS_BY_ID: Record<string, SnakeVariant> = Object.fromEntries(
  ALL_VARIANTS.map(v => [v.id, v])
);

/**
 * Starter snakes (player begins with these)
 */
export const STARTER_VARIANTS: SnakeVariant[] = [
  VARIANTS_BY_ID['EMBER_1'],
];

/**
 * Helper: Get random variant for breeding result
 */
export function getRandomVariantForBreeding(
  parent1Dynasty: DynastyId,
  parent2Dynasty: DynastyId,
): SnakeVariant {
  if (parent1Dynasty === parent2Dynasty) {
    const dynasty = DYNASTIES_BY_ID[parent1Dynasty];
    const randomIndex = Math.floor(Math.random() * dynasty.variants.length);
    return dynasty.variants[randomIndex];
  }

  const selectedDynasty = Math.random() < 0.5 ? parent1Dynasty : parent2Dynasty;
  const dynasty = DYNASTIES_BY_ID[selectedDynasty];
  const randomIndex = Math.floor(Math.random() * dynasty.variants.length);
  return dynasty.variants[randomIndex];
}
