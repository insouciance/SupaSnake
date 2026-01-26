# feature_energy_tuning_specification_v1_0_3_2_api_e

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:38.530175+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Energy Tuning Specification v1.0: 3.2 API Endpoints

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/ENERGY_TUNING_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/energy/status` | GET | Get current energy state | - | `{ natural, bonus, nextRegen, adRefillsLeft }` |
| `/api/energy/consume` | POST | Start game (use energy) | - | `{ success, remaining }` |
| `/api/energy/ad-refill` | POST | Watch ad for energy | - | `{ success, bonus, refillsLeft }` |
| `/api/game/complete` | POST | End game, grant DNA | `{ score, timeSeconds }` | `{ dna, breakdown }` |

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
