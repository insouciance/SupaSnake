#!/usr/bin/env python3
"""
Manual Memory Capture CLI

Captures knowledge to the project memory database (Supabase + local fallback).
Called by the /capture slash command.

Usage:
    python3 scripts/capture_memory.py \
        --domain "architecture" \
        --category "decision" \
        --title "Server Authority Pattern" \
        --summary "All game state validation happens server-side..." \
        --content "# Full markdown content..." \
        --tags "security,game,validation"
"""

import sys
import argparse
import json
from pathlib import Path

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from memory_tool_handler import MemoryToolHandler


def main():
    parser = argparse.ArgumentParser(
        description='Capture knowledge to the project memory database'
    )

    parser.add_argument(
        '--domain',
        required=True,
        choices=['architecture', 'platform', 'security', 'performance',
                 'api', 'react', 'game', 'engagement', 'best_practices'],
        help='Memory domain'
    )

    parser.add_argument(
        '--category',
        required=True,
        choices=['code_pattern', 'decision', 'learning', 'debugging', 'context'],
        help='Memory category'
    )

    parser.add_argument(
        '--title',
        required=True,
        help='Clear, searchable title (max 100 chars)'
    )

    parser.add_argument(
        '--summary',
        required=True,
        help='One-paragraph description (max 500 chars)'
    )

    parser.add_argument(
        '--content',
        required=True,
        help='Full markdown content'
    )

    parser.add_argument(
        '--tags',
        default='',
        help='Comma-separated tags for search'
    )

    parser.add_argument(
        '--source-file',
        default=None,
        help='Source file path (optional)'
    )

    parser.add_argument(
        '--source-commit',
        default=None,
        help='Git commit hash (optional)'
    )

    parser.add_argument(
        '--json',
        action='store_true',
        help='Output result as JSON'
    )

    args = parser.parse_args()

    # Parse tags
    tags = [t.strip() for t in args.tags.split(',') if t.strip()] if args.tags else []

    try:
        # Initialize handler
        memory = MemoryToolHandler()

        # Capture the memory
        result = memory.capture(
            domain=args.domain,
            category=args.category,
            title=args.title,
            summary=args.summary,
            content=args.content,
            tags=tags,
            source_file=args.source_file,
            source_commit=args.source_commit
        )

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\n✓ Memory captured successfully!")
            print(f"  Title: {result['title']}")
            print(f"  Domain: {result['domain']}")
            print(f"  Category: {result['category']}")
            print(f"  Storage: {result['storage']}")
            if result.get('id'):
                print(f"  ID: {result['id']}")
            if result.get('path') or result.get('local_path'):
                print(f"  Local: {result.get('path') or result.get('local_path')}")
            print()

        sys.exit(0)

    except ValueError as e:
        print(f"Validation error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error capturing memory: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
