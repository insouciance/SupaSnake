"""
Tool Registry - Searchable index for on-demand tool discovery

Implements Anthropic's Tool Search pattern:
- Tools indexed by keywords, capabilities, and domains
- Lazy loading - tools only imported when explicitly requested
- Search returns tool references, not full definitions
- 85% token reduction by not loading unused tools upfront

Usage:
    from mcp_tools import tools

    # Search for relevant tools
    matches = tools.search("read file contents")
    # Returns: [{'name': 'fs.read', 'score': 0.92, 'description': '...'}]

    # Load a specific tool
    read_func = tools.get('fs.read')
    content = read_func('/path/to/file.py')

    # Get examples for a tool
    examples = tools.examples('memory.search')

See: https://www.anthropic.com/engineering/advanced-tool-use
"""

from typing import Dict, List, Optional, Callable, Any
import re
from dataclasses import dataclass, field


@dataclass
class ToolDefinition:
    """Metadata for a single tool function"""
    name: str  # Full name: module.function (e.g., 'fs.read')
    module: str  # Module name (e.g., 'filesystem')
    function: str  # Function name (e.g., 'read')
    description: str  # Short description
    keywords: List[str]  # Search keywords
    parameters: Dict[str, str]  # param_name -> description
    returns: str  # Return type description
    examples: List[Dict[str, str]] = field(default_factory=list)  # Usage examples
    domain: Optional[str] = None  # Optional domain categorization
    defer_loading: bool = True  # Whether to lazy-load


# =============================================================================
# TOOL REGISTRY - All available tools indexed for search
# =============================================================================

TOOL_REGISTRY: Dict[str, ToolDefinition] = {}


def _register_tool(tool: ToolDefinition) -> None:
    """Register a tool in the global registry"""
    TOOL_REGISTRY[tool.name] = tool


# -----------------------------------------------------------------------------
# MEMORY TOOLS
# -----------------------------------------------------------------------------

_register_tool(ToolDefinition(
    name='memory.search',
    module='memory',
    function='search',
    description='Search memories using full-text search with optional domain filter',
    keywords=['memory', 'search', 'find', 'query', 'knowledge', 'pattern', 'learning', 'recall', 'retrieve'],
    parameters={
        'query': 'Search query string',
        'domain': 'Optional filter (architecture, security, performance, etc.)',
        'limit': 'Maximum results (default: 5)'
    },
    returns='List of memory dicts with: id, domain, title, summary, relevance_score',
    examples=[
        {
            'description': 'Find authentication patterns',
            'code': '''results = memory.search("authentication", domain="security")
for r in results:
    print(f"[{r['relevance_score']:.2f}] {r['title']}")''',
            'when': 'When you need to recall previous learnings or patterns'
        },
        {
            'description': 'Search across all domains',
            'code': '''results = memory.search("rate limiting")
print(f"Found {len(results)} memories")'''
        }
    ],
    domain='knowledge'
))

_register_tool(ToolDefinition(
    name='memory.capture',
    module='memory',
    function='capture',
    description='Store a new memory with full metadata for future retrieval',
    keywords=['memory', 'save', 'store', 'capture', 'record', 'learn', 'remember', 'persist'],
    parameters={
        'domain': 'One of: architecture, platform, security, performance, api, react, game, engagement, best_practices',
        'category': 'One of: code_pattern, decision, learning, debugging, context',
        'title': 'Clear, searchable title (max 100 chars)',
        'summary': 'One-paragraph description (max 500 chars)',
        'content': 'Full markdown content',
        'tags': 'Optional list of tags for search'
    },
    returns='Dict with: status, storage, id/path, domain, category, title',
    examples=[
        {
            'description': 'Capture a security pattern',
            'code': '''memory.capture(
    domain="security",
    category="code_pattern",
    title="Input Validation at API Boundaries",
    summary="Always validate and sanitize user input at API entry points before processing",
    content="# Input Validation\\n\\nValidate all user input at API boundaries...",
    tags=["validation", "api", "security"]
)''',
            'when': 'When you discover a reusable pattern or make an important decision'
        }
    ],
    domain='knowledge'
))

_register_tool(ToolDefinition(
    name='memory.get_by_domain',
    module='memory',
    function='get_by_domain',
    description='Get all memories for a specific domain, ordered by relevance',
    keywords=['memory', 'domain', 'category', 'list', 'all', 'browse'],
    parameters={
        'domain': 'Domain name (engagement, game, architecture, security, etc.)',
        'limit': 'Maximum results (default: 10)'
    },
    returns='List of memory dicts with full content',
    examples=[
        {
            'description': 'Get all security patterns',
            'code': '''patterns = memory.get_by_domain("security", limit=5)
for p in patterns:
    print(f"- {p['title']}")'''
        }
    ],
    domain='knowledge'
))

