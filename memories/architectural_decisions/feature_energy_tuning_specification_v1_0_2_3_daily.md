# feature_energy_tuning_specification_v1_0_2_3_daily

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:26:38.268297+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: Energy Tuning Specification v1.0: 2.3 Daily Economy Model

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/specs/ENERGY_TUNING_spec.md
**Captured:** 2026-01-26 10:26



## Content

**F2P Player (no ads, no purchases):**
```
Natural energy: 5 energy at start + 72 energy/day (1 per 20 min x 24 hours)
Effective plays: ~10-12 games/day (accounting for sleep, natural regen)
DNA earned: 10 games x 100 avg = 1,000 DNA/day
Progression:
- Day 1: First breed (300 DNA) complete
- Day 2: Second breed (300 DNA) + unlock (500 DNA) complete
- Day 3-4: Gen 3 breeding (400 DNA) + more unlocks complete
```

**Ad-Watching Player (uses all ad refills):**
```
Base plays: 10-12 games/day
+ Ad refills: 3 energy x 3/day = +3 games
Total: 13-15 games/day
DNA earned: 13 games x 100 avg = 1,300 DNA/day
Progression: 30% faster than pure F2P
```

**Paying Player (purchases energy pack):**
```
Base plays: 10-12 games/day
+ Purchased energy: 10-20 bonus energy (one-time or daily)
Total: 20-30 games/day (if they want)
DNA earned: 25 games x 100 avg = 2,500 DNA/day
Progression: Can complete collection faster, but same snakes as F2P
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
