'use strict';

const REQUIRED_PUSH_WORKFLOWS = Object.freeze([
  'build.yml',
  'lint.yml',
  'test.yml',
  'e2e.yml',
]);

function newestExactPushRun(payload, sha) {
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
  return runs
    .filter((run) => run?.head_sha === sha && run?.event === 'push')
    .sort((left, right) => {
      const byAttempt = Number(right.run_attempt ?? 0) - Number(left.run_attempt ?? 0);
      if (byAttempt !== 0) return byAttempt;
      return Number(right.id ?? 0) - Number(left.id ?? 0);
    })[0] ?? null;
}

function classifyExactPushRun(payload, sha) {
  const run = newestExactPushRun(payload, sha);
  if (!run) return { ok: false, reason: 'missing', run: null };
  if (run.status !== 'completed') {
    return { ok: false, reason: `status_${run.status ?? 'unknown'}`, run };
  }
  if (run.conclusion !== 'success') {
    return {
      ok: false,
      reason: `conclusion_${run.conclusion ?? 'unknown'}`,
      run,
    };
  }
  return { ok: true, reason: 'success', run };
}

module.exports = {
  REQUIRED_PUSH_WORKFLOWS,
  classifyExactPushRun,
  newestExactPushRun,
};
