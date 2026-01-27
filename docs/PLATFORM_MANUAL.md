# Platform Verification Manual

A hands-on guide for verifying that Claude Code's quality systems are working correctly.

**Who this is for:** Professionals with basic technical knowledge (comfortable with terminal, browser DevTools, and basic Git). If you've done The Odin Project or similar, you're ready.

**What you'll learn:** How to verify every automated system is working as designed.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Prerequisites](#2-prerequisites)
3. [Hook Verification](#3-hook-verification)
4. [Memory System Verification](#4-memory-system-verification)
5. [Agent System Verification](#5-agent-system-verification)
6. [State Tracking Verification](#6-state-tracking-verification)
7. [Troubleshooting](#7-troubleshooting)
8. [Verification Checklist](#8-verification-checklist)
9. [Operational Workflow](#9-operational-workflow)
10. [Code-Mode Execution](#10-code-mode-execution)
11. [Eval Workflow](#11-eval-workflow)
    - [UI/UX Checklist](#112-uiux-checklist)
    - [LLM Grading](#118-llm-grading-using-sub-agents)
    - [Consistency Testing](#119-consistency-testing-passk)

---

## 1. System Overview

### What Is Claude Code?

Claude Code is an AI assistant that helps you write software. It runs in your terminal and can read, write, and modify files in your project.

### What Are Hooks?

Hooks are automatic checks that run at specific moments. Think of them like spell-check, but for code quality:

- **Before Claude writes code** → Check if it's safe and complete
- **After Claude writes code** → Format it nicely
- **When Claude finishes responding** → Learn from what was done

### Why Verification Matters

These systems run automatically, but you should verify they're working because:

1. **Trust but verify** - Automation is great until it breaks silently
2. **Debugging** - When something goes wrong, you need to know which system failed
3. **Learning** - Understanding how the system works makes you more effective

### The Big Picture

```
You type a prompt
       ↓
[Memory Hook] Injects relevant past knowledge
       ↓
Claude thinks and wants to write code
       ↓
[Pre-Tool Hooks] Check: Is this code safe? Complete? Following rules?
       ↓
If blocked → Claude sees error, must fix it
If allowed → Code gets written
       ↓
[Post-Tool Hooks] Format code, track what happened
       ↓
Claude responds to you
       ↓
[Stop Hooks] Learn patterns, check quality
```

---

## 2. Prerequisites

### What You Need to Know

**Terminal basics:**
- `cd folder` - Change directory
- `ls` - List files
- `cat filename` - Display file contents
- `git status` - Check Git state
- `git log --oneline -5` - See recent commits

**Browser skills:**
- Opening Developer Tools (F12 or right-click > Inspect)
- Navigating web dashboards
- Reading JSON data

**Accounts needed:**
- Supabase account (for database verification)
- Access to your project's Supabase dashboard

### Quick Test

Open your terminal and run these commands. If they all work, you're ready:

```bash
# Check you're in the right folder
pwd
# Should show: /path/to/SupaSnake

# Check Python is set up
.venv/bin/python3.14 --version
# Should show: Python 3.14.x (your version may differ)

# Check hooks exist
ls .claude/hooks/
# Should show folders: lib, post-tool-use, pre-compact, pre-tool-use, stop, subagent-stop, user-prompt-submit
```

---

## 3. Hook Verification

Hooks are the most important system to verify. There are 27 hooks total, but we'll focus on the most critical ones.

### 3.1 Pre-Tool-Use Hooks (Blocking)

These hooks can **stop** Claude from writing bad code. They're your first line of defense.

#### Hook: Block Incomplete Code

**What it does:** Prevents Claude from writing placeholder code like "add implementation here" or deferred work markers.

**When it triggers:** Every time Claude tries to write or edit a file.

**How to verify:**

1. Open Claude Code in your terminal
2. Ask Claude to write incomplete code:
   ```
   Write a function called calculateDiscount with a placeholder that says "add implementation here"
   ```
3. **Expected result:** You should see a red error message:
   ```
   BLOCKED: Incomplete Code Detected
   ```
4. **If it works:** The hook prevented bad code. Success!
5. **If it doesn't work:** Check hook permissions (see Troubleshooting)

#### Hook: Block Security Issues

**What it does:** Prevents hardcoded passwords, API keys, and SQL injection vulnerabilities.

**When it triggers:** Every time Claude tries to write or edit a file.

**How to verify:**

1. Ask Claude to write insecure code:
   ```
   Write a config file with apiKey = "sk-1234567890abcdef"
   ```
2. **Expected result:** Red error message:
   ```
   BLOCKED: Security Issue Detected
   Pattern: hardcoded API key
   ```
3. **If it works:** Security is being enforced. Success!

#### Hook: Enforce Server Authority

**What it does:** Prevents storing game data (scores, currency, unlocks) in browser localStorage.

**When it triggers:** When Claude tries to use localStorage for game state.

**How to verify:**

1. Ask Claude:
   ```
   Write code to save the player's score to localStorage
   ```
2. **Expected result:** Red error message:
   ```
   BLOCKED: Server Authority Violation
   localStorage cannot store: score
   ```
3. **If it works:** Game integrity is protected. Success!

### 3.2 Memory Injection Hook

**What it does:** Automatically adds relevant knowledge from past sessions to your prompt.

**When it triggers:** When you submit a prompt.

**How to verify:**

1. Look at the system messages in Claude Code when you submit a prompt
2. You should see text containing:
   ```
   [SESSION HANDOFF - Resuming Previous Work]
   ```
   or
   ```
   [Memory Context]
   ```
3. **Alternative verification:** Check the terminal output for "hook success" messages

**If you don't see it:**
- The hook might not have found relevant memories
- Check that `.claude/hooks/user-prompt-submit/02-inject-memory-context.sh` exists

### 3.3 Capture Learnings Hook

**What it does:** After you make a commit, automatically extracts code patterns and saves them for future reference.

**When it triggers:** After Claude finishes responding (Stop hook), if there's a new commit.

**How to verify:**

1. Make a code change and commit it:
   ```bash
   echo "test" > test-file.txt
   git add test-file.txt
   git commit -m "Test commit"
   ```
2. In your next Claude interaction, check for:
   ```
   Capturing learnings from recent commit...
   ```
3. Check the capture file:
   ```bash
   cat state/.last_capture_commit
   ```
   Should show your latest commit hash.

4. Check if patterns were extracted:
   ```bash
   ls -la memories/code_patterns/
   ```

---

## 4. Memory System Verification

The memory system stores knowledge from past sessions so Claude remembers what worked.

### 4.1 Supabase Database Verification

**How to verify memories are being stored:**

1. Open your browser and go to: https://supabase.com/dashboard
2. Log in and select your project
3. Click **Table Editor** in the left sidebar
4. Click on the `claude_memories` table
5. You should see columns:
   - `id` - Unique identifier
   - `domain` - Category (like "security", "game", "api")
   - `title` - What the memory is about
   - `content` - The actual knowledge
   - `created_at` - When it was saved

**What to check:**
- Are there rows in the table? (Some data should exist)
- Are `created_at` dates recent? (System is actively saving)
- Do titles make sense? (Content is meaningful)

**Test the search function:**

1. In Supabase, click **SQL Editor**
2. Run this query:
   ```sql
   SELECT * FROM search_memories('authentication', NULL, 5);
   ```
3. **Expected:** Returns up to 5 rows related to authentication
4. **If empty:** Either no auth-related memories exist, or search isn't working

### 4.2 Local Fallback Verification

If Supabase isn't available, memories save locally.

**How to verify local storage works:**

1. Check the memories folder exists:
   ```bash
   ls -la memories/
   ```
2. **Expected folders:**
   - `architectural_decisions/`
   - `code_patterns/`
   - `project_knowledge/`

3. Check a sample memory file:
   ```bash
   cat memories/code_patterns/security/env_var_secrets.md
   ```
4. **Expected:** Readable markdown content about using environment variables

### 4.3 Capture Command Verification

The `/capture` command lets you manually save knowledge.

**How to verify:**

1. In Claude Code, run:
   ```
   /capture This is a test memory to verify the capture system works
   ```
2. Claude should respond with:
   ```
   Memory captured successfully!
   Title: ...
   Domain: ...
   Storage: supabase (or local)
   ```

3. Verify in Supabase:
   - Go to Table Editor > `claude_memories`
   - Sort by `created_at` descending
   - Your test memory should be at the top

4. Verify locally:
   ```bash
   ls -la memories/project_knowledge/
   ```
   Should show a new `.md` file

---

## 5. Agent System Verification

Agents are specialized sub-versions of Claude focused on specific tasks.

### 5.1 Available Agents

| Agent | What It Reviews | Key Output |
|-------|-----------------|------------|
| Security Reviewer | Vulnerabilities, auth issues | OWASP references, severity ratings |
| Performance Reviewer | Speed, efficiency | Benchmark suggestions |
| Code Quality Reviewer | Readability, maintainability | 1-10 rating |
| Balance Reviewer | Game fairness | Economy analysis |
| Validator | Production readiness | PASS/FAIL verdict |
| Memory | Past knowledge | Relevant patterns |

### 5.2 How to Invoke an Agent

Say to Claude:
```
Use the Security Reviewer agent to check the authentication code in src/app/auth/
```

### 5.3 How to Verify Agents Work

**Test the Security Reviewer:**

1. Ask Claude:
   ```
   Use the Security Reviewer agent to analyze our middleware.ts file
   ```
2. **Expected in response:**
   - "OWASP" mentioned (security framework reference)
   - Severity ratings (Critical/High/Medium/Low)
   - Specific file references
   - Remediation suggestions

**Test the Validator:**

1. Ask Claude:
   ```
   Use the Validator agent to check if this codebase is ready for production
   ```
2. **Expected in response:**
   - Clear PASS or FAIL verdict
   - Checklist of what was reviewed
   - Specific issues if any

**If agents don't work:**
- Check `.claude/agents/` folder exists
- Verify agent markdown files are present

---

## 6. State Tracking Verification

State files track what's happening across sessions.

### 6.1 Domain Mapping

**What it does:** Maps file paths to logical domains (game, api, security, etc.)

**How to verify:**

```bash
cat state/domain_mapping.json
```

**Expected structure:**
```json
{
  "last_updated": "2025-12-22T...",
  "file_count": 50,
  "domains": {
    "game": {
      "files": ["src/app/game/page.tsx", ...]
    },
    "api": {
      "files": ["src/app/api/health/route.ts", ...]
    }
  }
}
```

**What to check:**
- Does `last_updated` look recent?
- Are common folders correctly categorized?

### 6.2 Read Activity

**What it does:** Tracks which files Claude has read recently.

**How to verify:**

```bash
cat state/read_activity/recent_reads.json
```

**Expected:** JSON array of file paths with timestamps

```bash
cat state/read_activity/domain_activity.json
```

**Expected:** Object with domains and their recent file reads

**Test it:**
1. Ask Claude to read a file:
   ```
   Read the file src/middleware.ts
   ```
2. Check recent reads:
   ```bash
   cat state/read_activity/recent_reads.json | tail -5
   ```
3. **Expected:** `src/middleware.ts` should appear in the list

### 6.3 Handoff State

**What it does:** Saves context before the system resets (auto-compact).

**How to verify:**

```bash
cat state/handoff/current.json
```

**Expected fields:**
- `task` - What you were working on
- `status` - "in_progress" or similar
- `domain` - Which area of the codebase
- `next_action` - What to do next
- `files_to_load` - Which files are relevant

**If file doesn't exist:** That's okay - it only gets created during long sessions before auto-compact.

Check for archived handoffs:
```bash
ls state/handoff/
```

---

## 7. Troubleshooting

### Problem: Hooks Not Running

**Symptoms:** Claude writes code that should have been blocked.

**Check 1:** Verify hook files exist
```bash
ls .claude/hooks/pre-tool-use/
```
Should show numbered `.sh` files.

**Check 2:** Verify hooks are executable
```bash
ls -la .claude/hooks/pre-tool-use/
```
Files should show `x` in permissions (like `-rwxr-xr-x`).

**Fix:** Make hooks executable
```bash
chmod +x .claude/hooks/**/*.sh
```

### Problem: Memory Not Saving to Supabase

**Symptoms:** Memories only appear locally, not in Supabase dashboard.

**Check 1:** Verify environment variables
```bash
cat .env | grep SUPABASE
```
Should show:
- `NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=eyJ...`

**Check 2:** Test connection
```bash
.venv/bin/python3.14 -c "
from dotenv import load_dotenv
load_dotenv()
from scripts.memory_tool_handler import MemoryToolHandler
m = MemoryToolHandler()
print('Supabase connected:', m.use_supabase)
"
```
Should print `Supabase connected: True`

**Fix:** Add missing environment variables to `.env` file

### Problem: Python Script Errors

**Symptoms:** Errors mentioning "module not found" or "python not found"

**Check:** Verify Python setup
```bash
.venv/bin/python3.14 --version
.venv/bin/python3.14 -c "import supabase; print('OK')"
```

**Fix:** Reinstall dependencies
```bash
.venv/bin/pip install supabase python-dotenv
```

### Problem: Local Fallback Only

**Symptoms:** Everything works but only saves locally.

**This is fine!** Local fallback is the backup system. It means:
- Supabase connection failed (check credentials)
- But your data is still being saved

To check what's stored locally:
```bash
find memories/ -name "*.md" -type f | head -20
```

### Problem: Agent Not Responding Correctly

**Symptoms:** Asked for Security Reviewer but got generic response.

**Check:** Verify agent definition exists
```bash
cat .claude/agents/security_reviewer.md | head -20
```

**If missing:** The agent file needs to be created.

---

## 8. Verification Checklist

Use this checklist to verify your platform is working correctly.

### Quick Health Check (5 minutes)

| System | Test | How to Check | Working? |
|--------|------|--------------|----------|
| Hooks exist | Files present | `ls .claude/hooks/pre-tool-use/` | |
| Hooks executable | Permissions set | `ls -la .claude/hooks/pre-tool-use/01*.sh` shows `x` | |
| Python works | Script runs | `.venv/bin/python3.14 --version` | |
| Supabase connected | Test query | Check Supabase dashboard for `claude_memories` table | |
| Local memories | Folder exists | `ls memories/code_patterns/` | |
| State tracking | Files exist | `ls state/` shows domain_mapping.json | |

### Full Verification (15 minutes)

| System | Test | Steps | Result |
|--------|------|-------|--------|
| **Pre-tool hooks** | Block incomplete code | Ask Claude to write "placeholder here" | Should be blocked |
| **Pre-tool hooks** | Block secrets | Ask Claude to hardcode an API key | Should be blocked |
| **Pre-tool hooks** | Block localStorage | Ask Claude to save score to localStorage | Should be blocked |
| **Memory injection** | Context appears | Check for [Memory Context] in prompts | Should see it |
| **Capture command** | /capture works | Run `/capture test` | Shows success message |
| **Supabase storage** | Memory saved | Check Supabase table after /capture | New row appears |
| **Local storage** | Fallback works | Check `memories/` after /capture | New .md file appears |
| **Agents** | Security Reviewer | Ask to use Security Reviewer | Mentions OWASP |
| **Agents** | Validator | Ask to use Validator | Gives PASS/FAIL |
| **State** | Domain mapping | `cat state/domain_mapping.json` | Shows domains |
| **State** | Read activity | `cat state/read_activity/recent_reads.json` | Shows recent files |

### What Passing Looks Like

When everything works:
- Hooks block bad code with red error messages
- `/capture` saves to both Supabase and local
- Agents give specialized, formatted responses
- State files update as you work

### What Failing Looks Like

Common failure signs:
- Claude writes code with "placeholder" without being blocked
- `/capture` silently does nothing
- Agents give generic responses without OWASP or ratings
- State files are empty or missing

---

## Quick Reference

### Essential Commands

```bash
# Check hook status
ls -la .claude/hooks/pre-tool-use/

# Check memory connection
.venv/bin/python3.14 -c "from scripts.memory_tool_handler import MemoryToolHandler; print(MemoryToolHandler().use_supabase)"

# Check local memories
ls memories/

# Check state files
ls state/

# Check recent handoffs
cat state/handoff/current.json

# Check recent reads
cat state/read_activity/recent_reads.json

# Make hooks executable
chmod +x .claude/hooks/**/*.sh
```

### Supabase Dashboard Navigation

1. Go to https://supabase.com/dashboard
2. Select your project
3. **Table Editor** - View and edit data
4. **SQL Editor** - Run queries
5. **Logs** - Check for errors

### Hook Types at a Glance

| Type | When | Can Block? |
|------|------|------------|
| pre-tool-use | Before writing code | Yes (exit 2) |
| post-tool-use | After writing code | No |
| stop | After Claude responds | No |
| user-prompt-submit | When you send a prompt | No |
| pre-compact | Before context resets | No |

---

## 9. Operational Workflow

This section covers **how to use the platform to get work done** - from identifying a task to verifying it's complete.

### 9.1 Before You Assign a Task (Preparation)

**DO NOT skip this step.** Proper preparation prevents context degradation and wasted effort.

#### Step 1: Identify the Task in the Roadmap

Open `docs/game/02_MVP_SCOPE.md` and find:

1. **Which system?** (Core Snake Engine, Energy System, etc.)
2. **What phase?** (v0.1, v0.5, v1.0)
3. **Success criteria** - What does "done" look like?
4. **Scope boundaries** - What's NOT included?

**Example:**
```
System: Energy System
Phase: v0.1
Success Criteria:
  - Energy shows in HUD
  - Depletes on play (1 per run)
  - Regenerates (20 min per unit)
  - Can't play with 0 energy
NOT Included:
  - Clan energy bonuses (v0.5)
  - Energy expansion upgrades (v0.5)
```

#### Step 2: Check Dependencies

Before building a system, verify its dependencies work:

| System | Depends On |
|--------|------------|
| Energy System | Basic UI Framework, Backend Infrastructure |
| DNA Economy | Energy System, Backend Infrastructure |
| Classic Mode | Core Snake Engine, Energy System |
| Collection | DNA Economy, Backend Infrastructure |

**How to check:** Open the app. Does the dependency system actually work in the browser?

#### Step 3: Run Dev Environment Health Check

Before starting work, verify the tools work:

```bash
# Quick health check
.venv/bin/python3.14 scripts/code_executor.py --file /dev/null 2>&1 | head -1
# Should show an error about empty file, NOT a Python crash

# Check hooks are executable
ls -la .claude/hooks/pre-tool-use/*.sh | head -3
# Should show 'x' in permissions

# Check memory connection
.venv/bin/python3.14 -c "
from dotenv import load_dotenv
load_dotenv()
from scripts.memory_tool_handler import MemoryToolHandler
m = MemoryToolHandler()
print('Memory system:', 'Supabase' if m.use_supabase else 'Local only')
"
```

#### Step 4: Gather Reference Materials

Before assigning the task, identify:

1. **Design docs** - Which files in `design/` apply?
2. **Existing patterns** - Similar code already in the project?
3. **Constraints** - From `docs/game/00_CONSTRAINT_LATTICE.md`

**Write these down.** You'll include them in your task assignment.

---

### 9.2 How to Assign a Task

**Bad task assignment:**
```
Add the energy system
```

**Good task assignment:**
```
Build the Energy System for v0.1

REFERENCE DOCS:
- docs/game/02_MVP_SCOPE.md (lines 161-179)
- design/core_loop_aaa.md (energy mechanics)

SUCCESS CRITERIA:
- Energy counter shows in game HUD (5 max)
- Playing a run costs 1 energy
- Energy regenerates: 1 unit per 20 minutes
- Can't start a run with 0 energy (show message)
- Daily free refill: 1x per day button

NOT IN SCOPE (v0.5):
- Clan energy bonuses
- Energy capacity upgrades
- Energy overflow

EXISTING PATTERNS TO FOLLOW:
- Check src/components/HUD.tsx for HUD patterns
- Check src/hooks/ for state management patterns

DEPENDENCIES (verify these work first):
- Basic UI Framework ✓
- Backend Infrastructure ✓
```

#### Task Assignment Template

Copy and fill this out:

```
Build [SYSTEM NAME] for [PHASE]

REFERENCE DOCS:
- [path to relevant design doc]
- [path to scope doc with line numbers]

SUCCESS CRITERIA:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

NOT IN SCOPE:
- Feature deferred to later phase
- Feature deferred to later phase

EXISTING PATTERNS TO FOLLOW:
- [path to similar existing code]

DEPENDENCIES (verify these work):
- Dependency 1: [✓ or ✗]
- Dependency 2: [✓ or ✗]
```

---

### 9.3 While Claude Works

#### What To Watch For

**Good signs:**
- Claude reads the reference docs you specified
- Claude searches memory for relevant patterns
- Hook blocks appear (Claude tried something bad, got caught, fixed it)
- Claude asks clarifying questions

**Warning signs:**
- Claude starts coding without reading references
- Claude invents new patterns instead of following existing ones
- Claude expands scope ("I'll also add...")
- No memory searches (not using past knowledge)

#### When To Intervene

**Intervene immediately if:**
- Claude is working on the wrong system
- Claude is adding features NOT in scope
- Claude is ignoring your reference docs
- Claude seems confused about what to build

**How to intervene:**
```
STOP. Let's refocus.

The task is: [restate the specific task]
You're currently: [describe what they're doing wrong]

Please:
1. Re-read [specific reference doc]
2. Focus only on [specific scope item]
3. Do not add [out-of-scope thing]
```

---

### 9.4 After Claude Finishes

#### Automated Checks (Happen Automatically)

These run via hooks without you doing anything:

| Check | What It Catches | You'll See |
|-------|-----------------|------------|
| Build | Syntax errors, type errors | Error in terminal |
| Hooks | Security issues, incomplete code | Red "BLOCKED" message |
| Format | Style issues | Auto-fixed silently |

If Claude finished without red errors, basic automated checks passed.

#### Your Verification (Manual)

**This is your job. No one else can do this.**

1. **Open the app** in your browser (`npm run dev`)
2. **Test the specific feature** you asked for
3. **Check nothing else broke** (quick pass through other features)

Use the UI/UX Checklist (Section 11.2) as your guide.

#### Log The Results

After testing, update your logs:

**If something's broken:** Add to `state/evals/issues.md`
**If something worked well:** Add to `state/evals/wins.md`

More details in Section 11.

---

### 9.5 The Complete Workflow (Summary)

```
┌─────────────────────────────────────────────────────────────┐
│                    1. PREPARATION                            │
│                                                              │
│  □ Find task in roadmap (02_MVP_SCOPE.md)                   │
│  □ Note success criteria and scope boundaries               │
│  □ Check dependencies work (test in browser)                │
│  □ Run dev environment health check                         │
│  □ Gather reference docs                                     │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  2. TASK ASSIGNMENT                          │
│                                                              │
│  □ Use the task template                                    │
│  □ Include reference docs with line numbers                 │
│  □ List success criteria as checkboxes                      │
│  □ Explicitly state what's NOT in scope                     │
│  □ Point to existing patterns to follow                     │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   3. MONITOR PROGRESS                        │
│                                                              │
│  □ Watch for reference doc reads                            │
│  □ Watch for memory searches                                │
│  □ Intervene if scope creep or confusion                    │
│  □ Hook blocks are GOOD (catching issues)                   │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   4. VERIFICATION                            │
│                                                              │
│  □ Automated: Build passed? Hooks passed?                   │
│  □ Manual: Open app, test the feature                       │
│  □ Manual: Quick check nothing else broke                   │
│  □ Log issues and wins                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Code-Mode Execution

Code-mode execution prevents context bloat when Claude needs to use tools that return large amounts of data.

### 10.1 Why Code-Mode Exists

**The Problem:**
When Claude calls tools like web search or memory search directly, the full results go into context. A single web page can be 50,000 tokens. After a few searches, context fills up and auto-compact triggers - losing your progress.

**The Solution:**
Instead of calling tools directly, Claude writes Python code that calls the tools, processes the results, and prints only what's needed. This reduces 50,000 tokens to ~500 tokens.

**Token reduction: 98.7%** (150k → 2k for complex operations)

### 10.2 How It Works

```
OLD WAY (Bloats Context):
Claude → WebFetch tool → Full 50k page in context → Context full → Auto-compact

NEW WAY (Code-Mode):
Claude → Writes Python → Executes → Prints summary → ~500 tokens in context
```

### 10.3 Blocked Tools

These tools are **blocked by hooks** and must use code-mode:

| Tool | Why Blocked | Use Instead |
|------|-------------|-------------|
| `WebFetch` | Web pages are huge (10-50k tokens) | `web.fetch()` in code |
| `WebSearch` | Search results vary widely | `web.search()` in code |
| `mcp__*` | All MCP tools - variable size | Code-mode equivalents |

If Claude tries to use these directly, you'll see:
```
❌ BLOCKED: Use Code-Mode Execution
```

This is **working as intended**. Claude should then use code-mode.

### 10.4 How Claude Uses Code-Mode

**Step 1:** Claude writes Python to a temp file

```python
# /tmp/claude_code_abc123.py
from mcp_tools import memory, fs, web

# Search for authentication patterns
results = memory.search("authentication", domain="security", limit=5)
for r in results:
    print(f"- {r['title']}: {r['summary'][:100]}")
```

**Step 2:** Claude executes via the code executor

```bash
.venv/bin/python3.14 scripts/code_executor.py --file /tmp/claude_code_abc123.py --budget 500
```

**Step 3:** Only the printed output enters context (~500 tokens max)

### 10.5 Available Code-Mode Tools

#### Memory Tools

```python
from mcp_tools import memory

# Search memories
results = memory.search("query", domain="security", limit=5)

# Capture a new memory
memory.capture(
    domain="architecture",
    category="decision",
    title="Why We Chose X",
    summary="Short description...",
    content="Full markdown content...",
    tags=["tag1", "tag2"]
)

# Get memories by domain
patterns = memory.get_by_domain("performance", limit=10)
```

#### Filesystem Tools

```python
from mcp_tools import fs

# Read a file
content = fs.read("src/lib/auth.ts")
content = fs.read("src/lib/auth.ts", start_line=50, end_line=100)

# Find files
files = fs.glob("**/*.ts", path="src/")

# Search file contents
matches = fs.grep("validateUser", path="src/", file_type="ts")

# List directory
items = fs.list_dir("src/components/")
```

#### Web Tools

```python
from mcp_tools import web

# Fetch and process web content
result = web.fetch("https://example.com/docs", prompt="Extract the API endpoints")
print(result['content'][:1000])  # Print only what you need

# Note: web.search() requires API key configuration
```

### 10.6 Verifying Code-Mode Works

**Test the executor:**

```bash
# Create a test file
echo 'from mcp_tools import memory
print("Memory stats:", memory.stats())' > /tmp/test_code_mode.py

# Run it
.venv/bin/python3.14 scripts/code_executor.py --file /tmp/test_code_mode.py

# Expected: Shows memory stats, no errors
```

**Test the hook blocks direct calls:**

Ask Claude:
```
Use WebFetch to get https://example.com
```

**Expected:** Red "BLOCKED" message with instructions to use code-mode instead.

### 10.7 Execution Metrics

Every code execution is logged to `state/tool_metrics/code_execution.jsonl`:

```json
{
  "timestamp": "2025-01-10T14:30:00",
  "code_file": "/tmp/claude_code_abc.py",
  "success": true,
  "duration_ms": 234,
  "output_tokens": 127,
  "token_budget": 500,
  "truncated": false
}
```

Check recent executions:
```bash
tail -5 state/tool_metrics/code_execution.jsonl
```

---

## 11. Eval Workflow

Evaluation ensures features work correctly and nothing breaks over time. You are the primary evaluator through UI/UX testing.

### 11.1 The Three Eval Layers

```
┌─────────────────────────────────────────────────────────────┐
│              LAYER 1: AUTOMATED (Runs automatically)         │
│                                                              │
│  • Build passes                                              │
│  • TypeScript compiles                                       │
│  • Hooks don't block final code                             │
│  • Code-mode executions succeed                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              LAYER 2: YOUR UI/UX TESTING (Manual)           │
│                                                              │
│  • Open app in browser                                       │
│  • Test the specific feature                                │
│  • Verify nothing else broke                                │
│  • Use the checklist below                                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              LAYER 3: LOGGING (Capture feedback)            │
│                                                              │
│  • Issues found → issue log                                 │
│  • What worked → wins log                                   │
│  • Calibration → did automated checks match your findings?  │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 UI/UX Checklist

Use this when testing in the browser. Check what works, note what doesn't.

**Location:** `state/evals/ui_checklist.md` (create if doesn't exist)

```markdown
# SupaSnake UI/UX Checklist

## Instructions
1. Run `npm run dev` to start the app
2. Open http://localhost:3000 in your browser
3. Go through each section below
4. Mark ✓ for working, ✗ for broken, - for not yet built

## Last Tested: ___________

---

## App Launch
- [ ] App loads without errors
- [ ] Load time < 3 seconds
- [ ] No console errors (check DevTools)

## Core Game (if built)
- [ ] Game screen loads
- [ ] Snake moves smoothly
- [ ] Controls respond immediately
- [ ] Food spawns when eaten
- [ ] Snake grows when eating
- [ ] Collision triggers death
- [ ] Score displays correctly
- [ ] Game over screen appears

## Energy System (if built)
- [ ] Energy shows in HUD
- [ ] Correct max energy (5)
- [ ] Energy depletes on play
- [ ] Can't play with 0 energy
- [ ] Regeneration indicator visible

## DNA/Resources (if built)
- [ ] DNA earned after run
- [ ] DNA total displays correctly
- [ ] DNA persists after refresh

## Lab/Collection (if built)
- [ ] Lab accessible from menu
- [ ] Collection shows snakes
- [ ] Can select different snake
- [ ] Locked snakes visible

## Auth (if built)
- [ ] Can create account
- [ ] Can log in
- [ ] Can log out
- [ ] Progress saves
- [ ] Progress loads on return

## Notes
[Write any observations here]
```

### 11.3 Issue Log

When you find something broken, log it here.

**Location:** `state/evals/issues.md`

```markdown
# Issue Log

Track bugs and problems found during testing.

## Format
| Date | What's Broken | Where | Severity | Status |
|------|---------------|-------|----------|--------|

## Issues

| Date | What's Broken | Where | Severity | Status |
|------|---------------|-------|----------|--------|
| | | | | |

## Severity Guide
- **Critical**: App crashes, data loss, can't use core features
- **High**: Feature doesn't work, but app runs
- **Medium**: Feature works but has problems
- **Low**: Minor visual/UX issues

## Status
- **Open**: Not fixed yet
- **In Progress**: Being worked on
- **Fixed**: Resolved (note the date)
- **Won't Fix**: Accepted as-is (explain why)
```

### 11.4 Wins Log

Track what works well to reinforce good patterns.

**Location:** `state/evals/wins.md`

```markdown
# Wins Log

Track what's working well - both in the app AND in the dev process.

## Format
| Date | What Worked | Category | Why It Matters |
|------|-------------|----------|----------------|

## Categories
- **Feature**: App feature works as designed
- **Dev Process**: Something in the dev workflow worked well
- **Context**: Memory/hooks/agents helped effectively
- **Prevention**: Hook caught an issue before it shipped

## Wins

| Date | What Worked | Category | Why It Matters |
|------|-------------|----------|----------------|
| | | | |
```

### 11.5 Calibration Log

Track when automated systems disagree with your findings.

**Location:** `state/evals/calibration.md`

```markdown
# Calibration Log

Track when automated checks (hooks, build, sub-agents) disagree with your testing.

## Why This Matters
If hooks say "pass" but you find bugs, the hooks need improvement.
If hooks say "fail" but the feature works, the hooks are too strict.

## Format
| Date | Automated Said | You Found | Who's Right | Action Taken |
|------|----------------|-----------|-------------|--------------|

## Log

| Date | Automated Said | You Found | Who's Right | Action Taken |
|------|----------------|-----------|-------------|--------------|
| | | | | |

## Common Patterns
- Build passes but UI broken → Need more runtime checks
- Security hook too strict → Adjust patterns
- Memory didn't find relevant pattern → Improve memory capture
```

### 11.6 Creating The Eval Files

Run this once to set up the eval directory:

```bash
# Create eval directory
mkdir -p state/evals

# Create empty files
touch state/evals/ui_checklist.md
touch state/evals/issues.md
touch state/evals/wins.md
touch state/evals/calibration.md
```

Then copy the templates from sections 11.2-11.5 into each file.

### 11.7 When To Eval

| Moment | What To Do |
|--------|------------|
| After Claude finishes a feature | Full UI/UX test of that feature |
| After any code change | Quick smoke test (app loads, no crashes) |
| Start of each day | Quick health check of whole app |
| Before committing | Verify nothing broke |
| After noticing something odd | Log it in issues.md |
| After something works great | Log it in wins.md |

### 11.8 LLM Grading (Using Sub-Agents)

Use your sub-agents as **graders** to evaluate Claude's work before you test manually.

#### When To Use LLM Grading

| Situation | Use Agent |
|-----------|-----------|
| Security-sensitive code (auth, API) | Security Reviewer |
| Complex logic, new patterns | Code Quality Reviewer |
| Performance-critical code | Performance Reviewer |
| Game mechanics, economy | Balance Reviewer |
| Pre-production check | Validator |

#### How To Invoke a Grader

After Claude finishes a task, say:

```
Use the [Agent Name] to grade the work just completed.

Files changed:
- [list the files]

Success criteria (from roadmap):
- [criterion 1]
- [criterion 2]
- [criterion 3]

Return a structured verdict:
- PASS or FAIL for each criterion
- OVERALL: PASS or FAIL
- CONFIDENCE: HIGH/MEDIUM/LOW
- Issues found and recommendations
```

#### Example: Grading Energy System

```
Use the Code Quality Reviewer to grade the Energy System implementation.

Files changed:
- src/components/EnergyBar.tsx
- src/hooks/useEnergy.ts
- src/app/api/energy/route.ts

Success criteria:
- Energy displays correctly in HUD (5 max)
- Energy depletes on game start (1 per run)
- Energy regenerates server-side (20 min per unit)
- Can't start game with 0 energy (show message)

Grade each criterion PASS/FAIL with reason.
Give overall verdict and confidence level.
```

#### Logging Grader Results

Add grader results to `state/evals/grader_results.md`:

```markdown
# LLM Grader Results

| Date | Task | Grader | Verdict | Confidence | Notes |
|------|------|--------|---------|------------|-------|
| 01-10 | Energy System | Code Quality | PASS | HIGH | Clean implementation |
| 01-10 | Energy System | Security | PASS | MEDIUM | Recommend rate limiting |
```

#### Calibrating Graders

Compare grader verdicts against your UI/UX testing:

- If grader says PASS but you find bugs → grader missed something (log in calibration.md)
- If grader says FAIL but feature works → grader too strict (log in calibration.md)

Over time, this helps improve sub-agent prompts.

---

### 11.9 Consistency Testing (pass@k)

For important tasks, test if Claude can do them **consistently**.

#### What pass@k Measures

| Metric | Meaning |
|--------|---------|
| **pass@k** | "Will at least ONE of k attempts succeed?" |
| **pass^k** | "Will ALL k attempts succeed?" |

High pass@k + low pass^k = Claude can do it, but unreliably.
Both high = Ready for production.

#### When To Use

- Testing a **new task type** for the first time
- After **changing prompts** or memory patterns
- Before **trusting Claude** with a critical system

#### How To Test (Manual)

1. Run the same task 3 times (use `/clear` between attempts)
2. Track success/failure
3. Calculate success rate

**Log in** `state/evals/consistency.md`:

```markdown
# Consistency Testing (pass@k)

## Task: [Name]

| Trial | Date | Passed? | Notes |
|-------|------|---------|-------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

**Success rate:** X/3
**pass@3:** Yes/No (at least one success)
**pass^3:** Yes/No (all succeeded)

**Conclusion:** [Is this reliable enough? What needs improvement?]
```

#### Interpreting Results

| Result | Meaning | Action |
|--------|---------|--------|
| 3/3 pass | Highly reliable | Ready for production |
| 2/3 pass | Usually works | Acceptable, but monitor |
| 1/3 pass | Unreliable | Improve prompt, add context |
| 0/3 pass | Broken | Major rework needed |

---

### 11.10 The Eval Mindset

**You are the final judge.** Automated checks and LLM graders catch obvious problems, but only you can verify:

- Does this **feel** right?
- Is this **actually** what we wanted?
- Does this **fit** with everything else?

**The feedback loop:**
```
Your testing → Finds issues graders missed → Improve graders → Better automation
```

Your judgment improves the system. Every calibration entry makes the platform smarter.

---

*Last updated: 2025-01-10*
*Platform version: ZTE v4.1*
