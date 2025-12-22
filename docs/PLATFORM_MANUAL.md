# SupaSnake Development Platform Manual

A comprehensive guide to the Zero-Touch Engineering (ZTE) platform powering SupaSnake development.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Hook System](#hook-system)
4. [Memory System](#memory-system)
5. [Subagent System](#subagent-system)
6. [Context Management](#context-management)
7. [State Tracking](#state-tracking)
8. [Scripts Reference](#scripts-reference)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### Philosophy: Zero-Touch Engineering (ZTE)

The platform enforces AAA quality standards through deterministic hooks and intelligent context management. The goal is:

- **100% complete implementations** - No incomplete markers in production
- **Zero secrets in code** - Environment variables only
- **Server authority** - All game state on server (prevents cheating)
- **Automatic learning** - Platform learns from every code change

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Hooks | `.claude/hooks/` | Deterministic quality enforcement |
| Agents | `.claude/agents/` | Specialized analysis (fresh 200k context) |
| Memory | `./memories/` + Supabase | Cross-session knowledge persistence |
| Scripts | `scripts/` | Python utilities for platform operations |
| State | `state/` | Runtime metrics and handoffs |

### Measured Benefits

- **Incomplete Code Reduction**: 100% (0 in production)
- **Test Coverage**: 96% (up from 62%)
- **Security Issues**: 0.1 per 1000 LOC (95% reduction)
- **Token Savings**: 82.2% (memory concise mode)
- **Hook Pass Rate**: 87.5% on realistic workflows

---

## Quick Start

### Essential Commands

```bash
# Context management
/clear                    # Reset context (start fresh)

# Recovery after auto-compact
cat state/handoff/current.json

# Check platform status
cat CLAUDE.md             # Current work + thresholds

# Recent work
git log --oneline -5

# Hook metrics
cat state/hook_metrics/*.jsonl | tail -20
```

### Recovery After Auto-Compact

When Claude's context auto-compacts, the `01-save-session-state.sh` PreCompact hook automatically saves state:

1. **Check handoff**: `cat state/handoff/current.json`
2. **Load files**: Read files listed in `files_to_load` array
3. **Resume work**: Follow `next_action` from handoff
4. **Archive**: `mv state/handoff/current.json state/handoff/archive_$(date +%Y%m%d_%H%M%S).json`

### Working Pattern

1. Start with `/clear` for fresh context
2. Read `CLAUDE.md` (auto-loaded)
3. Load feature spec and relevant files
4. Work in focused sessions
5. Commit checkpoints at milestones

---

## Hook System

### Overview

Hooks are shell scripts that run at specific points in Claude's workflow. They enforce quality deterministically.

**Location**: `.claude/hooks/`

### Hook Types

| Type | When Triggered | Can Block? | Exit Codes |
|------|----------------|------------|------------|
| PreToolUse | Before tool execution | Yes | 0=allow, 2=block |
| PostToolUse | After tool execution | No | Informational |
| Stop | When Claude stops | No | Informational |
| SubagentStop | When subagent completes | No | Informational |
| UserPromptSubmit | Before prompt processed | No | Informational |
| PreCompact | Before auto-compact | No | Informational |

**Critical**: Only PreToolUse hooks can block operations (exit 2).

### PreToolUse Hooks (Blocking)

#### 01-block-incomplete-code.sh
Blocks Write/Edit with incomplete code markers, deferred work comments, exception stubs, or placeholder patterns.

**Blocked patterns include**: Deferred work markers with colons, exception stubs that signal unfinished work, mock/stub/fake/placeholder/temp prefixes

**Fix**: Complete the implementation or create a ticket in issue tracker.

#### 02-require-tests.sh
Requires test files when writing new source code.

**Fix**: Write tests alongside implementation.

#### 03-block-security-issues.sh
Blocks common security vulnerabilities:
- Hard-coded passwords, API keys, secrets, tokens
- SQL string concatenation (injection risk)
- Dynamic code execution functions
- Raw HTML injection patterns (XSS risk)

**Fix**: Use environment variables for secrets. Use parameterized queries. Use textContent or DOMPurify for HTML.

#### 05-validate-context-reads.sh
Validates that context loading is appropriate.

#### 06-require-context-for-implementation.sh
Requires reading files before modifying them.

#### 07-enforce-server-authority.sh
Blocks localStorage usage for game state (AAA 2026 standard).

**Blocked keys**: dna, score, points, currency, coins, gems, inventory, collection, unlock, achievement, progress, level, xp, energy, gameState, breeding, evolution, lab, snake, highScore

**Allowed**: Theme, volume, language, tutorial flags, analytics consent.

**Fix**: Use API routes for mutations. Server is single source of truth.

#### 08-block-client-db-access.sh
Prevents client components from directly accessing database.

#### 09-block-client-secrets.sh
Blocks SERVICE_ROLE_KEY or admin secrets in client code.

#### 10-enforce-config-constants.sh
Requires game balance values to come from config files.

### PostToolUse Hooks

#### 01-format-and-lint.sh
Auto-formats code after writes (prettier, eslint).

#### 02-track-read-activity.sh
Tracks which files/domains are being read for context analysis.

### Stop Hooks

#### 01-scan-incomplete-patterns.sh
Final scan for incomplete patterns before stopping.

#### 03-audit-context-compliance.sh
Audits that context usage follows guidelines.

#### 04-architecture-audit.sh
Checks architectural decisions are documented.

#### 05-completeness-check.sh
Verifies task completeness.

#### 06-integration-check.sh
Validates integration points.

#### 07-capture-learnings.sh
Captures patterns from recent code changes to memory system.

```bash
# Runs extract_code_patterns.py on git diff
# Extracts patterns and saves to memories
```

#### 08-monitor-context-quality.sh
Monitors context quality and recommends `/clear` or delegation when needed.

### UserPromptSubmit Hooks

#### 02-inject-memory-context.sh
Injects relevant memories and session handoff into user prompts.

**Process**:
1. Checks for active handoff in `state/handoff/current.json`
2. Calls `scripts/retrieve_memories.py` with prompt keywords
3. Injects `[MEMORY RECALL]` and `[SESSION HANDOFF]` sections

### PreCompact Hooks

#### 01-save-session-state.sh
Auto-generates handoff before context compaction.

**Saves to**: `state/handoff/current.json`
**Contents**: Task, status, domain, next_action, files_to_load, branch, timestamp

#### 02-update-claude-md.sh
Updates CLAUDE.md with current work status.

### Library Helpers

Located in `.claude/hooks/lib/`:

- `log_hook_metric.sh` - Logs hook execution metrics
- `log_memory_metric.sh` - Logs memory retrieval metrics
- `log_token_consumption.sh` - Logs token usage
- `map_parser.sh` - Parses knowledge base MAP.md
- `plan_templates.sh` - Templates for planning

---

## Memory System

### Architecture

Hybrid system with Supabase as primary and local files as fallback.

**Primary**: Supabase `claude_memories` table (full-text search)
**Fallback**: `./memories/` directory (keyword matching)

### Supabase Schema

```sql
CREATE TABLE claude_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain VARCHAR(50) NOT NULL,      -- engagement, game, architecture, api, etc.
  category VARCHAR(50),             -- subdomain
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  source_file VARCHAR(500),
  tags TEXT[],
  relevance_score FLOAT DEFAULT 1.0,
  times_applied INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search function
CREATE FUNCTION search_memories(search_query TEXT, domain_filter TEXT, result_limit INT)
RETURNS SETOF claude_memories;
```

### Memory Domains

| Domain | Content |
|--------|---------|
| `engagement` | Daily rewards, streaks, achievements, battle pass |
| `game` | Snake mechanics, scoring, levels, spawning |
| `architecture` | Server authority, client patterns, data flow |
| `api` | Route patterns, validation, responses |
| `database` | Schema, migrations, queries |
| `react` | Components, hooks, state management |
| `testing` | Test patterns, coverage |
| `platform` | Hooks, agents, memory system |
| `security` | Auth, validation, OWASP |

### Memory Retrieval

**Automatic injection**: `02-inject-memory-context.sh` runs on every prompt.

**Manual re-query**: Use Memory subagent for discovered keywords:
```
Use Memory sub-agent to find patterns about [keywords]
```

**Script usage**:
```bash
.venv/bin/python3.14 scripts/retrieve_memories.py \
  --prompt "daily rewards streaks" \
  --limit 5 \
  --format concise \
  --token-budget 500
```

### Memory Capture

**Automatic**: `07-capture-learnings.sh` runs on Stop, extracts patterns from git diff.

**Manual population**:
```bash
.venv/bin/python3.14 scripts/populate_memories.py
```

### Token Optimization

- **Concise format**: ~150 tokens for 3 patterns (default)
- **Detailed format**: ~450 tokens for 3 patterns
- **Savings**: 82.2% reduction with concise mode

---

## Subagent System

### Overview

Subagents are specialized Claude instances with fresh 200k context. Use for complex analysis without polluting coordinator context.

**Location**: `.claude/agents/`

### Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| Design Architect | Technical specifications | New features, architecture decisions |
| Security Reviewer | Vulnerability audits | Auth flows, API endpoints, data handling |
| Performance Reviewer | Optimization analysis | Slow queries, render performance |
| Code Quality Reviewer | Maintainability review | Refactoring, code structure |
| UX Reviewer | User experience evaluation | UI changes, user flows |
| Balance Reviewer | Game balance testing | Economy, progression, difficulty |
| Review Aggregator | Synthesize multiple reviews | After running multiple reviewers |
| Validator | Pre-production validation | Before deployment |
| Memory | Search knowledge base | Re-query memories mid-reasoning |

### Invocation Pattern

```
Use [Agent Name] sub-agent to [specific task]

Example:
Use Security Reviewer sub-agent to audit the authentication flow in src/app/auth/
```

### Agent Output Format

Each agent returns structured reports:

**Security Reviewer**:
- Executive Summary
- Critical/High/Medium/Low Findings
- OWASP references
- Remediation code examples

**Design Architect**:
- Overview
- Architecture diagram (ASCII)
- Data models
- API interfaces
- Implementation plan
- Testing strategy
- Risks & mitigations

### When to Use Subagents

1. **Context >140k tokens** (>73k work)
2. **Task >25k tokens** expected
3. **Specialized analysis** needed (security, performance, balance)
4. **Fresh perspective** on complex problem
5. **Parallel reviews** (run multiple agents simultaneously)

---

## Context Management

### Token Thresholds

| Level | Total Tokens | Work Tokens | Capacity | Action |
|-------|-------------|-------------|----------|--------|
| Baseline | 67k | 0 | 0% | After /clear |
| Optimal | <120k | <53k | <60% | Continue normally |
| Fair | 120-140k | 53-73k | 60-70% | Consider /clear |
| Severe | >140k | >73k | >70% | Delegate or /clear |

**Auto-compact trigger**: 155k tokens (200k - 45k buffer)

### Context Quality Scoring

Monitored by `08-monitor-context-quality.sh`:

- **Range**: 0-100
- **Good**: >70
- **Fair**: 50-70
- **Poor**: <50

**Quality factors**:
- Relevant content ratio (40 pts)
- Distractor count (20 pts)
- Age/staleness (40 pts)

### Distractor Patterns

Things that degrade context quality:
- console.log, print, debugger statements
- Incomplete work markers in comments
- Commented-out code (3+ lines)
- Error traces, stack dumps
- Debug/verbose logs
- Old tool results

### When to /clear

**Do clear**:
- Starting new feature (different domain)
- Context >120k before significant task
- Switching contexts (frontend <-> backend)
- Before complex analysis
- Quality score <50

**Don't clear**:
- Continuing same feature
- Low token usage (<120k)
- Mid-complex reasoning
- All context is relevant

### Active Loading Protocol

After `/clear`:
1. CLAUDE.md auto-loads (invariants + current work)
2. Load current feature spec
3. Load current files only (not historical)
4. Load recent decisions if needed

**Result**: 67k baseline + 10-20k relevant = ~77-87k total (vs 155k mixed/stale)

---

## State Tracking

### Directory Structure

```
state/
├── handoff/                  # Session handoffs
│   ├── current.json         # Active handoff (if any)
│   └── archive_*.json       # Historical handoffs
├── context_quality/
│   ├── latest_quality.json  # Current quality metrics
│   └── quality_history.jsonl
├── read_activity/
│   └── domain_activity.json # File read tracking
├── hook_metrics/            # Hook performance data
│   └── *.jsonl
├── tool_metrics/            # Tool evaluation data
│   └── memory_retrieval.jsonl
└── .last_capture_commit     # Last commit captured for learning
```

### Handoff Format

```json
{
  "task": "Working on engagement features",
  "status": "in_progress",
  "domain": "engagement",
  "next_action": "Continue implementing daily rewards API",
  "files_to_load": [
    "src/app/api/streaks/route.ts",
    "src/shared/config/engagement.ts"
  ],
  "branch": "main",
  "timestamp": "2025-12-12T10:30:00Z",
  "auto_generated": true
}
```

### Domain Activity Tracking

`02-track-read-activity.sh` tracks:
- Last read time per domain
- Recent files per domain
- Read frequency

Used by PreCompact hook to determine relevant files for handoff.

---

## Scripts Reference

### Memory Scripts

| Script | Purpose |
|--------|---------|
| `memory_tool_handler.py` | Core memory API (Supabase + local) |
| `retrieve_memories.py` | CLI for memory retrieval |
| `populate_memories.py` | Seed memories into Supabase |
| `extract_code_patterns.py` | Extract patterns from git diffs |

### Context Scripts

| Script | Purpose |
|--------|---------|
| `context_quality_scorer.py` | Score context quality (0-100) |
| `token_tracker.py` | Track token consumption |
| `context_memory_poc.py` | Context/memory proof of concept |

### Tool Evaluation

| Script | Purpose |
|--------|---------|
| `tool_evaluator.py` | Evaluate tool effectiveness |
| `workflow_evaluator.py` | Test realistic workflows |

### Usage Examples

**Retrieve memories**:
```bash
.venv/bin/python3.14 scripts/retrieve_memories.py \
  --prompt "auth session recovery" \
  --limit 5 \
  --format detailed
```

**Score context quality**:
```bash
echo "context content" | python3 scripts/context_quality_scorer.py \
  --tokens 50000 \
  --task "implementing auth"
```

**Analyze token usage**:
```bash
python3 scripts/token_tracker.py analyze
```

---

## Best Practices

### Code Quality

1. **Complete implementations only** - No incomplete markers, no placeholders
2. **Tests alongside code** - Write tests with implementation
3. **Environment variables for secrets** - Never hard-code credentials
4. **Server authority for game state** - Client displays, server decides
5. **Config-driven balance** - Use `src/shared/config/` for game constants

### Architecture

1. **API routes for mutations** - All state changes through API
2. **Parameterized queries** - Never concatenate SQL
3. **Supabase client patterns** - Server client for mutations, anon for reads
4. **Type safety** - TypeScript throughout

### Context Management

1. **Start fresh for new features** - `/clear` at feature boundaries
2. **Monitor quality** - Watch for quality alerts
3. **Delegate when overloaded** - Use subagents for complex analysis
4. **Load actively** - Load relevant files, not everything

### Memory Usage

1. **Let automatic injection work** - Memories inject on every prompt
2. **Re-query when discovering keywords** - Use Memory subagent
3. **Concise format by default** - 82% token savings
4. **Domain-specific queries** - More targeted results

---

## Troubleshooting

### Common Issues

#### "BLOCKED: Incomplete Code Detected"

**Cause**: Trying to write code with deferred work markers or placeholder patterns.

**Fix**: Complete the implementation. If not ready, don't write the code yet.

#### "BLOCKED: Server Authority Violation"

**Cause**: Using localStorage for game state like DNA, score, level.

**Fix**: Use API routes. Server is source of truth. Only store UI preferences (theme, volume) in localStorage.

#### Empty Memory Results

**Cause**: PostgreSQL full-text search requires all terms to match.

**Fix**: Use fewer, more specific keywords. Memory subagent extracts keywords automatically.

#### Context Quality Dropping

**Cause**: Accumulated distractors, stale context.

**Fix**: Use `/clear` and reload relevant files only.

#### Hook Not Blocking

**Cause**: Only PreToolUse hooks can block (exit 2). Other hook types are informational.

**Fix**: Move blocking logic to PreToolUse hook.

### Recovery Commands

```bash
# Check current handoff
cat state/handoff/current.json

# Check quality history
tail -5 state/context_quality/quality_history.jsonl | jq .

# Check hook metrics
tail -10 state/hook_metrics/pre_tool_use.jsonl | jq .

# Check memory retrieval performance
tail -5 state/tool_metrics/memory_retrieval.jsonl | jq .

# Verify Supabase connection
.venv/bin/python3.14 -c "from scripts.memory_tool_handler import MemoryToolHandler; m = MemoryToolHandler(); print('Supabase:', m.use_supabase)"
```

### Getting Help

- Check `CLAUDE.md` for current work and thresholds
- Check `knowledge_base/MAP.md` for documentation structure
- Run `/help` for Claude Code commands
- Report issues at https://github.com/anthropics/claude-code/issues

---

## Appendix: Quick Reference Card

```
HOOK EXIT CODES
  PreToolUse:    exit 0 = allow, exit 2 = block
  Other hooks:   Exit codes are informational only

TOKEN THRESHOLDS
  Baseline:      67k (after /clear)
  Optimal:       <120k total
  Fair:          120-140k total
  Severe:        >140k total
  Auto-compact:  155k total

CONTEXT QUALITY
  Good:          >70/100
  Fair:          50-70/100
  Poor:          <50/100

MEMORY FORMATS
  Concise:       ~150 tokens (3 patterns)
  Detailed:      ~450 tokens (3 patterns)

SERVER AUTHORITY RULE
  localStorage:  Theme, volume, language, tutorial flags ONLY
  Server:        DNA, score, level, inventory, unlocks, progress

RECOVERY AFTER COMPACT
  1. cat state/handoff/current.json
  2. Load files_to_load array
  3. Resume from next_action
  4. Archive handoff after loading
```

---

*Last updated: 2025-12-12*
*Platform version: ZTE v3.1*
