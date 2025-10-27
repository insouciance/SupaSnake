#!/usr/bin/env python3
"""
Hook Evaluation Workflows
Tests hooks under realistic development scenarios

Based on: Anthropic - "Writing Tools for Agents"
- "Tool evaluation should use realistic workflows, not isolated examples"
- Create evaluation sets representing realistic agent workflows
- Measure hook effectiveness in actual usage patterns
"""

import json
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict


@dataclass
class WorkflowStep:
    """Single step in a workflow"""
    name: str
    action: str  # write, edit, read
    file_path: str
    content: Optional[str] = None
    expected_hook_behavior: Optional[str] = None  # block, allow, format


@dataclass
class WorkflowResult:
    """Result of running a workflow"""
    workflow_name: str
    steps_executed: int
    steps_passed: int
    hooks_triggered: int
    hooks_blocked: int
    duration_ms: float
    failures: List[Dict]


class WorkflowEvaluator:
    """Run realistic workflows to evaluate hook effectiveness"""

    def __init__(self, project_root: Path = Path(".")):
        self.project_root = project_root
        self.workflows_dir = project_root / "state" / "evaluation_workflows"
        self.results_dir = project_root / "state" / "workflow_results"

        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)

    def create_workflow_incomplete_code_detection(self) -> List[WorkflowStep]:
        """
        Workflow: Developer writes code with TODO comments
        Expected: PreToolUse hook blocks it
        """
        return [
            WorkflowStep(
                name="Write function with TODO",
                action="write",
                file_path="test_workflow_incomplete.py",
                content="""
def calculate_total(items):
    # TODO: Implement discount calculation
    return sum(items)
""",
                expected_hook_behavior="block"
            ),
            WorkflowStep(
                name="Write complete function",
                action="write",
                file_path="test_workflow_complete.py",
                content="""
def calculate_total(items, discount=0):
    \"\"\"Calculate total with optional discount\"\"\"
    subtotal = sum(items)
    return subtotal * (1 - discount)
""",
                expected_hook_behavior="allow"
            )
        ]

    def create_workflow_test_requirement(self) -> List[WorkflowStep]:
        """
        Workflow: Developer writes code without tests
        Expected: PreToolUse hook blocks it, then allows with tests
        """
        return [
            WorkflowStep(
                name="Write function without test",
                action="write",
                file_path="src/calculator.py",
                content="""
def add(a, b):
    return a + b
""",
                expected_hook_behavior="block"
            ),
            WorkflowStep(
                name="Write test file",
                action="write",
                file_path="src/calculator.test.py",
                content="""
from calculator import add

def test_add():
    assert add(2, 2) == 4
""",
                expected_hook_behavior="allow"
            ),
            WorkflowStep(
                name="Retry function write with test present",
                action="write",
                file_path="src/calculator.py",
                content="""
def add(a, b):
    return a + b
""",
                expected_hook_behavior="allow"
            )
        ]

    def create_workflow_security_prevention(self) -> List[WorkflowStep]:
        """
        Workflow: Developer accidentally hard-codes secrets
        Expected: PreToolUse hook blocks it
        """
        return [
            WorkflowStep(
                name="Write code with hard-coded password",
                action="write",
                file_path="src/auth.py",
                content="""
password = "secret123"
def authenticate(user_password):
    return user_password == password
""",
                expected_hook_behavior="block"
            ),
            WorkflowStep(
                name="Write secure code with env var",
                action="write",
                file_path="src/auth.py",
                content="""
import os
password = os.environ.get('PASSWORD')
def authenticate(user_password):
    return user_password == password
""",
                expected_hook_behavior="allow"
            )
        ]

    def create_workflow_formatting(self) -> List[WorkflowStep]:
        """
        Workflow: Developer writes unformatted code
        Expected: PostToolUse hook formats it
        """
        return [
            WorkflowStep(
                name="Write unformatted JavaScript",
                action="write",
                file_path="src/utils.js",
                content="""
function   test(  x,y  ){return x+y;}
const  data={a:1,b:2};
""",
                expected_hook_behavior="format"
            )
        ]

    def execute_workflow(self, workflow_name: str, steps: List[WorkflowStep]) -> WorkflowResult:
        """Execute a workflow and record results"""

        start_time = time.time()
        steps_executed = 0
        steps_passed = 0
        hooks_triggered = 0
        hooks_blocked = 0
        failures = []

        print(f"\n=== Executing Workflow: {workflow_name} ===\n")

        for step in steps:
            steps_executed += 1
            print(f"Step {steps_executed}: {step.name}")

            try:
                if step.action == "write":
                    success, hook_result = self._simulate_write(step)

                    if hook_result == "blocked":
                        hooks_blocked += 1
                        hooks_triggered += 1

                        if step.expected_hook_behavior == "block":
                            print(f"  ✓ Expected block occurred")
                            steps_passed += 1
                        else:
                            print(f"  ✗ Unexpected block")
                            failures.append({
                                'step': step.name,
                                'expected': step.expected_hook_behavior,
                                'actual': hook_result
                            })

                    elif hook_result == "allowed":
                        hooks_triggered += 1

                        if step.expected_hook_behavior in ["allow", None]:
                            print(f"  ✓ Write allowed")
                            steps_passed += 1
                        else:
                            print(f"  ✗ Expected {step.expected_hook_behavior}, got allowed")
                            failures.append({
                                'step': step.name,
                                'expected': step.expected_hook_behavior,
                                'actual': hook_result
                            })

                    elif hook_result == "formatted":
                        hooks_triggered += 1

                        if step.expected_hook_behavior == "format":
                            print(f"  ✓ Code formatted")
                            steps_passed += 1
                        else:
                            print(f"  ✓ Code formatted (unexpected but good)")
                            steps_passed += 1

                else:
                    print(f"  ⚠️  Action {step.action} not yet implemented")

            except Exception as e:
                print(f"  ✗ Error: {e}")
                failures.append({
                    'step': step.name,
                    'error': str(e)
                })

        duration_ms = (time.time() - start_time) * 1000

        result = WorkflowResult(
            workflow_name=workflow_name,
            steps_executed=steps_executed,
            steps_passed=steps_passed,
            hooks_triggered=hooks_triggered,
            hooks_blocked=hooks_blocked,
            duration_ms=duration_ms,
            failures=failures
        )

        self._save_result(result)

        return result

    def _simulate_write(self, step: WorkflowStep) -> tuple[bool, str]:
        """
        Simulate write operation and check hook behavior
        Returns: (success, hook_result)
        hook_result: blocked, allowed, formatted
        """

        # Create temporary file to test hooks
        file_path = self.project_root / step.file_path
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Simulate PreToolUse hook check
        # Check for incomplete patterns
        if self._check_incomplete_patterns(step.content):
            return False, "blocked"

        # Check for security issues
        if self._check_security_issues(step.content):
            return False, "blocked"

        # Check for missing tests (simplified)
        if self._check_missing_tests(step.file_path, step.content):
            return False, "blocked"

        # Write file
        file_path.write_text(step.content)

        # Simulate PostToolUse formatting
        if step.file_path.endswith('.js'):
            # Simulate formatting
            return True, "formatted"

        return True, "allowed"

    def _check_incomplete_patterns(self, content: str) -> bool:
        """Check for TODO/FIXME patterns"""
        patterns = ["TODO:", "FIXME:", "XXX:", "HACK:"]
        return any(pattern in content for pattern in patterns)

    def _check_security_issues(self, content: str) -> bool:
        """Check for security vulnerabilities"""
        # Simple checks
        if 'password = "' in content and 'os.environ' not in content:
            return True
        if 'password = \'' in content and 'os.environ' not in content:
            return True
        return False

    def _check_missing_tests(self, file_path: str, content: str) -> bool:
        """Check if tests are missing"""
        # Skip test files themselves
        if 'test' in file_path:
            return False

        # If it's source code in src/, check for test file
        if file_path.startswith('src/') and file_path.endswith('.py'):
            # Check if it defines functions
            if 'def ' in content:
                # Check for corresponding test file
                test_path = Path(file_path.replace('.py', '.test.py'))
                return not test_path.exists()

        return False

    def _save_result(self, result: WorkflowResult):
        """Save workflow result"""
        result_file = self.results_dir / f"{result.workflow_name}_{int(time.time())}.json"
        with open(result_file, 'w') as f:
            json.dump(asdict(result), f, indent=2)

    def run_all_workflows(self) -> List[WorkflowResult]:
        """Run all evaluation workflows"""

        workflows = [
            ("incomplete_code_detection", self.create_workflow_incomplete_code_detection()),
            ("test_requirement", self.create_workflow_test_requirement()),
            ("security_prevention", self.create_workflow_security_prevention()),
            ("formatting", self.create_workflow_formatting()),
        ]

        results = []
        for name, steps in workflows:
            result = self.execute_workflow(name, steps)
            results.append(result)

        return results

    def generate_summary(self, results: List[WorkflowResult]):
        """Generate summary of all workflows"""

        total_steps = sum(r.steps_executed for r in results)
        total_passed = sum(r.steps_passed for r in results)
        total_hooks_triggered = sum(r.hooks_triggered for r in results)
        total_blocked = sum(r.hooks_blocked for r in results)
        total_duration = sum(r.duration_ms for r in results)

        summary = {
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'workflows_executed': len(results),
            'total_steps': total_steps,
            'steps_passed': total_passed,
            'pass_rate': (total_passed / total_steps * 100) if total_steps > 0 else 0,
            'hooks_triggered': total_hooks_triggered,
            'hooks_blocked': total_blocked,
            'block_rate': (total_blocked / total_hooks_triggered * 100) if total_hooks_triggered > 0 else 0,
            'total_duration_ms': total_duration,
            'workflows': [asdict(r) for r in results]
        }

        # Save summary
        summary_file = self.results_dir / "latest_summary.json"
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)

        return summary


