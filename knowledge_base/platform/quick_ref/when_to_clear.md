# When to /clear - Quick Reference

## Proactive Triggers (Use /clear)

✅ **Starting new feature** - Different domain from previous work
✅ **Context >120k** - Before significant task (work content >53k)
✅ **Switching work context** - Frontend ↔ Backend, different systems
✅ **Before complex analysis** - Need clean mental slate

## Don't /clear

❌ **Continuing same feature** - All context relevant
❌ **Low token usage** - <120k total tokens (<53k work)
❌ **Mid-complex reasoning** - Don't interrupt important discussion

## Context Math

**Baseline:** 67k tokens (system, tools, agents, memory)
**Autocompact:** 45k buffer (triggers at 155k total)
**Work capacity:** 88k tokens (200k - 67k - 45k)

**When you see 120k total = 53k of actual work content**

## After /clear

Load in order:
1. CLAUDE.md (auto - invariants + current work)
2. Current feature spec
3. Current files only
4. Recent decisions

**Result:** 67k baseline + 10-20k highly relevant context = ~77-87k total

**Philosophy:** /clear is proactive curation, not emergency recovery

**See:** @knowledge_base/platform/reference/context_management_full.md
