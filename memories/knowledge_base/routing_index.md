# Knowledge Base Routing Index

**Purpose:** Lightweight routing for knowledge base queries (replaces auto-loading MAP.md)
**Token cost:** ~800 tokens (vs 13.9k for full MAP.md)
**Strategy:** Query memory first, load specific doc only

---

## Platform Documentation Routes

### Context Management
- **"Should I /clear?"** → `quick_ref/decision_matrix.md` (411 tokens)
- **"When to /clear?"** → `quick_ref/when_to_clear.md` (230 tokens)
- **"What to load after /clear?"** → `quick_ref/active_loading.md` (would create)
- **"How estimate tokens?"** → `quick_ref/token_estimates.md` (680 tokens)
- **"How apply decision matrix?"** → `how_to/apply_decision_matrix.md` (2.3k tokens)
- **"Complete context strategy?"** → `reference/context_management_full.md` (5.3k tokens)

### Hooks System
- **"What hook types?"** → `quick_ref/hook_types.md` (565 tokens)
- **"Hook exit codes?"** → `quick_ref/hook_exit_codes.md` (would reference)
- **"How create custom hook?"** → `how_to/create_custom_hook.md` (2.3k tokens)
- **"All hook patterns?"** → `reference/hooks_guide_full.md` (16.8k tokens)

### Sub-Agents
- **"What sub-agents exist?"** → `quick_ref/subagent_types.md` (956 tokens)
- **"How use sub-agents?"** → `how_to/use_subagents.md` (2.4k tokens)
- **"Complete sub-agent guide?"** → `reference/subagent_guide_full.md` (5.3k tokens)

### Server Authority (AAA 2026)
- **"What is server authority?"** → `quick_ref/architectural_gates.md` (would reference)
- **"How maintain server authority?"** → `how_to/maintain_server_authority.md` (3.1k tokens)

---

## Game Documentation Routes

### Backend & Infrastructure
- **"How does Supabase work?"** → `game/quick_ref/backend_supabase.md`
- **"Setup Supabase?"** → `game/how_to/setup_supabase_backend.md`
- **"Auth system?"** → `game/quick_ref/auth_system.md`

### Core Gameplay
- **"Snake mechanics?"** → `game/quick_ref/core_snake_game.md`
- **"Energy system?"** → `game/quick_ref/energy_system.md`
- **"DNA earning?"** → `game/quick_ref/resource_generation.md`

### Lab Systems
- **"Collection Lab?"** → `game/quick_ref/collection_lab.md`
- **"Breeding mechanics?"** → `game/quick_ref/breeding_lab.md`
- **"Evolution system?"** → `game/quick_ref/evolution_lab.md`

### Economy & Balance
- **"DNA costs?"** → `game/quick_ref/economic_balance.md`
- **"Balance progression?"** → `game/how_to/balance_progression.md`

---

## Query Strategy (Three-Tier)

### Tier 1: Quick Reference (50-200 words)
**Use for:** "What is X?", "When to Y?", "Quick lookup"
**Location:** `quick_ref/`
**Load time:** Instant (~200-600 tokens)
**Coverage:** 80% of queries

### Tier 2: How-To Guides (500-1,000 words)
**Use for:** "How do I...?", "Step-by-step", "Implementation"
**Location:** `how_to/`
**Load time:** Fast (~1-3k tokens)
**Coverage:** 15% of queries

### Tier 3: Reference Docs (2,000-7,000 words)
**Use for:** "Everything about X", "Complete guide", "Deep dive"
**Location:** `reference/`
**Load time:** Moderate (~5-17k tokens)
**Coverage:** 5% of queries

---

## Usage Pattern

```
1. User asks question
2. Query this memory file for route
3. Load ONLY the specific doc identified
4. If need more detail, escalate to next tier

Example:
Q: "Should I clear my context?"
→ Memory: quick_ref/decision_matrix.md (411 tokens)
→ Load: @knowledge_base/platform/quick_ref/decision_matrix.md
→ Total: ~450 tokens (vs 14.1k with full MAP.md)
```

---

## Fallback

If memory routing fails or doc not found:
1. Check `knowledge_base/MAP.md` manually (not auto-loaded)
2. Use file structure: `knowledge_base/{platform|game}/{quick_ref|how_to|reference}/`
3. Query MAP.md explicitly: `@knowledge_base/MAP.md`

---

**Last Updated:** 2025-10-27
**Replaces:** MAP.md auto-loading (13.9k tokens → 0.8k tokens)
**Savings:** 13.1k tokens (94% reduction)
