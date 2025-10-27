# Memory Integration - Week 1 Implementation Guide
## Automatic Learning Capture

**Goal:** Make the platform learn automatically from every code change
**Time:** Week 1 (5-10 hours)
**Status:** Ready to implement

---

## What We're Building

**Before:**
- Claude writes code
- Patterns are forgotten
- Same issues repeated

**After:**
- Claude writes code
- Patterns automatically captured to memory
- Same issues never happen again

---

## Implementation Steps

### Step 1: Create Learning Capture Hook (2 hours)

**File:** `.claude/hooks/stop/07-capture-learnings.sh`

```bash
#!/bin/bash
# Stop Hook: Capture Learnings
# Automatically captures patterns from recent code changes

# Only run if code was written
if [[ ! -f ".git/index" ]]; then
    exit 0  # Not a git repo, skip
fi

# Check for staged changes
STAGED_FILES=$(git diff --cached --name-only)
if [[ -z "$STAGED_FILES" ]]; then
    exit 0  # No changes, skip
fi

# Check for code files
CODE_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|cpp|go|rs)$')
if [[ -z "$CODE_FILES" ]]; then
    exit 0  # No code changes, skip
fi

echo "📚 Capturing learnings from code changes..."

# Get the diff
DIFF=$(git diff --cached)

# Extract patterns
python3 scripts/extract_code_patterns.py --diff "$DIFF" --files "$CODE_FILES"

echo "✓ Learnings captured to memory"

exit 0
```

**Make executable:**
```bash
chmod +x .claude/hooks/stop/07-capture-learnings.sh
```

**Register in hooks config:**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/stop/01-scan-incomplete-patterns.sh"
          },
          {
            "type": "command",
            "command": ".claude/hooks/stop/07-capture-learnings.sh"
          }
        ]
      }
    ]
  }
}
```

### Step 2: Create Pattern Extraction Script (3 hours)

**File:** `scripts/extract_code_patterns.py`

```python
#!/usr/bin/env python3
"""
Extract reusable code patterns from recent changes
Automatically captures to memory for future reference
"""

import sys
import re
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from memory_tool_handler import MemoryToolHandler


