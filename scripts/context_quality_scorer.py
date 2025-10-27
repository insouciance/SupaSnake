#!/usr/bin/env python3
"""
Context Quality Scorer
Measures context quality and detects degradation (context rot)

Based on Anthropic research:
- Context rot occurs as length increases
- Distractors reduce performance
- Logical flow hurts retrieval (shuffled better)
- Performance degrades significantly at 5k+ tokens

Usage:
    scorer = ContextQualityScorer()
    score = scorer.score_context(messages, current_task)
    if score.should_clear:
        # Trigger /clear
"""

import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path
import json


@dataclass
class ContextScore:
    """Context quality score with recommendations"""
    overall_score: float  # 0-100, higher is better
    token_count: int
    relevant_ratio: float  # 0-1, relevant tokens / total tokens
    distractor_count: int
    age_penalty: float  # 0-1, penalty for old context
    should_clear: bool  # Recommendation to /clear
    should_delegate: bool  # Recommendation to use sub-agent
    reasons: List[str]  # Human-readable reasons for recommendation

    def __str__(self):
        status = "GOOD" if self.overall_score > 70 else "FAIR" if self.overall_score > 50 else "POOR"
        return f"""Context Quality: {self.overall_score:.1f}/100 [{status}]
Tokens: {self.token_count:,}
Relevant: {self.relevant_ratio*100:.1f}%
Distractors: {self.distractor_count}
Age Penalty: {self.age_penalty*100:.1f}%
Action: {'CLEAR' if self.should_clear else 'DELEGATE' if self.should_delegate else 'CONTINUE'}
Reasons: {', '.join(self.reasons) if self.reasons else 'None'}"""


