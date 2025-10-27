#!/usr/bin/env python3
"""
Tool Evaluation Framework
Tracks and analyzes tool usage to continuously improve effectiveness

Based on: Anthropic - "Writing Tools for Agents"
- "Tool evaluation should use realistic workflows, not isolated examples"
- Track: tokens used, performance, errors
- Iterate based on actual usage data
"""

import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import statistics


@dataclass
class ToolMetric:
    """Single tool usage metric"""
    timestamp: str
    tool_name: str
    operation: str  # read, write, execute, etc.
    success: bool
    duration_ms: float
    tokens_estimated: int
    file_path: Optional[str] = None
    error_message: Optional[str] = None
    context_size_estimate: Optional[int] = None


@dataclass
class HookMetric:
    """Single hook execution metric"""
    timestamp: str
    hook_name: str
    hook_type: str  # PreToolUse, PostToolUse, Stop, etc.
    success: bool
    duration_ms: float
    blocked: bool  # Did hook block operation?
    exit_code: int
    output_length: int  # Length of hook output
    error_message: Optional[str] = None


@dataclass
class MemoryRetrievalMetric:
    """Memory tool usage metric"""
    timestamp: str
    prompt: str
    format: str  # concise or detailed
    patterns_returned: int
    tokens_estimated: int
    relevance_scores: List[float]
    duration_ms: float
    truncated: bool


