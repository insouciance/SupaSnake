const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = join(process.cwd(), 'scripts/probe-linked-cohesive-schema.sh');
const PROJECT_ID = 'gmpwyzqafoyowndbvlma';
const CHECKS = {
  continuityConstraintsValid: true,
  continuityTriggerValid: true,
  favoriteRowsValid: true,
  favoriteTriggerValid: true,
  foundingBridgeSafe: true,
  genomeAscendanceFunctionsValid: true,
  genomeCatalogValid: true,
  genomeCodexVersionsValid: true,
  genomeDefinersHardened: true,
  genomeTablePrivilegesValid: true,
  readOnlyExecution: true,
  requiredFunctionsPresent: true,
  requiredFunctionsServiceOnly: true,
  requiredIndexesPresent: true,
  settlementBoundsAligned: true,
};

describe('linked cohesive schema probe harness', () => {
  let fakeBin;

  beforeAll(() => {
    fakeBin = mkdtempSync(join(tmpdir(), 'supasnake-probe-curl-'));
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
  ready)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '201'
    ;;
  invalid)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '201'
    ;;
  unexpected_success)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '200'
    ;;
  http_error)
    printf '%s' "\${FAKE_CURL_BODY:?}" > "$output"
    printf '400'
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

  function runProbe(testCase, body = '') {
    return spawnSync('bash', [SCRIPT], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        SUPABASE_ACCESS_TOKEN: 'test-management-token',
        SUPABASE_PROJECT_ID: PROJECT_ID,
        FAKE_CURL_CASE: testCase,
        FAKE_CURL_BODY: body,
      },
    });
  }

  function response(checks = CHECKS, status = 'ready') {
    return JSON.stringify([
      {
        cohesive_release_probe: {
          status,
          probe: 'cohesive_release_read_only_v4',
          checks,
        },
      },
    ]);
  }

  it('accepts only the exact 201 ready response', () => {
    const result = runProbe('ready', response());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('passed the read-only structural probe');
    expect(result.stderr).toBe('');
  });

  it('fails closed and identifies a false structural check', () => {
    const result = runProbe(
      'invalid',
      response({ ...CHECKS, foundingBridgeSafe: false }, 'invalid')
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not return the exact ready sentinel');
    expect(result.stderr).toContain('foundingBridgeSafe');
  });

  it('rejects an undocumented success status', () => {
    const result = runProbe('unexpected_success', response());

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('returned HTTP 200');
  });

  it('reports a bounded management API error without exposing the request', () => {
    const longDetail = 'x'.repeat(1500);
    const result = runProbe(
      'http_error',
      JSON.stringify({ message: 'database query failed', details: longDetail })
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('returned HTTP 400');
    expect(result.stderr).toContain('database query failed');
    expect(result.stderr).not.toContain(longDetail);
    expect(result.stderr).not.toContain('test-management-token');
  });

  it('fails closed on a malformed success response', () => {
    const result = runProbe('malformed');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('non-JSON success body');
  });

  it('preserves a transport failure as a failed release gate', () => {
    const result = runProbe('transport');

    expect(result.status).toBe(7);
    expect(result.stderr).toContain('failed before an HTTP response (curl 7)');
  });
});