class ContextQualityScorer:
    """Measures context quality and detects rot"""

    # Research-backed thresholds
    EARLY_DEGRADATION_THRESHOLD = 5000   # Research: degradation starts
    SIGNIFICANT_DEGRADATION = 50000       # Research: significant impact
    SEVERE_DEGRADATION = 80000            # Our new threshold (was 120k)

    # Quality score thresholds
    GOOD_QUALITY = 70.0
    FAIR_QUALITY = 50.0
    POOR_QUALITY = 30.0

    def __init__(self):
        """Initialize context quality scorer"""
        self.distractor_patterns = self._load_distractor_patterns()

    def _load_distractor_patterns(self) -> List[str]:
        """Load patterns that indicate distracting/irrelevant content"""
        return [
            # Debugging artifacts
            r'console\.log\(',
            r'print\(',
            r'debugger;',
            r'TODO:',
            r'FIXME:',
            r'XXX:',

            # Commented code (high signal of distraction)
            r'^\s*#.*\n^\s*#.*\n^\s*#.*',  # 3+ consecutive comment lines
            r'^\s*//.*\n^\s*//.*\n^\s*//.*',

            # Error traces (old errors are distractors)
            r'Traceback \(most recent call last\):',
            r'Error: .*\n\s+at .*\n\s+at .*',

            # Old tool results (can be distractors if not current)
            r'<tool_result>.*</tool_result>',

            # Verbose logs
            r'\[DEBUG\]',
            r'\[TRACE\]',
            r'\[VERBOSE\]',
        ]

    def score_context(
        self,
        context_text: str,
        current_task: Optional[str] = None,
        token_count: Optional[int] = None
    ) -> ContextScore:
        """
        Score context quality

        Args:
            context_text: Full context as text
            current_task: Current task description (for relevance)
            token_count: Token count if known (else estimated)

        Returns:
            ContextScore with overall quality and recommendations
        """

        # Estimate token count if not provided
        if token_count is None:
            token_count = self._estimate_tokens(context_text)

        # Calculate component scores
        relevant_ratio = self._calculate_relevant_ratio(context_text, current_task)
        distractor_count = self._count_distractors(context_text)
        age_penalty = self._calculate_age_penalty(token_count)

        # Calculate overall score (0-100)
        overall_score = self._calculate_overall_score(
            token_count=token_count,
            relevant_ratio=relevant_ratio,
            distractor_count=distractor_count,
            age_penalty=age_penalty
        )

        # Determine recommendations
        should_clear, should_delegate, reasons = self._make_recommendations(
            overall_score=overall_score,
            token_count=token_count,
            relevant_ratio=relevant_ratio,
            distractor_count=distractor_count
        )

        return ContextScore(
            overall_score=overall_score,
            token_count=token_count,
            relevant_ratio=relevant_ratio,
            distractor_count=distractor_count,
            age_penalty=age_penalty,
            should_clear=should_clear,
            should_delegate=should_delegate,
            reasons=reasons
        )

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count from text"""
        # Rough estimate: 1 token ≈ 0.75 words ≈ 4 characters
        return len(text) // 4

    def _calculate_relevant_ratio(
        self,
        context_text: str,
        current_task: Optional[str]
    ) -> float:
        """Calculate ratio of relevant tokens to total"""

        if not current_task:
            # Without task context, assume 60% relevance (neutral)
            return 0.6

        # Extract keywords from current task
        task_keywords = set(re.findall(r'\b\w{4,}\b', current_task.lower()))

        if not task_keywords:
            return 0.6

        # Count keyword matches in context
        context_lower = context_text.lower()
        total_words = len(re.findall(r'\b\w+\b', context_lower))

        if total_words == 0:
            return 0.0

        # Count relevant words
        relevant_count = 0
        for keyword in task_keywords:
            relevant_count += context_lower.count(keyword)

        # Calculate ratio (capped at 1.0)
        ratio = min(1.0, relevant_count / max(1, total_words / 10))

        return ratio

    def _count_distractors(self, context_text: str) -> int:
        """Count distractor patterns in context"""

        count = 0
        for pattern in self.distractor_patterns:
            matches = re.findall(pattern, context_text, re.MULTILINE)
            count += len(matches)

        return count

    def _calculate_age_penalty(self, token_count: int) -> float:
        """Calculate penalty based on context age/length"""

        # Research shows degradation starts early and accelerates
        if token_count < self.EARLY_DEGRADATION_THRESHOLD:
            return 0.0  # No penalty
        elif token_count < self.SIGNIFICANT_DEGRADATION:
            # Linear penalty 0-30%
            progress = (token_count - self.EARLY_DEGRADATION_THRESHOLD) / (
                self.SIGNIFICANT_DEGRADATION - self.EARLY_DEGRADATION_THRESHOLD
            )
            return progress * 0.3
        elif token_count < self.SEVERE_DEGRADATION:
            # Accelerating penalty 30-60%
            progress = (token_count - self.SIGNIFICANT_DEGRADATION) / (
                self.SEVERE_DEGRADATION - self.SIGNIFICANT_DEGRADATION
            )
            return 0.3 + (progress * 0.3)
        else:
            # Severe penalty 60-90%
            progress = min(1.0, (token_count - self.SEVERE_DEGRADATION) / 50000)
            return 0.6 + (progress * 0.3)

    def _calculate_overall_score(
        self,
        token_count: int,
        relevant_ratio: float,
        distractor_count: int,
        age_penalty: float
    ) -> float:
        """Calculate overall quality score (0-100)"""

        # Start with 100
        score = 100.0

        # Penalty for low relevance (0-40 points)
        relevance_score = relevant_ratio * 100
        relevance_penalty = (100 - relevance_score) * 0.4
        score -= relevance_penalty

        # Penalty for distractors (0-20 points)
        # Each distractor costs 2 points, capped at 20
        distractor_penalty = min(20, distractor_count * 2)
        score -= distractor_penalty

        # Penalty for age/length (0-40 points)
        age_penalty_points = age_penalty * 40
        score -= age_penalty_points

        return max(0.0, score)

    def _make_recommendations(
        self,
        overall_score: float,
        token_count: int,
        relevant_ratio: float,
        distractor_count: int
    ) -> Tuple[bool, bool, List[str]]:
        """
        Determine recommendations based on score

        Returns:
            (should_clear, should_delegate, reasons)
        """

        should_clear = False
        should_delegate = False
        reasons = []

        # Critical thresholds
        if token_count > self.SEVERE_DEGRADATION:
            should_clear = True
            reasons.append(f"Token count {token_count:,} exceeds severe threshold")

        if overall_score < self.POOR_QUALITY:
            should_clear = True
            reasons.append(f"Quality score {overall_score:.1f} is poor")

        # Delegate conditions
        if token_count > 60000 and not should_clear:
            should_delegate = True
            reasons.append(f"Token count {token_count:,} suggests delegating complex tasks")

        # Warning conditions (clear recommended but not critical)
        if token_count > self.SIGNIFICANT_DEGRADATION and not should_clear:
            should_clear = True
            reasons.append(f"Token count {token_count:,} shows significant degradation")

        if relevant_ratio < 0.4 and token_count > 30000:
            should_clear = True
            reasons.append(f"Low relevance ({relevant_ratio*100:.1f}%) with high token count")

        if distractor_count > 10 and token_count > 40000:
            should_clear = True
            reasons.append(f"High distractor count ({distractor_count}) degrading context")

        # Good quality message
        if not reasons:
            reasons.append("Context quality is good, continue working")

        return should_clear, should_delegate, reasons

    def export_score(self, score: ContextScore, output_path: Path) -> None:
        """Export score to JSON for monitoring"""

        data = {
            "timestamp": str(Path(__file__).stat().st_mtime),
            "score": {
                "overall": score.overall_score,
                "token_count": score.token_count,
                "relevant_ratio": score.relevant_ratio,
                "distractor_count": score.distractor_count,
                "age_penalty": score.age_penalty
            },
            "recommendations": {
                "should_clear": score.should_clear,
                "should_delegate": score.should_delegate,
                "reasons": score.reasons
            }
        }

        output_path.parent.mkdir(exist_ok=True, parents=True)
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)


def main():
    """CLI for testing context quality scorer"""

    import argparse

    parser = argparse.ArgumentParser(description='Score context quality')
    parser.add_argument('--context-file', help='File containing context text')
    parser.add_argument('--task', help='Current task description')
    parser.add_argument('--tokens', type=int, help='Token count if known')
    parser.add_argument('--export', help='Export results to JSON file')

    args = parser.parse_args()

    # Read context
    if args.context_file:
        with open(args.context_file, 'r') as f:
            context_text = f.read()
    else:
        # Read from stdin
        import sys
        context_text = sys.stdin.read()

    # Score context
    scorer = ContextQualityScorer()
    score = scorer.score_context(
        context_text=context_text,
        current_task=args.task,
        token_count=args.tokens
    )

    # Print results
    print(score)

    # Export if requested
    if args.export:
        scorer.export_score(score, Path(args.export))
        print(f"\nExported to: {args.export}")


if __name__ == '__main__':
    main()
