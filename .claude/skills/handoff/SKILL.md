---
description: Write rich session handoff before /clear
---

# /handoff - Write rich session handoff

Write a comprehensive handoff summary before clearing context or ending a session.

## Usage

```
/handoff
```

## Purpose

Creates a rich context snapshot that gets injected into the next session, enabling seamless context recovery after `/clear` or auto-compact.

## Behavior

When invoked, write a comprehensive handoff to `state/handoff/current.json`:

1. **Summarize** what was worked on this session (1-2 sentences)
2. **List accomplishments** - concrete things completed
3. **Note current focus** - what you were actively working on
4. **Identify blockers** - anything blocking progress (empty if none)
5. **Define next steps** - what should happen next
6. **Reference key files** - files that were modified or are relevant
7. **Include recent decisions** - from `state/handoff/decisions.jsonl`

## Output Format

Write to `state/handoff/current.json`:

```json
{
  "summary": "Implemented rich handoff system with /decision and /handoff commands to preserve context across sessions",
  "accomplishments": [
    "Created stop hook for continuous handoff saving",
    "Designed decision log format with JSONL storage",
    "Updated injection hook for rich display"
  ],
  "current_focus": "Testing the complete handoff flow",
  "blockers": [],
  "next_steps": [
    "Test /clear with new handoff",
    "Verify decisions are injected",
    "Document in CLAUDE.md"
  ],
  "key_files": [
    ".claude/commands/decision.md",
    ".claude/commands/handoff.md",
    ".claude/hooks/user-prompt-submit/02-inject-memory-context.sh"
  ],
  "decisions": [
    "chose JSONL for decisions - append-friendly and grep-able",
    "using stop hook instead of pre-compact - ensures /clear coverage"
  ],
  "timestamp": "2026-01-27T08:45:00Z",
  "source": "manual",
  "branch": "main"
}
```

## Confirmation

After writing the handoff, confirm:

```
Handoff saved to state/handoff/current.json

Summary: <summary text>
Accomplishments: <count> items
Next steps: <count> items

Safe to /clear - context will be restored on next prompt.
```

## Notes

- This is a **manual** command - use it before `/clear` when you want rich context
- The stop hook (`02-save-session-state.sh`) provides basic auto-handoff, but `/handoff` gives richer context
- Recent decisions from `state/handoff/decisions.jsonl` should be included (last 5-10)
