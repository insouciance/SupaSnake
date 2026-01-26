# feature_snake_data_model_specification_v1_0_core_d

**Domain:** architecture
**Category:** decision
**Captured:** 2026-01-26T09:26:39.203030+00:00
**Tags:** specification, decision, documentation

## Summary

# Feature: Snake Data Model Specification v1.0: Core Decisions

**Type:** specification
**Domain:** architecture
**Category:** decision
**Source:** docs/game/specs/SNAKE_DATA_MODEL_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Variant Count** | 5 variants for MVP | Minimum to test breeding loop (1 starter + 4 breedable) |
| **Dynasty Scope** | 3 dynasties (CYBER, PRIMAL, COSMIC) | Already locked in Dynasty spec |
| **Stat Model** | Base stats + Generation scaling | Simple, expandable, supports breeding progression |
| **Rarity for MVP** | Common only (500 DNA) | Reduce complexity, test loop before economy |
| **Data Location** | Supabase with local cache | Server authority, offline-friendly browsing |

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
