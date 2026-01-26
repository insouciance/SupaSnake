#!/bin/bash
# Clear Design Integrity marker on new user prompt
# This ensures each new task requires fresh consequence analysis
#
# Permission model:
# - New user prompt = new task = clear marker = analysis required
# - During same task (multi-turn) = marker persists = trusted to continue
# - Context compact/clear = marker lost = analysis required

MARKER_FILE="state/.design_integrity_checked"

if [[ -f "$MARKER_FILE" ]]; then
    rm "$MARKER_FILE"
fi

exit 0
