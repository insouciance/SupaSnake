#!/bin/bash
# PreToolUse Hook: Require Tests
# Blocks new functions without corresponding tests
# Based on: Anthropic "Writing Tools for Agents" - actionable error messages
# Exit 0: Allow, Exit 2: BLOCK

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')

# Only check Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Skip test files themselves
if [[ "$FILE_PATH" =~ test_ || "$FILE_PATH" =~ _test\. || "$FILE_PATH" =~ \.test\. || "$FILE_PATH" =~ /tests?/ ]]; then
  exit 0
fi

# Skip internal tooling scripts (platform infrastructure)
if [[ "$FILE_PATH" =~ /scripts/ ]]; then
  exit 0
fi

# Skip non-code files
if [[ ! "$FILE_PATH" =~ \.(ts|js|py|cpp|java|go|rs)$ ]]; then
  exit 0
fi

# Combine content
TEXT="$CONTENT$NEW_STRING"

# Extract function definitions
FUNCTIONS=()

# TypeScript/JavaScript functions
if [[ "$FILE_PATH" =~ \.(ts|js)$ ]]; then
  # Match function declarations: function foo()
  FUNCTIONS+=($(echo "$TEXT" | grep -E "^\s*(export\s+)?(async\s+)?function\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(" | sed 's/.*function \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/'))

  # Match arrow functions: const foo = () => or const foo = async () =>
  # Exclude destructuring: const { ... } =
  # Exclude object literals: const obj = { ... }
  FUNCTIONS+=($(echo "$TEXT" | grep -E "^\s*(export\s+)?const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(async\s+)?\(" | sed 's/.*const \([a-zA-Z_][a-zA-Z0-9_]*\) =.*/\1/'))

  # Match named functions: const foo = function()
  FUNCTIONS+=($(echo "$TEXT" | grep -E "^\s*(export\s+)?const\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(async\s+)?function\s*\(" | sed 's/.*const \([a-zA-Z_][a-zA-Z0-9_]*\) =.*/\1/'))
fi

# Python functions
if [[ "$FILE_PATH" =~ \.py$ ]]; then
  FUNCTIONS+=($(echo "$TEXT" | grep -E "^def " | sed 's/def \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/'))
fi

# C++ functions
if [[ "$FILE_PATH" =~ \.cpp$ ]]; then
  FUNCTIONS+=($(echo "$TEXT" | grep -E "^[a-zA-Z_].*\(" | sed 's/\(.*\)(.*/\1/' | awk '{print $NF}'))
fi

# If no functions found, allow (not a code file)
if [[ ${#FUNCTIONS[@]} -eq 0 ]]; then
  exit 0
fi

# Determine test file path
TEST_FILE=""
if [[ "$FILE_PATH" =~ \.ts$ ]]; then
  TEST_FILE="${FILE_PATH%.ts}.test.ts"
elif [[ "$FILE_PATH" =~ \.js$ ]]; then
  TEST_FILE="${FILE_PATH%.js}.test.js"
elif [[ "$FILE_PATH" =~ \.py$ ]]; then
  TEST_FILE="tests/test_$(basename $FILE_PATH)"
elif [[ "$FILE_PATH" =~ \.cpp$ ]]; then
  TEST_FILE="tests/test_$(basename $FILE_PATH)"
fi

# Check if test file exists
if [[ ! -f "$TEST_FILE" ]]; then
  cat >&2 <<'EOF'
❌ BLOCKED: Missing Test Coverage

📍 Problem:
EOF
  echo "  File: $FILE_PATH" >&2
  echo "  Functions found: ${FUNCTIONS[*]}" >&2
  echo "  Test file: $TEST_FILE (NOT FOUND)" >&2

  # Determine file extension and show appropriate template
  if [[ "$FILE_PATH" =~ \.py$ ]]; then
    cat >&2 <<'EOF'

📋 How to fix:

Step 1: Create test file
EOF
    echo "  Path: $TEST_FILE" >&2
    cat >&2 <<'EOF'

Step 2: Add tests with this template:

```python
import pytest
EOF
    echo "from $(basename ${FILE_PATH%.py}) import ${FUNCTIONS[*]}" >&2
    cat >&2 <<'EOF'

class TestFunctions:
EOF
    for func in "${FUNCTIONS[@]}"; do
      cat >&2 <<EOF

    def test_${func}_basic(self):
        """Test ${func} with typical input"""
        result = ${func}()
        assert result is not None

    def test_${func}_edge_cases(self):
        """Test ${func} with edge cases"""
        # TODO: Add edge case tests
        pass
EOF
    done

    cat >&2 <<'EOF'
```

Step 3: Run tests to verify coverage:
```bash
pytest $TEST_FILE --cov=${FILE_PATH%.py} --cov-report=term-missing
```

Target: ≥95% line coverage
EOF

  elif [[ "$FILE_PATH" =~ \.(ts|js)$ ]]; then
    cat >&2 <<'EOF'

📋 How to fix:

Step 1: Create test file
EOF
    echo "  Path: $TEST_FILE" >&2
    cat >&2 <<'EOF'

Step 2: Add tests with this template:

```typescript
import { describe, it, expect } from 'vitest';
EOF
    echo "import { ${FUNCTIONS[*]} } from './${FILE_PATH##*/}'; " | sed 's/\.[jt]s$//' >&2
    cat >&2 <<'EOF'

describe('Function Tests', () => {
EOF
    for func in "${FUNCTIONS[@]}"; do
      cat >&2 <<EOF

  describe('${func}', () => {
    it('should handle typical input', () => {
      const result = ${func}();
      expect(result).toBeDefined();
    });

    it('should handle edge cases', () => {
      // Add edge case tests
    });
  });
EOF
    done
    cat >&2 <<'EOF'
});
```

Step 3: Run tests:
```bash
npm test
```
EOF
  fi

  cat >&2 <<'EOF'

💡 Test-first development (TDD):
  1. Write tests first (defines expected behavior)
  2. Run tests (they should fail)
  3. Implement functionality
  4. Run tests (they should pass)
  5. Refactor with confidence

Platform requirement: ≥95% test coverage (hook enforced)
EOF
  exit 2
fi

# Check if functions are tested (basic check)
TEST_CONTENT=$(cat "$TEST_FILE")
MISSING_TESTS=()

for func in "${FUNCTIONS[@]}"; do
  if ! echo "$TEST_CONTENT" | grep -q "$func"; then
    MISSING_TESTS+=("$func")
  fi
done

if [[ ${#MISSING_TESTS[@]} -gt 0 ]]; then
  echo "❌ BLOCKED: Incomplete Test Coverage" >&2
  echo "" >&2
  echo "📍 Problem:" >&2
  echo "  File: $TEST_FILE exists" >&2
  echo "  Missing tests for:" >&2
  for func in "${MISSING_TESTS[@]}"; do
    echo "    • $func()" >&2
  done
  echo "" >&2
  echo "📋 Fix: Add tests for missing functions" >&2
  echo "" >&2
  echo "Platform requirement: All functions must be tested (≥95% coverage)" >&2
  exit 2
fi

# Allow write
exit 0
