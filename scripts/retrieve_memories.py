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

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from memory_tool_handler import MemoryToolHandler
except ImportError:
    print("Error: memory_tool_handler not found", file=sys.stderr)
    sys.exit(1)


class MemoryRetriever:
    """Retrieve relevant memories for current task"""

    def __init__(self):
        self.memory = MemoryToolHandler()

    def retrieve(self, prompt, limit=3, response_format="concise", min_relevance=0.0, token_budget=None):
        """
        Get most relevant memories for prompt

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

        # Get memories for that domain
        memories = self._get_domain_memories(domain)

        # Rank by relevance
        ranked = self._rank_by_relevance(memories, prompt)

        # Filter by minimum relevance
        if min_relevance > 0:
            ranked = [m for m in ranked if m['score'] >= min_relevance]

        # Format top N with specified format
        return self._format_memories(
            ranked[:limit],
            response_format=response_format,
            token_budget=token_budget
        )

    def _analyze_domain(self, prompt):
        """Determine what domain this task relates to"""

        prompt_lower = prompt.lower()

        # Security keywords
        if any(word in prompt_lower for word in ['security', 'auth', 'password', 'token', 'encrypt', 'validate', 'sanitize']):
            return 'security'

        # Performance keywords
        if any(word in prompt_lower for word in ['performance', 'optimize', 'slow', 'fast', 'cache', 'query', 'n+1']):
            return 'performance'

        # API keywords
        if any(word in prompt_lower for word in ['api', 'endpoint', 'route', 'request', 'response']):
            return 'api'

        # React keywords
        if any(word in prompt_lower for word in ['react', 'component', 'hook', 'useeffect', 'usestate']):
            return 'react'

        # Best practices (default)
        return 'best_practices'

    def _get_domain_memories(self, domain):
        """Load memories for specific domain"""

        memories = []

        # Map domain to memory paths
        paths = {
            'security': ['code_patterns/security/'],
            'performance': ['code_patterns/performance/'],
            'api': ['code_patterns/api/'],
            'react': ['code_patterns/react/'],
            'best_practices': ['code_patterns/best_practices/']
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
            # Extract key information
            title_match = re.search(r'# Pattern: (.+)', mem['content'])
            title = title_match.group(1) if title_match else 'Unknown Pattern'

            desc_match = re.search(r'## Description\n\n(.+?)\n\n', mem['content'], re.DOTALL)
            full_description = desc_match.group(1) if desc_match else 'No description'

            # Get first sentence for concise mode
            first_sentence = full_description.split('.')[0] + '.' if '.' in full_description else full_description

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
        from datetime import datetime

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
            'timestamp': datetime.utcnow().isoformat() + 'Z',
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
