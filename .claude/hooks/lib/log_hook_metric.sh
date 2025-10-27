#!/bin/bash
# Helper: Log Hook Execution Metrics
# Used by hooks to track their performance

log_hook_metric() {
    local hook_name="$1"
    local hook_type="$2"
    local success="$3"          # true/false
    local duration_ms="$4"
    local blocked="$5"          # true/false
    local exit_code="$6"
    local output_length="$7"
    local error_message="${8:-}"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local metrics_dir="state/tool_metrics"
    local log_file="$metrics_dir/hook_execution.jsonl"

    # Ensure directory exists
    mkdir -p "$metrics_dir"

    # Build JSON
    local json=$(cat <<EOF
{"timestamp":"$timestamp","hook_name":"$hook_name","hook_type":"$hook_type","success":$success,"duration_ms":$duration_ms,"blocked":$blocked,"exit_code":$exit_code,"output_length":$output_length,"error_message":$([ -n "$error_message" ] && echo "\"$error_message\"" || echo "null")}
EOF
)

    # Append to log
    echo "$json" >> "$log_file"
}

# Export function for use in hooks
export -f log_hook_metric
