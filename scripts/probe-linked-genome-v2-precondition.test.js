const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = join(
  process.cwd(),
  'scripts/probe-linked-genome-v2-precondition.sh'
);
const PROJECT_ID = 'gmpwyzqafoyowndbvlma';
const ZERO_SOURCES = {
  runContext: 0,
  startManifest: 0,
  startManifestDraft: 0,
  checkpoint: 0,
  terminalFacts: 0,
  settledGenome: 0,
};

describe('linked Genome v2 first-release precondition', () => {
  let fakeBin;

  beforeAll(() => {
    fakeBin = mkdtempSync(join(tmpdir(), 'supasnake-v2-preflight-curl-'));
    const fakeCurl = join(fakeBin, 'curl');
    writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash
set -euo pipefail
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
case "\${FAKE_CURL_CASE:?}" in
  success)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '201'
    ;;
  http_error)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '403'
    ;;
  malformed)
    printf 'not-json' > "$output"
    printf '201'
    ;;
  transport)
    exit 7
    ;;
esac
`,
      'utf8'
    );
    chmodSync(fakeCurl, 0o755);
  });

  afterAll(() => {
    rmSync(fakeBin, { recursive: true, force: true });
  });

  function response({
    status = 'clear',
    v2SessionCount = 0,
    bySource = ZERO_SOURCES,
  } = {}) {
    return JSON.stringify([
      {
        genome_v2_preflight: { status, v2SessionCount, bySource },
      },
    ]);
  }

  function runProbe(testCase, body = '', projectId = PROJECT_ID) {
    return spawnSync('bash', [SCRIPT], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        SUPABASE_ACCESS_TOKEN: 'test-management-token',
        SUPABASE_PROJECT_ID: projectId,
        FAKE_CURL_CASE: testCase,
        FAKE_CURL_BODY: body,
      },
    });
  }

  it('accepts only the exact aggregate zero-session sentinel', () => {
    const result = runProbe('success', response());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no durable v2 session exists');
    expect(result.stderr).toBe('');
  });

  it('blocks when any durable source contains Genome v2 evidence', () => {
    const result = runProbe('success', response({
      status: 'blocked',
      v2SessionCount: 1,
      bySource: { ...ZERO_SOURCES, checkpoint: 1 },
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exact zero-session sentinel');
    expect(result.stderr).toContain('"source":"checkpoint","count":1');
    expect(result.stderr).not.toContain('test-management-token');
  });

  it('rejects an unexpected project before making a request', () => {
    const result = runProbe('success', response(), 'abcdefghijklmnopqrst');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected project');
  });

  it('reports a bounded Management API error without exposing credentials', () => {
    const detail = 'x'.repeat(1500);
    const result = runProbe(
      'http_error',
      JSON.stringify({ message: 'read-only query failed', details: detail })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('returned HTTP 403');
    expect(result.stderr).toContain('read-only query failed');
    expect(result.stderr).not.toContain(detail);
    expect(result.stderr).not.toContain('test-management-token');
  });

  it('fails closed on malformed success and transport failure', () => {
    const malformed = runProbe('malformed');
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain('non-JSON success body');

    const transport = runProbe('transport');
    expect(transport.status).toBe(7);
    expect(transport.stderr).toContain('failed before an HTTP response (curl 7)');
  });
});
