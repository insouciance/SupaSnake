# feature_breeding_system_specification_v1_0_3_2_api

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:36.521087+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Breeding System Specification v1.0: 3.2 API Endpoints

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/BREEDING_SYSTEM_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/breeding/preview` | POST | Calculate cost without breeding | `{ parent1Id, parent2Id }` | `{ cost, offspringGen, possibleVariants }` |
| `/api/breeding/breed` | POST | Execute breeding | `{ parent1Id, parent2Id }` | `{ offspring: OwnedSnake, cost, history }` |
| `/api/breeding/history` | GET | Get breeding history | `?limit=20` | `{ breedings: BreedingRecord[] }` |

**TypeScript Types:**

```typescript
interface BreedingPreview {
  parent1: OwnedSnake;
  parent2: OwnedSnake;
  dnaCost: number;
  offspringGeneration: number;
  possibleVariants: SnakeVariant[];  // Usually 2 (or 1 if same variant)
  userDnaBalance: number;
  canAfford: boolean;
}

interface BreedingResult {
  offspring: OwnedSnake;
  cost: number;
  historyId: string;
}

interface BreedingRecord {
  id: string;
  parent1: OwnedSnake;
  parent2: OwnedSnake;
  offspring: OwnedSnake;
  dnaCost: number;
  bredAt: Date;
}
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
