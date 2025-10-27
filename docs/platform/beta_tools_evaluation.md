# Claude Beta Tools Evaluation
## Context Editing + Memory Tool Integration

**Date:** 2025-10-27
**Status:** Design Phase
**Beta Header Required:** `context-management-2025-06-27`

---

## Executive Summary

Anthropic has released two powerful beta tools that can **significantly enhance our ZTE platform**:

1. **Context Editing** (`clear_tool_uses_20250919`) - Automatic context management
2. **Memory Tool** (`memory_20250818`) - Persistent cross-conversation learning

**Bottom Line:** These tools automate and improve upon our current manual context management strategy while adding persistent learning capabilities we don't currently have.

---

## 1. Context Editing - Automatic Context Management

### What It Does

Automatically clears old tool results when context exceeds configured thresholds (default: 100k tokens), keeping only the most recent tool uses (default: 3).

### Current Platform vs. Context Editing

| Aspect | Current Platform | With Context Editing |
|--------|-----------------|---------------------|
| **Trigger Decision** | Manual (decision matrix at 100-150k) | Automatic (at 100k tokens) |
| **What Gets Cleared** | Everything (via /clear) | Only old tool results (keeps conversation) |
| **State Preservation** | PreCompact hooks + CLAUDE.md | Automatic + memory tool integration |
| **Recovery Time** | ~2 minutes (reload CLAUDE.md + context) | Instant (conversation preserved) |
| **Attention Budget** | Improves after /clear | Continuously optimized |

### Key Benefits

✅ **Eliminates manual decision-making** - No more decision matrix calculations
✅ **Preserves conversation context** - Only clears old tool results, not discussion
✅ **Works with prompt caching** - More efficient token usage
✅ **Configurable thresholds** - Fine-tune when clearing happens
✅ **Tool exclusions** - Keep critical tool results indefinitely

### Configuration Options

```python
context_management = {
    "strategy": "clear_tool_uses_20250919",
    "trigger": 100000,  # Default: start clearing at 100k input tokens
    "keep": 3,          # Default: keep last 3 tool uses
    "clear_at_least": 10000,  # Minimum tokens to clear per activation
    "exclude_tools": ["Read"],  # Tools to never clear
    "clear_tool_inputs": False  # Whether to also clear tool call params
}
```

### Supported Models (All Our Models!)

- Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) ✅
- Claude Opus 4.1 (`claude-opus-4-1-20250805`) ✅
- Claude Opus 4 (`claude-opus-4-20250514`) ✅
- Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) ✅

---

## 2. Memory Tool - Persistent Learning

### What It Does

Enables Claude to **store and retrieve information across conversations** through a persistent file directory (`/memories`). Claude can:

- Create/read/update/delete files
- Build knowledge over time
- Learn patterns across sessions
- Survive context clearing

### Architecture

**Client-side implementation** - Your application controls storage:

```
/memories/
├── architectural_decisions/
│   ├── server_authority.md
│   ├── breeding_formula_v2.md
│   └── energy_system_rationale.md
├── code_patterns/
│   ├── common_security_issues.md
│   ├── performance_bottlenecks.md
│   └── react_native_best_practices.md
├── project_knowledge/
│   ├── supasnake_tech_stack.md
│   ├── dynasty_lore.md
│   └── f2p_monetization_principles.md
└── agent_learnings/
    ├── security_reviewer_patterns.md
    ├── performance_reviewer_insights.md
    └── balance_reviewer_findings.md
```

### Available Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `view` | Display directory/file contents | Show architectural decisions |
| `create` | Write or overwrite files | Save new design pattern |
| `str_replace` | Modify text in files | Update energy formula |
| `insert` | Add text at specific line | Add new security pattern |
| `delete` | Remove files/directories | Clean up old patterns |
| `rename` | Move/rename files | Reorganize memory structure |

### Cross-Conversation Learning Example

**Session 1 (Today):**
```
Claude: Reviews Snake collision code, finds race condition pattern
Claude: [Uses memory tool] Creates /memories/code_patterns/race_conditions.md
Memory File: "Watch for shared state without synchronization in game loops"
```

**Session 2 (Tomorrow, NEW conversation):**
```
User: "Review this breeding system code"
Claude: [Uses memory tool] Checks /memories/code_patterns/
Claude: Finds race_conditions.md
Claude: Immediately spots similar pattern in breeding code
Claude: "I notice this breeding system has the same race condition I found yesterday..."
```

**This is HUGE** - Claude learns across sessions!

### What It Replaces/Enhances

| Current Mechanism | Limitation | Memory Tool Solution |
|-------------------|-----------|---------------------|
| CLAUDE.md invariants | Static, manual updates | Automatic learning, accumulates knowledge |
| Git commit messages | Hard to search/parse | Structured, queryable memory files |
| Design docs | Scattered across repo | Centralized in /memories with semantic organization |
| Sub-agent outputs | Lost after session | Persistent agent learnings |