class ToolEvaluator:
    """Evaluate and track tool effectiveness"""

    def __init__(self, metrics_dir: str = "state/tool_metrics"):
        self.metrics_dir = Path(metrics_dir)
        self.metrics_dir.mkdir(parents=True, exist_ok=True)

        # Metric files
        self.tool_log = self.metrics_dir / "tool_usage.jsonl"
        self.hook_log = self.metrics_dir / "hook_execution.jsonl"
        self.memory_log = self.metrics_dir / "memory_retrieval.jsonl"
        self.summary_file = self.metrics_dir / "summary.json"

    def log_tool_usage(self, metric: ToolMetric):
        """Log tool usage metric"""
        with open(self.tool_log, 'a') as f:
            f.write(json.dumps(asdict(metric)) + '\n')

    def log_hook_execution(self, metric: HookMetric):
        """Log hook execution metric"""
        with open(self.hook_log, 'a') as f:
            f.write(json.dumps(asdict(metric)) + '\n')

    def log_memory_retrieval(self, metric: MemoryRetrievalMetric):
        """Log memory retrieval metric"""
        with open(self.memory_log, 'a') as f:
            f.write(json.dumps(asdict(metric)) + '\n')

    def _read_jsonl(self, file_path: Path) -> List[Dict]:
        """Read JSONL file"""
        if not file_path.exists():
            return []

        metrics = []
        with open(file_path, 'r') as f:
            for line in f:
                if line.strip():
                    metrics.append(json.loads(line))
        return metrics

    def analyze_tool_usage(self, days: int = 7) -> Dict[str, Any]:
        """Analyze tool usage patterns"""
        metrics = self._read_jsonl(self.tool_log)

        if not metrics:
            return {"error": "No tool metrics found"}

        # Filter by time window
        cutoff = datetime.now().timestamp() - (days * 86400)
        recent = [m for m in metrics if datetime.fromisoformat(m['timestamp']).timestamp() > cutoff]

        if not recent:
            return {"error": f"No metrics in last {days} days"}

        # Aggregate by tool
        by_tool = {}
        for m in recent:
            tool = m['tool_name']
            if tool not in by_tool:
                by_tool[tool] = {
                    'count': 0,
                    'success_count': 0,
                    'total_duration_ms': 0,
                    'total_tokens': 0,
                    'errors': []
                }

            by_tool[tool]['count'] += 1
            if m['success']:
                by_tool[tool]['success_count'] += 1
            else:
                by_tool[tool]['errors'].append(m.get('error_message', 'Unknown'))

            by_tool[tool]['total_duration_ms'] += m['duration_ms']
            by_tool[tool]['total_tokens'] += m['tokens_estimated']

        # Calculate statistics
        for tool, stats in by_tool.items():
            stats['success_rate'] = stats['success_count'] / stats['count']
            stats['avg_duration_ms'] = stats['total_duration_ms'] / stats['count']
            stats['avg_tokens'] = stats['total_tokens'] / stats['count']

        return {
            'period_days': days,
            'total_operations': len(recent),
            'by_tool': by_tool
        }

    def analyze_hook_performance(self, days: int = 7) -> Dict[str, Any]:
        """Analyze hook execution performance"""
        metrics = self._read_jsonl(self.hook_log)

        if not metrics:
            return {"error": "No hook metrics found"}

        # Filter by time window
        cutoff = datetime.now().timestamp() - (days * 86400)
        recent = [m for m in metrics if datetime.fromisoformat(m['timestamp']).timestamp() > cutoff]

        if not recent:
            return {"error": f"No metrics in last {days} days"}

        # Aggregate by hook
        by_hook = {}
        for m in recent:
            hook = m['hook_name']
            if hook not in by_hook:
                by_hook[hook] = {
                    'count': 0,
                    'success_count': 0,
                    'block_count': 0,
                    'durations_ms': [],
                    'errors': []
                }

            by_hook[hook]['count'] += 1
            if m['success']:
                by_hook[hook]['success_count'] += 1
            else:
                by_hook[hook]['errors'].append(m.get('error_message', 'Unknown'))

            if m['blocked']:
                by_hook[hook]['block_count'] += 1

            by_hook[hook]['durations_ms'].append(m['duration_ms'])

        # Calculate statistics
        for hook, stats in by_hook.items():
            stats['success_rate'] = stats['success_count'] / stats['count']
            stats['block_rate'] = stats['block_count'] / stats['count']
            stats['avg_duration_ms'] = statistics.mean(stats['durations_ms'])
            stats['p95_duration_ms'] = statistics.quantiles(stats['durations_ms'], n=20)[18] if len(stats['durations_ms']) >= 20 else max(stats['durations_ms'])
            stats['max_duration_ms'] = max(stats['durations_ms'])
            del stats['durations_ms']  # Remove raw data from output

        return {
            'period_days': days,
            'total_executions': len(recent),
            'by_hook': by_hook
        }

    def analyze_memory_effectiveness(self, days: int = 7) -> Dict[str, Any]:
        """Analyze memory retrieval effectiveness"""
        metrics = self._read_jsonl(self.memory_log)

        if not metrics:
            return {"error": "No memory metrics found"}

        # Filter by time window
        cutoff = datetime.now().timestamp() - (days * 86400)
        recent = [m for m in metrics if datetime.fromisoformat(m['timestamp']).timestamp() > cutoff]

        if not recent:
            return {"error": f"No metrics in last {days} days"}

        # Aggregate by format
        by_format = {'concise': [], 'detailed': []}
        for m in recent:
            fmt = m['format']
            if fmt in by_format:
                by_format[fmt].append(m)

        # Calculate statistics per format
        format_stats = {}
        for fmt, entries in by_format.items():
            if not entries:
                continue

            format_stats[fmt] = {
                'count': len(entries),
                'avg_patterns': statistics.mean([e['patterns_returned'] for e in entries]),
                'avg_tokens': statistics.mean([e['tokens_estimated'] for e in entries]),
                'avg_relevance': statistics.mean([
                    statistics.mean(e['relevance_scores']) if e['relevance_scores'] else 0
                    for e in entries
                ]),
                'truncation_rate': sum(1 for e in entries if e['truncated']) / len(entries),
                'avg_duration_ms': statistics.mean([e['duration_ms'] for e in entries])
            }

        # Token savings (concise vs detailed)
        token_savings = None
        if 'concise' in format_stats and 'detailed' in format_stats:
            concise_tokens = format_stats['concise']['avg_tokens']
            detailed_tokens = format_stats['detailed']['avg_tokens']
            token_savings = {
                'concise_avg': concise_tokens,
                'detailed_avg': detailed_tokens,
                'savings_percent': ((detailed_tokens - concise_tokens) / detailed_tokens) * 100,
                'research_expected': 67.0  # Anthropic: "roughly one-third the tokens"
            }

        return {
            'period_days': days,
            'total_retrievals': len(recent),
            'by_format': format_stats,
            'token_savings': token_savings
        }

    def generate_summary(self, days: int = 7) -> Dict[str, Any]:
        """Generate comprehensive evaluation summary"""

        tool_analysis = self.analyze_tool_usage(days)
        hook_analysis = self.analyze_hook_performance(days)
        memory_analysis = self.analyze_memory_effectiveness(days)

        summary = {
            'generated_at': datetime.now().isoformat(),
            'period_days': days,
            'tool_usage': tool_analysis,
            'hook_performance': hook_analysis,
            'memory_effectiveness': memory_analysis,
            'recommendations': []
        }

        # Generate recommendations based on analysis
        recommendations = []

        # Check hook performance
        if 'by_hook' in hook_analysis:
            for hook, stats in hook_analysis['by_hook'].items():
                if stats['avg_duration_ms'] > 1000:
                    recommendations.append({
                        'type': 'performance',
                        'component': hook,
                        'issue': f"Hook taking {stats['avg_duration_ms']:.0f}ms average (target: <1000ms)",
                        'action': "Optimize hook execution or reduce scope"
                    })

                if stats['success_rate'] < 0.95:
                    recommendations.append({
                        'type': 'reliability',
                        'component': hook,
                        'issue': f"Hook success rate {stats['success_rate']:.1%} (target: >95%)",
                        'action': "Investigate errors and improve error handling"
                    })

        # Check memory effectiveness
        if 'token_savings' in memory_analysis and memory_analysis['token_savings']:
            savings = memory_analysis['token_savings']
            actual_savings = savings['savings_percent']
            expected_savings = savings['research_expected']

            if abs(actual_savings - expected_savings) > 10:
                recommendations.append({
                    'type': 'validation',
                    'component': 'memory_tool',
                    'issue': f"Token savings {actual_savings:.1f}% differs from research expectation {expected_savings:.1f}%",
                    'action': "Review concise/detailed format implementation"
                })

        summary['recommendations'] = recommendations

        # Write summary to file
        with open(self.summary_file, 'w') as f:
            json.dumps(summary, f, indent=2)

        return summary


