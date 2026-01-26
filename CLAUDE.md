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

## Context-Efficient Capture
When capturing learnings (`/capture` or hooks), keep the main agent's context clean:
- **`/capture` command:** Spawns Memory subagent to analyze and store (main agent receives ~150 char confirmation)
- **Stop hooks:** Run Python scripts in background (`extract_code_patterns.py`, `extract_doc_patterns.py`)
- **Never:** Perform inline analysis in main agent context
- **Output:** Title + domain + 1-line summary only

## Design Integrity Check (Pre-Code Enforcement)
Before modifying code files, a Design Integrity check is **REQUIRED** by hook:

1. **Hook enforces:** `10-require-design-integrity.sh` blocks Write/Edit on `.ts/.tsx/.js/.jsx/.py/.sql` files
2. **Run analysis:** Spawn Design Integrity subagent to analyze proposed change
3. **Review impact:** Subagent returns ~300 char summary (systems affected, constraints, risks)
4. **Proceed or abort:** If HARD constraint violations found, do not proceed

**To run analysis:**
```
Task tool: subagent_type="Design Integrity"
prompt="Analyze: [describe the change you want to make]"
```

The subagent marks `state/.design_integrity_checked` after analysis, allowing code changes for 2 hours.

## Code Rules (Enforced by Hooks)
- No TODO/FIXME/HACK - complete implementations only
- No hardcoded secrets - use environment variables
- No SQL concatenation - parameterized queries only
- Server authority - game state on server, not localStorage
- macOS: Use `grep -E` not `grep -P` (BSD compatibility)
- **Code-mode execution** - MCP/WebFetch/WebSearch blocked; use code executor

## Code-Mode Execution (Context Bloat Prevention)

Direct MCP tool calls are **BLOCKED** by hooks. Use code-mode execution instead:

**Why:** Direct calls bloat context (10k-150k tokens). Code-mode reduces to ~500 tokens (98.7% reduction).

**How to use:**

1. Write Python code to temp file:
```python
# /tmp/claude_code_xxx.py
from mcp_tools import memory, fs, web, tools

results = memory.search("authentication", domain="security")
for r in results:
    print(f"- {r['title']}: {r['summary'][:80]}")
```

2. Execute via code_executor:
```bash
.venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code_xxx.py --budget 500
```

**Available modules:**
- `memory.search()`, `memory.capture()`, `memory.get_by_domain()`
- `fs.read()`, `fs.glob()`, `fs.grep()`, `fs.list_dir()`
- `web.fetch()`, `web.search()`
- `tools.search()`, `tools.examples()`, `tools.info()`, `tools.get()`

**Blocked tools:** `mcp__*`, `WebFetch`, `WebSearch`

## Advanced Tool Use Patterns (Nov 2025)

Three patterns from Anthropic's advanced tool use:

**1. Tool Search** - Discover tools on-demand (85% token reduction):
```python
matches = tools.search("read file contents")
# Returns: [{'name': 'fs.read', 'score': 3.7, 'description': '...'}]

matches = tools.search("search patterns", domain="knowledge")
```

**2. Programmatic Tool Calling** - Invoke tools in code:
```python
# Loop through files, conditionals, data transforms
for f in fs.glob("**/*.ts", path="src/"):
    content = fs.read(f)
    if "auth" in content:
        print(f"Auth found in {f}")
```

**3. Tool Use Examples** - Get effective usage patterns:
```python
exs = tools.examples('memory.search')
for ex in exs:
    print(f"When: {ex.get('when')}")
    print(ex['code'])
```

**Registry:** 14 tools across knowledge, filesystem, web domains
**Reference:** https://www.anthropic.com/engineering/advanced-tool-use

## Hook Exit Codes
- PreToolUse: `exit 0` = allow, `exit 2` = block
- Other hooks: exit codes are informational only

## Current Work

**Feature:** Platform Infrastructure - Memory + Hooks
**Status:** Supabase memory system operational
**Branch:** main

**Recent:**
- Added Design Integrity subagent + enforcement hook for pre-code consequence analysis
- Fixed memory system to capture documentation patterns (not just code)
- Extended hook to detect spec/decision/constraint files
- Created `extract_doc_patterns.py` for markdown extraction
- Seeded 31 new memories from existing spec files
- Refactored `/capture` to use Memory subagent (context-efficient)

## Recovery (After Auto-Compact)
1. Check `state/handoff/current.json` for task context
2. Load files in `files_to_load` array
3. Resume from `next_action`
4. Archive: `mv state/handoff/current.json state/handoff/archive_$(date +%Y%m%d_%H%M%S).json`

## Key Files
```
.claude/hooks/pre-tool-use/     # Blocking quality gates
.claude/hooks/pre-tool-use/10-require-design-integrity.sh  # Pre-code consequence analysis
.claude/hooks/pre-tool-use/11-enforce-code-mode.sh  # Code-mode enforcement
.claude/hooks/stop/             # Post-response analysis
.claude/hooks/user-prompt-submit/02-inject-memory-context.sh  # Memory injection
.claude/hooks/pre-compact/      # Handoff before context reset
scripts/code_executor.py        # Code-mode execution engine
scripts/mcp_tools/              # Code-callable tool wrappers
scripts/mcp_tools/registry.py   # Tool Search + Examples (Advanced Tool Use)
scripts/memory_tool_handler.py  # Supabase/local memory API
scripts/retrieve_memories.py    # Domain-based memory retrieval
```

## Quick Commands
```
/clear                          # Reset context
git log --oneline -5            # Recent commits
cat state/handoff/current.json  # Check handoff
```