---

## 3. Integration Strategy for Our Platform

### Phase 1: Context Editing (Low Risk, High Value)

**Action:** Replace manual decision matrix with automatic context editing

**Changes Required:**
1. Add beta header to API requests: `context-management-2025-06-27`
2. Configure context management strategy
3. Update CLAUDE.md to remove decision matrix (automated now)
4. Keep PreCompact hooks for additional state preservation

**Configuration:**
```python
# Recommended settings for our platform
context_management = {
    "strategy": "clear_tool_uses_20250919",
    "trigger": 120000,  # Slightly higher than current (100k) for safety
    "keep": 5,          # Keep more recent tool uses than default
    "exclude_tools": ["Read"],  # Always keep file reads
    "clear_tool_inputs": False  # Preserve tool call context
}
```

**Benefits:**
- Eliminates 20+ minutes of decision matrix overhead per session
- Smoother workflow (no manual /clear interruptions)
- Better context utilization (gradual clearing vs. nuclear /clear)

**Risks:**
- Beta API (could change)
- Need to test threshold tuning

### Phase 2: Memory Tool (Medium Risk, Transformational Value)

**Action:** Implement client-side memory handler with structured knowledge base

**Changes Required:**
1. Create `/memories` directory structure
2. Implement `MemoryToolHandler` class (Python)
3. Add memory tool to all API requests
4. Create memory organization strategy
5. Update hooks to populate memory files

**Memory Directory Structure:**
```
/memories/
├── README.md                           # Memory organization guide
├── architectural_decisions/            # Design decisions with rationale
│   ├── server_authority.md
│   ├── breeding_formula_evolution.md
│   ├── energy_system_v2.md
│   └── f2p_monetization_strategy.md
├── code_patterns/                      # Learned patterns
│   ├── security/
│   │   ├── common_vulnerabilities.md
│   │   ├── auth_patterns.md
│   │   └── input_validation.md
│   ├── performance/
│   │   ├── game_loop_optimization.md
│   │   ├── rendering_bottlenecks.md
│   │   └── react_native_perf.md
│   └── quality/
│       ├── common_bugs.md
│       ├── testing_patterns.md
│       └── code_smells.md
├── project_knowledge/                  # SupaSnake-specific
│   ├── tech_stack.md
│   ├── dynasty_system.md
│   ├── collection_mechanics.md
│   └── game_balance_history.md
├── agent_learnings/                    # Sub-agent accumulated knowledge
│   ├── security_reviewer/
│   │   └── findings_database.md
│   ├── performance_reviewer/
│   │   └── optimization_catalog.md
│   └── balance_reviewer/
│       └── tuning_history.md
└── session_state/                      # Temporary working memory
    ├── current_feature.md
    ├── active_blockers.md
    └── next_actions.md
```

**Memory Tool Handler Implementation:**
```python
from pathlib import Path
import json

class MemoryToolHandler:
    """Client-side handler for Claude memory tool"""

    def __init__(self, base_path: str = "./memories"):
        self.base_path = Path(base_path).resolve()
        self.base_path.mkdir(exist_ok=True)

    def validate_path(self, path: str) -> Path:
        """Prevent directory traversal attacks"""
        full_path = (self.base_path / path).resolve()
        if not str(full_path).startswith(str(self.base_path)):
            raise ValueError("Invalid path: directory traversal detected")
        return full_path

    def view(self, path: str, start_line: int = None, end_line: int = None):
        """Display directory or file contents"""
        full_path = self.validate_path(path)

        if full_path.is_dir():
            return {"type": "directory", "contents": os.listdir(full_path)}

        with open(full_path, 'r') as f:
            lines = f.readlines()

        if start_line and end_line:
            lines = lines[start_line-1:end_line]

        return {"type": "file", "content": ''.join(lines)}

    def create(self, path: str, content: str):
        """Create or overwrite a file"""
        full_path = self.validate_path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)

        with open(full_path, 'w') as f:
            f.write(content)

        return {"status": "created", "path": str(full_path)}

    def str_replace(self, path: str, old_str: str, new_str: str):
        """Replace specific text in file"""
        full_path = self.validate_path(path)

        with open(full_path, 'r') as f:
            content = f.read()

        if old_str not in content:
            raise ValueError(f"String not found: {old_str}")

        new_content = content.replace(old_str, new_str, 1)

        with open(full_path, 'w') as f:
            f.write(new_content)

        return {"status": "replaced"}

    # ... additional methods: insert, delete, rename
```

