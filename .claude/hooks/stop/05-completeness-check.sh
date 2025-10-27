#!/bin/bash
# Stop Hook: Completeness Check
# Validates that ALL planned components were created
# This prevents stopping work before implementation is complete
# Exit 0: Always (informational), but warns if incomplete

PROJECT_DIR=$(pwd)
TODO_FILE="$PROJECT_DIR/.claude/settings.local.json"

# Skip if no todo file
if [[ ! -f "$TODO_FILE" ]]; then
  exit 0
fi

# Extract todos from settings.local.json
TODOS=$(cat "$TODO_FILE" | jq -r '.todos[]? | select(.status == "pending" or .status == "in_progress") | .content' 2>/dev/null)

# If no pending todos, all work complete
if [[ -z "$TODOS" ]]; then
  echo "✅ Completeness Check: All planned work complete"
  exit 0
fi

# Check for component creation todos
INCOMPLETE_COMPONENTS=()

while IFS= read -r todo; do
  # Extract file paths from common patterns
  # "Create ConsentBanner component" -> src/components/legal/ConsentBanner.tsx
  # "Create amplitude.ts integration" -> src/lib/analytics/amplitude.ts
  # "Create /api/consent/update route" -> src/app/api/consent/update/route.ts

  FILE_PATH=""

  # Match: "Create X component" or "Create X.tsx"
  if [[ "$todo" =~ Create[[:space:]]+([a-zA-Z_-]+)[[:space:]]+component ]]; then
    COMPONENT_NAME="${BASH_REMATCH[1]}"
    # Common component locations
    if [[ -f "src/components/legal/$COMPONENT_NAME.tsx" ]]; then
      continue
    elif [[ -f "src/components/privacy/$COMPONENT_NAME.tsx" ]]; then
      continue
    elif [[ -f "src/components/$COMPONENT_NAME.tsx" ]]; then
      continue
    else
      INCOMPLETE_COMPONENTS+=("Component: $COMPONENT_NAME (expected in src/components/)")
    fi
  fi

  # Match: "Create amplitude.ts" or "Create consent-manager.ts"
  if [[ "$todo" =~ Create[[:space:]]+([a-zA-Z_-]+\.ts) ]]; then
    FILE_NAME="${BASH_REMATCH[1]}"
    # Common lib locations
    if [[ -f "src/lib/analytics/$FILE_NAME" ]]; then
      continue
    elif [[ -f "src/lib/consent/$FILE_NAME" ]]; then
      continue
    elif [[ -f "src/lib/privacy/$FILE_NAME" ]]; then
      continue
    elif [[ -f "src/lib/$FILE_NAME" ]]; then
      continue
    else
      INCOMPLETE_COMPONENTS+=("File: $FILE_NAME (expected in src/lib/)")
    fi
  fi

  # Match: "Create /api/path/route"
  if [[ "$todo" =~ Create[[:space:]]+/api/([a-zA-Z/_-]+)[[:space:]]+(route|API|endpoint) ]]; then
    API_PATH="${BASH_REMATCH[1]}"
    # Check for API route
    if [[ -f "src/app/api/$API_PATH/route.ts" ]]; then
      continue
    else
      INCOMPLETE_COMPONENTS+=("API Route: /api/$API_PATH/route.ts")
    fi
  fi

  # Match: "Create Privacy Dashboard page"
  if [[ "$todo" =~ Create[[:space:]]+Privacy[[:space:]]+Dashboard[[:space:]]+page ]]; then
    if [[ -f "src/app/(dashboard)/settings/privacy/page.tsx" ]] || [[ -f "src/app/settings/privacy/page.tsx" ]]; then
      continue
    else
      INCOMPLETE_COMPONENTS+=("Page: Privacy Dashboard (expected in src/app/*/settings/privacy/page.tsx)")
    fi
  fi

done <<< "$TODOS"

# Report findings
if [[ ${#INCOMPLETE_COMPONENTS[@]} -gt 0 ]]; then
  echo ""
  echo "⚠️  COMPLETENESS CHECK: Incomplete Work Detected"
  echo ""
  echo "Platform Standard: Don't stop until all planned components are implemented"
  echo ""
  echo "Pending todos indicate planned components that don't exist yet:"
  echo ""
  for component in "${INCOMPLETE_COMPONENTS[@]}"; do
    echo "  ❌ $component"
  done
  echo ""
  echo "Recommendation: Complete implementation before stopping"
  echo ""
  echo "If these components are intentionally not created yet:"
  echo "  1. Update todo list to mark items as completed"
  echo "  2. Or add explanation in CLAUDE.md Current Work section"
  echo ""
else
  echo "✅ Completeness Check: All planned components exist"
fi

# Exit 0 (informational warning, not blocking)
exit 0
