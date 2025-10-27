#!/bin/bash
# Helper: Log Memory Retrieval Metrics
# Used by memory retrieval system to track effectiveness

log_memory_metric() {
    local prompt="$1"
    local format="$2"           # concise/detailed
    local patterns_returned="$3"
    local tokens_estimated="$4"
    local relevance_scores="$5"  # JSON array like "[0.8,0.6,0.5]"
    local duration_ms="$6"
    local truncated="$7"        # true/false

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local metrics_dir="state/tool_metrics"
    local log_file="$metrics_dir/memory_retrieval.jsonl"

    # Ensure directory exists
    mkdir -p "$metrics_dir"

    # Escape prompt for JSON
    local prompt_escaped=$(echo "$prompt" | sed 's/"/\\"/g' | tr '\n' ' ' | head -c 100)

    # Build JSON
    local json=$(cat <<EOF
{"timestamp":"$timestamp","prompt":"$prompt_escaped","format":"$format","patterns_returned":$patterns_returned,"tokens_estimated":$tokens_estimated,"relevance_scores":$relevance_scores,"duration_ms":$duration_ms,"truncated":$truncated}
EOF
)

    # Append to log
    echo "$json" >> "$log_file"
}

# Export function for use in scripts
export -f log_memory_metric