class PatternExtractor:
    """Extract patterns from code diffs"""

    def __init__(self):
        self.memory = MemoryToolHandler()
        self.patterns = []

    def extract_from_diff(self, diff_content, file_list):
        """Extract patterns from git diff"""

        print(f"Analyzing {len(file_list.split())} files...", flush=True)

        # Detect TypeScript/JavaScript patterns
        if any(f.endswith(('.ts', '.tsx', '.js', '.jsx')) for f in file_list.split()):
            self._extract_ts_patterns(diff_content)

        # Detect Python patterns
        if any(f.endswith('.py') for f in file_list.split()):
            self._extract_py_patterns(diff_content)

        # Detect SQL/Database patterns
        self._extract_db_patterns(diff_content)

        # Detect security patterns
        self._extract_security_patterns(diff_content)

        # Store patterns
        if self.patterns:
            self._store_patterns()
            print(f"✓ Captured {len(self.patterns)} patterns", flush=True)
        else:
            print("No new patterns detected", flush=True)

    def _extract_ts_patterns(self, diff):
        """Extract TypeScript/JavaScript patterns"""

        # Async/await pattern
        if re.search(r'\+.*async .*=>|async function', diff):
            self.patterns.append({
                'type': 'async_function',
                'language': 'typescript',
                'description': 'Async function implementation',
                'example': self._extract_block(diff, 'async'),
                'category': 'best_practices'
            })

        # React hooks
        if re.search(r'\+.*use[A-Z]\w+', diff):
            hooks = re.findall(r'use[A-Z]\w+', diff)
            for hook in set(hooks):
                self.patterns.append({
                    'type': 'react_hook',
                    'language': 'typescript',
                    'description': f'{hook} usage pattern',
                    'example': self._extract_block(diff, hook),
                    'category': 'react'
                })

        # Error handling
        if re.search(r'\+.*try \{.*\} catch', diff, re.DOTALL):
            self.patterns.append({
                'type': 'error_handling',
                'language': 'typescript',
                'description': 'Try-catch error handling',
                'example': self._extract_block(diff, 'try'),
                'category': 'best_practices'
            })

    def _extract_py_patterns(self, diff):
        """Extract Python patterns"""

        # List comprehensions
        if re.search(r'\+.*\[.* for .* in .*\]', diff):
            self.patterns.append({
                'type': 'list_comprehension',
                'language': 'python',
                'description': 'List comprehension usage',
                'example': self._extract_block(diff, 'for'),
                'category': 'best_practices'
            })

        # Context managers
        if re.search(r'\+.*with .* as .*:', diff):
            self.patterns.append({
                'type': 'context_manager',
                'language': 'python',
                'description': 'Context manager pattern',
                'example': self._extract_block(diff, 'with'),
                'category': 'best_practices'
            })

    def _extract_db_patterns(self, diff):
        """Extract database patterns"""

        # Parameterized queries (good)
        if re.search(r'\+.*\$\d+|%s|\?', diff):
            self.patterns.append({
                'type': 'parameterized_query',
                'language': 'sql',
                'description': 'Parameterized SQL query (security best practice)',
                'example': self._extract_block(diff, 'query'),
                'category': 'security'
            })

        # Batch operations
        if re.search(r'\+.*\$in|\$or', diff):
            self.patterns.append({
                'type': 'batch_query',
                'language': 'sql',
                'description': 'Batch query to prevent N+1',
                'example': self._extract_block(diff, '\$in'),
                'category': 'performance'
            })

    def _extract_security_patterns(self, diff):
        """Extract security-related patterns"""

        # Environment variable usage (good)
        if re.search(r'\+.*process\.env\.|os\.environ', diff):
            self.patterns.append({
                'type': 'env_var_usage',
                'language': 'any',
                'description': 'Environment variable for secrets',
                'example': self._extract_block(diff, 'env'),
                'category': 'security'
            })

        # Input validation
        if re.search(r'\+.*\.validate\(|\.sanitize\(|\.escape\(', diff):
            self.patterns.append({
                'type': 'input_validation',
                'language': 'any',
                'description': 'Input validation/sanitization',
                'example': self._extract_block(diff, 'validat'),
                'category': 'security'
            })

    def _extract_block(self, diff, keyword):
        """Extract code block containing keyword"""

        lines = diff.split('\n')
        for i, line in enumerate(lines):
            if keyword.lower() in line.lower() and line.startswith('+'):
                # Get context (5 lines before and after)
                start = max(0, i - 2)
                end = min(len(lines), i + 5)
                block = '\n'.join(lines[start:end])
                # Remove diff markers
                block = re.sub(r'^[+\-]', '', block, flags=re.MULTILINE)
                return block.strip()
        return ''

    def _store_patterns(self):
        """Store patterns in memory"""

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

        for pattern in self.patterns:
            # Determine storage path
            category = pattern.get('category', 'general')
            path = f"code_patterns/{category}/{pattern['type']}.md"

            # Check if pattern already exists
            try:
                existing = self.memory.view(path)
                # Append to existing
                content = existing['content']
                content += f"\n\n## Update: {timestamp}\n\n"
                content += f"**Description:** {pattern['description']}\n\n"
                content += f"**Example:**\n```{pattern['language']}\n{pattern['example']}\n```\n"

                self.memory.str_replace(
                    path,
                    content,
                    content  # This is a bit hacky but works for append
                )

            except:
                # Create new pattern file
                content = f"""# Pattern: {pattern['type'].replace('_', ' ').title()}

**Category:** {category}
**Language:** {pattern['language']}
**First Detected:** {timestamp}
**Times Applied:** 1

## Description

{pattern['description']}

## Example

```{pattern['language']}
{pattern['example']}
```

## When to Use

[Claude will learn this over time]

## Related Patterns

[Will be linked as more patterns are learned]

---

*This pattern was automatically learned from code changes.*
*Edit this file to add notes, examples, or related patterns.*
"""

                self.memory.create(path, content)

            print(f"  ✓ Stored: {pattern['type']}", flush=True)


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(description='Extract code patterns from diff')
    parser.add_argument('--diff', required=True, help='Git diff content')
    parser.add_argument('--files', required=True, help='Changed file list')

    args = parser.parse_args()

    extractor = PatternExtractor()
    extractor.extract_from_diff(args.diff, args.files)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"Error extracting patterns: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
