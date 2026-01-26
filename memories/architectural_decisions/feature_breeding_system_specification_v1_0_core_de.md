# feature_breeding_system_specification_v1_0_core_de

**Domain:** architecture
**Category:** decision
**Captured:** 2026-01-26T09:26:36.134153+00:00
**Tags:** specification, decision, documentation

## Summary

# Feature: Breeding System Specification v1.0: Core Decisions

**Type:** specification
**Domain:** architecture
**Category:** decision
**Source:** docs/game/specs/BREEDING_SYSTEM_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Breeding Rule** | Same dynasty only | v0.1 simplicity, avoids hybrid complexity |
| **Breeding Timer** | Instant (0 seconds) | Better UX for MVP testing, no frustrating waits |
| **DNA Cost** | 200 base + (avg_parent_gen × 100) | Scales with power, prevents exploitation |
| **Offspring Generation** | max(parent1_gen, parent2_gen) + 1 | Clear progression, incentivizes high-gen parents |
| **Offspring Variant** | 50/50 random from parents | Simple, fair, no complex genetics |

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
