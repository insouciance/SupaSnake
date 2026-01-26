#!/usr/bin/env python3
"""
Mark that Design Integrity analysis was completed.

Called by the Design Integrity subagent after performing consequence analysis.
The enforcement hook checks for this marker before allowing code modifications.

Usage:
    .venv/bin/python3.14 scripts/mark_integrity_checked.py

Permission model:
- Marker valid for current task (until next user prompt)
- Cleared automatically by user-prompt-submit hook on new prompt
- Cleared on context compact/clear
"""

from pathlib import Path
from datetime import datetime
import sys


def main():
    marker_file = Path("state/.design_integrity_checked")

    # Ensure state directory exists
    marker_file.parent.mkdir(exist_ok=True)

    # Write timestamp to marker file
    timestamp = datetime.now().isoformat()
    marker_file.write_text(f"Design Integrity analysis completed at: {timestamp}\n")

    print("✓ Design Integrity analysis marked complete")
    print(f"  Timestamp: {timestamp}")
    print("  Valid for: current task (until new user prompt)")
    print("  Code modifications now allowed")

    return 0


if __name__ == '__main__':
    sys.exit(main())