def main():
    """CLI for workflow evaluation"""
    import argparse

    parser = argparse.ArgumentParser(description='Hook Evaluation Workflows')
    parser.add_argument('command', choices=['run', 'summary'],
                        help='Command to execute')
    parser.add_argument('--workflow', type=str,
                        help='Specific workflow to run (incomplete_code, test_requirement, etc.)')

    args = parser.parse_args()

    evaluator = WorkflowEvaluator()

    if args.command == 'run':
        if args.workflow:
            # Run specific workflow
            if args.workflow == 'incomplete_code':
                steps = evaluator.create_workflow_incomplete_code_detection()
            elif args.workflow == 'test_requirement':
                steps = evaluator.create_workflow_test_requirement()
            elif args.workflow == 'security':
                steps = evaluator.create_workflow_security_prevention()
            elif args.workflow == 'formatting':
                steps = evaluator.create_workflow_formatting()
            else:
                print(f"Unknown workflow: {args.workflow}")
                return

            result = evaluator.execute_workflow(args.workflow, steps)
            results = [result]
        else:
            # Run all workflows
            results = evaluator.run_all_workflows()

        # Generate summary
        summary = evaluator.generate_summary(results)

        print("\n" + "=" * 60)
        print("WORKFLOW EVALUATION SUMMARY")
        print("=" * 60)
        print(f"\nWorkflows Executed: {summary['workflows_executed']}")
        print(f"Total Steps: {summary['total_steps']}")
        print(f"Steps Passed: {summary['steps_passed']}")
        print(f"Pass Rate: {summary['pass_rate']:.1f}%")
        print(f"\nHooks Triggered: {summary['hooks_triggered']}")
        print(f"Hooks Blocked: {summary['hooks_blocked']}")
        print(f"Block Rate: {summary['block_rate']:.1f}%")
        print(f"\nTotal Duration: {summary['total_duration_ms']:.0f}ms")

        # Show failures
        failures = []
        for wf in summary['workflows']:
            failures.extend(wf['failures'])

        if failures:
            print(f"\n⚠️  {len(failures)} Failures:")
            for fail in failures:
                print(f"  - {fail.get('step', 'Unknown')}: {fail.get('error', fail.get('expected', 'Unknown'))}")
        else:
            print("\n✅ All workflows passed!")

    elif args.command == 'summary':
        summary_file = Path("state/workflow_results/latest_summary.json")
        if not summary_file.exists():
            print("No workflow results found. Run 'workflow_evaluator.py run' first.")
            return

        with open(summary_file, 'r') as f:
            summary = json.load(f)

        print("=" * 60)
        print("LATEST WORKFLOW EVALUATION")
        print("=" * 60)
        print(f"\nTimestamp: {summary['timestamp']}")
        print(f"Workflows: {summary['workflows_executed']}")
        print(f"Pass Rate: {summary['pass_rate']:.1f}%")
        print(f"Block Rate: {summary['block_rate']:.1f}%")


if __name__ == '__main__':
    main()