_register_tool(ToolDefinition(
    name='memory.stats',
    module='memory',
    function='stats',
    description='Get memory storage statistics',
    keywords=['memory', 'stats', 'statistics', 'count', 'size', 'info'],
    parameters={},
    returns='Dict with: total_size_mb, file_count, directory_count, base_path',
    examples=[
        {
            'description': 'Check memory usage',
            'code': '''s = memory.stats()
print(f"Memory: {s['total_size_mb']}MB across {s['file_count']} files")'''
        }
    ],
    domain='knowledge'
))

# -----------------------------------------------------------------------------
# FILESYSTEM TOOLS
# -----------------------------------------------------------------------------

_register_tool(ToolDefinition(
    name='fs.read',
    module='filesystem',
    function='read',
    description='Read file contents with optional line range',
    keywords=['file', 'read', 'content', 'open', 'view', 'cat', 'text', 'source'],
    parameters={
        'path': 'Absolute or relative path to file',
        'start_line': 'Optional starting line (1-indexed)',
        'end_line': 'Optional ending line (inclusive)'
    },
    returns='File contents as string',
    examples=[
        {
            'description': 'Read entire file',
            'code': '''content = fs.read("src/lib/auth.ts")
print(f"File has {len(content.splitlines())} lines")''',
            'when': 'When you need to examine file contents'
        },
        {
            'description': 'Read specific lines',
            'code': '''# Read lines 50-100 for a focused view
snippet = fs.read("src/lib/auth.ts", start_line=50, end_line=100)
print(snippet)''',
            'when': 'When you only need a portion of a large file'
        }
    ],
    domain='filesystem'
))

_register_tool(ToolDefinition(
    name='fs.glob',
    module='filesystem',
    function='glob',
    description='Find files matching a glob pattern',
    keywords=['file', 'find', 'search', 'glob', 'pattern', 'match', 'list', 'discover'],
    parameters={
        'pattern': 'Glob pattern (e.g., "**/*.ts", "src/**/*.py")',
        'path': 'Optional base directory (default: project root)'
    },
    returns='List of matching file paths (relative to search path)',
    examples=[
        {
            'description': 'Find all TypeScript files',
            'code': '''ts_files = fs.glob("**/*.ts", path="src/")
print(f"Found {len(ts_files)} TypeScript files")
for f in ts_files[:5]:
    print(f"  - {f}")''',
            'when': 'When you need to discover files by extension or pattern'
        },
        {
            'description': 'Find test files',
            'code': '''tests = fs.glob("**/test_*.py")
print(f"Found {len(tests)} test files")'''
        }
    ],
    domain='filesystem'
))

_register_tool(ToolDefinition(
    name='fs.grep',
    module='filesystem',
    function='grep',
    description='Search file contents using regex pattern',
    keywords=['search', 'grep', 'find', 'regex', 'pattern', 'match', 'content', 'code'],
    parameters={
        'pattern': 'Regular expression pattern',
        'path': 'File or directory to search (default: project root)',
        'file_type': 'File extension filter without dot (e.g., "py", "ts")',
        'ignore_case': 'Case-insensitive search',
        'context_lines': 'Lines of context before/after match',
        'max_results': 'Maximum matches (default: 100)'
    },
    returns='List of match dicts with: file, line_number, content',
    examples=[
        {
            'description': 'Find function definitions',
            'code': '''matches = fs.grep("def.*validate", path="src/", file_type="py")
for m in matches:
    print(f"{m['file']}:{m['line_number']}: {m['content']}")''',
            'when': 'When you need to find code patterns or text in files'
        },
        {
            'description': 'Case-insensitive search with context',
            'code': '''matches = fs.grep("error", ignore_case=True, context_lines=2, max_results=10)
for m in matches:
    print(f"{m['file']}:{m['line_number']}")'''
        }
    ],
    domain='filesystem'
))

_register_tool(ToolDefinition(
    name='fs.exists',
    module='filesystem',
    function='exists',
    description='Check if a path exists',
    keywords=['file', 'exists', 'check', 'path', 'verify'],
    parameters={'path': 'Absolute or relative path'},
    returns='True if path exists, False otherwise',
    examples=[
        {
            'description': 'Check before reading',
            'code': '''if fs.exists("src/lib/auth.ts"):
    content = fs.read("src/lib/auth.ts")
else:
    print("File not found")'''
        }
    ],
    domain='filesystem'
))

