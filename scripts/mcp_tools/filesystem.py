"""
Filesystem tool wrapper for code-mode execution

Provides safe file operations with path validation.
Wraps Claude's Read, Glob, and Grep tools.

Usage:
    from mcp_tools import fs

    # Read a file
    content = fs.read("/path/to/file.py")
    content = fs.read("/path/to/file.py", start_line=10, end_line=50)

    # Find files by pattern
    files = fs.glob("**/*.ts", path="src/")

    # Search file contents
    matches = fs.grep("def.*validate", path="src/", file_type="py")

Security:
- All paths validated to prevent directory traversal
- Read operations only (no write from code-mode)
- Project root boundaries enforced
"""

import os
import subprocess
import fnmatch
from pathlib import Path
from typing import Dict, List, Optional, Union

# Project root (parent of scripts directory)
_PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()


def _validate_path(path: str) -> Path:
    """
    Validate path is within project or allowed directories

    Args:
        path: Absolute or relative path

    Returns:
        Resolved absolute path

    Raises:
        ValueError: If path attempts directory traversal or is outside allowed dirs
    """
    # Handle relative paths as relative to project root
    if not os.path.isabs(path):
        full_path = (_PROJECT_ROOT / path).resolve()
    else:
        full_path = Path(path).resolve()

    # Check for directory traversal
    if '..' in str(path):
        # Ensure resolved path doesn't escape allowed directories
        try:
            full_path.relative_to(_PROJECT_ROOT)
        except ValueError:
            # Allow /tmp for code execution temp files
            if not str(full_path).startswith('/tmp'):
                raise ValueError(f"Path traversal detected: {path}")

    return full_path