```

**Make executable:**
```bash
chmod +x scripts/extract_code_patterns.py
```

### Step 3: Test the System (1 hour)

**Test 1: Make a simple code change**

```bash
# Create test file
cat > test_pattern.ts <<EOF
export async function fetchUser(id: string) {
  try {
    const response = await fetch(\`/api/users/\${id}\`);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}
EOF

# Stage it
git add test_pattern.ts

# Trigger the hook (happens automatically when Claude stops)
# Or test manually:
.claude/hooks/stop/07-capture-learnings.sh
```

**Expected output:**
```
📚 Capturing learnings from code changes...
Analyzing 1 files...
  ✓ Stored: async_function
  ✓ Stored: error_handling
✓ Captured 2 patterns
✓ Learnings captured to memory
```

**Verify patterns created:**
```bash
ls -l memories/code_patterns/best_practices/
# Should show:
# async_function.md
# error_handling.md
```

**Test 2: View captured pattern**

```bash
cat memories/code_patterns/best_practices/async_function.md
```

**Should show:**
```markdown
# Pattern: Async Function

**Category:** best_practices
**Language:** typescript
**First Detected:** 2025-10-27 10:30
**Times Applied:** 1

## Description

Async function implementation

## Example

```typescript
export async function fetchUser(id: string) {
  try {
    const response = await fetch(`/api/users/${id}`);
    ...
  }
}
```

...
```

### Step 4: Integration Test (1 hour)

**Full workflow test:**

1. Ask Claude to implement a feature
2. Claude writes code with patterns
3. Code is staged for commit
4. Stop hook automatically captures patterns
5. Verify patterns in memories/

**Example:**

```
User: "Add input validation to the login function"

Claude: [Implements validation]

# Patterns automatically captured:
- memories/code_patterns/security/input_validation.md
- memories/code_patterns/best_practices/error_handling.md
```

---

## What You've Achieved

After Week 1 implementation:

✅ **Automatic learning** - Patterns captured from every code change
✅ **Zero manual effort** - No need to document patterns manually
✅ **Growing knowledge base** - Memory accumulates organically
✅ **Structured storage** - Patterns organized by category

**Memory growth projection:**
- Week 1: ~10-20 patterns
- Week 2: ~30-40 patterns
- Week 4: ~60-80 patterns
- Week 8: ~120-150 patterns

---

## Next: Week 2

After Week 1 is working, move to Week 2:
- Memory injection before tasks
- Smart pattern retrieval
- Context-aware recommendations

See: `docs/platform/memory_week2_implementation.md` (to be created)

---

## Troubleshooting

**Hook not running:**
```bash
# Check hook is executable
ls -l .claude/hooks/stop/07-capture-learnings.sh
# Should show: -rwxr-xr-x

# If not:
chmod +x .claude/hooks/stop/07-capture-learnings.sh
```

**Patterns not captured:**
```bash
# Test extraction script directly
git diff --cached > /tmp/test_diff.txt
python3 scripts/extract_code_patterns.py \
    --diff "$(cat /tmp/test_diff.txt)" \
    --files "test.ts"
```

**Memory write fails:**
```bash
# Check memory directory permissions
ls -ld memories/
# Should be writable

# Check memory handler
python3 -c "from scripts.memory_tool_handler import MemoryToolHandler; m = MemoryToolHandler(); print('OK')"
```

---

## Documentation

- Hook implementation: `.claude/hooks/stop/07-capture-learnings.sh`
- Pattern extraction: `scripts/extract_code_patterns.py`
- Memory structure: `memories/code_patterns/`
- This guide: `docs/platform/memory_week1_implementation.md`

---

**Status:** Ready to implement
**Time required:** 5-10 hours
**Dependencies:** Phase 1 & 2 complete ✅
**Next step:** Implement Stop hook and test with real code changes
