#!/usr/bin/env python3
"""
Token Consumption Tracker
Monitors and analyzes token usage across tools and operations

Based on: Anthropic research on token efficiency
- Track tokens per tool operation
- Identify high-cost operations
- Optimize token budget allocation
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class TokenConsumption:
    """Token usage for a single operation"""
    timestamp: str
    operation_type: str  # read, write, conversation, memory, etc.
    component: str  # file path, hook name, etc.
    tokens_estimated: int
    content_preview: str  # First 100 chars
    session_id: Optional[str] = None
    metadata: Optional[Dict] = None


class TokenTracker:
    """Track and analyze token consumption"""

    # Token estimation constants
    # Based on: ~4 characters per token average
    CHARS_PER_TOKEN = 4

    # Code is denser: ~3 characters per token
    CODE_CHARS_PER_TOKEN = 3

    # Structured data (JSON) is even denser: ~2.5 characters per token
    JSON_CHARS_PER_TOKEN = 2.5

    def __init__(self, log_dir: str = "state/tool_metrics"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.token_log = self.log_dir / "token_consumption.jsonl"
        self.session_summary = self.log_dir / "token_session_summary.json"

    def estimate_tokens(self, text: str, content_type: str = "text") -> int:
        """Estimate tokens for text content"""
        char_count = len(text)

        if content_type == "code":
            return int(char_count / self.CODE_CHARS_PER_TOKEN)
        elif content_type == "json":
            return int(char_count / self.JSON_CHARS_PER_TOKEN)
        else:  # text
            return int(char_count / self.CHARS_PER_TOKEN)

    def estimate_file_tokens(self, file_path: Path) -> int:
        """Estimate tokens for a file"""
        try:
            content = file_path.read_text()

            # Determine content type by extension
            suffix = file_path.suffix.lower()
            if suffix in ['.py', '.js', '.ts', '.cpp', '.java', '.go', '.rs']:
                content_type = "code"
            elif suffix in ['.json', '.jsonl']:
                content_type = "json"
            else:
                content_type = "text"

            return self.estimate_tokens(content, content_type)
        except Exception:
            return 0

    def log_consumption(self, consumption: TokenConsumption):
        """Log token consumption"""
        with open(self.token_log, 'a') as f:
            f.write(json.dumps(asdict(consumption)) + '\n')

    def log_read(self, file_path: str, content: str, session_id: Optional[str] = None):
        """Log tokens for read operation"""
        tokens = self.estimate_tokens(content, "code" if Path(file_path).suffix in ['.py', '.js', '.ts'] else "text")

        consumption = TokenConsumption(
            timestamp=datetime.utcnow().isoformat() + 'Z',
            operation_type="read",
            component=file_path,
            tokens_estimated=tokens,
            content_preview=content[:100].replace('\n', ' '),
            session_id=session_id,
            metadata={"lines": content.count('\n')}
        )

        self.log_consumption(consumption)
        return tokens

    def log_write(self, file_path: str, content: str, session_id: Optional[str] = None):
        """Log tokens for write operation"""
        tokens = self.estimate_tokens(content, "code" if Path(file_path).suffix in ['.py', '.js', '.ts'] else "text")

        consumption = TokenConsumption(
            timestamp=datetime.utcnow().isoformat() + 'Z',
            operation_type="write",
            component=file_path,
            tokens_estimated=tokens,
            content_preview=content[:100].replace('\n', ' '),
            session_id=session_id,
            metadata={"lines": content.count('\n')}
        )

        self.log_consumption(consumption)
        return tokens

    def log_conversation_turn(self, user_message: str, assistant_message: str, session_id: Optional[str] = None):
        """Log tokens for conversation exchange"""
        user_tokens = self.estimate_tokens(user_message, "text")
        assistant_tokens = self.estimate_tokens(assistant_message, "text")
        total_tokens = user_tokens + assistant_tokens

        consumption = TokenConsumption(
            timestamp=datetime.utcnow().isoformat() + 'Z',
            operation_type="conversation",
            component="exchange",
            tokens_estimated=total_tokens,
            content_preview=f"User: {user_message[:50]}",
            session_id=session_id,
            metadata={
                "user_tokens": user_tokens,
                "assistant_tokens": assistant_tokens
            }
        )

        self.log_consumption(consumption)
        return total_tokens

    def log_memory_injection(self, memory_content: str, format: str, session_id: Optional[str] = None):
        """Log tokens for memory injection"""
        tokens = self.estimate_tokens(memory_content, "text")

        consumption = TokenConsumption(
            timestamp=datetime.utcnow().isoformat() + 'Z',
            operation_type="memory_injection",
            component=f"format_{format}",
            tokens_estimated=tokens,
            content_preview=memory_content[:100].replace('\n', ' '),
            session_id=session_id,
            metadata={"format": format}
        )

        self.log_consumption(consumption)
        return tokens

    def analyze_consumption(self, days: int = 7) -> Dict:
        """Analyze token consumption patterns"""
        if not self.token_log.exists():
            return {"error": "No token consumption data"}

        # Read all consumption records
        records = []
        with open(self.token_log, 'r') as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))

        if not records:
            return {"error": "No consumption records"}

        # Filter by time window
        cutoff = datetime.now().timestamp() - (days * 86400)
        recent = [r for r in records if datetime.fromisoformat(r['timestamp'].rstrip('Z')).timestamp() > cutoff]

        if not recent:
            return {"error": f"No records in last {days} days"}

        # Aggregate by operation type
        by_operation = {}
        for record in recent:
            op_type = record['operation_type']
            if op_type not in by_operation:
                by_operation[op_type] = {
                    'count': 0,
                    'total_tokens': 0,
                    'components': {}
                }

            by_operation[op_type]['count'] += 1
            by_operation[op_type]['total_tokens'] += record['tokens_estimated']

            # Track by component
            component = record['component']
            if component not in by_operation[op_type]['components']:
                by_operation[op_type]['components'][component] = {
                    'count': 0,
                    'tokens': 0
                }
            by_operation[op_type]['components'][component]['count'] += 1
            by_operation[op_type]['components'][component]['tokens'] += record['tokens_estimated']

        # Calculate percentages and averages
        total_tokens = sum(op['total_tokens'] for op in by_operation.values())

        for op_type, stats in by_operation.items():
            stats['percentage_of_total'] = (stats['total_tokens'] / total_tokens) * 100
            stats['avg_tokens_per_operation'] = stats['total_tokens'] / stats['count']

            # Top 5 components by tokens
            components_sorted = sorted(
                stats['components'].items(),
                key=lambda x: x[1]['tokens'],
                reverse=True
            )[:5]
            stats['top_components'] = [
                {
                    'component': comp,
                    'tokens': data['tokens'],
                    'count': data['count']
                }
                for comp, data in components_sorted
            ]
            del stats['components']  # Remove full component list

        return {
            'period_days': days,
            'total_tokens': total_tokens,
            'total_operations': len(recent),
            'by_operation': by_operation,
            'avg_tokens_per_operation': total_tokens / len(recent) if recent else 0
        }

    def generate_session_summary(self, session_id: str) -> Dict:
        """Generate summary for a specific session"""
        if not self.token_log.exists():
            return {"error": "No token consumption data"}

        # Read session records
        records = []
        with open(self.token_log, 'r') as f:
            for line in f:
                if line.strip():
                    record = json.loads(line)
                    if record.get('session_id') == session_id:
                        records.append(record)

        if not records:
            return {"error": f"No records for session {session_id}"}

        # Calculate totals
        total_tokens = sum(r['tokens_estimated'] for r in records)

        # Breakdown by operation
        by_operation = {}
        for record in records:
            op_type = record['operation_type']
            if op_type not in by_operation:
                by_operation[op_type] = 0
            by_operation[op_type] += record['tokens_estimated']

        # Sort operations by token consumption
        operations_sorted = sorted(
            by_operation.items(),
            key=lambda x: x[1],
            reverse=True
        )

        return {
            'session_id': session_id,
            'total_tokens': total_tokens,
            'operation_count': len(records),
            'by_operation': {op: tokens for op, tokens in operations_sorted},
            'budget_remaining': 200000 - total_tokens,
            'budget_used_percent': (total_tokens / 200000) * 100
        }

    def find_optimization_opportunities(self) -> List[Dict]:
        """Identify opportunities to reduce token consumption"""
        analysis = self.analyze_consumption(days=7)

        if 'error' in analysis:
            return []

        opportunities = []

        # Check for high-cost operations
        for op_type, stats in analysis['by_operation'].items():
            avg_tokens = stats['avg_tokens_per_operation']

            # Flag operations >10k tokens average
            if avg_tokens > 10000:
                opportunities.append({
                    'type': 'high_cost_operation',
                    'operation': op_type,
                    'avg_tokens': avg_tokens,
                    'suggestion': f"Consider breaking {op_type} operations into smaller chunks or using pagination"
                })

            # Check for frequently repeated expensive components
            for comp in stats.get('top_components', []):
                if comp['count'] > 5 and comp['tokens'] > 50000:
                    opportunities.append({
                        'type': 'repeated_expensive',
                        'operation': op_type,
                        'component': comp['component'],
                        'total_tokens': comp['tokens'],
                        'count': comp['count'],
                        'suggestion': f"Component loaded {comp['count']} times consuming {comp['tokens']} tokens total. Consider caching or reducing scope."
                    })

        # Check memory injection efficiency
        if 'memory_injection' in analysis['by_operation']:
            mem_stats = analysis['by_operation']['memory_injection']
            if mem_stats['avg_tokens_per_operation'] > 500:
                opportunities.append({
                    'type': 'memory_inefficient',
                    'avg_tokens': mem_stats['avg_tokens_per_operation'],
                    'suggestion': "Memory injections averaging >500 tokens. Use concise format and token budgets."
                })

        return opportunities


def main():
    """CLI for token tracking"""
    import argparse

    parser = argparse.ArgumentParser(description='Token Consumption Tracker')
    parser.add_argument('command', choices=['analyze', 'session', 'optimize', 'estimate-file'],
                        help='Command to execute')
    parser.add_argument('--days', type=int, default=7,
                        help='Number of days to analyze')
    parser.add_argument('--session-id', type=str,
                        help='Session ID for session command')
    parser.add_argument('--file', type=str,
                        help='File path for estimate-file command')

    args = parser.parse_args()

    tracker = TokenTracker()

    if args.command == 'analyze':
        result = tracker.analyze_consumption(args.days)
        print(json.dumps(result, indent=2))

    elif args.command == 'session':
        if not args.session_id:
            print("Error: --session-id required for session command", file=sys.stderr)
            sys.exit(1)
        result = tracker.generate_session_summary(args.session_id)
        print(json.dumps(result, indent=2))

    elif args.command == 'optimize':
        opportunities = tracker.find_optimization_opportunities()
        if not opportunities:
            print("✅ No optimization opportunities found")
        else:
            print(f"Found {len(opportunities)} optimization opportunities:\n")
            for i, opp in enumerate(opportunities, 1):
                print(f"{i}. [{opp['type'].upper()}]")
                if 'operation' in opp:
                    print(f"   Operation: {opp['operation']}")
                if 'component' in opp:
                    print(f"   Component: {opp['component']}")
                if 'avg_tokens' in opp:
                    print(f"   Avg Tokens: {opp['avg_tokens']:.0f}")
                if 'total_tokens' in opp:
                    print(f"   Total Tokens: {opp['total_tokens']}")
                print(f"   Suggestion: {opp['suggestion']}")
                print()

    elif args.command == 'estimate-file':
        if not args.file:
            print("Error: --file required for estimate-file command", file=sys.stderr)
            sys.exit(1)
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"Error: File not found: {args.file}", file=sys.stderr)
            sys.exit(1)

        tokens = tracker.estimate_file_tokens(file_path)
        print(f"Estimated tokens for {args.file}: {tokens}")


if __name__ == '__main__':
    main()
