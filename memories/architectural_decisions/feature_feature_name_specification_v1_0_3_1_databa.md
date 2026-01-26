# feature_feature_name_specification_v1_0_3_1_databa

**Domain:** architecture
**Category:** context
**Captured:** 2026-01-26T09:27:13.423777+00:00
**Tags:** specification, context, documentation

## Summary

# Feature: [FEATURE_NAME] Specification v1.0: 3.1 Database Schema (if applicable)

**Type:** specification
**Domain:** architecture
**Category:** context
**Source:** docs/game/templates/FEATURE_SPECIFICATION_TEMPLATE.md
**Captured:** 2026-01-26 10:27



## Content

```sql
-- [TABLE_NAME]
CREATE TABLE [table_name] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- fields here
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[policy_name]" ON [table_name]
  FOR SELECT USING (auth.uid() = user_id);
```

---

*Automatically extracted from documentation.*


---
*Manually captured via /capture command*
