# Mission Control

## 📌 Invariants (Always True)

**Platform Architecture:**
- ZTE Platform = Hooks (quality gates) + Sub-agents (specialized analysis) + Memory (persistent learning) + Orchestration (multi-instance)
- PreToolUse hooks enforce deterministically (exit 2 blocks operations)
- Sub-agents get 200k fresh context each
- Memory tool enables cross-session learning ✅ OPERATIONAL (2025-10-27)
  - Automatic learning: Patterns captured after every code change
  - Intelligent recall: Memories injected before every task
  - Context quality monitoring: Automatic alerts at degradation thresholds
- Context thresholds: Research-backed (Anthropic 2025) - degradation starts at 5k, severe at 80k+

**Non-Negotiables:**
- 95%+ test coverage (hooks enforce)
- No secrets in code (use env vars - hooks enforce)
- No SQL concatenation (parameterized only - hooks enforce)
- Test-first development (tests before implementation)
- Complete implementations only (no placeholders - hooks enforce)

**Key Decisions:**
- macOS BSD compatibility (grep -E not grep -P)
- Exit 1 for blocking hooks
- stderr for hook messages (>&2)
- Project-level hook configuration

**Tools:**
- 6 hook types operational: `.claude/hooks/*/`
- 8 sub-agents configured: `.claude/agents/`
- Orchestration: `automation/orchestrator.py`, `automation/analyze_request.py`
- Memory tool: `./memories/` (persistent knowledge base)
- Context editing: Automatic management at 120k tokens

---

## 🎯 Current Work (Update After Each Milestone)

**Feature:** [Your current feature name]
**Status:** [Design / Implementation / Review / Complete]
**Blocker:** None

**Last Auto-Update:** 2025-10-25 08:59
**Branch:** main
**Last Commit:** 667e08d Add Legal & Analytics Infrastructure (Phase 1 Complete)

**Recent Changes:**
```
 M .claude/hooks/pre-tool-use/02-require-tests.sh
 M .claude/hooks/pre-tool-use/05-validate-context-reads.sh
 M CLAUDE.md
 M docs/analytics/event-taxonomy.md
 M state/context_plan_20251019_architectural_gates.json
```

**Recent Files:**
```
.claude/hooks/pre-tool-use/05-validate-context-reads.sh
.claude/hooks/pre-tool-use/06-require-context-for-implementation.sh
.claude/hooks/pre-tool-use/07-enforce-server-authority.sh
.claude/hooks/pre-tool-use/08-block-client-db-access.sh
.claude/hooks/pre-tool-use/09-block-client-secrets.sh
```

**Note:** Update manually after milestones with specific feature info.
See templates/CURRENT_WORK_TEMPLATE.md for guidance.

**Recovery (After /clear or Auto-Compact):**
1. Check CLAUDE.md Current Work section (this section)
2. Read: `cat .claude/session_state/precompact_*.md` for detailed snapshot
3. Load relevant context as specified in Current Work
4. Resume from last commit or Next Action

---

## 🧭 Context Management (Active Curation)

### Decision Matrix (Before Every Task)
**Research-backed thresholds (Anthropic 2025):**

**Estimate:** Task tokens (conversation + files + context)
**Current:** Check token usage
**Total:** Current + Estimate

```
Total < 60k → Continue normally (optimal zone)
60k < Total < 80k → /clear + active load (recommended)
Total > 80k OR Task >25k → Delegate to sub-agent (required)
```

**Research:** Performance degrades at 5k+ tokens, significant by 50k, severe at 80k+

### When to /clear (Proactive Triggers)

- Starting new feature (different context domain)
- Context >60k tokens before significant task (was 120k - now research-backed)
- Switching work context (frontend ↔ backend)
- Before complex analysis that needs clean slate
- Context quality score <50 (automatic monitoring via hooks)

### Active Loading (After /clear)

**Load in order:**
1. CLAUDE.md (auto-loads - invariants + current work)
2. Current feature spec: `@docs/current_feature.md`
3. Current files only (not historical)
4. Recent architecture decisions (last 5 commits)

**Don't load:**
- Old conversation history
- Previous feature contexts
- Unrelated files

### When NOT to /clear

- Continuing same feature (context is relevant)
- Low token usage (<80k)
- Mid-complex reasoning (valuable conversation context)

---

## 🔒 Context Loading Protocol (CRITICAL - Rule #1)

**Rule #1:** Never work without the right context (existential requirement)
**Rule #2:** Never bloat context with irrelevant content (protects Rule #1)

### Before ANY Substantive Work:

**Step 1: Analyze Context Needs**
- What does this query require?
- What's the current state? (check CLAUDE.md, roadmaps, plans)
- What knowledge base files are needed?
- What tier? (quick_ref / how_to / reference)

