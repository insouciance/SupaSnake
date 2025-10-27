# Memory Directory

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
