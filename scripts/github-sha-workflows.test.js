const {
  REQUIRED_PUSH_WORKFLOWS,
  classifyExactPushRun,
} = require('./github-sha-workflows.cjs');

describe('exact-SHA workflow proof', () => {
  const sha = 'a'.repeat(40);

  it('requires all four protected push workflows', () => {
    expect(REQUIRED_PUSH_WORKFLOWS).toEqual([
      'build.yml',
      'lint.yml',
      'test.yml',
      'e2e.yml',
    ]);
  });

  it('accepts only a completed successful push run for the exact SHA', () => {
    expect(classifyExactPushRun({
      workflow_runs: [
        { id: 1, head_sha: 'b'.repeat(40), head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' },
        { id: 2, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' },
        { id: 3, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' },
      ],
    }, sha)).toMatchObject({ ok: true, reason: 'success', run: { id: 3 } });
  });

  it('fails closed for missing, pending, failed, or newer non-green runs', () => {
    expect(classifyExactPushRun({ workflow_runs: [] }, sha)).toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(classifyExactPushRun({
      workflow_runs: [{ id: 4, head_sha: sha, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null }],
    }, sha)).toMatchObject({ ok: false, reason: 'status_in_progress' });
    expect(classifyExactPushRun({
      workflow_runs: [{ id: 5, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'failure' }],
    }, sha)).toMatchObject({ ok: false, reason: 'conclusion_failure' });
    expect(classifyExactPushRun({
      workflow_runs: [
        { id: 6, run_attempt: 2, created_at: '2026-07-31T09:00:00Z', head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' },
        { id: 7, run_attempt: 1, created_at: '2026-07-31T10:00:00Z', head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'cancelled' },
      ],
    }, sha)).toMatchObject({ ok: false, reason: 'conclusion_cancelled', run: { id: 7 } });
  });

  it('cannot satisfy a production proof with a push from another branch', () => {
    expect(classifyExactPushRun({
      workflow_runs: [
        { id: 8, created_at: '2026-07-31T11:00:00Z', head_sha: sha, head_branch: 'develop', event: 'push', status: 'completed', conclusion: 'success' },
      ],
    }, sha)).toMatchObject({ ok: false, reason: 'missing', run: null });
  });

  it('uses run id as the fail-closed tiebreaker for equal timestamps', () => {
    expect(classifyExactPushRun({
      workflow_runs: [
        { id: 9, run_attempt: 3, created_at: '2026-07-31T12:00:00Z', head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' },
        { id: 10, run_attempt: 1, created_at: '2026-07-31T12:00:00Z', head_sha: sha, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null },
      ],
    }, sha)).toMatchObject({ ok: false, reason: 'status_in_progress', run: { id: 10 } });
  });
});
