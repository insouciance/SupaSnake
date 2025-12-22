# SupaSnake - Claude Instructions

## Platform Overview
- **Stack:** Next.js + Supabase + TypeScript
- **Hooks:** `.claude/hooks/` - quality enforcement (PreToolUse blocks with exit 2)
- **Agents:** `.claude/agents/` - specialized reviewers + Memory agent for context retrieval
- **Memory:** Supabase `claude_memories` table + local `./memories/` fallback
- **Python:** Use `.venv/bin/python3.14` (has supabase, dotenv packages)

## Memory Re-Query (When Initial Context is Insufficient)
When you discover better keywords during planning/analysis than the initial prompt provided:
- **Use:** Memory subagent to search for relevant patterns
- **Invoke:** "Use Memory sub-agent to find patterns about [discovered keywords]"
- **Example:** Initial prompt "fix the bug" → discovered it's about auth → invoke Memory with "auth session recovery zustand"
- **Note:** Initial hook injection still runs; this is for re-querying with better keywords

## Code Rules (Enforced by Hooks)
- No TODO/FIXME/HACK - complete implementations only
- No hardcoded secrets - use environment variables
- No SQL concatenation - parameterized queries only
- Server authority - game state on server, not localStorage
- macOS: Use `grep -E` not `grep -P` (BSD compatibility)

## Hook Exit Codes
- PreToolUse: `exit 0` = allow, `exit 2` = block
- Other hooks: exit codes are informational only

## Current Work

**Feature:** Platform Infrastructure - Memory + Hooks
**Status:** Supabase memory system operational
**Branch:** main

**Recent:**
- Enabled Supabase memory storage (`claude_memories` table)
- Updated hooks to use `.venv/bin/python3.14`
- Fixed migration SQL (empty array type casting)

## Recovery (After Auto-Compact)
1. Check `state/handoff/current.json` for task context
2. Load files in `files_to_load` array
3. Resume from `next_action`
4. Archive: `mv state/handoff/current.json state/handoff/archive_$(date +%Y%m%d_%H%M%S).json`

## Key Files
```
.claude/hooks/pre-tool-use/     # Blocking quality gates
.claude/hooks/stop/             # Post-response analysis
.claude/hooks/user-prompt-submit/02-inject-memory-context.sh  # Memory injection
.claude/hooks/pre-compact/      # Handoff before context reset
scripts/memory_tool_handler.py  # Supabase/local memory API
scripts/retrieve_memories.py    # Domain-based memory retrieval
```

## Quick Commands
```
/clear                          # Reset context
git log --oneline -5            # Recent commits
cat state/handoff/current.json  # Check handoff
```
