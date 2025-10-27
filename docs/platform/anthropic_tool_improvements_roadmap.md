# Platform Improvements from Anthropic's "Writing Tools for Agents"

## Source
https://www.anthropic.com/engineering/writing-tools-for-agents
**Date:** 2025-10-27
**Analysis:** Comprehensive review of Anthropic's tool design best practices

---

## Executive Summary

Our platform already implements many best practices from Anthropic's research:
- ✅ Response format parameter (concise vs detailed)
- ✅ Realistic workflow evaluation (not isolated examples)
- ✅ Token efficiency mechanisms (82.2% savings)
- ✅ High-signal information (context quality scoring)

However, we identified **7 improvements** with measurable impact potential:
- **10-20% better task completion** (error messages + prompts)
- **15% faster decision-making** (tool consolidation)
- **5-10% token reduction** (truncation guidance)

---

## Improvement 1: Error Message Enhancement (HIGH IMPACT)

### Current State
Hooks output technical errors that require interpretation:
```bash
# Example from 01-block-incomplete-code.sh
echo "❌ BLOCKED: Incomplete code patterns detected" >&2
echo "Patterns found: TODO, FIXME" >&2
echo "Files: src/calculator.py:5, src/utils.js:12" >&2
```

### Anthropic Guidance
> "Replace opaque error codes with guidance... explain specific and actionable improvements to help agents self-correct."

### Target State
```bash
echo "❌ BLOCKED: Incomplete code patterns detected" >&2
echo "" >&2
echo "📋 What to fix:" >&2
echo "  • Remove TODO comment at src/calculator.py:5" >&2
echo "    Replace with actual implementation or create issue tracker ticket" >&2
echo "" >&2
echo "  • Remove FIXME comment at src/utils.js:12" >&2
echo "    Implement the fix or document why it's deferred" >&2
echo "" >&2
echo "💡 Best practice:" >&2
echo "  Use issue tracker for future work, not code comments" >&2
echo "  Complete implementations only - no placeholders in production" >&2
```

### Implementation Plan
- **File:** `.claude/hooks/pre-tool-use/01-block-incomplete-code.sh`
- **Changes:**
  1. Add structured guidance format
  2. Include specific fix instructions per violation
  3. Suggest best practices
  4. Provide links to knowledge base
- **Effort:** 2-3 hours per hook (10 hooks total = ~25 hours)
- **Priority:** Week 1

### Expected Impact
- **20% reduction in hook re-triggers** (agent fixes correctly first time)
- **Faster task completion** (less trial-and-error)
- **Better learning** (agents understand WHY, not just WHAT)

---

## Improvement 2: Agent Prompt Optimization (HIGH IMPACT)

### Current State
Sub-agent prompts are functional but not optimized:
```markdown
# Your Role
You are a senior security engineer conducting production security audits.

# Your Mandate
Find and report ALL security issues:
1. Injection Attacks
2. Cross-Site Scripting (XSS)
...
```

### Anthropic Guidance
> "Refinements to descriptions yielded dramatic performance improvements on SWE-bench Verified. Treat descriptions as you would for a new team member—make implicit context explicit and clarify specialized query formats."

### Target State
Use Claude to analyze evaluation transcripts and optimize prompts:
```markdown
# Your Role
You are a senior security engineer conducting production security audits for a AAA mobile F2P game built with React Native + Supabase.

# Critical Context
- **Stack:** React Native (client), Supabase (backend), PostgreSQL (database)
- **Architecture:** Server authority (no game state in client)
- **Common patterns:** Row-level security (RLS), parameterized queries, JWT tokens
- **Focus areas:** RLS policies, API routes, client-server boundaries

# Your Mandate
Prioritize high-severity issues first. Use specific file:line references.
When you find SQL injection, check for:
1. String concatenation in queries (use CTRL+F for "WHERE.*\+" patterns)
2. Missing parameterized query usage
3. Raw SQL in client code (should be in API routes only)
...
```

