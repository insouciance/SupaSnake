/**
 * Tests for FTUE starter selection logic
 */

import { bonusTextFor, buildStarterCards } from './starterUtils';
import type { SnakeVariant, Dynasty } from '@/shared/types/snake-data-model';

function makeDynasty(overrides: Partial<Dynasty>): Dynasty {
  return {
    id: 'dyn-1',
    name: 'CYBER',
    displayName: 'Cyber Dynasty',
    description: '',
    colorPrimary: '#00FFFF',
    colorSecondary: '#FF00FF',
    statBonusType: 'speed',
    statBonusValue: 0.05,
    sortOrder: 1,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeVariant(overrides: Partial<SnakeVariant>): SnakeVariant {
  return {
    id: 'var-1',
    dynastyId: 'dyn-1',
    name: 'CYBER SPARK',
    rarity: 'common',
    loreText: null,
    artUrl: null,
    baseStats: { speed: 10, size: 5, hp: 100 },
    unlockCostDna: 0,
    isStarter: true,
    sortOrder: 1,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('bonusTextFor', () => {
  it('renders CYBER speed bonus', () => {
    expect(bonusTextFor('speed', 0.05)).toBe('+5% Speed');
  });

  it('renders PRIMAL DNA bonus', () => {
    expect(bonusTextFor('dna_generation', 0.05)).toBe('+5% DNA');
  });

  it('renders COSMIC size bonus', () => {
    expect(bonusTextFor('size', 0.05)).toBe('+5% Size');
  });

  it('accepts percent-style values (5 -> +5%)', () => {
    expect(bonusTextFor('dna_generation', 5)).toBe('+5% DNA');
  });

  it('handles unknown bonus types and invalid values', () => {
    expect(bonusTextFor('luck', 0.1)).toBe('+10% luck');
    expect(bonusTextFor('speed', 0)).toBe('+0% Speed');
    expect(bonusTextFor('speed', NaN)).toBe('+0% Speed');
  });
});

describe('buildStarterCards', () => {
  const dynasties: Dynasty[] = [
    makeDynasty({ id: 'cyber', name: 'CYBER', statBonusType: 'speed', sortOrder: 1 }),
    makeDynasty({
      id: 'primal',
      name: 'PRIMAL',
      displayName: 'Primal Dynasty',
      colorPrimary: '#2d5016',
      colorSecondary: '#8b4513',
      statBonusType: 'dna_generation',
      sortOrder: 2,
    }),
    makeDynasty({
      id: 'cosmic',
      name: 'COSMIC',
      displayName: 'Cosmic Dynasty',
      colorPrimary: '#4a0e4e',
      colorSecondary: '#ffd700',
      statBonusType: 'size',
      sortOrder: 3,
    }),
  ];

  const variants: SnakeVariant[] = [
    makeVariant({ id: 'v-cyber', dynastyId: 'cyber', name: 'CYBER SPARK' }),
    makeVariant({ id: 'v-cyber-2', dynastyId: 'cyber', name: 'CYBER VOLT', isStarter: false }),
    makeVariant({ id: 'v-primal', dynastyId: 'primal', name: 'PRIMAL SEED' }),
    makeVariant({ id: 'v-cosmic', dynastyId: 'cosmic', name: 'COSMIC DUST' }),
  ];

  it('builds one card per dynasty in dynasty sort order', () => {
    const cards = buildStarterCards(variants, dynasties);

    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.dynastyName)).toEqual(['CYBER', 'PRIMAL', 'COSMIC']);
    expect(cards.map((c) => c.variant.id)).toEqual(['v-cyber', 'v-primal', 'v-cosmic']);
  });

  it('only includes starter variants', () => {
    const cards = buildStarterCards(variants, dynasties);
    expect(cards.find((c) => c.variant.id === 'v-cyber-2')).toBeUndefined();
  });

  it('attaches dynasty colors and bonus text', () => {
    const cards = buildStarterCards(variants, dynasties);
    const primal = cards.find((c) => c.dynastyName === 'PRIMAL')!;

    expect(primal.primaryColor).toBe('#2d5016');
    expect(primal.secondaryColor).toBe('#8b4513');
    expect(primal.bonusText).toBe('+5% DNA');
  });

  it('picks the lowest sort-order starter when a dynasty has several', () => {
    const withExtra = [
      ...variants,
      makeVariant({ id: 'v-cyber-alt', dynastyId: 'cyber', name: 'CYBER ALT', sortOrder: 0 }),
    ];

    const cards = buildStarterCards(withExtra, dynasties);
    expect(cards.find((c) => c.dynastyName === 'CYBER')?.variant.id).toBe('v-cyber-alt');
  });

  it('skips dynasties without a starter and inactive entries', () => {
    const cards = buildStarterCards(
      [
        makeVariant({ id: 'v-cyber', dynastyId: 'cyber' }),
        makeVariant({ id: 'v-primal', dynastyId: 'primal', isActive: false }),
      ],
      [...dynasties, makeDynasty({ id: 'ghost', name: 'GHOST', sortOrder: 4, isActive: false })]
    );

    expect(cards.map((c) => c.dynastyName)).toEqual(['CYBER']);
  });

  it('handles empty catalogs', () => {
    expect(buildStarterCards([], [])).toEqual([]);
    expect(buildStarterCards([], dynasties)).toEqual([]);
  });
});
