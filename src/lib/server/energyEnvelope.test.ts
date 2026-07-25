/**
 * Energy envelope — server authority.
 *
 * Covers the two things the pure module cannot: that exemption short-circuits
 * the ledger entirely, and that every failure mode favours the player rather
 * than quietly cutting their harvest to a quarter.
 *
 * The last block is a codebase-wide gate: it greps the whole of `src/` to
 * prove that no purchase, perk or reward path can reach the ledger. That is
 * the WP-0.01 acceptance criterion, executed rather than asserted in prose.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '@/shared/config/game';
import { consumeRunCharge, isMissingEnvelopeInfra, readChargeStatus } from './energyEnvelope';
import { NO_EXEMPTION } from '@/shared/game/energyEnvelope';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const PER_DAY = GAME_CONFIG.economy.energy.chargesPerDay;
const NOW = new Date('2026-07-25T12:00:00Z');

/** Minimal Supabase double: a `from(...).select().eq().single()` chain + rpc. */
function makeSupabase(opts: {
  ledger?: { charges_day: string | null; charges_used: number } | null;
  ledgerError?: { code?: string; message?: string } | null;
  rpcResult?: unknown;
  rpcError?: { code?: string; message?: string } | null;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: opts.rpcResult ?? null,
    error: opts.rpcError ?? null,
  });
  const single = jest.fn().mockResolvedValue({
    data: opts.ledger ?? null,
    error: opts.ledgerError ?? null,
  });
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  return {
    client: { from, rpc } as unknown as SupabaseClient,
    rpc,
    from,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('readChargeStatus — a read, and only a read', () => {
  it('resolves a stored ledger against today', async () => {
    const { client, from } = makeSupabase({
      ledger: { charges_day: '2026-07-25', charges_used: 2 },
    });
    const status = await readChargeStatus(client, 'p1', NOW);
    expect(status.remaining).toBe(PER_DAY - 2);
    // One table touch, and it is a select - never an update.
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('players');
  });

  it('reads a stale day as a full, refilled allotment', async () => {
    const { client } = makeSupabase({
      ledger: { charges_day: '2026-01-01', charges_used: PER_DAY },
    });
    const status = await readChargeStatus(client, 'p1', NOW);
    expect(status.remaining).toBe(PER_DAY);
  });

  it('degrades to a full day when the migration has not applied', async () => {
    const { client } = makeSupabase({
      ledgerError: { code: '42703', message: 'column charges_day does not exist' },
    });
    const status = await readChargeStatus(client, 'p1', NOW);
    expect(status.remaining).toBe(PER_DAY);
  });

  it('degrades to a full day on an unexpected error, and reports it', async () => {
    const Sentry = jest.requireMock('@sentry/nextjs');
    const { client } = makeSupabase({
      ledgerError: { code: '08006', message: 'connection failure' },
    });
    const status = await readChargeStatus(client, 'p1', NOW);
    expect(status.remaining).toBe(PER_DAY);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('consumeRunCharge — exemption short-circuits the ledger', () => {
  it('never calls the RPC for an exempt run', async () => {
    const { client, rpc } = makeSupabase({
      ledger: { charges_day: '2026-07-25', charges_used: 1 },
    });
    const result = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, serpentWeekId: 'week-31' },
      NOW
    );
    expect(result.state).toBe('exempt');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('leaves the allotment untouched for a Signal objective run', async () => {
    const { client, rpc } = makeSupabase({
      ledger: { charges_day: '2026-07-25', charges_used: 1 },
    });
    const result = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, signalObjectiveRunId: 'signal-1' },
      NOW
    );
    expect(result.state).toBe('exempt');
    expect(result.status.remaining).toBe(PER_DAY - 1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('exempts rewardless practice without spending a charge', async () => {
    const { client, rpc } = makeSupabase({
      ledger: { charges_day: '2026-07-25', charges_used: 0 },
    });
    const result = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, rewardless: true },
      NOW
    );
    expect(result.state).toBe('exempt');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('exempts even when charges ARE available (§8.6 full-fat rituals)', async () => {
    const { client, rpc } = makeSupabase({
      ledger: { charges_day: '2026-07-25', charges_used: 0 },
    });
    const result = await consumeRunCharge(
      client,
      'p1',
      { ...NO_EXEMPTION, serpentWeekId: 'w' },
      NOW
    );
    expect(result.state).toBe('exempt');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('consumeRunCharge — the ordinary path', () => {
  it('reports charged when the RPC took a charge', async () => {
    const { client, rpc } = makeSupabase({
      rpcResult: [{ charged: true, charges_day: '2026-07-25', charges_used: 1 }],
    });
    const result = await consumeRunCharge(client, 'p1', NO_EXEMPTION, NOW);
    expect(result.state).toBe('charged');
    expect(result.status.remaining).toBe(PER_DAY - 1);
    expect(rpc).toHaveBeenCalledWith('consume_run_charge', {
      p_player_id: 'p1',
      p_charges_per_day: PER_DAY,
    });
  });

  it('reports lean — NOT an error — when the day is spent', async () => {
    const { client } = makeSupabase({
      rpcResult: [{ charged: false, charges_day: '2026-07-25', charges_used: PER_DAY }],
    });
    const result = await consumeRunCharge(client, 'p1', NO_EXEMPTION, NOW);
    expect(result.state).toBe('lean');
    expect(result.status.remaining).toBe(0);
  });

  it('accepts a bare object as well as a single-row array', async () => {
    const { client } = makeSupabase({
      rpcResult: { charged: true, charges_day: '2026-07-25', charges_used: 3 },
    });
    const result = await consumeRunCharge(client, 'p1', NO_EXEMPTION, NOW);
    expect(result.state).toBe('charged');
    expect(result.status.remaining).toBe(PER_DAY - 3);
  });
});

describe('consumeRunCharge — failures favour the player', () => {
  it('settles FULL strength when the ledger is unreachable', async () => {
    // A server fault must never quietly cut a player's harvest to 25%.
    // Under-charging on an outage is the honest failure direction.
    const { client } = makeSupabase({
      rpcError: { code: '08006', message: 'connection failure' },
    });
    const result = await consumeRunCharge(client, 'p1', NO_EXEMPTION, NOW);
    expect(result.state).toBe('charged');
  });

  it('settles FULL strength before the migration applies', async () => {
    const { client } = makeSupabase({
      rpcError: { code: 'PGRST202', message: 'consume_run_charge not found' },
    });
    const result = await consumeRunCharge(client, 'p1', NO_EXEMPTION, NOW);
    expect(result.state).toBe('charged');
  });

  it('reports the unexpected failure to Sentry, but not the missing migration', async () => {
    const Sentry = jest.requireMock('@sentry/nextjs');
    (Sentry.captureException as jest.Mock).mockClear();

    const missing = makeSupabase({
      rpcError: { code: '42883', message: 'function consume_run_charge does not exist' },
    });
    await consumeRunCharge(missing.client, 'p1', NO_EXEMPTION, NOW);
    expect(Sentry.captureException).not.toHaveBeenCalled();

    const broken = makeSupabase({
      rpcError: { code: 'XX000', message: 'internal error' },
    });
    await consumeRunCharge(broken.client, 'p1', NO_EXEMPTION, NOW);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('isMissingEnvelopeInfra', () => {
  it('recognises the pre-migration error shapes', () => {
    for (const code of ['42P01', '42703', '42883', 'PGRST202']) {
      expect(isMissingEnvelopeInfra({ code })).toBe(true);
    }
    expect(isMissingEnvelopeInfra({ message: 'column charges_used missing' })).toBe(true);
    expect(isMissingEnvelopeInfra({ message: 'no function consume_run_charge' })).toBe(true);
  });

  it('does not swallow real failures', () => {
    expect(isMissingEnvelopeInfra(null)).toBe(false);
    expect(isMissingEnvelopeInfra({ code: '08006', message: 'connection failure' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WP-0.01 acceptance gate, executed
// ---------------------------------------------------------------------------

/**
 * Strip comments so the gates below scan CODE, not documentation. Several
 * of these files legitimately explain in prose what they no longer do
 * ("only consume_run_charge ever writes the ledger"), and a grep that
 * cannot tell an explanation from an implementation is a gate that will be
 * silenced the first time it cries wolf.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Every .ts/.tsx file under src/, excluding tests. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, acc);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name) &&
      !/\.migration\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

describe('acceptance: no purchase or perk path can grant charges', () => {
  const SRC = path.join(process.cwd(), 'src');
  const files = sourceFiles(SRC);
  const sqlDir = path.join(process.cwd(), 'supabase/migrations');
  const sqlFiles = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.join(sqlDir, f));

  it('finds at least the files it means to scan', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(sqlFiles.length).toBeGreaterThan(30);
  });

  it('writes charges_used from exactly one module', () => {
    const writers = files.filter((f) => {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      return /charges_used\s*:/.test(src) || /consume_run_charge/.test(src);
    });
    // The server helper is the only TypeScript that names the RPC or the
    // column in a write position.
    expect(writers.map((f) => path.relative(SRC, f)).sort()).toEqual([
      'lib/server/energyEnvelope.ts',
    ]);
  });

  it('has no SQL anywhere that credits the ledger', () => {
    for (const f of sqlFiles) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/charges_used\s*=\s*charges_used\s*\+\s*[^1]/);
      expect(src).not.toMatch(/charges_used\s*=\s*charges_used\s*\+\s*p_/);
    }
  });

  it('has no commerce, premium or reward module that mentions charges', () => {
    const commerce = files.filter((f) =>
      /stripe|checkout|webhook|premium|purchase|shop|contracts|achievements|daily-rewards|season|streaks/i.test(
        path.relative(SRC, f)
      )
    );
    expect(commerce.length).toBeGreaterThan(5);
    for (const f of commerce) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      expect(src).not.toMatch(/consume_run_charge/);
      expect(src).not.toMatch(/charges_used/);
      expect(src).not.toMatch(/charges_day/);
    }
  });

  it('sells no product whose rewards include energy or charges', () => {
    const products = fs.readFileSync(
      path.join(SRC, 'lib/stripe/products.ts'),
      'utf8'
    );
    // ENERGY_PRODUCTS is deleted by WP-0.09, which owns this file. What
    // WP-0.01 must guarantee is narrower and absolute: whatever a SKU still
    // claims to grant, it cannot reach the charge ledger.
    expect(products).not.toMatch(/charges/i);
  });

  it('has retired the premium energy stipend everywhere', () => {
    expect(
      fs.existsSync(path.join(SRC, 'app/api/premium/claim-stipend/route.ts'))
    ).toBe(false);
    const premiumConfig = fs.readFileSync(
      path.join(SRC, 'shared/config/premium.ts'),
      'utf8'
    );
    expect(premiumConfig).not.toMatch(/stipendEnergyPerDay\s*:/);
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      expect(src).not.toMatch(/['"`]\/api\/premium\/claim-stipend['"`]/);
    }
  });

  it('has removed the 20-minute drip and its module', () => {
    expect(fs.existsSync(path.join(SRC, 'lib/server/energyRegen.ts'))).toBe(false);
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      expect(src).not.toMatch(/calculateServerEnergy/);
      expect(src).not.toMatch(/calculateNextRegenAfterConsume/);
      expect(src).not.toMatch(/regenRateMs/);
    }
  });

  it('has no run-start energy gate left in the session route', () => {
    const route = stripComments(
      fs.readFileSync(path.join(SRC, 'app/api/game/session/route.ts'), 'utf8')
    );
    expect(route).not.toMatch(/Not enough energy/);
    expect(route).not.toMatch(/costPerGame/);
  });

  it('no longer restores energy from the offline claim (GT §9.1)', () => {
    const route = stripComments(
      fs.readFileSync(path.join(SRC, 'app/api/player/claim-offline/route.ts'), 'utf8')
    );
    expect(route).not.toMatch(/energyRestored/);
    expect(route).not.toMatch(/max_energy/);
    expect(route).not.toMatch(/\benergy\b/);
    // The clamp that destroyed purchased energy, by shape.
    expect(route).not.toMatch(/Math\.min\(\s*player\.energy/);
  });
});
