-- Migration 004: Claude Memory System
-- Server-side storage for Claude's learning and context

-- ============================================================================
-- MEMORIES - Main storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS claude_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Categorization
  domain TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL,
  summary TEXT,

  -- Metadata
  source_file TEXT,
  source_commit TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Relevance scoring
  times_applied INTEGER NOT NULL DEFAULT 0,
  relevance_score DECIMAL(5,2) DEFAULT 0.0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_memories_domain ON claude_memories(domain);
CREATE INDEX IF NOT EXISTS idx_memories_category ON claude_memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON claude_memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memories_relevance ON claude_memories(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON claude_memories(created_at DESC);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_memories_content_search ON claude_memories
  USING GIN(to_tsvector('english', title || ' ' || content));

-- ============================================================================
-- MEMORY DOMAINS - Valid domains
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_domains (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  required_context TEXT[] DEFAULT '{}'
);

-- Seed domains
INSERT INTO memory_domains (name, description, keywords, required_context) VALUES
  ('engagement', 'Daily rewards, streaks, achievements, battle pass',
   ARRAY['engagement', 'daily', 'reward', 'streak', 'achievement', 'battle pass', 'xp', 'milestone'],
   ARRAY['src/shared/config/engagement.ts', 'supabase/migrations/003_engagement_features.sql']),
  ('game', 'Game logic, snake mechanics, scoring',
   ARRAY['game', 'snake', 'score', 'level', 'spawn', 'collision', 'gameplay'],
   ARRAY['src/shared/config/game.ts']),
  ('architecture', 'Server authority, database, migrations',
   ARRAY['architecture', 'server authority', 'client', 'database', 'migration', 'schema'],
   ARRAY[]::text[]),
  ('platform', 'Hooks, agents, tooling, CLAUDE.md',
   ARRAY['hook', 'platform', 'claude', 'agent', 'memory', 'context'],
   ARRAY['CLAUDE.md']),
  ('security', 'Authentication, encryption, validation',
   ARRAY['security', 'auth', 'password', 'token', 'encrypt', 'validate', 'sanitize', 'login'],
   ARRAY[]::text[]),
  ('api', 'API routes, endpoints, requests',
   ARRAY['api', 'endpoint', 'route', 'request', 'response'],
   ARRAY[]::text[]),
  ('react', 'React components, hooks, state',
   ARRAY['react', 'component', 'useeffect', 'usestate'],
   ARRAY[]::text[]),
  ('best_practices', 'General coding best practices',
   ARRAY['best practice', 'pattern', 'clean code'],
   ARRAY[]::text[])
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- MEMORY ACCESS LOG - Track usage for relevance
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id UUID NOT NULL REFERENCES claude_memories(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL CHECK (access_type IN ('retrieved', 'applied', 'updated')),
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_access_memory ON memory_access_log(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_access_time ON memory_access_log(created_at DESC);

-- ============================================================================
-- FUNCTIONS - Helper functions
-- ============================================================================

-- Search memories by text
CREATE OR REPLACE FUNCTION search_memories(
  search_query TEXT,
  domain_filter TEXT DEFAULT NULL,
  result_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  domain TEXT,
  title TEXT,
  summary TEXT,
  relevance_score DECIMAL,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.domain,
    m.title,
    m.summary,
    m.relevance_score,
    ts_rank(to_tsvector('english', m.title || ' ' || m.content), plainto_tsquery('english', search_query)) as rank
  FROM claude_memories m
  WHERE
    to_tsvector('english', m.title || ' ' || m.content) @@ plainto_tsquery('english', search_query)
    AND (domain_filter IS NULL OR m.domain = domain_filter)
  ORDER BY rank DESC, m.relevance_score DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Increment times_applied and update relevance
CREATE OR REPLACE FUNCTION apply_memory(memory_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE claude_memories
  SET
    times_applied = times_applied + 1,
    relevance_score = relevance_score + 0.1,
    last_accessed_at = NOW(),
    updated_at = NOW()
  WHERE id = memory_uuid;

  INSERT INTO memory_access_log (memory_id, access_type)
  VALUES (memory_uuid, 'applied');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE claude_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;

-- Public read for all (memories are shared knowledge)
CREATE POLICY memories_public_read ON claude_memories FOR SELECT USING (true);
CREATE POLICY domains_public_read ON memory_domains FOR SELECT USING (true);

-- Service role only for writes (only Claude/system can write)
CREATE POLICY memories_service_write ON claude_memories
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY access_log_service_write ON memory_access_log
  FOR ALL USING (auth.role() = 'service_role');
