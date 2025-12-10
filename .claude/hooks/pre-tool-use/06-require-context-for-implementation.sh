#!/bin/bash
# PreToolUse Hook: Require Context for Implementation (v3 - Domain + Activity)
# Validates: File domain matches recent read activity
# Exit 0: Allow, Exit 2: BLOCK

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check Write/Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Skip non-implementation paths
if [[ "$FILE_PATH" =~ /state/ ]] || \
   [[ "$FILE_PATH" =~ /docs/ ]] || \
   [[ "$FILE_PATH" =~ \.claude ]] || \
   [[ "$FILE_PATH" =~ ^knowledge_base/ ]] || \
   [[ "$FILE_PATH" =~ \.md$ ]] || \
   [[ "$FILE_PATH" =~ \.test\. ]] || \
   [[ "$FILE_PATH" =~ \.config\. ]] || \
   [[ "$FILE_PATH" =~ /config/ ]] || \
   [[ "$FILE_PATH" =~ package\.json ]] || \
   [[ "$FILE_PATH" =~ tsconfig ]]; then
  exit 0
fi

# Load domain mapping
DOMAIN_MAPPING="state/domain_mapping.json"
if [[ ! -f "$DOMAIN_MAPPING" ]]; then
  # No domain mapping = can't validate, allow but warn
  echo "⚠️  No domain mapping found (state/domain_mapping.json)" >&2
  echo "   Context validation skipped" >&2
  exit 0
fi

# Detect domain of file being written
WRITE_DOMAIN=""
for domain in $(jq -r '.domains | keys[]' "$DOMAIN_MAPPING"); do
  PATTERNS=$(jq -r --arg d "$domain" '.domains[$d].path_patterns[]' "$DOMAIN_MAPPING" 2>/dev/null)
  while IFS= read -r pattern; do
    if [[ -n "$pattern" ]] && [[ "$FILE_PATH" == *"$pattern"* ]]; then
      WRITE_DOMAIN="$domain"
      break 2
    fi
  done <<< "$PATTERNS"
done

# If file doesn't match any domain, allow (unknown territory)
if [[ -z "$WRITE_DOMAIN" ]]; then
  exit 0
fi

# Check if we have recent activity in this domain
DOMAIN_ACTIVITY="state/read_activity/domain_activity.json"

if [[ ! -f "$DOMAIN_ACTIVITY" ]]; then
  # No activity tracked yet - need to read context first
  DOMAIN_DESC=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].description' "$DOMAIN_MAPPING")
  REQUIRED=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].required_context[]? | "  - \(.file) (\(.reason))"' "$DOMAIN_MAPPING")
  PATTERNS=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].pattern_references[]? | "  - \(.file) (\(.reason))"' "$DOMAIN_MAPPING")

  cat >&2 <<EOF
❌ BLOCKED: No context loaded for domain "$WRITE_DOMAIN"

📍 You're writing to: $FILE_PATH
📁 Domain: $WRITE_DOMAIN ($DOMAIN_DESC)

⚠️  No files from this domain have been read yet.

📋 Required context to read first:
$REQUIRED

📐 Pattern references (recommended):
$PATTERNS

💡 Why this matters:
  Reading relevant context ensures you understand:
  - Existing patterns and conventions
  - Database schema and config values
  - How similar features are implemented

Read the required files, then retry the write.
EOF
  exit 2
fi

# Check if this domain has been accessed
DOMAIN_LAST_READ=$(jq -r --arg d "$WRITE_DOMAIN" '.[$d].last_read // "never"' "$DOMAIN_ACTIVITY")

if [[ "$DOMAIN_LAST_READ" == "never" ]] || [[ "$DOMAIN_LAST_READ" == "null" ]]; then
  DOMAIN_DESC=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].description' "$DOMAIN_MAPPING")
  REQUIRED=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].required_context[]? | "  - \(.file) (\(.reason))"' "$DOMAIN_MAPPING")
  PATTERNS=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].pattern_references[]? | "  - \(.file) (\(.reason))"' "$DOMAIN_MAPPING")

  # Show what domains HAVE been accessed
  ACTIVE_DOMAINS=$(jq -r 'keys[]' "$DOMAIN_ACTIVITY" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')

  cat >&2 <<EOF
❌ BLOCKED: No context loaded for domain "$WRITE_DOMAIN"

📍 You're writing to: $FILE_PATH
📁 Domain: $WRITE_DOMAIN ($DOMAIN_DESC)

🔍 You have read context for: $ACTIVE_DOMAINS
   But NOT for: $WRITE_DOMAIN

📋 Required context to read first:
$REQUIRED

📐 Pattern references (recommended):
$PATTERNS

Read the required files for "$WRITE_DOMAIN" domain, then retry.
EOF
  exit 2
fi

# Check if required context files have been read
REQUIRED_FILES=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].required_context[]?.file' "$DOMAIN_MAPPING")
RECENT_READS=$(jq -r '.reads[].file' "state/read_activity/recent_reads.json" 2>/dev/null)

MISSING_REQUIRED=()
while IFS= read -r required; do
  if [[ -n "$required" ]]; then
    # Check if this required file (or something in same dir) was read
    FOUND=false
    while IFS= read -r read_file; do
      if [[ "$read_file" == *"$required"* ]] || [[ "$required" == *"$read_file"* ]]; then
        FOUND=true
        break
      fi
    done <<< "$RECENT_READS"

    if [[ "$FOUND" == "false" ]]; then
      MISSING_REQUIRED+=("$required")
    fi
  fi
done <<< "$REQUIRED_FILES"

if [[ ${#MISSING_REQUIRED[@]} -gt 0 ]]; then
  DOMAIN_DESC=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].description' "$DOMAIN_MAPPING")

  cat >&2 <<EOF
⚠️  WARNING: Missing required context for "$WRITE_DOMAIN"

📍 You're writing to: $FILE_PATH
📁 Domain: $WRITE_DOMAIN ($DOMAIN_DESC)

📋 Required files NOT read:
EOF
  for file in "${MISSING_REQUIRED[@]}"; do
    REASON=$(jq -r --arg d "$WRITE_DOMAIN" --arg f "$file" \
      '.domains[$d].required_context[]? | select(.file == $f) | .reason' "$DOMAIN_MAPPING")
    echo "  - $file ($REASON)" >&2
  done

  cat >&2 <<EOF

💡 Consider reading these files for full context.
   Allowing write, but quality may be affected.
EOF
  # Warn but allow - they have SOME domain context
  exit 0
fi

# All checks passed
DOMAIN_DESC=$(jq -r --arg d "$WRITE_DOMAIN" '.domains[$d].description' "$DOMAIN_MAPPING")
echo "✓ Context verified for domain: $WRITE_DOMAIN ($DOMAIN_DESC)" >&2
exit 0