_register_tool(ToolDefinition(
    name='fs.list_dir',
    module='filesystem',
    function='list_dir',
    description='List directory contents',
    keywords=['directory', 'list', 'ls', 'contents', 'files', 'folders'],
    parameters={'path': 'Directory path (default: project root)'},
    returns='Sorted list of file/directory names',
    examples=[
        {
            'description': 'List directory contents',
            'code': '''files = fs.list_dir("src/components")
for f in files:
    print(f"  - {f}")'''
        }
    ],
    domain='filesystem'
))

_register_tool(ToolDefinition(
    name='fs.file_info',
    module='filesystem',
    function='file_info',
    description='Get file metadata (size, lines, modified time)',
    keywords=['file', 'info', 'metadata', 'size', 'stats', 'details'],
    parameters={'path': 'Path to file'},
    returns='Dict with: size_bytes, lines, modified, type',
    examples=[
        {
            'description': 'Get file statistics',
            'code': '''info = fs.file_info("src/lib/auth.ts")
print(f"Size: {info['size_bytes']} bytes, {info['lines']} lines")'''
        }
    ],
    domain='filesystem'
))

# -----------------------------------------------------------------------------
# WEB TOOLS
# -----------------------------------------------------------------------------

_register_tool(ToolDefinition(
    name='web.fetch',
    module='web',
    function='fetch',
    description='Fetch web content and process with a prompt',
    keywords=['web', 'fetch', 'http', 'url', 'download', 'page', 'api', 'request', 'internet'],
    parameters={
        'url': 'URL to fetch',
        'prompt': 'Instructions for processing the content',
        'use_cache': 'Whether to use cached response (default: True)'
    },
    returns='Dict with: url, content, summary, cached',
    examples=[
        {
            'description': 'Fetch and extract specific information',
            'code': '''result = web.fetch(
    "https://docs.example.com/api",
    prompt="Extract the authentication methods"
)
if result.get('content'):
    # Process the content in code
    content = result['content']
    # Filter to relevant sections
    lines = [l for l in content.split('\\n') if 'auth' in l.lower()]
    for line in lines[:10]:
        print(line)''',
            'when': 'When you need to fetch and process web content'
        },
        {
            'description': 'Check for fetch errors',
            'code': '''result = web.fetch(url, prompt="Summarize")
if result.get('error'):
    print(f"Fetch failed: {result['error']}")
else:
    print(f"Got {result['content_length']} chars")'''
        }
    ],
    domain='web'
))

_register_tool(ToolDefinition(
    name='web.search',
    module='web',
    function='search',
    description='Search the web (requires API key configuration)',
    keywords=['web', 'search', 'google', 'bing', 'find', 'query', 'internet'],
    parameters={
        'query': 'Search query',
        'limit': 'Maximum results (default: 5)'
    },
    returns='List of result dicts with: title, url, snippet',
    examples=[
        {
            'description': 'Search for documentation',
            'code': '''results = web.search("python async patterns 2024")
for r in results:
    print(f"{r['title']}: {r['url']}")''',
            'when': 'When you need to find web resources (requires SEARCH_API_KEY)'
        }
    ],
    domain='web'
))

_register_tool(ToolDefinition(
    name='web.cache_stats',
    module='web',
    function='cache_stats',
    description='Get web fetch cache statistics',
    keywords=['web', 'cache', 'stats', 'statistics'],
    parameters={},
    returns='Dict with: file_count, total_size_bytes, oldest, newest',
    examples=[
        {
            'description': 'Check cache status',
            'code': '''stats = web.cache_stats()
print(f"Cache: {stats['file_count']} files")'''
        }
    ],
    domain='web'
))

_register_tool(ToolDefinition(
    name='web.clear_cache',
    module='web',
    function='clear_cache',
    description='Clear web fetch cache',
    keywords=['web', 'cache', 'clear', 'clean', 'purge'],
    parameters={'max_age_minutes': 'Only clear items older than this (default: all)'},
    returns='Dict with: cleared_count, remaining_count',
    examples=[
        {
            'description': 'Clear old cache entries',
            'code': '''result = web.clear_cache(max_age_minutes=60)
print(f"Cleared {result['cleared_count']} entries")'''
        }
    ],
    domain='web'
))


# =============================================================================
# SEARCH FUNCTIONS
# =============================================================================

def _tokenize(text: str) -> List[str]:
    """Split text into searchable tokens"""
    return re.findall(r'\w+', text.lower())


