# Decision Matrix - Quick Reference
## Research-Backed Thresholds (Memory-Optimized 2025-10-27)

**Based on:** Anthropic research showing degradation starts at 5k tokens, significant by 50k

**Platform Baseline:** ~50k tokens after /clear (system + tools + essential docs)
- Memory-optimized routing reduces baseline from 64k → 50k
- MAP.md (13.9k) replaced with memory routing (0.8k)
- Working zone: 50k → 60k (only 10k before should /clear)

## Before Every Task

**Step 1:** Estimate task tokens (conversation + files + context)
**Step 2:** Check current context usage
**Step 3:** Calculate total (current + estimate)
**Step 4:** Apply matrix:

```
Total < 60k (30% capacity, optimal zone)
→ CONTINUE NORMALLY
  Context quality high, work naturally
  Research: Minimal degradation

60k < Total < 80k (30-40% capacity, fair zone)
→ /CLEAR + ACTIVE LOAD (Recommended)
  Curate context for task
  1. /clear
  2. CLAUDE.md auto-loads
  3. Load feature spec
  4. Load current files only
  5. Begin with clean context
  Research: Significant degradation zone

Total > 80k (>40% capacity, severe zone)
OR Task > 25k tokens
→ DELEGATE TO SUB-AGENT (Required)
  "Use [Agent] sub-agent to [task]"
  Sub-agent gets 200k fresh context
  Research: Severe performance degradation
```

**Research Context:**
- 5k tokens: Degradation begins
- 50k tokens: Significant performance impact
- 80k+ tokens: Severe degradation (3× less attention per token)

**Override:** Use judgment for mid-complex reasoning or highly relevant context, but **stay below 80k for critical work**.

**See:** @knowledge_base/platform/reference/context_management_full.md for details
