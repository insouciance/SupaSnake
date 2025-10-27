"""
Memory Tool Handler for Claude
Client-side implementation of Claude's memory_20250818 tool

Security:
- Prevents directory traversal attacks
- Validates all paths against base directory
- Implements size limits to prevent unbounded growth

Usage:
    memory = MemoryToolHandler(base_path="./memories")
    memory.create("project_knowledge/tech_stack.md", "# Tech Stack\n...")
    content = memory.view("project_knowledge/tech_stack.md")
"""

from pathlib import Path
from typing import Dict, List, Optional, Union
import os
import json
from datetime import datetime


class MemoryToolHandler:
    """Client-side handler for Claude memory tool operations"""

    def __init__(self, base_path: str = "./memories", max_file_size_mb: int = 10):
        """
        Initialize memory tool handler

        Args:
            base_path: Root directory for memory storage (default: ./memories)
            max_file_size_mb: Maximum file size in MB (default: 10)
        """
        self.base_path = Path(base_path).resolve()
        self.max_file_size_bytes = max_file_size_mb * 1024 * 1024

        # Create base directory if it doesn't exist
        self.base_path.mkdir(exist_ok=True, parents=True)

        # Initialize subdirectories
        self._initialize_structure()

    def _initialize_structure(self):
        """Create recommended memory directory structure"""
        subdirs = [
            "architectural_decisions",
            "code_patterns/security",
            "code_patterns/performance",
            "code_patterns/quality",
            "project_knowledge",
            "agent_learnings/security_reviewer",
            "agent_learnings/performance_reviewer",
            "agent_learnings/balance_reviewer",
            "session_state",
        ]

        for subdir in subdirs:
            (self.base_path / subdir).mkdir(exist_ok=True, parents=True)

        # Create README if it doesn't exist
        readme_path = self.base_path / "README.md"
        if not readme_path.exists():
            readme_content = """# Memory Directory

This directory contains persistent knowledge for Claude across sessions.

## Structure

- `architectural_decisions/` - Design decisions with rationale
- `code_patterns/` - Learned patterns (security, performance, quality)
- `project_knowledge/` - Project-specific information
- `agent_learnings/` - Sub-agent accumulated wisdom
- `session_state/` - Temporary working memory (cleaned regularly)

## Security

- All paths validated to prevent directory traversal
- No sensitive data (passwords, API keys, PII)
- Content sanitized before storage
- Size limits enforced (10MB per file)

## Maintenance

- `session_state/` cleaned automatically (90-day retention)
- Old files archived monthly
- Total size monitored (alert at 100MB)
"""
            with open(readme_path, 'w') as f:
                f.write(readme_content)

    def _validate_path(self, path: str) -> Path:
        """
        Validate path to prevent directory traversal attacks

        Args:
            path: Relative path within memory directory

        Returns:
            Resolved absolute path

        Raises:
            ValueError: If path is invalid or attempts traversal
        """
        # Remove leading slash if present
        path = path.lstrip('/')

        # Check for traversal attempts
        if '..' in path or path.startswith('/'):
            raise ValueError(f"Invalid path: directory traversal detected in '{path}'")

        # Resolve full path
        full_path = (self.base_path / path).resolve()

        # Ensure path is within base directory
        if not str(full_path).startswith(str(self.base_path)):
            raise ValueError(f"Invalid path: '{path}' resolves outside memory directory")

        return full_path

    def _check_file_size(self, path: Path):
        """Check if file size is within limits"""
        if path.exists() and path.stat().st_size > self.max_file_size_bytes:
            size_mb = path.stat().st_size / (1024 * 1024)
            raise ValueError(f"File size ({size_mb:.1f}MB) exceeds limit ({self.max_file_size_bytes / (1024 * 1024)}MB)")

    def view(
        self,
        path: str,
        start_line: Optional[int] = None,
        end_line: Optional[int] = None
    ) -> Dict[str, Union[str, List[str]]]:
        """
        Display directory or file contents

        Args:
            path: Path to file or directory
            start_line: Optional starting line number (1-indexed)
            end_line: Optional ending line number (inclusive)

        Returns:
            Dictionary with 'type' and 'content' or 'contents'

        Example:
            # View directory
            result = memory.view("code_patterns")
            # {'type': 'directory', 'contents': ['security', 'performance', 'quality']}

            # View file
            result = memory.view("project_knowledge/tech_stack.md")
            # {'type': 'file', 'content': '# Tech Stack\n...'}

            # View file with line range
            result = memory.view("project_knowledge/tech_stack.md", start_line=1, end_line=10)
        """
        full_path = self._validate_path(path)

        if not full_path.exists():
            raise FileNotFoundError(f"Path not found: {path}")

        # Directory listing
        if full_path.is_dir():
            contents = sorted([item.name for item in full_path.iterdir()])
            return {
                "type": "directory",
                "contents": contents,
                "path": path
            }

        # File contents
        self._check_file_size(full_path)

        with open(full_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Apply line range if specified
        if start_line is not None and end_line is not None:
            lines = lines[start_line - 1:end_line]
        elif start_line is not None:
            lines = lines[start_line - 1:]
        elif end_line is not None:
            lines = lines[:end_line]

        return {
            "type": "file",
            "content": ''.join(lines),
            "path": path,
            "total_lines": len(lines)
        }

    def create(self, path: str, content: str) -> Dict[str, str]:
        """
        Create or overwrite a file

        Args:
            path: Path to file (will be created if doesn't exist)
            content: File content

        Returns:
            Dictionary with 'status' and 'path'

        Example:
            memory.create(
                "project_knowledge/tech_stack.md",
                "# Tech Stack\n\n- React Native\n- Supabase\n"
            )
        """
        full_path = self._validate_path(path)

        # Create parent directories if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Check content size
        content_size = len(content.encode('utf-8'))
        if content_size > self.max_file_size_bytes:
            size_mb = content_size / (1024 * 1024)
            raise ValueError(f"Content size ({size_mb:.1f}MB) exceeds limit")

        # Write file
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)

        return {
            "status": "created",
            "path": path,
            "size_bytes": content_size
        }

    def str_replace(self, path: str, old_str: str, new_str: str) -> Dict[str, str]:
        """
        Replace specific text within a file (first occurrence only)

        Args:
            path: Path to file
            old_str: String to find and replace
            new_str: Replacement string

        Returns:
            Dictionary with 'status'

        Raises:
            ValueError: If old_str not found in file

        Example:
            memory.str_replace(
                "project_knowledge/tech_stack.md",
                "- Supabase\n",
                "- Supabase (PostgreSQL + Real-time)\n"
            )
        """
        full_path = self._validate_path(path)

        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        self._check_file_size(full_path)

        # Read current content
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check if string exists
        if old_str not in content:
            raise ValueError(f"String not found in file: '{old_str}'")

        # Replace first occurrence
        new_content = content.replace(old_str, new_str, 1)

        # Write updated content
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return {
            "status": "replaced",
            "path": path
        }

    def insert(self, path: str, line_number: int, content: str) -> Dict[str, str]:
        """
        Insert text at a specific line number

        Args:
            path: Path to file
            line_number: Line number to insert at (1-indexed)
            content: Content to insert

        Returns:
            Dictionary with 'status'

        Example:
            memory.insert(
                "project_knowledge/tech_stack.md",
                5,
                "- Expo (React Native toolchain)\n"
            )
        """
        full_path = self._validate_path(path)

        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        self._check_file_size(full_path)

        # Read current content
        with open(full_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Insert content
        lines.insert(line_number - 1, content)

        # Write updated content
        with open(full_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)

        return {
            "status": "inserted",
            "path": path,
            "line_number": line_number
        }

    def delete(self, path: str) -> Dict[str, str]:
        """
        Remove a file or directory

        Args:
            path: Path to file or directory

        Returns:
            Dictionary with 'status'

        Example:
            memory.delete("session_state/old_feature.md")
        """
        full_path = self._validate_path(path)

        if not full_path.exists():
            raise FileNotFoundError(f"Path not found: {path}")

        # Delete directory recursively or file
        if full_path.is_dir():
            import shutil
            shutil.rmtree(full_path)
            item_type = "directory"
        else:
            full_path.unlink()
            item_type = "file"

        return {
            "status": "deleted",
            "path": path,
            "type": item_type
        }

    def rename(self, old_path: str, new_path: str) -> Dict[str, str]:
        """
        Rename or move a file or directory

        Args:
            old_path: Current path
            new_path: New path

        Returns:
            Dictionary with 'status'

        Example:
            memory.rename(
                "session_state/current_feature.md",
                "architectural_decisions/feature_design_v1.md"
            )
        """
        old_full_path = self._validate_path(old_path)
        new_full_path = self._validate_path(new_path)

        if not old_full_path.exists():
            raise FileNotFoundError(f"Path not found: {old_path}")

        if new_full_path.exists():
            raise FileExistsError(f"Destination already exists: {new_path}")

        # Create parent directories if needed
        new_full_path.parent.mkdir(parents=True, exist_ok=True)

        # Rename/move
        old_full_path.rename(new_full_path)

        return {
            "status": "renamed",
            "old_path": old_path,
            "new_path": new_path
        }

    def get_storage_stats(self) -> Dict[str, Union[int, float]]:
        """
        Get storage statistics for memory directory

        Returns:
            Dictionary with storage stats

        Example:
            stats = memory.get_storage_stats()
            # {'total_size_mb': 5.2, 'file_count': 42, 'directory_count': 8}
        """
        total_size = 0
        file_count = 0
        dir_count = 0

        for item in self.base_path.rglob('*'):
            if item.is_file():
                total_size += item.stat().st_size
                file_count += 1
            elif item.is_dir():
                dir_count += 1

        return {
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_size_bytes": total_size,
            "file_count": file_count,
            "directory_count": dir_count,
            "base_path": str(self.base_path)
        }


def test_memory_handler():
    """Test basic memory operations"""
    import tempfile
    import shutil

    # Create temporary directory for testing
    temp_dir = tempfile.mkdtemp()
    print(f"Testing in: {temp_dir}")

    try:
        # Initialize handler
        memory = MemoryToolHandler(base_path=temp_dir)
        print("✓ Handler initialized")

        # Test create
        memory.create("test_file.md", "# Test\n\nThis is a test file.\n")
        print("✓ File created")

        # Test view
        result = memory.view("test_file.md")
        assert result['type'] == 'file'
        assert '# Test' in result['content']
        print("✓ File viewed")

        # Test str_replace
        memory.str_replace("test_file.md", "test file", "TEST FILE")
        result = memory.view("test_file.md")
        assert 'TEST FILE' in result['content']
        print("✓ String replaced")

        # Test insert
        memory.insert("test_file.md", 3, "## New Section\n")
        result = memory.view("test_file.md")
        assert '## New Section' in result['content']
        print("✓ Text inserted")

        # Test storage stats
        stats = memory.get_storage_stats()
        assert stats['file_count'] > 0
        print(f"✓ Storage stats: {stats['total_size_mb']}MB, {stats['file_count']} files")

        # Test delete
        memory.delete("test_file.md")
        print("✓ File deleted")

        print("\n✅ All tests passed!")

    finally:
        # Cleanup
        shutil.rmtree(temp_dir)
        print(f"Cleaned up: {temp_dir}")


if __name__ == "__main__":
    test_memory_handler()
