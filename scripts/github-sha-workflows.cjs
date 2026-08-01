'use strict';

const REQUIRED_PUSH_WORKFLOWS = Object.freeze([
  'build.yml',
  'lint.yml',
  'test.yml',
  'e2e.yml',
]);

function newestExactPushRun(payload, sha, branch = 'main') {
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
  return runs
    .filter((run) =>
      run?.head_sha === sha &&
      run?.event === 'push' &&
      run?.head_branch === branch
    )
    .sort((left, right) => {
      // `run_attempt` is local to one workflow run. It is not chronology: an
      // older rerun at attempt 2 must never mask a newer distinct push run at
      // attempt 1. GitHub run ids break equal/absent creation timestamps.
      const leftCreated = Date.parse(String(left.created_at ?? '')) || 0;
      const rightCreated = Date.parse(String(right.created_at ?? '')) || 0;
      const byCreated = rightCreated - leftCreated;
      if (byCreated !== 0) return byCreated;
      return Number(right.id ?? 0) - Number(left.id ?? 0);
    })[0] ?? null;
}

function classifyExactPushRun(payload, sha, branch = 'main') {
  const run = newestExactPushRun(payload, sha, branch);
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
