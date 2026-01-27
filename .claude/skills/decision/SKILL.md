---
description: Log a key decision to preserve across sessions
---

# /decision - Log a key decision

Append a decision to the session decision log for context preservation across sessions.

## Usage

```
/decision <decision text>
```

## Examples

```
/decision chose zustand over redux - simpler API, less boilerplate
/decision using JSONL for decisions - append-friendly and grep-able
/decision skipping auth for MVP - will add in v0.2
```

## Decision Text

**Decision to log:** $ARGUMENTS

## Behavior

When invoked, execute this command to log the decision:

```bash
mkdir -p state/handoff && echo '{"timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'", "decision": "$ARGUMENTS", "session_id": "'$CLAUDE_SESSION_ID'"}' >> state/handoff/decisions.jsonl
```

Then confirm briefly: `Decision logged: $ARGUMENTS`

## Storage Format

File: `state/handoff/decisions.jsonl` (JSONL = one JSON object per line)

## Purpose

Decisions logged here are:
- Injected into the next session after `/clear` or auto-compact
- Included in `/handoff` summaries
- Preserved for context recovery
