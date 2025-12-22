#!/usr/bin/env python3
"""
Extract reusable code patterns from recent changes
Automatically captures to memory for future reference
"""

import sys
import re
import argparse
from pathlib import Path
from datetime import datetime

# Load environment variables for Supabase
from dotenv import load_dotenv
load_dotenv()

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from memory_tool_handler import MemoryToolHandler
except ImportError:
    print("Error: memory_tool_handler not found", file=sys.stderr)
    sys.exit(1)


class PatternExtractor:
    """Extract patterns from code diffs"""

    def __init__(self):
        self.memory = MemoryToolHandler()
        self.patterns = []

    def extract_from_diff(self, diff_content, file_list):
        """Extract patterns from git diff"""

        files = file_list.split('\n')
        files = [f for f in files if f.strip()]

        print(f"Analyzing {len(files)} files...")

        # Detect TypeScript/JavaScript patterns
        if any(f.endswith(('.ts', '.tsx', '.js', '.jsx')) for f in files):
            self._extract_ts_patterns(diff_content)

        # Detect Python patterns
        if any(f.endswith('.py') for f in files):
            self._extract_py_patterns(diff_content)

        # Detect database patterns
        self._extract_db_patterns(diff_content)

        # Detect security patterns
        self._extract_security_patterns(diff_content)

        # Store patterns
        if self.patterns:
            self._store_patterns()
            print(f"✓ Captured {len(self.patterns)} patterns")
        else:
            print("No new patterns detected (this is normal for small changes)")

    def _extract_ts_patterns(self, diff):
        """Extract TypeScript/JavaScript patterns"""

        # Async/await pattern
        if re.search(r'\+.*async .*=>|async function', diff):
            example = self._extract_block(diff, 'async')
            if example:
                self.patterns.append({
                    'type': 'async_function',
                    'language': 'typescript',
                    'description': 'Async function implementation',
                    'example': example,
                    'category': 'best_practices'
                })

        # React hooks
        hook_matches = re.findall(r'\+.*(use[A-Z]\w+)', diff)
        if hook_matches:
            for hook in set(hook_matches):
                example = self._extract_block(diff, hook)
                if example:
                    self.patterns.append({
                        'type': f'react_hook_{hook.lower()}',
                        'language': 'typescript',
                        'description': f'{hook} usage pattern',
                        'example': example,
                        'category': 'react'
                    })

        # Error handling with try-catch
        if re.search(r'\+.*try \{', diff) and 'catch' in diff:
            example = self._extract_block(diff, 'try')
            if example:
                self.patterns.append({
                    'type': 'error_handling_try_catch',
                    'language': 'typescript',
                    'description': 'Try-catch error handling pattern',
                    'example': example,
                    'category': 'best_practices'
                })

        # API route handlers
        if re.search(r'\+.*export async function (GET|POST|PUT|DELETE)', diff):
            example = self._extract_block(diff, 'export async function')
            if example:
                self.patterns.append({
                    'type': 'api_route_handler',
                    'language': 'typescript',
                    'description': 'Next.js API route handler',
                    'example': example,
                    'category': 'api'
                })

    def _extract_py_patterns(self, diff):
        """Extract Python patterns"""

        # Context managers
        if re.search(r'\+.*with .* as .*:', diff):
            example = self._extract_block(diff, 'with ')
            if example:
                self.patterns.append({
                    'type': 'context_manager',
                    'language': 'python',
                    'description': 'Context manager pattern (with statement)',
                    'example': example,
                    'category': 'best_practices'
                })

        # List comprehensions
        if re.search(r'\+.*\[.* for .* in .*\]', diff):
            example = self._extract_block(diff, 'for ')
            if example and '[' in example:
                self.patterns.append({
                    'type': 'list_comprehension',
                    'language': 'python',
                    'description': 'List comprehension usage',
                    'example': example,
                    'category': 'best_practices'
                })

    def _extract_db_patterns(self, diff):
        """Extract database patterns"""

        # Parameterized queries (good security practice)
        if re.search(r'\+.*(\$\d+|%s|\?)', diff):
            example = self._extract_block(diff, 'query')
            if example:
                self.patterns.append({
                    'type': 'parameterized_query',
                    'language': 'sql',
                    'description': 'Parameterized SQL query (prevents injection)',
                    'example': example,
                    'category': 'security'
                })

        # Batch operations ($in, $or)
        if re.search(r'\+.*\$in|\$or', diff):
            example = self._extract_block(diff, '$in')
            if example:
                self.patterns.append({
                    'type': 'batch_query',
                    'language': 'database',
                    'description': 'Batch query pattern (prevents N+1)',
                    'example': example,
                    'category': 'performance'
                })

    def _extract_security_patterns(self, diff):
        """Extract security-related patterns"""

        # Environment variable usage (good)
        if re.search(r'\+.*(process\.env\.|os\.environ)', diff):
            example = self._extract_block(diff, 'env')
            if example:
                self.patterns.append({
                    'type': 'env_var_secrets',
                    'language': 'any',
                    'description': 'Using environment variables for secrets',
                    'example': example,
                    'category': 'security'
                })

        # Input validation
        if re.search(r'\+.*(\.validate\(|\.sanitize\(|\.escape\()', diff):
            example = self._extract_block(diff, 'validat')
            if example:
                self.patterns.append({
                    'type': 'input_validation',
                    'language': 'any',
                    'description': 'Input validation/sanitization',
                    'example': example,
                    'category': 'security'
                })

    def _extract_block(self, diff, keyword):
        """Extract code block containing keyword"""

        lines = diff.split('\n')
        for i, line in enumerate(lines):
            if keyword.lower() in line.lower() and line.startswith('+'):
                # Get context (3 lines before, 5 lines after)
                start = max(0, i - 3)
                end = min(len(lines), i + 6)
                block_lines = lines[start:end]

                # Remove diff markers and clean up
                cleaned = []
                for l in block_lines:
                    if l.startswith('+'):
                        cleaned.append(l[1:])  # Remove +
                    elif not l.startswith('-'):
                        cleaned.append(l)  # Keep context lines

                block = '\n'.join(cleaned).strip()

                # Only return if we have meaningful content
                if len(block) > 20:
                    return block

        return None

    def _store_patterns(self):
        """Store patterns in memory"""

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

        for pattern in self.patterns:
            try:
                category = pattern.get('category', 'general')
                type_slug = pattern['type']
                path = f"code_patterns/{category}/{type_slug}.md"

                # Check if pattern already exists
                try:
                    existing = self.memory.view(path)

                    # Update existing pattern with new example
                    content = existing['content']

                    # Increment usage counter
                    if 'Times Applied:' in content:
                        content = re.sub(
                            r'Times Applied: (\d+)',
                            lambda m: f'Times Applied: {int(m.group(1)) + 1}',
                            content
                        )

                    # Add new example
                    content += f"\n\n## Example Added: {timestamp}\n\n"
                    content += f"```{pattern['language']}\n{pattern['example']}\n```\n"

                    self.memory.str_replace(path, existing['content'], content)
                    print(f"  ✓ Updated: {type_slug}")

                except:
                    # Create new pattern file
                    content = f"""# Pattern: {pattern['type'].replace('_', ' ').title()}

**Category:** {category}
**Language:** {pattern['language']}
**First Detected:** {timestamp}
**Times Applied:** 1

## Description

{pattern['description']}

## Example

```{pattern['language']}
{pattern['example']}
```

## When to Use

This pattern was automatically detected. Best practices:
- Use when implementing similar functionality
- Maintain consistency across codebase
- Follow security/performance guidelines

## Related Patterns

(Will be linked as more patterns are learned)

---

*This pattern was automatically learned from code changes.*
*Add notes or examples by editing this file.*
"""

                    self.memory.create(path, content)
                    print(f"  ✓ Created: {type_slug}")

            except Exception as e:
                print(f"  ⚠️  Failed to store {pattern['type']}: {e}", file=sys.stderr)


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(description='Extract code patterns from diff')
    parser.add_argument('--diff', required=True, help='Git diff content')
    parser.add_argument('--files', required=True, help='Changed file list')

    args = parser.parse_args()

    try:
        extractor = PatternExtractor()
        extractor.extract_from_diff(args.diff, args.files)
    except Exception as e:
        print(f"Error extracting patterns: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
