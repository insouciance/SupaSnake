# feature_breeding_system_specification_v1_0_2_1_cor

**Domain:** architecture
**Category:** decision
**Captured:** 2026-01-26T09:26:36.262672+00:00
**Tags:** specification, decision, documentation

## Summary

# Feature: Breeding System Specification v1.0: 2.1 Core Mechanics

**Type:** specification
**Domain:** architecture
**Category:** decision
**Source:** docs/game/specs/BREEDING_SYSTEM_spec.md
**Captured:** 2026-01-26 10:26



## Content

**Breeding Formula:**
```
INPUTS:
- Parent 1: OwnedSnake (dynasty A, generation X, variant V1)
- Parent 2: OwnedSnake (dynasty A, generation Y, variant V2)

VALIDATION:
- Parent 1 and Parent 2 must be same dynasty
- Player must own both parents
- Player must have sufficient DNA

DNA COST:
- cost = 200 + ((parent1.generation + parent2.generation) / 2) × 100
- Gen 1 + Gen 1 → 200 + 100 = 300 DNA
- Gen 2 + Gen 2 → 200 + 200 = 400 DNA
- Gen 5 + Gen 5 → 200 + 500 = 700 DNA

OUTPUTS:
- Offspring Generation: max(parent1.generation, parent2.generation) + 1
- Offspring Dynasty: Same as parents (100% inheritance)
- Offspring Variant: 50% chance parent1's variant, 50% chance parent2's variant
- Offspring Stats: base_stats × (1 + (offspring_generation - 1) × 0.05)
```

**User Flow:**
```
1. User opens Lab → taps "Breed" tab
2. User sees parent selection slots (empty)
3. User taps "Select Parent 1" → opens snake picker (filtered to owned)
4. User selects a snake → Parent 1 slot filled
5. User taps "Select Parent 2" → opens snake picker (filtered to same dynasty)
6. User selects another snake → Parent 2 slot filled
7. System shows DNA cost and offspring preview
8. User taps "Breed" → DNA deducted, offspring created instantly
9. Celebration animation plays
10. Offspring card revealed with stats
11. User taps "View in Collection" → opens Collection at new snake
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