**Hook Integration:**
```bash
# .claude/hooks/stop/06-populate-memory.sh
# After Claude finishes, extract learnings to memory

# If security review was done, update security patterns
if grep -q "Security Reviewer" "$OUTPUT"; then
    # Extract findings and append to memory
    echo "Updating /memories/agent_learnings/security_reviewer/findings_database.md"
fi

# If architectural decision was made, store it
if grep -q "Decision:" "$OUTPUT"; then
    # Extract decision rationale and store
    echo "Storing architectural decision in /memories/architectural_decisions/"
fi
```

**Benefits:**
- **Cross-session learning** - Claude remembers patterns across days/weeks
- **Accumulated wisdom** - Security/performance patterns build up over time
- **Better sub-agent reviews** - Agents check memory for similar past issues
- **Reduced context bloat** - Important info in memory, not CLAUDE.md
- **Project knowledge base** - Searchable, structured, growing over time

**Risks:**
- **Security**: Path traversal, memory poisoning (prompt injection via memory files)
- **Storage growth**: Need memory cleanup strategy
- **Complexity**: More moving parts to maintain

### Phase 3: Full Integration (Long-term)

**Action:** Combine context editing + memory + enhanced hooks

**Changes Required:**
1. Context editing handles automatic clearing
2. Memory tool stores persistent knowledge
3. Hooks populate memory automatically
4. Sub-agents query memory before analysis
5. CLAUDE.md becomes lightweight (invariants only, knowledge in memory)

**Example Workflow:**
```
User: "Review this payment processing code"

Claude: [Checks /memories/code_patterns/security/payment_security.md]
Claude: Finds: "Always validate amounts server-side, never trust client"
Claude: [Reviews code with this pattern in mind]
Claude: Finds violation, reports it
Claude: [Updates memory with new payment security pattern found]

Context grows to 125k tokens
→ Automatic context editing clears old tool results
→ Memory files preserved
→ Conversation context preserved
→ Claude continues seamlessly
```

---

## 4. Security Considerations

### Path Traversal Prevention

```python
def validate_path(self, path: str) -> Path:
    """Must be FIRST check in every memory operation"""
    full_path = (self.base_path / path).resolve()

    # Ensure path is within /memories
    if not str(full_path).startswith(str(self.base_path)):
        raise ValueError("Invalid path: directory traversal detected")

    # Ensure no .. or absolute paths
    if '..' in path or path.startswith('/'):
        raise ValueError("Invalid path: traversal attempt")

    return full_path
```

### Memory Poisoning (Prompt Injection)

**Risk:** Malicious code could trick Claude into writing memory files that later inject prompts

**Mitigations:**
1. **Content sanitization** - Strip markdown code blocks, limit special characters
2. **Memory isolation** - Separate user input memory from system memory
3. **Regular audits** - Hook to scan memory files for suspicious content
4. **Size limits** - Prevent unbounded memory growth
5. **Never store sensitive data** - No passwords, API keys, PII

### Storage Management

```python
# Hook: .claude/hooks/stop/07-memory-cleanup.sh
# Run weekly to prevent unbounded growth

# Delete memory files older than 90 days in session_state/
find /memories/session_state -type f -mtime +90 -delete

# Compress old architectural decisions
tar -czf /memories/archive/arch_decisions_$(date +%Y%m).tar.gz \
    /memories/architectural_decisions/*.md

# Alert if memory > 100MB
MEMORY_SIZE=$(du -sm /memories | cut -f1)
if [ $MEMORY_SIZE -gt 100 ]; then
    echo "⚠️ Memory size: ${MEMORY_SIZE}MB - Consider cleanup"
fi
```

---

## 5. Comparison: Current vs. Beta Tools

### Context Management

| Aspect | Current (Manual) | Beta Tools (Automatic) |
|--------|-----------------|----------------------|
| **Decision making** | Manual calculation every task | Automatic at 100k tokens |
| **Context preservation** | Nuclear /clear (lose everything) | Gradual (keep conversation) |
| **Recovery time** | ~2 minutes | Instant |
| **Overhead** | 20+ min per session | Zero |
| **Flexibility** | High (manual control) | Medium (configurable thresholds) |

### Knowledge Persistence

| Aspect | Current (CLAUDE.md + Docs) | Beta Tools (Memory) |
|--------|---------------------------|---------------------|
| **Cross-session learning** | None (fresh each time) | Yes (accumulates) |
| **Pattern recognition** | Manual (human documents) | Automatic (Claude stores) |
| **Searchability** | Grep/manual | Semantic (Claude queries) |
| **Update mechanism** | Manual edits | Automatic accumulation |
| **Sub-agent integration** | None | Agent learnings persist |

---

## 6. Recommended Implementation Plan

### Week 1: Context Editing Proof of Concept

**Goals:**
- [ ] Add beta header to one API request
- [ ] Test context editing with default settings
- [ ] Measure impact on context usage
- [ ] Compare to manual /clear workflow

**Success Criteria:**
- Context editing triggers at ~100k tokens
- Conversation context preserved
- No degradation in response quality

