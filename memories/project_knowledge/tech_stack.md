# SupaSnake Tech Stack

**Last Updated:** 2025-10-27

## Core Technologies

### Frontend
- **React Native** - Cross-platform mobile framework
- **Expo** - React Native development toolchain
- **TypeScript** - Type-safe JavaScript

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Real-time subscriptions
  - Authentication
  - Row Level Security (RLS)
  - Storage (for assets)

### Development Platform
- **Claude Code** - AI-assisted development
- **Claude Sonnet 4.5** - Primary AI model
- **Hooks** - Quality enforcement (6 types operational)
- **Sub-Agents** - Specialized analysis (8 agents configured)

## Architecture Principles

### Server Authority (AAA 2026 Standard)
- Server is single source of truth for all game state
- Client displays UI, collects input only
- All mutations go through API routes
- No game state in localStorage (only UI preferences)
- **Enforced by 5 architectural quality gates (hooks)**

### Zero-Touch Engineering (ZTE)
- Deterministic quality enforcement via hooks
- Automated testing (95%+ coverage required)
- Security vulnerability prevention
- Complete implementations only (no TODOs)

## Development Workflow

### Context Management
- Decision matrix for when to /clear
- Active loading protocol
- PreCompact hooks save session state
- Proactive curation strategy

### Quality Gates (Hooks)
1. Block incomplete code (TODO/FIXME)
2. Require tests (95%+ coverage)
3. Block security issues
4. Auto-format code
5. Scan for incomplete patterns
6. Validate review quality

### Sub-Agents
1. Design Architect - Technical specs
2. Security Reviewer - Vulnerability audits
3. Performance Reviewer - Optimization
4. Code Quality Reviewer - Maintainability
5. UX Reviewer - User experience
6. Balance Reviewer - Game balance
7. Review Aggregator - Synthesize reviews
8. Validator - Final quality gate

## Project Structure

```
SupaSnake/
├── src/                    # Source code
│   ├── client/            # Client-only code
│   ├── server/            # Server-only code
│   ├── shared/            # Isomorphic code
│   └── features/          # Feature modules
├── docs/                  # Documentation
│   ├── game/             # Game design docs
│   ├── platform/         # Platform docs
│   └── research/         # Research materials
├── scripts/              # Utility scripts
├── tests/                # Test files
├── .claude/              # Claude Code configuration
│   ├── hooks/           # Quality enforcement hooks
│   └── agents/          # Sub-agent definitions
└── memories/            # Persistent AI memory (NEW)
    ├── architectural_decisions/
    ├── code_patterns/
    ├── project_knowledge/
    └── agent_learnings/
```

## Game Design

### Core Loop
- Classic Snake gameplay (2D grid)
- DNA collection (resource)
- Breeding system (same-dynasty in v0.1)
- Collection Lab (Panini book style)
- Energy system (stamina gating, 1/20min regen)

### Monetization
- F2P mobile game
- Energy system for pacing (not paywall)
- Premium card variants (foil effects)
- Ethical monetization (no P2W, no loot boxes)

### Content
- 3 starter dynasties: CYBER, PRIMAL, COSMIC
- 30 variants total in MVP
- Dynasty expansion monthly (7-day sprint each)

## Development Priorities

1. **Server Authority** - All game logic on server
2. **Test Coverage** - 95%+ required
3. **Security** - No vulnerabilities in production
4. **Performance** - 60fps on mid-range mobile
5. **Ethics** - Respect players, no dark patterns
