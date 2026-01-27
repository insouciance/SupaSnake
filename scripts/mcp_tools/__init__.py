"""
MCP Tools - Code-callable wrappers for Claude Code tools

Instead of direct MCP tool calls that bloat context, Claude writes Python code
that imports these modules. The code_executor runs the code and returns
a token-budgeted summary.

ADVANCED TOOL USE PATTERNS (Nov 2025):
1. Tool Search - Discover tools on-demand instead of loading all upfront
2. Programmatic Tool Calling - Invoke tools in code execution environment
3. Tool Use Examples - Concrete usage patterns beyond just schemas

Usage (Claude writes this in a temp file):
    from mcp_tools import memory, fs, web, tools

    # PATTERN 1: Tool Search - find tools by capability
    matches = tools.search("read file contents")
    print(f"Best match: {matches[0]['name']}")  # fs.read

    # PATTERN 2: Programmatic Tool Calling - use tools in code
    results = memory.search("authentication patterns", domain="security")
    for r in results:
        print(f"- {r['title']}: {r['summary'][:100]}")

    content = fs.read("/path/to/file.py")
    matches = fs.grep("def.*validate", path="src/")

    data = web.fetch("https://example.com", prompt="Extract the main points")

    # PATTERN 3: Tool Use Examples - get usage patterns
    examples = tools.examples('memory.search')
    for ex in examples:
        print(f"When: {ex.get('when', 'General use')}")
        print(ex['code'])

Token Reduction:
- Direct MCP calls: ~150k tokens for complex operations
- Code-mode: ~2k tokens (98.7% reduction)
- Tool Search vs all definitions upfront: 85% additional reduction

See: https://www.anthropic.com/engineering/advanced-tool-use
"""

from . import memory
from . import filesystem as fs
from . import web
from . import registry as tools

__all__ = ['memory', 'fs', 'web', 'tools']

# Version for compatibility tracking
__version__ = '2.0.0'  # Advanced Tool Use patterns added