### Week 2: Memory Tool Prototype

**Goals:**
- [ ] Implement basic `MemoryToolHandler` class
- [ ] Create `/memories` directory structure
- [ ] Test create/read/update/delete operations
- [ ] Verify path traversal prevention

**Success Criteria:**
- Claude can store and retrieve memory files
- Security validation works
- Memory persists across sessions

### Week 3: Integration & Testing

**Goals:**
- [ ] Integrate memory tool with hooks
- [ ] Test cross-session learning
- [ ] Measure knowledge accumulation
- [ ] Create memory cleanup strategy

**Success Criteria:**
- Claude remembers patterns from previous sessions
- Hooks automatically populate memory
- Storage stays under 100MB

### Week 4: Production Rollout

**Goals:**
- [ ] Update CLAUDE.md to document new system
- [ ] Update knowledge base docs
- [ ] Create memory organization guide
- [ ] Deploy to all instances

**Success Criteria:**
- Full platform using context editing
- Memory tool operational
- Documentation complete

---

## 7. Expected Impact

### Quantitative Benefits

| Metric | Current | With Beta Tools | Improvement |
|--------|---------|-----------------|-------------|
| **Context management overhead** | 20 min/session | 0 min | -100% |
| **Recovery time after clearing** | 2 minutes | 0 seconds | -100% |
| **Cross-session pattern reuse** | 0% | 80%+ | +80% |
| **Architectural decision lookup** | Manual grep | Semantic query | 10x faster |
| **Sub-agent effectiveness** | Fresh each time | Builds knowledge | 2-3x better |

### Qualitative Benefits

✅ **Smoother workflow** - No manual clearing decisions
✅ **Persistent learning** - Platform gets smarter over time
✅ **Better reviews** - Sub-agents remember past findings
✅ **Knowledge accumulation** - Project wisdom grows automatically
✅ **Reduced cognitive load** - No decision matrix calculations

---

## 8. Risks & Mitigations

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Beta API changes | High | Medium | Monitor changelog, version lock |
| Path traversal exploit | Critical | Low | Strict path validation |
| Memory poisoning | High | Medium | Content sanitization, audits |
| Storage growth | Medium | High | Cleanup strategy, size limits |
| Context editing bugs | High | Low | Gradual rollout, fallback to manual |

### Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Learning incorrect patterns | Medium | Medium | Memory audits, human review |
| Over-reliance on memory | Medium | High | Document what's in memory |
| Complex debugging | High | Medium | Comprehensive logging |

---

## 9. Decision Recommendation

### Should We Adopt These Tools?

**YES - Phased Adoption Recommended**

**Reasoning:**
1. **Context Editing** is low-risk, high-value - automates our current manual process
2. **Memory Tool** is transformational - adds capabilities we don't currently have
3. **Models are supported** - All our models (Sonnet 4.5, Opus 4, Haiku 4.5) work
4. **Strategic alignment** - Moves platform toward autonomous, self-improving system

### Adoption Sequence

**Phase 1 (Immediate):** Context Editing
- Low risk, immediate benefit
- Replaces manual decision matrix
- 1 week implementation

**Phase 2 (Short-term):** Memory Tool Prototype
- Test cross-session learning
- Validate security measures
- 2 week implementation

**Phase 3 (Medium-term):** Full Integration
- Combine both tools
- Hook integration
- 4 week implementation

**Total Timeline:** 7 weeks to full production system

---

## 10. Next Steps

### Immediate Actions (This Week)

1. **Create test project** with beta header enabled
2. **Test context editing** with default settings
3. **Prototype memory handler** with basic CRUD operations
4. **Security review** of memory tool architecture

### Documentation Updates Needed

1. **Update CLAUDE.md** - Document context editing (remove decision matrix)
2. **Create memory guide** - How to organize /memories directory
3. **Update hooks guide** - Memory population patterns
4. **Add security guide** - Memory tool security best practices

### Code Changes Needed

1. **API client updates** - Add beta header support
2. **Memory handler class** - Implement client-side storage
3. **Hook modifications** - Auto-populate memory files
4. **CLAUDE.md refactor** - Lightweight invariants + memory references

---

## Conclusion

The beta tools (context editing + memory) represent a **significant evolution** of our platform:

**From:** Manual context management + static documentation
**To:** Automatic context management + dynamic learning system

**This moves us from "high-quality development platform" to "self-improving development platform".**

The investment (7 weeks implementation) is justified by:
- Elimination of 20+ min overhead per session
- Cross-session learning capability
- Better sub-agent effectiveness
- Knowledge accumulation over time

**Recommendation: Proceed with phased adoption, starting with context editing proof of concept this week.**

---

**Version:** 1.0
**Author:** Claude (Sonnet 4.5)
**Date:** 2025-10-27
**Status:** Design Document - Awaiting Approval
