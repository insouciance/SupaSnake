/**
 * @jest-environment node
 */

/**
 * Dynasties API Utils Tests
 */

import { mapDynastyRow } from './utils';

describe('mapDynastyRow', () => {
  it('should convert snake_case to camelCase', () => {
    const row = {
      id: 'uuid-123',
      name: 'CYBER',
      display_name: 'Cyber Dynasty',
      description: 'Test description',
      color_primary: '#00FFFF',
      color_secondary: '#FF00FF',
      stat_bonus_type: 'speed',
      stat_bonus_value: 0.05,
      sort_order: 1,
      is_active: true,
      created_at: '2025-01-22T00:00:00Z',
      updated_at: '2025-01-22T00:00:00Z',
    };

    const result = mapDynastyRow(row);

    expect(result.id).toBe('uuid-123');
    expect(result.name).toBe('CYBER');
    expect(result.displayName).toBe('Cyber Dynasty');
    expect(result.colorPrimary).toBe('#00FFFF');
    expect(result.colorSecondary).toBe('#FF00FF');
    expect(result.statBonusType).toBe('speed');
    expect(result.statBonusValue).toBe(0.05);
    expect(result.sortOrder).toBe(1);
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBe('2025-01-22T00:00:00Z');
    expect(result.updatedAt).toBe('2025-01-22T00:00:00Z');
  });
});
