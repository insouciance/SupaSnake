#!/bin/bash
# PreToolUse Hook: Block Security Issues
# Prevents common security vulnerabilities with actionable guidance
# Based on: Anthropic "Writing Tools for Agents" - actionable error messages
# Exit 0: Allow, Exit 2: BLOCK

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check Write and Edit tools
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Combine content
TEXT="$CONTENT$NEW_STRING"

# Skip if no text
if [[ -z "$TEXT" ]]; then
  exit 0
fi

# Check for hard-coded password
if echo "$TEXT" | grep -Eq 'password[[:space:]]*=[[:space:]]*["\047]'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - Hard-Coded Password

🔒 Security impact: CRITICAL
  • Passwords in code = leaked in git history forever
  • Anyone with repo access = full access to system
  • OWASP Top 10: A07:2021 – Identification and Authentication Failures

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  echo "  Pattern: password = \"...\"" >&2
  cat >&2 <<'EOF'

📋 How to fix:

Step 1: Remove hard-coded password from code

Step 2: Add to .env file (NOT committed to git):
```bash
# .env
DB_PASSWORD=your_actual_password_here
```

Step 3: Load from environment in code:
```python
import os
from dotenv import load_dotenv

load_dotenv()

password = os.getenv('DB_PASSWORD')
if not password:
    raise ValueError("DB_PASSWORD environment variable required")
```

Step 4: Verify .env in .gitignore:
```
.env
.env.local
*.env
```

Step 5: Document in README.md:
```markdown
## Environment Variables
Required:
- `DB_PASSWORD` - Database password (get from team lead)
```

⚠️  CRITICAL: Rotate the leaked password immediately
  The password in your code is now in git history.
  You must change it in the actual system.

💡 Secure secrets management:
  Development: .env file (git-ignored)
  Production: AWS Secrets Manager / HashiCorp Vault
  Never commit: passwords, API keys, tokens, certificates

📚 Learn more:
  - OWASP: https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/

Platform requirement: Zero secrets in code (deterministic enforcement)
EOF
  exit 2
fi

# Check for hard-coded API key
if echo "$TEXT" | grep -Eq 'api[_-]?key[[:space:]]*=[[:space:]]*["\047]'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - Hard-Coded API Key

🔒 Security impact: CRITICAL
  • API keys in code = unauthorized API access
  • Leaked keys = potential data breach + unexpected bills
  • Third-party services can't revoke compromised keys retroactively

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 How to fix:

Step 1: Remove hard-coded API key

Step 2: Add to .env file:
```bash
# .env
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
```

Step 3: Load in code:
```javascript
// Node.js / Next.js
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY environment variable required');
}
```

⚠️  CRITICAL: Rotate the leaked API key immediately
  Contact the API provider to revoke and generate new key.

📚 Learn more: OWASP A07:2021

Platform requirement: Zero secrets in code
EOF
  exit 2
fi

# Check for hard-coded secret
if echo "$TEXT" | grep -Eq 'secret[[:space:]]*=[[:space:]]*["\047]'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - Hard-Coded Secret

🔒 Security impact: CRITICAL
EOF
  echo "📍 Location: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 Fix: Use environment variables (.env file)
⚠️  Rotate the secret immediately

Platform requirement: Zero secrets in code
EOF
  exit 2
fi

# Check for hard-coded token
if echo "$TEXT" | grep -Eq 'token[[:space:]]*=[[:space:]]*["\047]'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - Hard-Coded Token

🔒 Security impact: CRITICAL
  • Auth tokens in code = session hijacking risk
  • JWT secrets leaked = anyone can forge tokens
EOF
  echo "📍 Location: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 Fix: Use environment variables (.env file)
⚠️  Rotate the token immediately

Platform requirement: Zero secrets in code
EOF
  exit 2
fi

# Check for SQL string concatenation (injection risk)
# IMPROVED: Only blocks + operator adjacent to quotes (string concat)
# Allows: UPDATE users SET count = count + 1 (arithmetic - safe)
# Blocks: SELECT * FROM users WHERE name = 'x' + input (string concat - dangerous)
if echo "$TEXT" | grep -Eq '(SELECT|INSERT|UPDATE|DELETE).*([\+][[:space:]]*["\047]|["\047][[:space:]]*[\+])'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - SQL Injection Risk

