#!/bin/bash
# Test Token Tracking System
# Demonstrates token consumption analysis

set -e

echo "=== Testing Token Tracking System ==="
echo ""

# Source helper
source .claude/hooks/lib/log_token_consumption.sh

echo "1. Simulating file operations..."
echo ""

# Simulate reading some files
log_token_read "CLAUDE.md" "test-session-1"
log_token_read "scripts/context_quality_scorer.py" "test-session-1"
log_token_read "scripts/tool_evaluator.py" "test-session-1"

# Simulate writing files
TEST_CONTENT=$(cat <<'EOF'
#!/usr/bin/env python3
"""Test file for token tracking"""

def example_function():
    """Example function"""
    return "Hello, world!"

if __name__ == '__main__':
    print(example_function())
EOF
)

log_token_write "test_output.py" "$TEST_CONTENT" "test-session-1"

echo "✓ Logged file operations"
echo ""

# Check log file
if [ -f "state/tool_metrics/token_consumption.jsonl" ]; then
    TOKEN_COUNT=$(wc -l < state/tool_metrics/token_consumption.jsonl)
    echo "  Logged operations: $TOKEN_COUNT"
else
    echo "  No token consumption logged yet"
fi
echo ""

echo "2. Analyzing token consumption..."
echo ""

# Run analysis
python3 scripts/token_tracker.py analyze --days 1

echo ""
echo "3. Finding optimization opportunities..."
echo ""

python3 scripts/token_tracker.py optimize

echo ""
echo "4. Estimating file tokens..."
echo ""

# Estimate tokens for various files
for file in "CLAUDE.md" "scripts/context_quality_scorer.py" "scripts/tool_evaluator.py"; do
    if [ -f "$file" ]; then
        echo "  $file:"
        python3 scripts/token_tracker.py estimate-file --file "$file"
    fi
done

echo ""
echo "=== Test Complete ==="
echo ""
echo "Token consumption data: state/tool_metrics/token_consumption.jsonl"
echo "Analysis: python3 scripts/token_tracker.py analyze"
echo "Optimize: python3 scripts/token_tracker.py optimize"
