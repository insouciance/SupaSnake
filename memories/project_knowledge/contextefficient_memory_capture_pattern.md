# Context-Efficient Memory Capture Pattern

**Domain:** platform
**Category:** decision
**Captured:** 2026-01-26T09:41:21.991816+00:00
**Tags:** memory, context, efficiency, subagent, hooks

## Summary

# Context-Efficient Memory Capture



## Problem
Inline analysis in main agent context causes token bloat.

## Solution
- **/capture command:** Spawns subagent (has full context access)
- **Stop hooks:** Run Python scripts in background
- **Output:** Title + domain + 1-line summary only

## Files
- .claude/commands/capture.md - Subagent delegation
- .claude/hooks/stop/07-capture-learnings.sh - Background scripts
- scripts/extract_doc_patterns.py - Markdown extraction

---
*Manually captured via /capture command*
