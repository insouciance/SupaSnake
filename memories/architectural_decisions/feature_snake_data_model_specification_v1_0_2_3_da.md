# feature_snake_data_model_specification_v1_0_2_3_da

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:39.338909+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Snake Data Model Specification v1.0: 2.3 Data Relationships

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/SNAKE_DATA_MODEL_spec.md
**Captured:** 2026-01-26 10:26



## Content

```
┌──────────────┐
│  dynasties   │ ← 3 records (CYBER, PRIMAL, COSMIC)
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│snake_variants│ ← 5 records (MVP variants)
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────────┐
│player_collection │ ← N records per player (owned snakes)
└──────────────────┘
       │ N:1
       ▼
┌──────────────┐
│    users     │
└──────────────┘
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