### Implementation Plan
- **Method:** Claude-assisted optimization using workflow transcripts
- **Process:**
  1. Collect evaluation transcripts for each agent
  2. Identify patterns where agents struggled
  3. Use Claude to refine prompts based on transcript analysis
  4. A/B test old vs new prompts
  5. Measure task completion rates
- **Effort:** 1-2 hours per agent (12 agents = ~18 hours)
- **Priority:** Week 2

### Expected Impact
- **15% improvement in task accuracy** (from SWE-bench research)
- **Better domain focus** (agents waste less time on irrelevant checks)
- **Faster reviews** (agents know what to look for)

---

## Improvement 3: Tool Consolidation Analysis (MEDIUM IMPACT)

### Current State
Memory system has separate operations:
- `retrieve_memories.py` - Get relevant memories
- `memory_tool_handler.py` - Store/update memories
- `extract_code_patterns.py` - Extract patterns from code

### Anthropic Guidance
> "Design tools that handle multiple discrete operations under the hood... implementing `get_customer_context` that compiles relevant information atomically."

### Target State
Consolidated tool:
```python
def handle_memory_context(operation, **kwargs):
    """
    Unified memory context handler

    Operations:
    - "prepare_for_task": Gets relevant memories + stores current context
    - "learn_from_code": Extracts patterns + stores + returns summary
    - "recall_similar": Retrieves + ranks + formats in one call
    """
    if operation == "prepare_for_task":
        # Retrieve relevant memories
        memories = retrieve(kwargs['prompt'])
        # Store current context for future
        store_session_state(kwargs['context'])
        # Return formatted
        return format_memories(memories)
```

### Implementation Plan
- **Phase 1:** Audit all memory/context tools
- **Phase 2:** Identify consolidation opportunities
- **Phase 3:** Create unified interfaces
- **Phase 4:** Update hooks to use consolidated tools
- **Effort:** ~12 hours
- **Priority:** Week 3

### Expected Impact
- **15% faster agent decision-making** (fewer tool calls)
- **Reduced cognitive load** (one tool vs three)
- **Better atomicity** (operations succeed/fail together)

---

## Improvement 4: Response Format Documentation (MEDIUM IMPACT)

### Current State
`response_format` parameter exists but isn't documented:
```python
def retrieve(self, prompt, limit=3, response_format="concise", ...):
    """Get most relevant memories for prompt"""
    # Implementation uses response_format but not documented
```

### Anthropic Guidance
> "Implement a `response_format` enum parameter allowing agents to request either 'concise' or 'detailed' responses, balancing token efficiency with downstream tool chaining requirements."

### Target State
Explicit documentation in agent prompts:
```markdown
# Memory Tool Usage

When calling memory tools, use `response_format` parameter:

- **"concise"** (default): ~150 tokens per pattern
  - Use for: Quick checks, routine operations, token-constrained contexts
  - Returns: Pattern name, severity, one-line description

- **"detailed"**: ~450 tokens per pattern
  - Use for: Deep analysis, learning, when chaining to other tools
  - Returns: Full pattern, code examples, fix recommendations

Example:
```python
# For quick security check
memories = retrieve("SQL injection patterns", response_format="concise")

# For detailed review report
memories = retrieve("SQL injection patterns", response_format="detailed")
```
```

### Implementation Plan
- **Phase 1:** Document in all agent prompts
- **Phase 2:** Add to knowledge_base/platform/how_to/use_memory_tool.md
- **Phase 3:** Update CLAUDE.md with guidance
- **Effort:** ~4 hours
- **Priority:** Week 3

