# feature_tutorial_system_specification_v1_0_3_2_api

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:21.693309+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Tutorial System Specification v1.0: 3.2 API Endpoints

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/TUTORIAL_spec.md
**Captured:** 2026-01-26 10:26



## Content

| Endpoint | Method | Description | Request | Response |
|----------|--------|-------------|---------|----------|
| `/api/tutorial/status` | GET | Get current tutorial state | - | `{ step, data }` |
| `/api/tutorial/advance` | POST | Move to next step | `{ step, data }` | `{ progress }` |
| `/api/tutorial/choose-dynasty` | POST | Select starter dynasty | `{ dynastyId }` | `{ starterSnake }` |
| `/api/tutorial/grant-second` | POST | Give free second snake | - | `{ secondSnake }` |
| `/api/tutorial/free-breed` | POST | Execute free first breed | `{ parent1Id, parent2Id }` | `{ offspring }` |
| `/api/tutorial/complete` | POST | Mark tutorial done, grant bonus | - | `{ bonus: 500 }` |

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
