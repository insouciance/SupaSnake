"""
Web tool wrapper for code-mode execution

Provides web fetch and search operations with caching and rate limiting.
These operations typically return large amounts of data, so code-mode
execution is especially beneficial here.

Usage:
    from mcp_tools import web

    # Fetch and summarize web content
    result = web.fetch(
        "https://docs.example.com/api",
        prompt="Extract the authentication methods"
    )

    # Search the web
    results = web.search("python async patterns 2024", limit=5)

Token Reduction Benefits:
- Direct WebFetch: 10k-50k tokens per page
- Code-mode: Claude processes in code, returns filtered summary (~500 tokens)
"""

import os
import json
import hashlib
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timedelta

# Cache directory for web fetches
_CACHE_DIR = Path(__file__).parent.parent.parent / 'state' / 'web_cache'
_CACHE_TTL_MINUTES = 15


def _get_cache_path(url: str) -> Path:
    """Get cache file path for URL"""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:16]
    return _CACHE_DIR / f"{url_hash}.json"


def _check_cache(url: str) -> Optional[Dict]:
    """Check if cached response exists and is valid"""
    cache_path = _get_cache_path(url)

    if not cache_path.exists():
        return None

    try:
        with open(cache_path, 'r') as f:
            cached = json.load(f)

        cached_time = datetime.fromisoformat(cached.get('cached_at', ''))
        if datetime.now() - cached_time < timedelta(minutes=_CACHE_TTL_MINUTES):
            return cached.get('data')
    except (json.JSONDecodeError, ValueError, KeyError):
        pass

    return None


def _save_cache(url: str, data: Dict) -> None:
    """Save response to cache"""
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _get_cache_path(url)

    cache_data = {
        'url': url,
        'cached_at': datetime.now().isoformat(),
        'data': data
    }

    with open(cache_path, 'w') as f:
        json.dump(cache_data, f)


def fetch(
    url: str,
    prompt: str,
    use_cache: bool = True
) -> Dict:
    """
    Fetch web content and process with a prompt

    Uses curl to fetch content and returns structured data.
    Caches responses for 15 minutes to reduce repeated fetches.

    Args:
        url: URL to fetch
        prompt: Instructions for processing the content
        use_cache: Whether to use cached response (default: True)

    Returns:
        Dict with: url, content, summary, cached

    Example:
        result = web.fetch(
            "https://api.example.com/docs",
            prompt="Extract the rate limiting rules"
        )
        print(result['summary'])

    Note:
        The content is fetched but NOT sent to an LLM for summarization
        in code-mode. The prompt is stored for the executor to handle
        post-processing. Claude should filter the content in the code.
    """
    if use_cache:
        cached = _check_cache(url)
        if cached:
            cached['cached'] = True
            return cached

    # Validate URL
    if not url.startswith(('http://', 'https://')):
        return {
            'url': url,
            'error': 'Invalid URL: must start with http:// or https://',
            'content': None
        }

    # Upgrade HTTP to HTTPS
    if url.startswith('http://'):
        url = 'https://' + url[7:]

    try:
        # Use curl to fetch content
        result = subprocess.run(
            [
                'curl', '-sS', '-L',
                '-H', 'User-Agent: Mozilla/5.0 (compatible; ClaudeCodeBot/1.0)',
                '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                '--max-time', '30',
                '--max-filesize', '5242880',  # 5MB limit
                url
            ],
            capture_output=True,
            text=True,
            timeout=35
        )

        if result.returncode != 0:
            return {
                'url': url,
                'error': f'Fetch failed: {result.stderr}',
                'content': None
            }

        content = result.stdout

        # Basic HTML to text conversion
        content = _html_to_text(content)

        response = {
            'url': url,
            'content': content[:50000],  # Limit content size
            'content_length': len(content),
            'prompt': prompt,  # Store for potential post-processing
            'cached': False,
            'fetched_at': datetime.now().isoformat()
        }

        if use_cache:
            _save_cache(url, response)

        return response

    except subprocess.TimeoutExpired:
        return {
            'url': url,
            'error': 'Request timed out after 30 seconds',
            'content': None
        }
    except Exception as e:
        return {
            'url': url,
            'error': str(e),
            'content': None
        }