def _calculate_score(query_tokens: List[str], tool: ToolDefinition) -> float:
    """Calculate relevance score for a tool against query tokens"""
    score = 0.0

    # Check keywords (highest weight)
    tool_keywords = set(k.lower() for k in tool.keywords)
    keyword_matches = sum(1 for t in query_tokens if t in tool_keywords)
    score += keyword_matches * 3.0

    # Check name
    name_tokens = set(_tokenize(tool.name))
    name_matches = sum(1 for t in query_tokens if t in name_tokens)
    score += name_matches * 2.0

    # Check description
    desc_tokens = set(_tokenize(tool.description))
    desc_matches = sum(1 for t in query_tokens if t in desc_tokens)
    score += desc_matches * 1.0

    # Normalize by query length to favor precise matches
    if query_tokens:
        score = score / len(query_tokens)

    return score


def search(query: str, domain: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for tools by capability description

    This is the Tool Search Tool pattern from Anthropic's advanced tool use.
    Instead of loading all tools upfront, search for relevant ones.

    Args:
        query: Natural language description of needed capability
        domain: Optional domain filter (knowledge, filesystem, web)
        limit: Maximum results (default: 5)

    Returns:
        List of tool references with: name, score, description, parameters

    Example:
        matches = tools.search("read file contents")
        # Returns: [{'name': 'fs.read', 'score': 0.92, ...}]

        matches = tools.search("find patterns in code", domain="filesystem")
    """
    query_tokens = _tokenize(query)

    results = []
    for tool in TOOL_REGISTRY.values():
        # Apply domain filter
        if domain and tool.domain != domain:
            continue

        score = _calculate_score(query_tokens, tool)
        if score > 0:
            results.append({
                'name': tool.name,
                'score': round(score, 2),
                'description': tool.description,
                'parameters': tool.parameters,
                'domain': tool.domain
            })

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)

    return results[:limit]


def get(tool_name: str) -> Optional[Callable]:
    """
    Get a tool function by name (lazy loading)

    Args:
        tool_name: Full tool name (e.g., 'fs.read', 'memory.search')

    Returns:
        The tool function, or None if not found

    Example:
        read_func = tools.get('fs.read')
        content = read_func('/path/to/file.py')
    """
    if tool_name not in TOOL_REGISTRY:
        return None

    tool = TOOL_REGISTRY[tool_name]

    # Lazy import the module
    if tool.module == 'memory':
        from . import memory as mod
    elif tool.module == 'filesystem':
        from . import filesystem as mod
    elif tool.module == 'web':
        from . import web as mod
    else:
        return None

    return getattr(mod, tool.function, None)


def examples(tool_name: str) -> List[Dict[str, str]]:
    """
    Get usage examples for a tool

    This implements the Tool Use Examples pattern - concrete examples
    showing not just what's valid but what's effective.

    Args:
        tool_name: Full tool name (e.g., 'fs.read', 'memory.search')

    Returns:
        List of example dicts with: description, code, when (optional)

    Example:
        exs = tools.examples('memory.search')
        for ex in exs:
            print(f"# {ex['description']}")
            print(ex['code'])
    """
    if tool_name not in TOOL_REGISTRY:
        return []

    return TOOL_REGISTRY[tool_name].examples


def info(tool_name: str) -> Optional[Dict[str, Any]]:
    """
    Get full information about a tool

    Args:
        tool_name: Full tool name

    Returns:
        Dict with all tool metadata, or None if not found
    """
    if tool_name not in TOOL_REGISTRY:
        return None

    tool = TOOL_REGISTRY[tool_name]
    return {
        'name': tool.name,
        'module': tool.module,
        'function': tool.function,
        'description': tool.description,
        'keywords': tool.keywords,
        'parameters': tool.parameters,
        'returns': tool.returns,
        'examples': tool.examples,
        'domain': tool.domain
    }


def list_all(domain: Optional[str] = None) -> List[str]:
    """
    List all registered tool names

    Args:
        domain: Optional domain filter

    Returns:
        List of tool names
    """
    if domain:
        return [name for name, tool in TOOL_REGISTRY.items() if tool.domain == domain]
    return list(TOOL_REGISTRY.keys())


def domains() -> List[str]:
    """Get list of all tool domains"""
    return list(set(tool.domain for tool in TOOL_REGISTRY.values() if tool.domain))


# Summary statistics
def summary() -> Dict[str, Any]:
    """
    Get registry summary statistics

    Returns:
        Dict with: total_tools, by_domain, by_module
    """
    by_domain = {}
    by_module = {}

    for tool in TOOL_REGISTRY.values():
        # Count by domain
        domain = tool.domain or 'other'
        by_domain[domain] = by_domain.get(domain, 0) + 1

        # Count by module
        by_module[tool.module] = by_module.get(tool.module, 0) + 1

    return {
        'total_tools': len(TOOL_REGISTRY),
        'by_domain': by_domain,
        'by_module': by_module,
        'domains': list(by_domain.keys())
    }
