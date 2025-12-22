#!/usr/bin/env python3
"""
Smart Memory Retrieval
Finds relevant memories based on task context
"""

import sys
import argparse
from pathlib import Path
import re
import json

# Load environment variables for Supabase
from dotenv import load_dotenv
load_dotenv()

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from memory_tool_handler import MemoryToolHandler
except ImportError:
    print("Error: memory_tool_handler not found", file=sys.stderr)
    sys.exit(1)


class MemoryRetriever:
    """Retrieve relevant memories for current task - Supabase-first with local fallback"""

    def __init__(self):
        self.memory = MemoryToolHandler()

    def retrieve(self, prompt, limit=3, response_format="concise", min_relevance=0.0, token_budget=None):
        """
        Get most relevant memories for prompt (Supabase-first, local fallback)

        Args:
            prompt: User prompt to analyze
            limit: Maximum number of memories to return
            response_format: "concise" (1/3 tokens) or "detailed" (full content)
            min_relevance: Minimum relevance score threshold (0-1)
            token_budget: Maximum tokens to return (None = unlimited)

        Returns:
            Formatted memory string
        """
        # Analyze prompt for domain
        domain = self._analyze_domain(prompt)

        # Try Supabase search first (uses full-text search)
        if self.memory.use_supabase:
            memories = self._get_supabase_memories(prompt, domain, limit)
            if memories:
                return self._format_memories(
                    memories,
                    response_format=response_format,
                    token_budget=token_budget
                )

        # Fall back to local file search
        memories = self._get_domain_memories(domain)
        ranked = self._rank_by_relevance(memories, prompt)

        # Filter by minimum relevance
        if min_relevance > 0:
            ranked = [m for m in ranked if m['score'] >= min_relevance]

        return self._format_memories(
            ranked[:limit],
            response_format=response_format,
            token_budget=token_budget
        )

    def _extract_keywords(self, prompt):
        """Extract meaningful keywords from prompt for search"""
        # Common words to ignore
        stopwords = {
            'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
            'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must',
            'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that',
            'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
            'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
            'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
            'just', 'about', 'into', 'through', 'during', 'before', 'after',
            'above', 'below', 'between', 'under', 'again', 'further', 'then',
            'once', 'here', 'there', 'any', 'help', 'implement', 'create',
            'make', 'add', 'use', 'get', 'set', 'want', 'like', 'work',
        }

        # Extract words and filter
        words = re.findall(r'\b\w+\b', prompt.lower())
        keywords = [w for w in words if w not in stopwords and len(w) > 2]

        # Return space-separated keywords for full-text search
        return ' '.join(keywords[:5])  # Limit to 5 keywords

    def _get_supabase_memories(self, prompt, domain, limit):
        """Get memories from Supabase using full-text search"""
        try:
            # Extract keywords for better full-text search
            search_terms = self._extract_keywords(prompt)
            if not search_terms:
                search_terms = prompt  # Fallback to full prompt

            results = self.memory.search(search_terms, domain=domain, limit=limit)

            # If no results with full query, try individual keywords
            if not results and ' ' in search_terms:
                keywords = search_terms.split()
                for keyword in keywords:
                    results = self.memory.search(keyword, domain=domain, limit=limit)
                    if results:
                        break  # Found something with this keyword

            if not results:
                return []

            # Convert to standard memory format
            memories = []
            for r in results:
                memories.append({
                    'id': r.get('id'),
                    'path': f"supabase/{r.get('domain')}/{r.get('title')}",
                    'content': r.get('summary') or r.get('content', '')[:500],
                    'domain': r.get('domain', domain),
                    'title': r.get('title', 'Untitled'),
                    'score': float(r.get('relevance_score', 0) or r.get('rank', 0)),
                    'storage': 'supabase'
                })
            return memories
        except Exception as e:
            print(f"Supabase retrieval error: {e}", file=sys.stderr)
            return []

    def _analyze_domain(self, prompt):
        """Determine what domain this task relates to"""

        prompt_lower = prompt.lower()

        # Engagement keywords (daily rewards, streaks, achievements, battle pass)
        if any(word in prompt_lower for word in ['engagement', 'daily', 'reward', 'streak', 'achievement', 'battle pass', 'battlepass', 'xp', 'milestone']):
            return 'engagement'

        # Game keywords
        if any(word in prompt_lower for word in ['game', 'snake', 'score', 'level', 'spawn', 'collision', 'gameplay']):
            return 'game'

        # Architecture keywords
        if any(word in prompt_lower for word in ['architecture', 'server authority', 'client', 'database', 'migration', 'schema']):
            return 'architecture'

        # Platform/hooks keywords
        if any(word in prompt_lower for word in ['hook', 'platform', 'claude', 'agent', 'memory', 'context']):
            return 'platform'

        # Security keywords
        if any(word in prompt_lower for word in ['security', 'auth', 'password', 'token', 'encrypt', 'validate', 'sanitize', 'login']):
            return 'security'

        # Performance keywords
        if any(word in prompt_lower for word in ['performance', 'optimize', 'slow', 'fast', 'cache', 'query', 'n+1']):
            return 'performance'

        # API keywords
        if any(word in prompt_lower for word in ['api', 'endpoint', 'route', 'request', 'response']):
            return 'api'

        # React keywords
        if any(word in prompt_lower for word in ['react', 'component', 'useeffect', 'usestate', 'zustand', 'state management', 'hook', 'provider', 'context']):
            return 'react'

        # Best practices (default)
        return 'best_practices'

    def _get_domain_memories(self, domain):
        """Load memories for specific domain"""

        memories = []

        # Map domain to memory paths (expanded to include all directories)
        paths = {
            'security': ['code_patterns/security/', 'architectural_decisions/'],
            'performance': ['code_patterns/performance/'],
            'api': ['code_patterns/api/', 'architectural_decisions/'],
            'react': ['code_patterns/react/'],
            'best_practices': ['code_patterns/best_practices/'],
            'engagement': ['architectural_decisions/', 'project_knowledge/'],
            'game': ['architectural_decisions/', 'project_knowledge/'],
            'architecture': ['architectural_decisions/', 'project_knowledge/'],
            'platform': ['architectural_decisions/', 'project_knowledge/', 'knowledge_base/']
        }

        domain_paths = paths.get(domain, ['code_patterns/best_practices/'])

        for path in domain_paths:
            try:
                result = self.memory.view(path)

                if result['type'] == 'directory':
                    # Get all files in directory
                    for item in result['contents']:
                        if item.endswith('.md'):
                            file_path = f"{path}{item}"
                            try:
                                file_result = self.memory.view(file_path)
                                memories.append({
                                    'path': file_path,
                                    'content': file_result['content'],
                                    'domain': domain
                                })
                            except:
                                pass
            except:
                pass

        return memories

    def _rank_by_relevance(self, memories, prompt):
        """Rank memories by relevance to prompt"""

        prompt_words = set(prompt.lower().split())

        ranked = []
        for memory in memories:
            # Calculate relevance score
            content_lower = memory['content'].lower()
            matches = sum(1 for word in prompt_words if word in content_lower)

            # Boost recent patterns (check Times Applied)
            times_match = re.search(r'Times Applied: (\d+)', memory['content'])
            times_applied = int(times_match.group(1)) if times_match else 1

            # Score = word matches + log(usage)
            score = matches + (times_applied / 10.0)

            ranked.append({
                **memory,
                'score': score
            })

        # Sort by score descending
        return sorted(ranked, key=lambda x: x['score'], reverse=True)

    def _format_memories(self, memories, response_format="concise", token_budget=None):
        """
        Format memories for injection

        Args:
            memories: List of memory dicts
            response_format: "concise" (1/3 tokens) or "detailed" (full)
            token_budget: Maximum tokens (None = unlimited)

        Returns:
            Formatted string
        """

        if not memories:
            return ""

        output = []
        estimated_tokens = 0

        for i, mem in enumerate(memories, 1):
            # Extract key information - try multiple markdown formats
            # Format 1: # Pattern: Title
            title_match = re.search(r'# Pattern: (.+)', mem['content'])
            # Format 2: # Architectural Decision: Title
            if not title_match:
                title_match = re.search(r'# Architectural Decision: (.+)', mem['content'])
            # Format 3: Just # Title
            if not title_match:
                title_match = re.search(r'^# (.+)', mem['content'], re.MULTILINE)

            title = title_match.group(1) if title_match else mem['path'].split('/')[-1].replace('.md', '')

            # Try multiple description formats
            desc_match = re.search(r'## Description\n\n(.+?)\n\n', mem['content'], re.DOTALL)
            if not desc_match:
                desc_match = re.search(r'## Decision\n\n(.+?)\n\n', mem['content'], re.DOTALL)
            if not desc_match:
                desc_match = re.search(r'## Context\n\n(.+?)\n\n', mem['content'], re.DOTALL)
            if not desc_match:
                # Just get first paragraph after title
                desc_match = re.search(r'^# .+\n\n(.+?)\n\n', mem['content'], re.MULTILINE | re.DOTALL)

            full_description = desc_match.group(1) if desc_match else mem['content'][:200]

            # Get first sentence for concise mode
            first_sentence = full_description.split('.')[0] + '.' if '.' in full_description else full_description[:100]

            if response_format == "concise":
                # CONCISE: Title + Domain + One-liner (~1/3 tokens of detailed)
                # Anthropic research: "concise versions use roughly one-third the tokens"
                entry = f"{i}. {title} ({mem['domain']}): {first_sentence}\n"
                entry_tokens = len(entry) // 4  # Rough estimate

            else:  # detailed
                # DETAILED: Full description + example code
                # Extract example (first 5 lines)
                example_match = re.search(r'```\w+\n(.+?)```', mem['content'], re.DOTALL)
                example = ''
                if example_match:
                    example_lines = example_match.group(1).split('\n')[:5]
                    example = '\n'.join(example_lines)
                    if len(example_match.group(1).split('\n')) > 5:
                        example += '\n...'

                entry = f"""
{i}. {title}
   Domain: {mem['domain']}
   {full_description}

   Example:
   ```
{example}
   ```
"""
                entry_tokens = len(entry) // 4  # Rough estimate

            # Check token budget
            if token_budget and (estimated_tokens + entry_tokens) > token_budget:
                # Reached budget, truncate here
                output.append(f"\n[Truncated: {len(memories) - i} more patterns available]")
                break

            output.append(entry)
            estimated_tokens += entry_tokens

        return '\n'.join(output)


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(description='Retrieve relevant memories')
    parser.add_argument('--prompt', required=True, help='User prompt to analyze')
    parser.add_argument('--limit', type=int, default=3, help='Max memories to return')
    parser.add_argument('--format', choices=['concise', 'detailed'], default='concise',
                        help='Response format: concise (1/3 tokens) or detailed (full)')
    parser.add_argument('--min-relevance', type=float, default=0.0,
                        help='Minimum relevance score (0-1)')
    parser.add_argument('--token-budget', type=int, default=None,
                        help='Maximum tokens to return')

    args = parser.parse_args()

    try:
        import time
        from datetime import datetime, timezone

        start_time = time.time()

        retriever = MemoryRetriever()
        memories = retriever.retrieve(
            args.prompt,
            args.limit,
            response_format=args.format,
            min_relevance=args.min_relevance,
            token_budget=args.token_budget
        )

        duration_ms = (time.time() - start_time) * 1000

        # Estimate tokens (rough: 4 chars per token)
        tokens_estimated = len(memories) // 4

        # Count patterns returned
        patterns_returned = memories.count('\n') - memories.count('[Truncated')

        # Check if truncated
        truncated = '[Truncated' in memories

        # Extract relevance scores (if available)
        # This is a placeholder - would need to return from retrieve()
        relevance_scores = []

        # Log metrics
        metrics_dir = Path('state/tool_metrics')
        metrics_dir.mkdir(parents=True, exist_ok=True)
        log_file = metrics_dir / 'memory_retrieval.jsonl'

        metric = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'prompt': args.prompt[:100],  # Truncate long prompts
            'format': args.format,
            'patterns_returned': patterns_returned,
            'tokens_estimated': tokens_estimated,
            'relevance_scores': relevance_scores,
            'duration_ms': duration_ms,
            'truncated': truncated
        }

        with open(log_file, 'a') as f:
            f.write(json.dumps(metric) + '\n')

        print(memories)
    except Exception as e:
        print(f"Error retrieving memories: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