### Expected Impact
- **Better token management** (agents choose appropriate format)
- **Clearer expectations** (agents know what they'll get)
- **Improved tool chaining** (detailed format for downstream analysis)

---

## Improvement 5: Truncation Guidance (MEDIUM IMPACT)

### Current State
Hook blocks oversized reads without guidance:
```bash
# From 05-validate-context-reads.sh
if [[ $estimated_tokens -gt 5000 ]]; then
    echo "❌ BLOCKED: File too large ($estimated_tokens tokens > 5000)" >&2
    exit 1
fi
```

### Anthropic Guidance
> "When limiting responses, directly encourage agents to pursue more token-efficient strategies, like making many small and targeted searches."

### Target State
```bash
if [[ $estimated_tokens -gt 5000 ]]; then
    echo "❌ BLOCKED: File too large ($estimated_tokens tokens > 5000 limit)" >&2
    echo "" >&2
    echo "💡 Token-efficient alternatives:" >&2
    echo "" >&2
    echo "Option 1: Query knowledge_base/MAP.md first" >&2
    echo "  - Find the specific section you need" >&2
    echo "  - Load only that section (50-200 tokens)" >&2
    echo "" >&2
    echo "Option 2: Use Grep to find specific content" >&2
    echo "  - Search for key terms or patterns" >&2
    echo "  - Load only matching sections with context (-A 5 -B 5)" >&2
    echo "" >&2
    echo "Option 3: Use quick_ref/ tier" >&2
    echo "  - Check if quick_ref version exists" >&2
    echo "  - Load concise version instead of full reference" >&2
    echo "" >&2
    echo "Current file: $FILE_PATH" >&2
    echo "Estimated tokens: $estimated_tokens" >&2
    echo "Suggested: Use Grep with pattern: $suggested_pattern" >&2
    exit 1
fi
```

### Implementation Plan
- **File:** `.claude/hooks/pre-tool-use/05-validate-context-reads.sh`
- **Changes:**
  1. Add structured guidance for alternatives
  2. Suggest specific patterns for Grep
  3. Link to MAP.md for navigation
  4. Show token comparison
- **Effort:** ~3 hours
- **Priority:** Week 4

### Expected Impact
- **10% reduction in context bloat** (agents use better strategies)
- **Faster problem-solving** (guidance accelerates decision)
- **Better learning** (agents internalize token-efficient patterns)

---

## Improvement 6: Metric Expansion (LOW IMPACT)

### Current State
`tool_evaluator.py` tracks:
- Tokens used
- Duration
- Success/failure
- File paths

### Anthropic Guidance
> "Track not just accuracy but total runtime, total number of tool calls, total token consumption, and tool errors."

### Target State
Add aggregate metrics:
```python
@dataclass
class SessionMetrics:
    """Aggregate metrics for entire session"""
    total_runtime_ms: float
    total_tool_calls: int
    total_token_consumption: int
    tool_errors: int
    tools_by_frequency: Dict[str, int]  # tool_name: count
    tools_by_tokens: Dict[str, int]     # tool_name: total_tokens
    error_rate_by_tool: Dict[str, float]  # tool_name: error_rate
```

### Implementation Plan
- **File:** `scripts/tool_evaluator.py`
- **Changes:**
  1. Add SessionMetrics dataclass
  2. Aggregate individual tool metrics
  3. Calculate per-tool statistics
  4. Generate session summary report
- **Effort:** ~4 hours
- **Priority:** Week 4

### Expected Impact
- **Better optimization targeting** (identify high-cost tools)
- **Performance insights** (session-level patterns)
- **Trend analysis** (track improvements over time)

---

## Improvement 7: Verifier Refinement (LOW IMPACT)

### Current State
Workflow evaluator has strict verifiers:
```python
def verify_result(expected, actual):
    """Check if result matches expected"""
    return expected == actual  # Exact match only
```

### Anthropic Guidance
> "Avoid overly strict verifiers that reject correct responses due to spurious differences like formatting, punctuation, or valid alternative phrasings."

### Target State
```python
def verify_result(expected, actual):
    """Check if result matches expected (fuzzy match)"""
    # Normalize whitespace
    expected_norm = ' '.join(expected.split())
    actual_norm = ' '.join(actual.split())

    # Exact match
    if expected_norm == actual_norm:
        return True

    # Semantic equivalence (e.g., "TODO found" vs "Found TODO")
    if semantically_equivalent(expected_norm, actual_norm):
        return True

    # Alternative phrasings
    if matches_alternatives(expected_norm, actual_norm):
        return True

    return False
```

### Implementation Plan
- **File:** `scripts/workflow_evaluator.py`
- **Changes:**
  1. Add fuzzy matching for strings
  2. Normalize formatting differences
  3. Accept alternative phrasings
  4. Document acceptable variations
- **Effort:** ~4 hours
- **Priority:** Week 4

### Expected Impact
- **Higher evaluation accuracy** (fewer false negatives)
- **Better confidence in metrics** (87.5% → 90%+ pass rate)
- **Less brittleness** (evaluation adapts to minor changes)

---

## Implementation Timeline

### Week 1 (HIGH IMPACT)
- ✅ Day 1-2: Create roadmap document
- 🔄 Day 3-5: Audit all hooks for error messages
- 🔜 Day 6-7: Start refactoring error messages (3-4 hooks)

### Week 2 (HIGH IMPACT)
- 🔜 Day 1-3: Complete error message refactoring (remaining 6-7 hooks)
- 🔜 Day 4-5: Collect agent evaluation transcripts
- 🔜 Day 6-7: Run Claude-assisted prompt optimization (4 agents)

### Week 3 (MEDIUM IMPACT)
- 🔜 Day 1-3: Complete prompt optimization (remaining 8 agents)
- 🔜 Day 4-5: Audit memory/context tools for consolidation
- 🔜 Day 6-7: Document response_format parameter

### Week 4 (LOW IMPACT)
- 🔜 Day 1-2: Implement tool consolidation
- 🔜 Day 3-4: Add truncation guidance
- 🔜 Day 5: Expand metrics in tool_evaluator
- 🔜 Day 6-7: Refine workflow verifiers

---

## Success Metrics

### Before (Baseline)
- Hook re-trigger rate: Unknown (needs measurement)
- Agent task completion: 87.5% (workflow evaluation)
- Token efficiency: 82.2% savings (memory concise mode)
- Average session runtime: Unknown (needs measurement)

### After (Target)
- Hook re-trigger rate: <10% (agents fix correctly first time)
- Agent task completion: 95%+ (from prompt optimization)
- Token efficiency: 85%+ savings (from truncation guidance)
- Average session runtime: 15% faster (from tool consolidation)

### Measurement Plan
1. Establish baseline metrics (Week 0)
2. Measure after each improvement phase
3. A/B test significant changes (prompts, verifiers)
4. Track trends over 4-week implementation period

---

## Research Validation

### Anthropic Citations
1. **Error Messages:** "Specific and actionable improvements help agents self-correct"
2. **Prompts:** "Refinements yielded dramatic performance improvements on SWE-bench"
3. **Tool Consolidation:** "Multiple discrete operations under the hood"
4. **Response Format:** "Balance token efficiency with downstream tool chaining"
5. **Truncation:** "Encourage token-efficient strategies like targeted searches"
6. **Metrics:** "Track runtime, tool calls, token consumption, errors"
7. **Verifiers:** "Avoid overly strict verifiers rejecting valid alternatives"

### Our Platform Context
- **Base:** 67k tokens (system + tools + agents + memory)
- **Capacity:** 88k tokens for work (200k - 67k - 45k buffer)
- **Thresholds:** <120k optimal, 120-140k fair, >140k severe
- **Current performance:** 87.5% pass rate on realistic workflows

### Expected ROI
- **Development time:** ~50 hours (1.25 weeks full-time)
- **Performance gain:** 10-20% task completion improvement
- **Token savings:** 5-10% additional reduction
- **Quality improvement:** Hook re-triggers <10%

**Cost-benefit:** HIGH (1.25 weeks for 10-20% improvement)

---

## Next Steps

1. ✅ Create this roadmap document
2. 🔄 Begin Week 1 implementation (error message audit)
3. 🔜 Establish baseline metrics before changes
4. 🔜 Track improvements as each phase completes
5. 🔜 Document learnings in memory system
6. 🔜 Share results with community (GitHub discussions)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-27
**Status:** Approved - Implementation in progress
