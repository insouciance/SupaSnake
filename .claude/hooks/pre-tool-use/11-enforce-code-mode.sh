#!/bin/bash
# PreToolUse Hook: Enforce Code-Mode Execution
# Blocks direct MCP and context-heavy tool calls
# Forces Claude to use code-mode execution pattern
# Exit 0: Allow, Exit 2: BLOCK
#
# Based on: https://www.anthropic.com/engineering/code-execution-with-mcp
# Token reduction: 98.7% (150k → 2k tokens)

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Tools that MUST use code-mode execution
# These tools return large amounts of data that bloat context
BLOCKED_TOOLS=(
  "mcp__"      # All MCP tools (prefix match)
  "WebFetch"   # Web content (10-50k tokens per page)
  "WebSearch"  # Search results (variable, often large)
)

# Check if tool should be blocked
for pattern in "${BLOCKED_TOOLS[@]}"; do
  if [[ "$TOOL_NAME" == "$pattern"* ]]; then
    cat >&2 <<EOF
❌ BLOCKED: Use Code-Mode Execution

🔧 Tool: $TOOL_NAME

📊 Why blocked:
  • Direct tool calls bloat context (10k-150k tokens per call)
  • Code-mode reduces this to ~500 tokens (98.7% reduction)
  • Prevents auto-compact from frequent context resets

📋 How to use code-mode instead:

Step 1: Write Python code to a temp file:
\`\`\`python
# /tmp/claude_code_xxx.py
from mcp_tools import memory, fs, web

# Your tool operations here
results = memory.search("your query", domain="security")
for r in results:
    print(f"- {r['title']}")
\`\`\`

Step 2: Execute via code_executor:
\`\`\`bash
.venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code_xxx.py --budget 500
\`\`\`

🔄 Available mcp_tools modules:

  memory.search(query, domain=None, limit=5)
  memory.capture(domain, category, title, summary, content, tags)
  memory.get_by_domain(domain, limit=10)

  fs.read(path, start_line=None, end_line=None)
  fs.glob(pattern, path=".")
  fs.grep(pattern, path=".", file_type=None)
  fs.list_dir(path)

  web.fetch(url, prompt)
  web.search(query, limit=5)

💡 Example workflow:

  1. Write tool to write Python to /tmp/claude_code_<unique>.py
  2. Bash tool to run: .venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code_<unique>.py
  3. Receive token-budgeted summary

Platform requirement: Code-mode for context-heavy operations
See: docs/PLATFORM_MANUAL.md
EOF
    exit 2
  fi
done

# Allow all other tools
exit 0
