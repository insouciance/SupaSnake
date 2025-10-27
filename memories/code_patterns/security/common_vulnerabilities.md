# Common Security Vulnerabilities - Learned Patterns

**Last Updated:** 2025-10-27
**Source:** Security Reviewer agent + manual audits

## Vulnerability Patterns to Watch For

### 1. Hard-Coded Secrets

**Pattern:**
```typescript
// ❌ BAD - Hard-coded secret
const API_KEY = "sk_live_abc123";
const password = "admin123";
```

**Why Dangerous:**
- Secrets exposed in source code
- Visible in version control history
- Can't be rotated without code changes

**Fix:**
```typescript
// ✅ GOOD - Environment variable
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;
const password = process.env.DATABASE_PASSWORD;
```

**Detection:** Hook 09 blocks hard-coded passwords, API keys

### 2. SQL Injection via Concatenation

**Pattern:**
```typescript
// ❌ BAD - SQL concatenation
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;
```

**Why Dangerous:**
- Attacker can inject SQL: `'; DROP TABLE users; --`
- Full database compromise possible

**Fix:**
```typescript
// ✅ GOOD - Parameterized query
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userEmail);
```

**Detection:** Hook 03 blocks SQL concatenation patterns

### 3. Client-Side Secret Access

**Pattern:**
```typescript
// ❌ BAD - Service role key in client code
// components/AdminPanel.tsx
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Exposed to client!
);
```

**Why Dangerous:**
- Service role key has full database access
- Bypasses Row Level Security
- Client code is public (can be inspected)

**Fix:**
```typescript
// ✅ GOOD - Service role key in API route
// app/api/admin/delete-player/route.ts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Safe on server
);
```

**Detection:** Hook 09 blocks SERVICE_ROLE_KEY in client directories

### 4. Missing Input Validation

**Pattern:**
```typescript
// ❌ BAD - No validation
export async function POST(req: Request) {
  const { amount } = await req.json();
  await deductDNA(userId, amount);  // What if amount is negative?
}
```

**Why Dangerous:**
- Negative amounts can add resources
- Type coercion can cause unexpected behavior
- Missing bounds checking

**Fix:**
```typescript
// ✅ GOOD - Validate all inputs
export async function POST(req: Request) {
  const { amount } = await req.json();

  // Validate
  if (typeof amount !== 'number' || amount <= 0 || amount > 10000) {
    return Response.json({ error: 'Invalid amount' }, { status: 400 });
  }

  await deductDNA(userId, amount);
}
```

**Detection:** Manual code review required (consider adding hook)

### 5. Race Conditions in Game State

**Pattern:**
```typescript
// ❌ BAD - Race condition
async function collectDNA() {
  const current = await getUserDNA(userId);
  const newAmount = current + 10;
  await setUserDNA(userId, newAmount);
  // If two requests run simultaneously, one update is lost!
}
```

**Why Dangerous:**
- Concurrent requests cause data loss
- Economy exploits possible
- State inconsistency

**Fix:**
```typescript
// ✅ GOOD - Atomic database operation
async function collectDNA() {
  const { data } = await supabase
    .rpc('increment_dna', { user_id: userId, amount: 10 });
  return data;
}

// SQL function (atomic)
CREATE FUNCTION increment_dna(user_id UUID, amount INT)
RETURNS INT AS $$
  UPDATE players
  SET dna = dna + amount
  WHERE id = user_id
  RETURNING dna;
$$ LANGUAGE SQL;
```

**Detection:** Pattern recognition during code review

### 6. XSS via innerHTML

**Pattern:**
```javascript
// ❌ BAD - XSS vulnerability
element.innerHTML = userInput;  // Can inject scripts
```

**Why Dangerous:**
- Attacker can execute arbitrary JavaScript
- Can steal session tokens
- Can redirect to phishing sites

**Fix:**
```javascript
// ✅ GOOD - Safe DOM manipulation
element.textContent = userInput;  // Escapes HTML

// Or use a sanitizer library
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

**Detection:** Hook 03 blocks innerHTML usage

### 7. Exposed Debug Information

**Pattern:**
```typescript
// ❌ BAD - Debug info in production
console.log('User session:', session);
console.error('Database error:', fullError);
```

**Why Dangerous:**
- Leaks sensitive information
- Aids attackers in reconnaissance
- Exposes internal structure

**Fix:**
```typescript
// ✅ GOOD - Sanitized logging
if (process.env.NODE_ENV === 'development') {
  console.log('User session:', session);
}

// Production logging
logger.error('Database error', {
  message: error.message,
  code: error.code,
  // Don't log full error with stack traces
});
```

**Detection:** Hook 01 blocks console.log in production code

### 8. Missing Authentication Checks

**Pattern:**
```typescript
// ❌ BAD - No auth check
export async function DELETE(req: Request) {
  const { playerId } = await req.json();
  await deletePlayer(playerId);  // Anyone can delete!
}
```

**Why Dangerous:**
- Unauthorized access to sensitive operations
- Privilege escalation possible

**Fix:**
```typescript
// ✅ GOOD - Authentication required
export async function DELETE(req: Request) {
  const session = await getServerSession(req);

  if (!session?.user?.isAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { playerId } = await req.json();
  await deletePlayer(playerId);
}
```

**Detection:** Manual review of API routes

## Detection Strategy

### Automated (Hooks)
- Hook 03: Blocks SQL concatenation, innerHTML, hard-coded passwords
- Hook 09: Blocks client-side secrets
- Hook 01: Blocks TODO/console.log in production

### Manual Review
- Check all API routes for authentication
- Verify input validation on all endpoints
- Review concurrent state modifications
- Audit database functions for atomicity

### Security Reviewer Agent
- Traces data flow from inputs to database
- Identifies trust boundaries
- Maps attack surface
- Rates severity (Critical/High/Medium/Low)

## Remediation Priority

**Critical (Fix Immediately):**
- Hard-coded secrets
- SQL injection
- Missing authentication on sensitive endpoints
- XSS vulnerabilities

**High (Fix Before Production):**
- Race conditions in game state
- Missing input validation
- Exposed debug information

**Medium (Fix in Sprint):**
- Insufficient error handling
- Missing rate limiting
- Weak password policies

**Low (Technical Debt):**
- Verbose error messages
- Missing security headers
- Outdated dependencies (minor versions)

## Learning Notes

**2025-10-27:** Most vulnerabilities come from trusting user input. Always validate, sanitize, and parameterize. Never trust the client.

**Pattern Recognition:** Similar security issues appear across different languages and frameworks. Focus on learning the underlying vulnerability pattern, not just the specific syntax.
