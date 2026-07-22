/**
 * @jest-environment node
 */

/**
 * Variants API Utils Tests
 */

import { mapVariantRow } from './utils';

describe('mapVariantRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      dynasty_id: 'dynasty-uuid',
      name: 'CYBER SPARK',
      rarity: 'common',
      lore_text: 'Test lore',
      art_url: null,
      base_stats: { speed: 10, size: 5, hp: 100 },
      unlock_cost_dna: 500,
      is_starter: false,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapVariantRow(row);

    expect(result.id).toBe('uuid-123');
    expect(result.dynastyId).toBe('dynasty-uuid');
    expect(result.name).toBe('CYBER SPARK');
    expect(result.rarity).toBe('common');
    expect(result.loreText).toBe('Test lore');
    expect(result.artUrl).toBeNull();
    expect(result.baseStats).toEqual({ speed: 10, size: 5, hp: 100 });
    expect(result.unlockCostDna).toBe(500);
    expect(result.isStarter).toBe(false);
    expect(result.sortOrder).toBe(1);
    expect(result.isActive).toBe(true);
  });

  it('should handle starter variant', () => {
    const row = {
      id: 'uuid-123',
      dynasty_id: 'dynasty-uuid',
      name: 'CYBER SPARK',
      rarity: 'common',
      lore_text: 'Starter lore',
      art_url: 'https://example.com/art.png',
      base_stats: { speed: 10, size: 5, hp: 100 },
      unlock_cost_dna: 0,
      is_starter: true,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapVariantRow(row);

    expect(result.isStarter).toBe(true);
    expect(result.unlockCostDna).toBe(0);
    expect(result.artUrl).toBe('https://example.com/art.png');
  });

  it('maps and sanitizes Genome affinity columns', () => {
    const result = mapVariantRow({
      id: 'uuid-123',
      dynasty_id: 'dynasty-uuid',
      name: 'CYBER VORTEX',
      rarity: 'rare',
      base_stats: { speed: 10, size: 5, hp: 100 },
      unlock_cost_dna: 2000,
      is_starter: false,
      sort_order: 7,
      is_active: true,
      lineage_strain: 'VOLT',
      affinity_strength: 1,
    });
    expect(result.lineageStrain).toBe('VOLT');
    expect(result.affinityStrength).toBe(1);
  });
});
