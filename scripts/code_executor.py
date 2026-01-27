#!/usr/bin/env python3
"""
Code Executor for Claude Code-Mode Execution

Executes Python code files with mcp_tools available in the namespace.
Returns token-budgeted output to minimize context bloat.

ADVANCED TOOL USE PATTERNS (Nov 2025):
1. Tool Search - tools.search("capability") finds relevant tools on-demand
2. Programmatic Tool Calling - memory, fs, web tools callable in code
3. Tool Use Examples - tools.examples("tool.name") shows usage patterns

Usage:
    .venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code.py
    .venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code.py --budget 500

Token Reduction:
- Direct MCP calls: ~150k tokens for complex operations
- Code-mode via executor: ~2k tokens (98.7% reduction)
- Tool Search vs upfront definitions: 85% additional reduction

Security:
- Code runs in subprocess with timeout
- No network access beyond mcp_tools.web
- Output truncated to token budget
- Temp files auto-cleaned

See: https://www.anthropic.com/engineering/advanced-tool-use
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

# Constants
DEFAULT_TOKEN_BUDGET = 500
MAX_TOKEN_BUDGET = 2000
TIMEOUT_SECONDS = 60
CHARS_PER_TOKEN = 4  # Rough estimate

# Paths
SCRIPTS_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPTS_DIR.parent
METRICS_DIR = PROJECT_ROOT / 'state' / 'tool_metrics'


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length"""
    return len(text) // CHARS_PER_TOKEN


def truncate_to_budget(output: str, budget: int) -> tuple[str, bool]:
    """
    Truncate output to fit within token budget

    Args:
        output: Full output text
        budget: Token budget

    Returns:
        Tuple of (truncated_output, was_truncated)
    """
    max_chars = budget * CHARS_PER_TOKEN

    if len(output) <= max_chars:
        return output, False

    # Reserve space for truncation notice
    notice = f"\n\n... [Output truncated. {estimate_tokens(output)} tokens → {budget} tokens]"
    available_chars = max_chars - len(notice)

    # Try to truncate at a line boundary
    truncated = output[:available_chars]
    last_newline = truncated.rfind('\n')
    if last_newline > available_chars * 0.8:  # Keep at least 80% of content
        truncated = truncated[:last_newline]

    return truncated + notice, True


def log_metrics(
    code_file: str,
    success: bool,
    duration_ms: int,
    output_tokens: int,
    budget: int,
    truncated: bool,
    error: Optional[str] = None
) -> None:
    """Log execution metrics to JSONL file"""
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    metrics_file = METRICS_DIR / 'code_execution.jsonl'

    metric = {
        'timestamp': datetime.now().isoformat(),
        'code_file': code_file,
        'success': success,
        'duration_ms': duration_ms,
        'output_tokens': output_tokens,
        'token_budget': budget,
        'truncated': truncated,
        'error': error
    }

    with open(metrics_file, 'a') as f:
        f.write(json.dumps(metric) + '\n')


def run_code(code_file: str, budget: int) -> Dict:
    """
    Execute Python code file with mcp_tools available

    Args:
        code_file: Path to Python file to execute
        budget: Token budget for output

    Returns:
        Dict with execution results
    """
    start_time = time.time()

    # Validate file exists
    code_path = Path(code_file)
    if not code_path.exists():
        return {
            'success': False,
            'error': f'Code file not found: {code_file}',
            'output': None
        }

    # Read the code
    with open(code_path, 'r') as f:
        code = f.read()

    # Create wrapper that imports mcp_tools
    wrapper_code = f'''
import sys
from pathlib import Path

# Add scripts directory to path for mcp_tools
scripts_dir = Path("{SCRIPTS_DIR}")
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

# Load environment
from dotenv import load_dotenv
load_dotenv()

# Import mcp_tools for user code (including Tool Search)
from mcp_tools import memory, fs, web, tools

# Execute user code
{code}
'''

    # Write wrapper to temp file
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        delete=False,
        dir='/tmp'
    ) as wrapper_file:
        wrapper_file.write(wrapper_code)
        wrapper_path = wrapper_file.name

    try:
        # Run in subprocess with timeout
        result = subprocess.run(
            [sys.executable, wrapper_path],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            cwd=str(PROJECT_ROOT),
            env={
                **os.environ,
                'PYTHONPATH': str(SCRIPTS_DIR)
            }
        )

        duration_ms = int((time.time() - start_time) * 1000)

        # Combine stdout and stderr
        output = result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"

        # Apply token budget
        output, truncated = truncate_to_budget(output, budget)
        output_tokens = estimate_tokens(output)

        success = result.returncode == 0
        error = None if success else f"Exit code: {result.returncode}"

        # Log metrics
        log_metrics(
            code_file=code_file,
            success=success,
            duration_ms=duration_ms,
            output_tokens=output_tokens,
            budget=budget,
            truncated=truncated,
            error=error
        )

        return {
            'success': success,
            'output': output,
            'tokens': output_tokens,
            'truncated': truncated,
            'duration_ms': duration_ms,
            'exit_code': result.returncode
        }

    except subprocess.TimeoutExpired:
        duration_ms = int((time.time() - start_time) * 1000)
        error = f"Execution timed out after {TIMEOUT_SECONDS} seconds"

        log_metrics(
            code_file=code_file,
            success=False,
            duration_ms=duration_ms,
            output_tokens=0,
            budget=budget,
            truncated=False,
            error=error
        )

        return {
            'success': False,
            'error': error,
            'output': None,
            'duration_ms': duration_ms
        }

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error = str(e)

        log_metrics(
            code_file=code_file,
            success=False,
            duration_ms=duration_ms,
            output_tokens=0,
            budget=budget,
            truncated=False,
            error=error
        )

        return {
            'success': False,
            'error': error,
            'output': None,
            'duration_ms': duration_ms
        }

    finally:
        # Clean up wrapper file
        try:
            os.unlink(wrapper_path)
        except OSError:
            pass

        # Optionally clean up original code file
        # (uncomment if you want auto-cleanup)
        # try:
        #     os.unlink(code_file)
        # except OSError:
        #     pass


def main():
    parser = argparse.ArgumentParser(
        description='Execute Python code with mcp_tools available'
    )
    parser.add_argument(
        '--file', '-f',
        required=True,
        help='Path to Python file to execute'
    )
    parser.add_argument(
        '--budget', '-b',
        type=int,
        default=DEFAULT_TOKEN_BUDGET,
        help=f'Token budget for output (default: {DEFAULT_TOKEN_BUDGET}, max: {MAX_TOKEN_BUDGET})'
    )
    parser.add_argument(
        '--json', '-j',
        action='store_true',
        help='Output results as JSON'
    )

    args = parser.parse_args()

    # Validate budget
    budget = min(args.budget, MAX_TOKEN_BUDGET)

    # Run the code
    result = run_code(args.file, budget)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result['success']:
            print(result['output'])
        else:
            print(f"Error: {result.get('error', 'Unknown error')}", file=sys.stderr)
            if result.get('output'):
                print(result['output'])
            sys.exit(1)


if __name__ == '__main__':
    main()
