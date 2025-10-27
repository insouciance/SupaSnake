#!/bin/bash
# PreToolUse Hook: Block Incomplete Code
# Prevents writing code with TODO/FIXME/placeholders
# Based on: Anthropic "Writing Tools for Agents" - actionable error messages
# Exit 0: Allow, Exit 1: BLOCK

# Read JSON input from stdin
INPUT=$(cat)

# Extract tool name and content
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Combine content sources
TEXT="$CONTENT$NEW_STRING"

# Skip if no text to check
if [[ -z "$TEXT" ]]; then
  exit 0
fi

# Blocked patterns
INCOMPLETE_PATTERNS=(
  "TODO:"
  "FIXME:"
  "XXX:"
  "HACK:"
  "NotImplementedError"
  "throw new Error([\"']Not implemented"
  "return null; // implement"
  "return null # TODO"
  "pass  # TODO"
  "pass  # FIXME"
  "mock_"
  "stub_"
  "fake_"
  "placeholder_"
  "temp_function"
)

# Check each pattern
for pattern in "${INCOMPLETE_PATTERNS[@]}"; do
  if echo "$TEXT" | grep -q "$pattern"; then
    cat >&2 <<'EOF'
❌ BLOCKED: Incomplete Code Detected

📍 Problem:
EOF
    echo "  File: $FILE_PATH" >&2
    echo "  Pattern: $pattern" >&2
    cat >&2 <<'EOF'

⚠️  Why this matters:
  • Incomplete code = technical debt in production
  • TODO comments = forgotten tasks that never get done
  • Placeholders = potential bugs and crashes
  • 100% complete implementations = AAA quality standard

📋 How to fix:

Option 1: Complete the implementation NOW
EOF

    # Give specific guidance based on pattern
    if [[ "$pattern" == "TODO:"* || "$pattern" == "FIXME:"* ]]; then
      cat >&2 <<'EOF'
```
# Instead of:
def calculate_discount(price):
    # TODO: Implement discount calculation
    return price

# Write complete implementation:
def calculate_discount(price, discount_percent=0):
    """Apply discount to price"""
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError("Discount must be 0-100")
    return price * (1 - discount_percent / 100)
```
EOF
    elif [[ "$pattern" == *"NotImplementedError"* || "$pattern" == *"Not implemented"* ]]; then
      cat >&2 <<'EOF'
```
# Instead of:
def process_payment(amount):
    raise NotImplementedError()

# Implement the functionality:
def process_payment(amount):
    """Process payment via Stripe"""
    if amount <= 0:
        raise ValueError("Amount must be positive")
    return stripe.charge(amount)
```
EOF
    elif [[ "$pattern" == "pass  #"* ]]; then
      cat >&2 <<'EOF'
```
# Instead of:
def validate_input(data):
    pass  # TODO

# Implement validation:
def validate_input(data):
    """Validate user input"""
    if not data:
        raise ValueError("Data cannot be empty")
    return True
```
EOF
    fi

    cat >&2 <<'EOF'

Option 2: If NOT ready to implement:
  a) Remove the incomplete code entirely
  b) Create issue tracker ticket (GitHub/Jira)
  c) Document decision in architectural decisions
  d) NEVER leave TODO comments in code

💡 Best practice:
  Use issue tracker for future work, not code comments.
  Every line of code in production must be complete and tested.

📚 Learn more:
  - Why TODOs are technical debt
  - Issue tracker setup
  - Definition of "Done"

Platform requirement: 100% complete implementations (0 TODO/FIXME in production)
EOF
    exit 1
  fi
done

# Allow write
exit 0
