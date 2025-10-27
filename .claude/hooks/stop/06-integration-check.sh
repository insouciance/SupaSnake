#!/bin/bash
# Stop Hook: Integration Check
# Validates TypeScript compilation and module integration
# Ensures no syntax errors, missing imports, or circular dependencies
# Exit 0: Always (informational)

PROJECT_DIR=$(pwd)

# Skip if no package.json (not a Node project)
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  exit 0
fi

# Skip if no TypeScript config
if [[ ! -f "$PROJECT_DIR/tsconfig.json" ]]; then
  exit 0
fi

# Check if TypeScript is installed
if ! command -v tsc &> /dev/null; then
  echo "⚠️  TypeScript not installed (skipping integration check)"
  exit 0
fi

echo ""
echo "=== Integration Check: TypeScript Compilation ==="
echo ""

# Run TypeScript compiler in check mode (no emit)
TS_OUTPUT=$(tsc --noEmit 2>&1)
TS_EXIT_CODE=$?

if [[ $TS_EXIT_CODE -eq 0 ]]; then
  echo "✅ TypeScript compilation successful"
  echo ""
else
  echo "❌ TypeScript compilation errors detected:"
  echo ""
  echo "$TS_OUTPUT" | head -20
  echo ""

  # Count errors
  ERROR_COUNT=$(echo "$TS_OUTPUT" | grep -c "error TS")

  if [[ $ERROR_COUNT -gt 20 ]]; then
    echo "... and $((ERROR_COUNT - 20)) more errors"
    echo ""
  fi

  echo "Fix: Resolve TypeScript errors before deployment"
  echo ""
fi

# Check for common integration issues
echo "=== Integration Check: Common Issues ==="
echo ""

# Check for missing imports in new files
NEW_TS_FILES=$(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -20)

if [[ -n "$NEW_TS_FILES" ]]; then
  MISSING_IMPORTS=0

  while IFS= read -r file; do
    # Check for usage of undefined variables (basic heuristic)
    # Skip test files and .d.ts files
    if [[ "$file" =~ \.test\. ]] || [[ "$file" =~ \.d\.ts$ ]]; then
      continue
    fi

    # Check if file imports React but uses JSX
    if grep -q "\.tsx$" <<< "$file"; then
      if ! grep -q "^import.*React" "$file" && grep -q "<[A-Z]" "$file"; then
        echo "⚠️  $file: Uses JSX but doesn't import React"
        MISSING_IMPORTS=$((MISSING_IMPORTS + 1))
      fi
    fi
  done <<< "$NEW_TS_FILES"

  if [[ $MISSING_IMPORTS -eq 0 ]]; then
    echo "✅ No obvious missing imports detected"
  fi
else
  echo "✅ No TypeScript files to check"
fi

echo ""

# Check for circular dependencies (basic check)
if command -v madge &> /dev/null; then
  echo "=== Circular Dependency Check ==="
  echo ""

  CIRCULAR=$(madge --circular --extensions ts,tsx src/ 2>&1)

  if [[ -z "$CIRCULAR" ]]; then
    echo "✅ No circular dependencies detected"
  else
    echo "⚠️  Circular dependencies found:"
    echo "$CIRCULAR"
    echo ""
    echo "Fix: Refactor to remove circular imports"
  fi

  echo ""
else
  echo "ℹ️  Install 'madge' for circular dependency detection: npm install -g madge"
  echo ""
fi

# Summary
echo "=== Integration Check Summary ==="
echo ""

if [[ $TS_EXIT_CODE -eq 0 ]]; then
  echo "✅ TypeScript compilation: PASS"
else
  echo "❌ TypeScript compilation: FAIL ($ERROR_COUNT errors)"
fi

echo ""
echo "Recommendation: Fix compilation errors before deployment"
echo ""

# Exit 0 (informational, not blocking)
exit 0
