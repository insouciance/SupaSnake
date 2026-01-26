# Manual Memory Capture System

**Domain:** platform
**Category:** learning
**Captured:** 2025-12-22T09:12:53.431208+00:00
**Tags:** memory, platform, slash-command, capture

## Summary

# Manual Memory Capture System

This system allows manual capture of any knowledge during Claude sessions.



## Components

1. **Slash Command** (`.claude/commands/capture.md`)
   - Prompts Claude to classify and format the memory
   - Guides through domain/category selection

2. **CLI Script** (`scripts/capture_memory.py`)
   - Accepts structured arguments
   - Validates domain, category, title length
   - Stores to Supabase (primary) and local (backup)

3. **Handler Method** (`MemoryToolHandler.capture()`)
   - Full metadata support
   - Dual storage (Supabase + local)
   - Relevance scoring initialized at 50.0

## Usage

```
/capture The CORS fix we just implemented
```

Claude will:
1. Extract the key knowledge
2. Classify domain/category
3. Format as memory entry
4. Store via the capture script
5. Confirm with ID and path


---
*Manually captured via /capture command*
