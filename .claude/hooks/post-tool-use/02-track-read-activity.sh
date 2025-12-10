#!/bin/bash
# PostToolUse Hook: Track Read Activity
# Records what files have been read for context relevance validation
# Exit 0: Always (non-blocking, informational only)

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only track Read tool
if [[ "$TOOL_NAME" != "Read" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Create activity directory
ACTIVITY_DIR="state/read_activity"
mkdir -p "$ACTIVITY_DIR"

ACTIVITY_FILE="$ACTIVITY_DIR/recent_reads.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize if doesn't exist
if [[ ! -f "$ACTIVITY_FILE" ]]; then
  echo '{"reads": [], "last_cleared": "'"$TIMESTAMP"'"}' > "$ACTIVITY_FILE"
fi

# Add read to activity log (keep last 50 reads)
jq --arg file "$FILE_PATH" --arg ts "$TIMESTAMP" '
  .reads = ([{file: $file, timestamp: $ts}] + .reads) | .reads = .reads[:50]
' "$ACTIVITY_FILE" > "$ACTIVITY_FILE.tmp" && mv "$ACTIVITY_FILE.tmp" "$ACTIVITY_FILE"

# Detect domain from file path
DOMAIN_MAPPING="state/domain_mapping.json"
if [[ -f "$DOMAIN_MAPPING" ]]; then
  DETECTED_DOMAIN=""

  # Check each domain's path patterns
  for domain in $(jq -r '.domains | keys[]' "$DOMAIN_MAPPING"); do
    PATTERNS=$(jq -r --arg d "$domain" '.domains[$d].path_patterns[]' "$DOMAIN_MAPPING" 2>/dev/null)
    while IFS= read -r pattern; do
      if [[ "$FILE_PATH" == *"$pattern"* ]]; then
        DETECTED_DOMAIN="$domain"
        break 2
      fi
    done <<< "$PATTERNS"
  done

  if [[ -n "$DETECTED_DOMAIN" ]]; then
    # Update domain activity
    DOMAIN_FILE="$ACTIVITY_DIR/domain_activity.json"
    if [[ ! -f "$DOMAIN_FILE" ]]; then
      echo '{}' > "$DOMAIN_FILE"
    fi

    jq --arg domain "$DETECTED_DOMAIN" --arg ts "$TIMESTAMP" --arg file "$FILE_PATH" '
      .[$domain] = {
        last_read: $ts,
        recent_files: ((.[$domain].recent_files // []) + [$file]) | unique | .[-10:]
      }
    ' "$DOMAIN_FILE" > "$DOMAIN_FILE.tmp" && mv "$DOMAIN_FILE.tmp" "$DOMAIN_FILE"
  fi
fi

exit 0
