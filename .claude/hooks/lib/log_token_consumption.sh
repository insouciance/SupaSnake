#!/bin/bash
# Helper: Log Token Consumption
# Used by hooks and scripts to track token usage

log_token_read() {
    local file_path="$1"
    local session_id="${2:-}"

    if [ ! -f "$file_path" ]; then
        return 0
    fi

    local content=$(cat "$file_path")
    local content_preview=$(echo "$content" | head -c 100 | tr '\n' ' ' | sed 's/"/\\"/g')
    local line_count=$(echo "$content" | wc -l)

    # Estimate tokens: ~4 chars per token for text, ~3 for code
    local char_count=${#content}
    local tokens_estimated

    case "$file_path" in
        *.py|*.js|*.ts|*.cpp|*.java|*.go|*.rs)
            tokens_estimated=$((char_count / 3))
            ;;
        *.json|*.jsonl)
            tokens_estimated=$((char_count * 2 / 5))
            ;;
        *)
            tokens_estimated=$((char_count / 4))
            ;;
    esac

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local metrics_dir="state/tool_metrics"
    local log_file="$metrics_dir/token_consumption.jsonl"

    mkdir -p "$metrics_dir"

    # Build JSON
    local json=$(cat <<EOF
{"timestamp":"$timestamp","operation_type":"read","component":"$file_path","tokens_estimated":$tokens_estimated,"content_preview":"$content_preview","session_id":$([ -n "$session_id" ] && echo "\"$session_id\"" || echo "null"),"metadata":{"lines":$line_count}}
EOF
)

    echo "$json" >> "$log_file"
}

log_token_write() {
    local file_path="$1"
    local content="$2"
    local session_id="${3:-}"

    local content_preview=$(echo "$content" | head -c 100 | tr '\n' ' ' | sed 's/"/\\"/g')
    local line_count=$(echo "$content" | wc -l)

    # Estimate tokens
    local char_count=${#content}
    local tokens_estimated

    case "$file_path" in
        *.py|*.js|*.ts|*.cpp|*.java|*.go|*.rs)
            tokens_estimated=$((char_count / 3))
            ;;
        *.json|*.jsonl)
            tokens_estimated=$((char_count * 2 / 5))
            ;;
        *)
            tokens_estimated=$((char_count / 4))
            ;;
    esac

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local metrics_dir="state/tool_metrics"
    local log_file="$metrics_dir/token_consumption.jsonl"

    mkdir -p "$metrics_dir"

    # Build JSON
    local json=$(cat <<EOF
{"timestamp":"$timestamp","operation_type":"write","component":"$file_path","tokens_estimated":$tokens_estimated,"content_preview":"$content_preview","session_id":$([ -n "$session_id" ] && echo "\"$session_id\"" || echo "null"),"metadata":{"lines":$line_count}}
EOF
)

    echo "$json" >> "$log_file"
}

# Export functions
export -f log_token_read
export -f log_token_write
