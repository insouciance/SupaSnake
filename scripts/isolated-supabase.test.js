const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * The isolated Supabase stack is started identically everywhere, and it is
 * started through the guarded script rather than by a bare `supabase start`.
 *
 * A bare start is not merely untidy. The stack publishes 54320-54322, all of
 * which sit inside the kernel's default ephemeral port range, so an outbound
 * connection can hold one of them at the moment Docker publishes it and the
 * job dies with "failed to bind host port ... address already in use". The
 * script reserves the block and retries that specific conflict; a workflow
 * that bypasses it silently reinstates the flake.
 */

function workflow(name) {
  return readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');
}

/**
 * The workflow with comment lines blanked out. Ordering has to be judged on
 * the steps that run, not on prose that happens to mention `npm ci`.
 */
function executable(name) {
  return workflow(name)
    .split('\n')
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');
}

/** The workflow split into its top-level jobs, `{ [jobId]: source }`. */
function jobs(name) {
  const source = executable(name);
  const headings = [...source.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
  return Object.fromEntries(
    headings.map((heading, index) => [
      heading[1],
      source.slice(heading.index, headings[index + 1]?.index ?? source.length),
    ])
  );
}

const START_SCRIPT = readFileSync(
  join(process.cwd(), 'scripts/isolated-supabase.sh'),
  'utf8'
);

const CONFIG = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');

/** Every workflow that brings up a local stack. */
const STACK_WORKFLOWS = ['e2e.yml', 'deploy-production.yml'];

describe('isolated Supabase startup', () => {
  it('never starts the stack with a bare `supabase start`', () => {
    for (const name of STACK_WORKFLOWS) {
      expect(workflow(name)).not.toMatch(/^\s*supabase start\b/m);
    }
  });

  it('routes every stack start through the guarded script', () => {
    const starts = STACK_WORKFLOWS.flatMap((name) =>
      workflow(name).match(/isolated-supabase\.sh start/g) ?? []
    );
    // Two in e2e.yml (sql-contracts, e2e-matrix) and one in the production
    // verify job. A new start site must add its own reservation step too.
    expect(starts).toHaveLength(3);
  });

  it('reserves the ports in every job that starts the stack, before it starts', () => {
    const checked = [];
    for (const name of STACK_WORKFLOWS) {
      for (const [jobId, source] of Object.entries(jobs(name))) {
        const start = source.indexOf('isolated-supabase.sh start');
        if (start === -1) continue;
        const reserve = source.indexOf('isolated-supabase.sh reserve-ports');
        expect(`${name}:${jobId} reserve@${reserve}`).not.toContain('@-1');
        expect(reserve).toBeLessThan(start);
        checked.push(`${name}:${jobId}`);
      }
    }
    expect(checked).toEqual([
      'e2e.yml:sql-contracts',
      'e2e.yml:e2e-matrix',
      'deploy-production.yml:verify',
    ]);
  });

  it('reserves before anything that opens outbound connections', () => {
    // The reservation only governs port assignments made after it, so within
    // its job it has to precede `npm ci`, the Playwright download and the
    // Supabase image pull.
    for (const name of STACK_WORKFLOWS) {
      for (const source of Object.values(jobs(name))) {
        const reserve = source.indexOf('isolated-supabase.sh reserve-ports');
        if (reserve === -1) continue;
        for (const opener of ['npm ci', 'playwright install']) {
          const at = source.indexOf(opener);
          if (at > -1) expect(reserve).toBeLessThan(at);
        }
      }
    }
  });

  it('derives the reserved ports from config.toml instead of restating them', () => {
    // A hardcoded list would drift the moment config.toml moved a port, and
    // the drift would only surface as the same rare bind failure.
    expect(START_SCRIPT).toMatch(/awk[\s\S]*shadow_\)\?port/);
    const literals = START_SCRIPT.match(/\b543[0-9]{2}\b/g) ?? [];
    const commentary = START_SCRIPT.split('\n')
      .filter((line) => /^\s*#/.test(line))
      .join('\n');
    for (const literal of literals) {
      expect(commentary).toContain(literal);
    }
    expect(CONFIG).toMatch(/^port = 54321$/m);
    expect(CONFIG).toMatch(/^port = 54322$/m);
    expect(CONFIG).toMatch(/^shadow_port = 54320$/m);
  });

  it('retries only a host-port bind conflict, never a real failure', () => {
    expect(START_SCRIPT).toMatch(/failed to bind host port\|address already in use/);
    expect(START_SCRIPT).toContain('unrelated to host-port binding; not retrying');
  });
});