def main():
    """CLI for tool evaluation"""
    import argparse

    parser = argparse.ArgumentParser(description='Tool Evaluation Framework')
    parser.add_argument('command', choices=['analyze-tools', 'analyze-hooks', 'analyze-memory', 'summary'],
                        help='Command to execute')
    parser.add_argument('--days', type=int, default=7,
                        help='Number of days to analyze (default: 7)')
    parser.add_argument('--format', choices=['json', 'text'], default='text',
                        help='Output format')

    args = parser.parse_args()

    evaluator = ToolEvaluator()

    if args.command == 'analyze-tools':
        result = evaluator.analyze_tool_usage(args.days)
    elif args.command == 'analyze-hooks':
        result = evaluator.analyze_hook_performance(args.days)
    elif args.command == 'analyze-memory':
        result = evaluator.analyze_memory_effectiveness(args.days)
    elif args.command == 'summary':
        result = evaluator.generate_summary(args.days)

    if args.format == 'json':
        print(json.dumps(result, indent=2))
    else:
        # Text format
        if args.command == 'summary':
            print("=" * 60)
            print("TOOL EVALUATION SUMMARY")
            print("=" * 60)
            print(f"\nPeriod: Last {result['period_days']} days")
            print(f"Generated: {result['generated_at']}")

            # Tool usage
            print("\n### TOOL USAGE ###")
            if 'by_tool' in result['tool_usage']:
                for tool, stats in result['tool_usage']['by_tool'].items():
                    print(f"\n{tool}:")
                    print(f"  Operations: {stats['count']}")
                    print(f"  Success Rate: {stats['success_rate']:.1%}")
                    print(f"  Avg Duration: {stats['avg_duration_ms']:.1f}ms")
                    print(f"  Avg Tokens: {stats['avg_tokens']:.0f}")

            # Hook performance
            print("\n### HOOK PERFORMANCE ###")
            if 'by_hook' in result['hook_performance']:
                for hook, stats in result['hook_performance']['by_hook'].items():
                    print(f"\n{hook}:")
                    print(f"  Executions: {stats['count']}")
                    print(f"  Success Rate: {stats['success_rate']:.1%}")
                    print(f"  Block Rate: {stats['block_rate']:.1%}")
                    print(f"  Avg Duration: {stats['avg_duration_ms']:.1f}ms")
                    print(f"  P95 Duration: {stats['p95_duration_ms']:.1f}ms")

            # Memory effectiveness
            print("\n### MEMORY EFFECTIVENESS ###")
            if 'by_format' in result['memory_effectiveness']:
                for fmt, stats in result['memory_effectiveness']['by_format'].items():
                    print(f"\n{fmt.upper()}:")
                    print(f"  Retrievals: {stats['count']}")
                    print(f"  Avg Patterns: {stats['avg_patterns']:.1f}")
                    print(f"  Avg Tokens: {stats['avg_tokens']:.0f}")
                    print(f"  Avg Relevance: {stats['avg_relevance']:.2f}")
                    print(f"  Truncation Rate: {stats['truncation_rate']:.1%}")

            if result['memory_effectiveness'].get('token_savings'):
                savings = result['memory_effectiveness']['token_savings']
                print(f"\nToken Savings (Concise vs Detailed):")
                print(f"  Actual: {savings['savings_percent']:.1f}%")
                print(f"  Research Expected: {savings['research_expected']:.1f}%")
                status = "✅ MATCHES" if abs(savings['savings_percent'] - savings['research_expected']) < 10 else "⚠️ DIFFERS"
                print(f"  Status: {status}")

            # Recommendations
            if result['recommendations']:
                print("\n### RECOMMENDATIONS ###")
                for i, rec in enumerate(result['recommendations'], 1):
                    print(f"\n{i}. [{rec['type'].upper()}] {rec['component']}")
                    print(f"   Issue: {rec['issue']}")
                    print(f"   Action: {rec['action']}")
            else:
                print("\n### RECOMMENDATIONS ###")
                print("\n✅ No issues found - all metrics within targets")

        else:
            # Individual command output
            print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