🔒 Security impact: CRITICAL
  • SQL injection = attacker can read/modify/delete ALL database data
  • String concatenation = most common SQL injection vector
  • OWASP Top 10: A03:2021 – Injection

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  echo "  Pattern: SQL statement with + operator adjacent to quotes" >&2
  cat >&2 <<'EOF'

📋 How to fix:

❌ BAD (string concatenation - vulnerable):
```python
query = "SELECT * FROM users WHERE name = '" + user_input + "'"
# Attacker input: ' OR '1'='1
# Executes: SELECT * FROM users WHERE name = '' OR '1'='1'
# Result: Returns ALL users!
```

✅ GOOD (parameterized query - safe):
```python
query = "SELECT * FROM users WHERE name = %s"
cursor.execute(query, (user_input,))
# Attacker input: ' OR '1'='1
# Treated as literal string, not SQL code
```

Language-specific examples:

Python (psycopg2):
```python
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

JavaScript (node-postgres):
```javascript
const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
```

Supabase:
```typescript
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);  // Automatically parameterized
```

💡 Key principle: Never concatenate user input into SQL strings

📚 Learn more: OWASP A03:2021 - Injection

Platform requirement: Zero SQL concatenation (parameterized queries only)
EOF
  exit 2
fi

# Check for eval() usage
if echo "$TEXT" | grep -Eq 'eval\('; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - eval() Usage

🔒 Security impact: HIGH
  • eval() executes arbitrary code
  • Attacker-controlled input = remote code execution (RCE)
  • Can access filesystem, network, environment variables

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 How to fix:

❌ BAD:
```javascript
const result = eval(userInput);  // NEVER do this
```

✅ GOOD alternatives:
```javascript
// For JSON parsing:
const result = JSON.parse(userInput);

// For math expressions:
const result = math.evaluate(userInput);  // Use math.js library

// For function calls:
const allowedFunctions = {
  add: (a, b) => a + b,
  multiply: (a, b) => a * b
};
const result = allowedFunctions[functionName](...args);
```

Platform requirement: Zero eval() usage (use safer alternatives)
EOF
  exit 2
fi

# Check for exec() usage
if echo "$TEXT" | grep -Eq 'exec\('; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - exec() Usage

🔒 Security impact: HIGH
  • exec() executes arbitrary code (like eval)

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 Fix: Use safer alternatives (JSON.parse, specific parsers)

Platform requirement: Zero exec() usage
EOF
  exit 2
fi

# Check for innerHTML (XSS risk)
if echo "$TEXT" | grep -Eq 'innerHTML[[:space:]]*='; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - XSS Risk (innerHTML)

🔒 Security impact: HIGH
  • innerHTML with user input = Cross-Site Scripting (XSS)
  • Attacker can inject malicious JavaScript
  • Can steal cookies, session tokens, redirect to phishing

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 How to fix:

❌ BAD:
```javascript
element.innerHTML = userInput;  // XSS vulnerability
```

✅ GOOD alternatives:
```javascript
// For plain text:
element.textContent = userInput;  // Automatically escapes

// For sanitized HTML:
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);

// For React (automatically escapes):
<div>{userInput}</div>
```

Platform requirement: Use textContent or sanitize HTML
EOF
  exit 2
fi

# Check for dangerouslySetInnerHTML (XSS risk)
if echo "$TEXT" | grep -Eq 'dangerouslySetInnerHTML'; then
  cat >&2 <<'EOF'
❌ BLOCKED: Critical Security Issue - XSS Risk (dangerouslySetInnerHTML)

🔒 Security impact: HIGH
  • XSS vulnerability if content not sanitized

📍 Location:
EOF
  echo "  File: $FILE_PATH" >&2
  cat >&2 <<'EOF'

📋 How to fix:

❌ BAD:
```jsx
<div dangerouslySetInnerHTML={{__html: userInput}} />
```

✅ GOOD:
```jsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userInput)}} />
```

Or better: Use React's automatic escaping:
```jsx
<div>{userInput}</div>
```

Platform requirement: Sanitize HTML or avoid dangerouslySetInnerHTML
EOF
  exit 2
fi

# Allow write
exit 0