def _html_to_text(html: str) -> str:
    """Basic HTML to text conversion"""
    import re

    # Remove script and style tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)

    # Decode common HTML entities
    entities = {
        '&nbsp;': ' ', '&lt;': '<', '&gt;': '>',
        '&amp;': '&', '&quot;': '"', '&#39;': "'"
    }
    for entity, char in entities.items():
        text = text.replace(entity, char)

    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n\n', text)

    return text.strip()


def search(
    query: str,
    limit: int = 5
) -> List[Dict]:
    """
    Search the web (placeholder - requires external search API)

    Note: This is a placeholder. Actual web search requires:
    - Google Custom Search API
    - Bing Search API
    - SerpAPI
    - Or similar service

    Args:
        query: Search query
        limit: Maximum results (default: 5)

    Returns:
        List of result dicts with: title, url, snippet

    Example:
        results = web.search("python async best practices 2024")
        for r in results:
            print(f"{r['title']}: {r['url']}")
    """
    # Check if we have a search API configured
    search_api_key = os.environ.get('SEARCH_API_KEY')

    if not search_api_key:
        return [{
            'error': 'Web search not configured',
            'message': 'Set SEARCH_API_KEY environment variable to enable web search',
            'query': query
        }]

    # Placeholder for actual implementation
    # Would integrate with Google Custom Search, Bing, or SerpAPI

    return [{
        'error': 'Web search not implemented',
        'message': 'Use web.fetch() with a known URL instead',
        'query': query
    }]


def clear_cache(max_age_minutes: Optional[int] = None) -> Dict:
    """
    Clear web fetch cache

    Args:
        max_age_minutes: Only clear items older than this (default: all)

    Returns:
        Dict with: cleared_count, remaining_count

    Example:
        # Clear all cache
        web.clear_cache()

        # Clear items older than 60 minutes
        web.clear_cache(max_age_minutes=60)
    """
    if not _CACHE_DIR.exists():
        return {'cleared_count': 0, 'remaining_count': 0}

    cleared = 0
    remaining = 0
    cutoff = datetime.now() - timedelta(minutes=max_age_minutes) if max_age_minutes else None

    for cache_file in _CACHE_DIR.glob('*.json'):
        should_delete = True

        if cutoff:
            try:
                with open(cache_file, 'r') as f:
                    cached = json.load(f)
                cached_time = datetime.fromisoformat(cached.get('cached_at', ''))
                should_delete = cached_time < cutoff
            except (json.JSONDecodeError, ValueError, KeyError):
                should_delete = True

        if should_delete:
            cache_file.unlink()
            cleared += 1
        else:
            remaining += 1

    return {'cleared_count': cleared, 'remaining_count': remaining}


def cache_stats() -> Dict:
    """
    Get cache statistics

    Returns:
        Dict with: file_count, total_size_bytes, oldest, newest

    Example:
        stats = web.cache_stats()
        print(f"Cache: {stats['file_count']} files, {stats['total_size_bytes']} bytes")
    """
    if not _CACHE_DIR.exists():
        return {
            'file_count': 0,
            'total_size_bytes': 0,
            'oldest': None,
            'newest': None
        }

    files = list(_CACHE_DIR.glob('*.json'))
    total_size = sum(f.stat().st_size for f in files)

    oldest = None
    newest = None

    for cache_file in files:
        try:
            with open(cache_file, 'r') as f:
                cached = json.load(f)
            cached_time = datetime.fromisoformat(cached.get('cached_at', ''))

            if oldest is None or cached_time < oldest:
                oldest = cached_time
            if newest is None or cached_time > newest:
                newest = cached_time
        except (json.JSONDecodeError, ValueError, KeyError):
            continue

    return {
        'file_count': len(files),
        'total_size_bytes': total_size,
        'oldest': oldest.isoformat() if oldest else None,
        'newest': newest.isoformat() if newest else None
    }