**Step 2: Create Context Plan**
Write context plan to `state/context_plan_<timestamp>.json`:
```json
{
  "session_id": "<timestamp>",
  "timestamp": "<ISO-8601>",
  "query": "<user query>",
  "analysis": "<what you determined>",
  "required_context": [
    {
      "file": "knowledge_base/.../file.md",
      "reason": "why needed",
      "tier": "quick_ref",
      "priority": "critical"
    }
  ],
  "optional_context": [],
  "loaded": [],
  "blocked": [],
  "status": "pending"
}
```

**Step 3: State Your Plan to User**
```
"I need to load the following context:
- breeding_overview.md (breeding mechanics)
- f2p_economy.md (DNA costs)

Loading now..."
```

**Step 4: Load Files**
- Read each required file
- PreToolUse hooks will validate each load against plan
- Hooks block off-plan loads (Rule #2 enforcement)

**Step 5: Verify Before Implementing**
- All critical files must be loaded
- PreToolUse hooks enforce this before Write/Edit
- Status updates to "loaded" automatically

**NEVER skip this protocol. Hooks enforce deterministically.**

### Context Plan Status Flow

```
pending → loading → loaded → complete
            ↓
         blocked (if inappropriate loads attempted)
```

### Enforcement Mechanism

**PreToolUse Hook 05 (Validate Reads):**
- Validates every knowledge_base Read against context plan
- Blocks reads not in plan (Rule #2: prevents bloat)
- Updates loaded[] array automatically

**PreToolUse Hook 06 (Require Context):**
- Blocks Write/Edit without loaded context (Rule #1)
- Checks all critical files loaded
- Allows implementation only after context verified

**Stop Hook 03 (Audit):**
- Shows context compliance report
- Lists loaded files
- Reports blocked loads (Rule #2 enforcement)

---

## 🎮 Server Authority (AAA 2026 Standard)

**Core Principle:** Server is single source of truth for all game state.

**What This Means:**
- Client displays UI, collects input
- Server processes ALL game logic
- Client receives results, updates display
- No game state in localStorage (only UI preferences)

**Why It Matters:**
- Prevents cheating (can't modify localStorage for infinite DNA)
- Enables multiplayer (single source of truth)
- Prevents data loss (localStorage cleared = preferences lost, not progress)
- Enables server validation (all mutations validated)

### The 4 Principles

**1. Client Displays, Server Decides**
- Never calculate game state client-side
- All game logic in API routes
- Client shows results only

**2. API Routes for All Mutations**
- Every state change goes through API
- Client never directly accesses database
- API validates, processes, persists

**3. Secrets Stay Server-Side**
- No SERVICE_ROLE_KEY in client code
- No private keys in client code
- Sensitive operations in API routes only

**4. Config-Driven Balance**
- Game constants in `src/shared/config/game.ts`
- No hard-coded DNA costs, spawn rates, etc.
- Can tune without code changes

### localStorage Policy

**✅ Allowed (UI State):**
- Theme, volume, language
- Input preferences
- Tutorial completion flags
- Analytics consent

**❌ Never Allowed (Game State):**
- DNA, score, level
- Inventory, collection
- Unlocks, achievements
- Any progress data

**Rule:** If losing it means losing progress → Server. If losing it means re-selecting preferences → localStorage.

### Architectural Quality Gates (Enforcement)

**5 Hooks enforce server authority:**

1. **Hook 07 - Server Authority:** Blocks localStorage for game state (dna, score, inventory, etc.)
2. **Hook 08 - Client DB Access:** Blocks direct database queries in client code (components/, hooks/, ui/)
3. **Hook 09 - Client Secrets:** Blocks SERVICE_ROLE_KEY and private keys in client code
4. **Hook 10 - Config Constants:** Blocks hard-coded game balance values (DNA_COST = 50, etc.)
5. **Hook 04 - Architecture Audit:** Comprehensive scan for all violations (runs when Claude stops)

**These hooks make server authority DETERMINISTIC.**

Attempting to violate server authority → Hook blocks → Claude must fix → Production code is guaranteed clean.

**See:** @knowledge_base/platform/how_to/maintain_server_authority.md for complete guide

---

## 🧠 Memory Tool (Persistent Learning - NEW)

**Status:** Beta (2025-10-27)
**Purpose:** Cross-session learning and knowledge accumulation

### What It Does

Enables Claude to **store and retrieve information across conversations** through persistent files in `/memories`. Claude can:
- Learn patterns and remember them for future sessions
- Store architectural decisions with rationale
- Accumulate security/performance/quality patterns
- Build project knowledge base over time

### Memory Structure

```
memories/
├── architectural_decisions/    # Design decisions with rationale
│   └── server_authority.md
├── code_patterns/              # Learned patterns
│   ├── security/
│   │   └── common_vulnerabilities.md
│   ├── performance/
│   └── quality/
├── project_knowledge/          # SupaSnake-specific info
│   └── tech_stack.md
├── agent_learnings/            # Sub-agent accumulated wisdom
│   ├── security_reviewer/
│   ├── performance_reviewer/
│   └── balance_reviewer/
└── session_state/              # Temporary (90-day retention)
```

### Key Operations

**Query memory before work:**
```
"Check /memories/code_patterns/security/ for similar patterns"
```

**Store learnings:**
```
"Store this architectural decision in /memories/architectural_decisions/"
```

**Cross-session learning example:**
```
Session 1 (Today): Finds race condition in Snake collision
→ Stores pattern in /memories/code_patterns/

Session 2 (Tomorrow): Reviews breeding code
→ Checks memory, finds similar pattern
→ "I remember this from yesterday's Snake review..."
```

### Benefits

✅ **Learns across sessions** - Pattern recognition improves over time
✅ **Accumulated wisdom** - Security/performance patterns build up
✅ **Better reviews** - Sub-agents remember past findings
✅ **Persistent knowledge** - Architectural decisions preserved
✅ **Survives context clearing** - Memory persists even when context is cleared

### Security

- All paths validated (prevent directory traversal)
- No sensitive data (no passwords, API keys, PII)
- Content sanitized
- Size limits enforced (10MB per file)
- Regular cleanup of session_state/ (90-day retention)

### Integration with Context Editing

Works with automatic context editing:
- Context editing clears old tool results at 120k tokens
- Memory files are NEVER cleared (excluded from context editing)
- Important knowledge moves from conversation to memory
- Enables longer-running workflows without context limits

### Usage Patterns

**Before implementation:**
```
1. Check memory for similar patterns
2. Load relevant architectural decisions
3. Review past security findings
4. Implement with accumulated knowledge
```

**After implementation:**
```
1. Store new patterns learned
2. Update architectural decisions
3. Add security findings to catalog
4. Enrich project knowledge
```

**See:** `@docs/platform/beta_tools_evaluation.md` for complete guide

---

## ⚡ Quick Commands

```bash
# Context management
/clear                          # Reset context (before new feature)
# Then load: invariants (auto) + feature spec + current files

# Recovery
cat .claude/session_state/precompact_*.md  # Last snapshot
cat PLATFORM_STATUS.md                     # Platform status
git log --oneline -5                       # Recent work

# Hooks & agents
/hooks list                     # View hooks
/agents list                    # View agents
"Run [Agent] agent to [task]"   # Delegate to sub-agent

# Checkpoints
git add . && git commit -m "Checkpoint: [milestone]"
```

---

## 📚 Documentation (Memory-Optimized)

**Query Strategy:**
1. **Check memory first:** Query `@memories/knowledge_base/routing_index.md` for routing
2. **Load specific doc:** Memory tells you which file (quick_ref / how_to / reference)
3. **Token savings:** Load only what you need (~200-1k tokens vs 14k with MAP.md)

**Common Queries:**
- "Should I /clear?" → Check memory routing → Load `decision_matrix.md` (~411 tokens)
- "What hook types?" → Check memory routing → Load `hook_types.md` (~565 tokens)
- "How use sub-agents?" → Check memory routing → Load `use_subagents.md` (~2.4k tokens)

**Quick Reference (50-200 words):**
- @knowledge_base/platform/quick_ref/decision_matrix.md
- @knowledge_base/platform/quick_ref/when_to_clear.md
- @knowledge_base/platform/quick_ref/hook_types.md
- @knowledge_base/platform/quick_ref/subagent_types.md
- @knowledge_base/platform/quick_ref/token_estimates.md

**How-To Guides (500-1,000 words):**
- @knowledge_base/platform/how_to/apply_decision_matrix.md
- @knowledge_base/platform/how_to/use_subagents.md
- @knowledge_base/platform/how_to/create_custom_hook.md

**Complete Reference (2,000-7,000 words):**
- @knowledge_base/platform/reference/context_management_full.md
- @knowledge_base/platform/reference/hooks_guide_full.md
- @knowledge_base/platform/reference/subagent_guide_full.md

**Platform:**
- @PLATFORM_STATUS.md - Platform status

**Fallback:** If memory routing unclear, manually check @knowledge_base/MAP.md

---

**Target:** 600-800 tokens | **Philosophy:** Memory-first routing + load-on-demand optimization
