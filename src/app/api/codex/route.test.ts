/** @jest-environment node */

var mockAuth: jest.Mock;
var mockFrom: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockAuth(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { GENOME_V2_GENES } from '@/shared/game/genes';
import { GENOME_V2_SPLICE_IDS } from '@/shared/game/genomeV2';

const PLAYER_ID = 'player-1';

/** `.eq()` calls made against the per-gene stats query, in order. */
let sessionQueryEqCalls: [string, unknown][] = [];

function request() {
  return new NextRequest('http://localhost:3000/api/codex', {
    headers: { authorization: 'Bearer token' },
  });
}

function mockDatabase(
  options: {
    codexError?: object;
    bankedRuns?: number;
    /** Extra `player_codex` rows on top of the gold_trail gene discovery. */
    extraRows?: { discovery_type: string; entry_id: string }[];
  } = {}
) {
  mockAuth.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'players') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: PLAYER_ID }, error: null }),
          }),
        }),
      };
    }
    if (table === 'player_codex') {
      return {
        select: () => ({
          eq: async () => ({
            data: options.codexError
              ? null
              : [
                  {
                    discovery_type: 'gene',
                    entry_id: 'gold_trail',
                    first_discovered_at: '2026-07-01T00:00:00Z',
                  },
                  ...(options.extraRows ?? []).map((row) => ({
                    ...row,
                    first_discovered_at: '2026-07-02T00:00:00Z',
                  })),
                ],
            error: options.codexError ?? null,
          }),
        }),
      };
    }
    if (table === 'codex_first_discoveries') {
      return {
        select: async () => ({ data: [], error: null }),
      };
    }
    if (table === 'game_sessions') {
      const countQuery = {
        eq: () => countQuery,
        not: async () => ({
          count: options.bankedRuns ?? 20,
          error: null,
        }),
      };
      const sessionQuery = {
        eq: (column: string, value: unknown) => {
          sessionQueryEqCalls.push([column, value]);
          return sessionQuery;
        },
        not: () => sessionQuery,
        order: () => sessionQuery,
        limit: async () => ({
          data: [
            {
              extracted: true,
              genome: { v: 1, picks: [{ id: 'gold_trail' }], splices: [] },
            },
          ],
          error: null,
        }),
      };
      return {
        select: (_columns: string, queryOptions?: { head?: boolean }) =>
          queryOptions?.head ? countQuery : sessionQuery,
      };
    }
    if (table === 'player_cosmetics') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('GET /api/codex', () => {
  beforeEach(() => {
    mockAuth = jest.fn();
    mockFrom = jest.fn();
    sessionQueryEqCalls = [];
  });

  it('requires authentication', async () => {
    expect(
      (await GET(new NextRequest('http://localhost:3000/api/codex'))).status
    ).toBe(401);
  });

  it('returns private discoveries and bounded session stats without a premium check', async () => {
    mockDatabase();
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.live).toBe(true);
    expect(body.unlocked).toBe(true);
    expect(body.genes.find((gene: { id: string }) => gene.id === 'gold_trail')).toMatchObject({
      discovered: true,
      picks: 1,
      banks: 1,
    });
    expect(mockFrom).not.toHaveBeenCalledWith('premium_subscriptions');
  });

  /**
   * REWRITTEN, not deleted (WP-2.07a). This test was the only guard on the
   * discovery gate, and the gate is being kept — what changed is what it
   * gates. It used to assert that a sub-15-bank player received NO catalog
   * at all (`toEqual({live, unlocked, bankedRuns, unlockAt})` exactly). The
   * Codex is a lexicon now: the rules always ship, and `unlocked` is only a
   * label for the discovery layer. So the narrower promise is asserted
   * here — the catalog arrives and the gate is still reported honestly.
   */
  it('ships the active v2 catalog and reports immediate discovery recording', async () => {
    mockDatabase({ bankedRuns: 0 });
    const response = await GET(request());
    const body = await response.json();

    // The gate is reported, not applied to the catalog.
    expect(response.status).toBe(200);
    expect(body.live).toBe(true);
    expect(body.unlocked).toBe(true);
    expect(body.bankedRuns).toBe(0);
    expect(body.unlockAt).toBe(0);

    // Every rule is present and readable before the first BANK.
    expect(body.genes).toHaveLength(Object.keys(GENOME_V2_GENES).length);
    expect(body.splices).toHaveLength(GENOME_V2_SPLICE_IDS.length);
    for (const gene of body.genes as { effect: string; cost: string }[]) {
      expect(gene.effect.length).toBeGreaterThan(0);
      expect(gene.cost.length).toBeGreaterThan(0);
    }

    // The discovery layer is still honest about what has been found.
    expect(
      body.genes.find((gene: { id: string }) => gene.id === 'gold_trail')
    ).toMatchObject({ discovered: true });
  });

  it('ships every tactical recipe while discovery remains honest metadata', async () => {
    mockDatabase({
      extraRows: [
        { discovery_type: 'splice', entry_id: 'splice_dragon_hoard' },
      ],
    });
    const body = await (await GET(request())).json();
    const splices = body.splices as {
      id: string;
      name: string;
      effect: string;
      cost: string;
      discovered: boolean;
      parents: string[] | null;
    }[];

    const found = splices.find((s) => s.id === 'splice_dragon_hoard')!;
    expect(found.discovered).toBe(true);
    expect(found.parents).toEqual(['gold_trail', 'compound_interest']);

    // Undiscovered: recipe, name, effect and cost are all rules and ship.
    const undiscovered = splices.filter((s) => !s.discovered);
    expect(undiscovered.length).toBeGreaterThan(0);
    for (const splice of undiscovered) {
      expect(splice.parents).toHaveLength(2);
      expect(splice.name).not.toBe('???');
      expect(splice.effect.length).toBeGreaterThan(0);
      expect(splice.cost.length).toBeGreaterThan(0);
    }
  });

  it('never counts Free Play runs in the per-gene stats', async () => {
    // Free Play grants the entire pool, so a practice run would inflate the
    // "N picks · M banked" line on cards the player was never offered.
    mockDatabase();
    await GET(request());
    const sessionEqCalls = sessionQueryEqCalls.map(([column]) => column);
    expect(sessionEqCalls).toContain('is_free_play');
  });

  it('degrades to live:false before migration 031', async () => {
    mockDatabase({
      codexError: { code: '42P01', message: 'relation player_codex does not exist' },
    });
    const response = await GET(request());
    expect(await response.json()).toEqual({ live: false });
  });
});