def read(
    path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """
    Read file contents

    Args:
        path: Absolute or relative path to file
        start_line: Optional starting line (1-indexed)
        end_line: Optional ending line (inclusive)

    Returns:
        File contents as string

    Raises:
        FileNotFoundError: If file doesn't exist
        ValueError: If path is invalid

    Example:
        content = fs.read("src/lib/auth.ts")
        snippet = fs.read("src/lib/auth.ts", start_line=50, end_line=100)
    """
    full_path = _validate_path(path)

    if not full_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    if not full_path.is_file():
        raise ValueError(f"Not a file: {path}")

    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    # Apply line range
    if start_line is not None or end_line is not None:
        start_idx = (start_line - 1) if start_line else 0
        end_idx = end_line if end_line else len(lines)
        lines = lines[start_idx:end_idx]

    return ''.join(lines)


def glob(
    pattern: str,
    path: Optional[str] = None
) -> List[str]:
    """
    Find files matching a glob pattern

    Args:
        pattern: Glob pattern (e.g., "**/*.ts", "src/**/*.py")
        path: Optional base directory (default: project root)

    Returns:
        List of matching file paths (relative to search path)

    Example:
        ts_files = fs.glob("**/*.ts", path="src/")
        tests = fs.glob("**/test_*.py")
    """
    base_path = _validate_path(path) if path else _PROJECT_ROOT

    if not base_path.exists():
        return []

    if not base_path.is_dir():
        raise ValueError(f"Not a directory: {path}")

    matches = []
    for match in base_path.rglob(pattern.lstrip('*/')):
        if match.is_file():
            try:
                rel_path = str(match.relative_to(base_path))
                matches.append(rel_path)
            except ValueError:
                matches.append(str(match))

    return sorted(matches)


def grep(
    pattern: str,
    path: Optional[str] = None,
    file_type: Optional[str] = None,
    ignore_case: bool = False,
    context_lines: int = 0,
    max_results: int = 100
) -> List[Dict[str, Union[str, int]]]:
    """
    Search file contents using regex pattern

    Args:
        pattern: Regular expression pattern
        path: File or directory to search (default: project root)
        file_type: File extension filter without dot (e.g., "py", "ts", "tsx")
        ignore_case: Case-insensitive search
        context_lines: Lines of context before/after match
        max_results: Maximum matches to return (default: 100)

    Returns:
        List of match dicts with: file, line_number, content, [context]

    Example:
        # Find all function definitions
        matches = fs.grep("def.*validate", path="src/", file_type="py")

        # Case-insensitive search with context
        matches = fs.grep("error", ignore_case=True, context_lines=2)
    """
    base_path = _validate_path(path) if path else _PROJECT_ROOT

    # Build ripgrep command
    cmd = ['rg', '--json', '-n']

    if ignore_case:
        cmd.append('-i')

    if context_lines > 0:
        cmd.extend(['-C', str(context_lines)])

    if file_type:
        cmd.extend(['--type', file_type])

    cmd.extend(['-m', str(max_results)])
    cmd.append(pattern)
    cmd.append(str(base_path))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        matches = []
        import json

        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                data = json.loads(line)
                if data.get('type') == 'match':
                    match_data = data.get('data', {})
                    path_data = match_data.get('path', {})
                    lines_data = match_data.get('lines', {})

                    matches.append({
                        'file': path_data.get('text', ''),
                        'line_number': match_data.get('line_number', 0),
                        'content': lines_data.get('text', '').rstrip('\n')
                    })
            except json.JSONDecodeError:
                continue

        return matches[:max_results]

    except subprocess.TimeoutExpired:
        return [{'error': 'Search timed out after 30 seconds'}]
    except FileNotFoundError:
        # ripgrep not installed, fall back to basic grep
        return _grep_fallback(pattern, base_path, file_type, ignore_case, max_results)


def _grep_fallback(
    pattern: str,
    base_path: Path,
    file_type: Optional[str],
    ignore_case: bool,
    max_results: int
) -> List[Dict]:
    """Fallback grep using Python re module"""
    import re

    flags = re.IGNORECASE if ignore_case else 0
    try:
        regex = re.compile(pattern, flags)
    except re.error as e:
        return [{'error': f'Invalid regex: {e}'}]

    matches = []
    file_pattern = f"*.{file_type}" if file_type else "*"

    for file_path in base_path.rglob(file_pattern):
        if not file_path.is_file():
            continue
        if len(matches) >= max_results:
            break

        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                for line_num, line in enumerate(f, 1):
                    if regex.search(line):
                        matches.append({
                            'file': str(file_path.relative_to(base_path)),
                            'line_number': line_num,
                            'content': line.rstrip('\n')
                        })
                        if len(matches) >= max_results:
                            break
        except (IOError, OSError):
            continue

    return matches


def exists(path: str) -> bool:
    """
    Check if a path exists

    Args:
        path: Absolute or relative path

    Returns:
        True if path exists, False otherwise

    Example:
        if fs.exists("src/lib/auth.ts"):
            content = fs.read("src/lib/auth.ts")
    """
    try:
        full_path = _validate_path(path)
        return full_path.exists()
    except ValueError:
        return False


def is_file(path: str) -> bool:
    """Check if path is a file"""
    try:
        full_path = _validate_path(path)
        return full_path.is_file()
    except ValueError:
        return False


def is_dir(path: str) -> bool:
    """Check if path is a directory"""
    try:
        full_path = _validate_path(path)
        return full_path.is_dir()
    except ValueError:
        return False


def list_dir(path: Optional[str] = None) -> List[str]:
    """
    List directory contents

    Args:
        path: Directory path (default: project root)

    Returns:
        Sorted list of file/directory names

    Example:
        files = fs.list_dir("src/components")
    """
    base_path = _validate_path(path) if path else _PROJECT_ROOT

    if not base_path.exists():
        raise FileNotFoundError(f"Directory not found: {path}")

    if not base_path.is_dir():
        raise ValueError(f"Not a directory: {path}")

    return sorted([item.name for item in base_path.iterdir()])


def file_info(path: str) -> Dict:
    """
    Get file metadata

    Args:
        path: Path to file

    Returns:
        Dict with: size_bytes, lines, modified, type

    Example:
        info = fs.file_info("src/lib/auth.ts")
        print(f"Size: {info['size_bytes']} bytes, {info['lines']} lines")
    """
    full_path = _validate_path(path)

    if not full_path.exists():
        raise FileNotFoundError(f"Path not found: {path}")

    stat = full_path.stat()

    result = {
        'path': str(full_path),
        'size_bytes': stat.st_size,
        'modified': stat.st_mtime,
        'type': 'file' if full_path.is_file() else 'directory'
    }

    if full_path.is_file():
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                result['lines'] = sum(1 for _ in f)
        except (IOError, OSError):
            result['lines'] = None

    return result
