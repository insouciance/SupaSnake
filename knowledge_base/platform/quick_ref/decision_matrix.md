# Decision Matrix - Quick Reference
## Research-Backed Thresholds (Updated 2025-10-27)

**Based on:** Anthropic research showing degradation starts at 5k tokens, significant by 50k

**Platform Baseline:** 67k tokens (system prompt, tools, agents, memory)
**Autocompact Buffer:** 45k tokens (hardcoded, not configurable)
**Available Capacity:** 88k tokens (200k - 67k - 45k)
**Autocompact Triggers:** 155k tokens (78% of 200k)

## Before Every Task

**Step 1:** Estimate task tokens (conversation + files + context)
**Step 2:** Check current context usage
**Step 3:** Calculate total (current + estimate)
**Step 4:** Apply matrix:

```
Total < 120k (work <53k, 60% capacity, optimal zone)
→ CONTINUE NORMALLY
  Context quality high, work naturally
  Research: Minimal degradation
  67k baseline + <53k work = <120k total

120k < Total < 140k (work 53-73k, 60-70% capacity, fair zone)
→ /CLEAR + ACTIVE LOAD (Recommended)
  Curate context for task
  1. /clear (resets to 67k baseline)
  2. CLAUDE.md auto-loads
  3. Load feature spec
  4. Load current files only
  5. Begin with clean context
  Research: Significant degradation zone
  67k baseline + 53-73k work = 120-140k total

Total > 140k (work >73k, >70% capacity, severe zone)
OR Task > 25k tokens
→ DELEGATE TO SUB-AGENT (Required)
  "Use [Agent] sub-agent to [task]"
  Sub-agent gets 200k fresh context
  Research: Severe performance degradation
  Autocompact triggers at 155k (15k safety margin)
```

**Research Context:**
- 5k tokens: Degradation begins
- 50k tokens: Significant performance impact
- 80k+ tokens: Severe degradation (3× less attention per token)

**Override:** Use judgment for mid-complex reasoning or highly relevant context, but **stay below 140k total (73k work) for critical work**.

**See:** @knowledge_base/platform/reference/context_management_full.md for details
