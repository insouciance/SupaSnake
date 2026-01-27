"""
Memory tool wrapper for code-mode execution

Wraps the existing memory_tool_handler.py to provide a clean API
for Claude's code execution.

Usage:
    from mcp_tools import memory

    # Search memories
    results = memory.search("authentication", domain="security", limit=5)

    # Capture a new memory
    memory.capture(
        domain="architecture",
        category="decision",
        title="Rate Limiting Strategy",
        summary="Using token bucket algorithm...",
        content="# Full explanation...",
        tags=["api", "security"]
    )

    # Get memories by domain
    patterns = memory.get_by_domain("performance", limit=10)
"""

import sys
from pathlib import Path
from typing import Dict, List, Optional

# Add scripts directory to path for memory_tool_handler import
_scripts_dir = Path(__file__).parent.parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from memory_tool_handler import MemoryToolHandler

# Singleton instance
_handler: Optional[MemoryToolHandler] = None


def _get_handler() -> MemoryToolHandler:
    """Get or create the memory handler singleton"""
    global _handler
    if _handler is None:
        _handler = MemoryToolHandler()
    return _handler


def search(
    query: str,
    domain: Optional[str] = None,
    limit: int = 5
) -> List[Dict]:
    """
    Search memories using full-text search

    Args:
        query: Search query string
        domain: Optional filter (architecture, security, performance, etc.)
        limit: Maximum results (default: 5)

    Returns:
        List of memory dicts with: id, domain, title, summary, relevance_score

    Example:
        results = memory.search("authentication", domain="security")
        for r in results:
            print(f"{r['title']}: {r['summary']}")
    """
    handler = _get_handler()
    return handler.search(query, domain, limit)


def capture(
    domain: str,
    category: str,
    title: str,
    summary: str,
    content: str,
    tags: Optional[List[str]] = None,
    source_file: Optional[str] = None,
    source_commit: Optional[str] = None
) -> Dict[str, str]:
    """
    Capture a new memory with full metadata

    Args:
        domain: One of: architecture, platform, security, performance,
                api, react, game, engagement, best_practices
        category: One of: code_pattern, decision, learning, debugging, context
        title: Clear, searchable title (max 100 chars)
        summary: One-paragraph description (max 500 chars)
        content: Full markdown content
        tags: Optional list of tags for search
        source_file: Optional source file path
        source_commit: Optional git commit hash

    Returns:
        Dict with: status, storage, id/path, domain, category, title

    Example:
        memory.capture(
            domain="security",
            category="code_pattern",
            title="Input Validation Pattern",
            summary="Always validate user input at API boundaries...",
            content="# Input Validation\\n\\n## Why\\n...",
            tags=["validation", "api", "security"]
        )
    """
    handler = _get_handler()
    return handler.capture(
        domain=domain,
        category=category,
        title=title,
        summary=summary,
        content=content,
        tags=tags,
        source_file=source_file,
        source_commit=source_commit
    )


def get_by_domain(domain: str, limit: int = 10) -> List[Dict]:
    """
    Get memories by domain, ordered by relevance

    Args:
        domain: Domain name (engagement, game, architecture, security, etc.)
        limit: Maximum results (default: 10)

    Returns:
        List of memory dicts with full content

    Example:
        patterns = memory.get_by_domain("security", limit=5)
        for p in patterns:
            print(f"[{p['relevance_score']}] {p['title']}")
    """
    handler = _get_handler()
    return handler.get_by_domain(domain, limit)


def view(
    path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> Dict:
    """
    View a memory file or directory

    Args:
        path: Relative path within memory directory
        start_line: Optional starting line (1-indexed)
        end_line: Optional ending line (inclusive)

    Returns:
        Dict with: type (file/directory), content/contents, path

    Example:
        # View directory
        result = memory.view("code_patterns/security")
        for name in result['contents']:
            print(f"  - {name}")

        # View file
        result = memory.view("architectural_decisions/server_authority.md")
        print(result['content'])
    """
    handler = _get_handler()
    return handler.view(path, start_line, end_line)


def stats() -> Dict:
    """
    Get memory storage statistics

    Returns:
        Dict with: total_size_mb, file_count, directory_count, base_path

    Example:
        s = memory.stats()
        print(f"Memory: {s['total_size_mb']}MB across {s['file_count']} files")
    """
    handler = _get_handler()
    return handler.get_storage_stats()


def increment_applied(memory_id: str) -> bool:
    """
    Mark a memory as applied (increments usage counter)

    Args:
        memory_id: UUID of the memory (from search results)

    Returns:
        True if successful, False otherwise

    Example:
        results = memory.search("auth pattern")
        if results:
            memory.increment_applied(results[0]['id'])
    """
    handler = _get_handler()
    return handler.increment_applied(memory_id)
