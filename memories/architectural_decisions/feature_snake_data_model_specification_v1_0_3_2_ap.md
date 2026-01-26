# feature_snake_data_model_specification_v1_0_3_2_ap

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:39.600536+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Snake Data Model Specification v1.0: 3.2 API Endpoints

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/SNAKE_DATA_MODEL_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/dynasties` | GET | List all active dynasties | - | `{ dynasties: Dynasty[] }` |
| `/api/dynasties/:id/variants` | GET | List variants in dynasty | - | `{ variants: Variant[] }` |
| `/api/variants` | GET | List all variants | `?dynasty=CYBER` | `{ variants: Variant[] }` |
| `/api/variants/:id` | GET | Get single variant | - | `{ variant: Variant }` |
| `/api/collection` | GET | Get player's collection | - | `{ snakes: OwnedSnake[] }` |
| `/api/collection/unlock` | POST | Unlock a variant | `{ variantId: UUID }` | `{ snake: OwnedSnake }` |
| `/api/collection/equip` | POST | Equip a snake | `{ snakeId: UUID }` | `{ success: boolean }` |

**TypeScript Types:**

```typescript
// Types derived from database schema

interface Dynasty {
  id: string;
  name: string;
  displayName: string;
  description: string;
  colorPrimary: string;
  colorSecondary: string;
  statBonusType: 'speed' | 'dna_generation' | 'size';
  statBonusValue: number;
  sortOrder: number;
}

interface SnakeVariant {
  id: string;
  dynastyId: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  loreText: string;
  artUrl: string | null;
  baseStats: SnakeStats;
  unlockCostDna: number;
  isStarter: boolean;
  sortOrder: number;
}

interface SnakeStats {
  speed: number;
  size: number;
  hp: number;
}

interface OwnedSnake {
  id: string;
  userId: string;
  variantId: string;
  variant: SnakeVariant;        // Joined
  dynasty: Dynasty;             // Joined
  generation: number;
  parent1Id: string | null;
  parent2Id: string | null;
  acquiredAt: Date;
  acquiredMethod: 'tutorial' | 'unlock' | 'bred';
  isEquipped: boolean;
  isFavorited: boolean;
  // Computed
  effectiveStats: SnakeStats;   // Base * generation scaling * dynasty bonus
}

// Computed stats helper
function computeEffectiveStats(
  baseStats: SnakeStats,
  generation: number,
  dynasty: Dynasty
): SnakeStats {
  const genMultiplier = 1 + (generation - 1) * 0.05;
  const stats = {
    speed: baseStats.speed * genMultiplier,
    size: baseStats.size * genMultiplier,
    hp: baseStats.hp * genMultiplier,
  };

  // Apply dynasty bonus
  if (dynasty.statBonusType === 'speed') {
    stats.speed *= (1 + dynasty.statBonusValue);
  } else if (dynasty.statBonusType === 'size') {
    stats.size *= (1 + dynasty.statBonusValue);
  }
  // dna_generation bonus applies to rewards, not stats

  return stats;
}
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
