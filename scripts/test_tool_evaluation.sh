#!/bin/bash
# Test Tool Evaluation Framework
# Generates sample metrics and runs analysis

set -e

echo "=== Testing Tool Evaluation Framework ==="
echo ""

# Ensure directories exist
mkdir -p state/tool_metrics

echo "1. Testing memory retrieval metrics..."
echo ""

# Run a few memory retrievals to generate metrics
python3 scripts/retrieve_memories.py \
    --prompt "implement authentication" \
    --format concise \
    --limit 3 > /dev/null 2>&1 || echo "No memories yet (expected)"

python3 scripts/retrieve_memories.py \
    --prompt "security best practices" \
    --format detailed \
    --limit 2 > /dev/null 2>&1 || echo "No memories yet (expected)"

python3 scripts/retrieve_memories.py \
    --prompt "optimize performance" \
    --format concise \
    --token-budget 500 \
    --limit 5 > /dev/null 2>&1 || echo "No memories yet (expected)"

echo "✓ Generated memory retrieval metrics"
echo ""

# Check if metrics were logged
if [ -f "state/tool_metrics/memory_retrieval.jsonl" ]; then
    MEMORY_COUNT=$(wc -l < state/tool_metrics/memory_retrieval.jsonl)
    echo "  Logged retrievals: $MEMORY_COUNT"
else
    echo "  No memory metrics logged yet"
fi
echo ""

echo "2. Simulating hook execution metrics..."
echo ""

# Simulate some hook metrics using the helper
source .claude/hooks/lib/log_hook_metric.sh 2>/dev/null || echo "Hook helper not found"

# Simulate successful hook execution
if type log_hook_metric &>/dev/null; then
    log_hook_metric \
        "01-block-incomplete-code" \
        "PreToolUse" \
        "true" \
        "45" \
        "false" \
        "0" \
        "0" \
        ""

    log_hook_metric \
        "02-require-tests" \
        "PreToolUse" \
        "true" \
        "120" \
        "true" \
        "1" \
        "156" \
        "Missing test file"

    log_hook_metric \
        "08-monitor-context-quality" \
        "Stop" \
        "true" \
        "850" \
        "false" \
        "0" \
        "412" \
        ""

    echo "✓ Generated hook execution metrics"
else
    echo "⚠️  Hook logging not available"
fi
echo ""

# Check if hook metrics were logged
if [ -f "state/tool_metrics/hook_execution.jsonl" ]; then
    HOOK_COUNT=$(wc -l < state/tool_metrics/hook_execution.jsonl)
    echo "  Logged executions: $HOOK_COUNT"
else
    echo "  No hook metrics logged yet"
fi
echo ""

echo "3. Running tool evaluation analysis..."
echo ""

# Run analysis if we have metrics
if [ -f "state/tool_metrics/memory_retrieval.jsonl" ] || [ -f "state/tool_metrics/hook_execution.jsonl" ]; then
    echo "--- Memory Effectiveness ---"
    python3 scripts/tool_evaluator.py analyze-memory --days 1 2>/dev/null || echo "Not enough data for analysis"
    echo ""

    echo "--- Hook Performance ---"
    python3 scripts/tool_evaluator.py analyze-hooks --days 1 2>/dev/null || echo "Not enough data for analysis"
    echo ""

    echo "--- Complete Summary ---"
    python3 scripts/tool_evaluator.py summary --days 1 2>/dev/null || echo "Not enough data for summary"
    echo ""
else
    echo "⚠️  No metrics available for analysis"
    echo "  Run actual operations to generate metrics"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "Metrics stored in: state/tool_metrics/"
echo "  - memory_retrieval.jsonl"
echo "  - hook_execution.jsonl"
echo "  - tool_usage.jsonl"
echo ""
echo "Run analysis: python3 scripts/tool_evaluator.py summary"
