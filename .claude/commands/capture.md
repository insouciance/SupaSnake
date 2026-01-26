---
description: Capture knowledge to the project memory database
---

## Context-Efficient Capture

When /capture is invoked, delegate ALL analysis to a Memory subagent to avoid context bloat.

**User focus:** $ARGUMENTS

### Instructions

Use the Task tool to spawn a Memory subagent:

```
Task tool parameters:
- subagent_type: "Memory"
- model: "haiku"
- description: "Capture learnings to memory"
- prompt: See below
```

**Prompt for subagent:**

> Analyze the current conversation context and extract key learnings to capture.
>
> **User focus:** $ARGUMENTS
>
> Your task:
> 1. Identify the most valuable knowledge from this session (patterns, decisions, fixes, insights)
> 2. Classify appropriately:
>    - **Domain:** architecture, platform, security, performance, api, react, game, engagement
>    - **Category:** code_pattern, decision, learning, debugging, context
> 3. Create condensed, searchable content
> 4. Store via: `.venv/bin/python3.14 scripts/capture_memory.py --domain X --category Y --title "..." --summary "..." --content "..." --tags "..."`
> 5. Return ONLY a brief confirmation (2-3 lines max):
>    - Title captured
>    - Domain/category
>    - One-line summary
>
> Do NOT return the full content or analysis. Keep response under 200 characters.

### Important

- Do NOT perform inline analysis in the main agent
- The subagent has access to the full conversation context
- Only the brief confirmation is returned to keep main context clean
