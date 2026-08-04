/**
 * The curriculum eligibility reader and its two write paths (WP-B).
 *
 * What this file pins:
 *
 *   - MIGRATION 067'S ABSENCE IS SILENT AND SAFE. The runbook requires the app
 *     to be deployable before its migrations apply, so a missing table or RPC
 *     must report "no curriculum state" without an alert and without an
 *     exception. Composition then answers with the complete legal Dynasty
 *     roster, which is the behaviour this feature replaces.
 *   - A REAL failure is different: it is reported to Sentry (Rule 11) and STILL
 *     degrades to no curriculum state rather than throwing. This is the
 *     opposite trade from `getGenomeRunFacts`, which refuses to degrade
 *     because its read feeds a payout; eligibility feeds no payout, and a
 *     smaller pool would be a worse answer than a larger one.
 *   - A MALFORMED PAYLOAD IS ALSO A FAILURE. An unreadable projection, or an
 *     id this build does not know, must not reach `createGenomeV2State`.
 *   - No settlement is ever blocked by a promotion that did not land.
 */

const mockCaptureException = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GENE_ELIGIBILITY_RULES_VERSION,
  grantStarterEligibility,
  isMissingGeneEligibilityInfra,
  readGeneEligibility,
  recordTrialOffer,
  resolveLearningEvent,
  selectGeneTrial,
} from './geneEligibility';
import { GENOME_V2_STARTER_POOLS } from '@/shared/game/genes';

const PLAYER = 'player-1';

interface Fixture {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  throws?: boolean;
  /** The `player_gene_eligibility` row the trial-guarantee read finds (WP-C). */
  trialRow?: Fixture;
}

function fakeClient(rpc: Fixture = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const filters: Record<string, unknown> = {};
  const row = rpc.trialRow;
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      calls.push({ name: 'select', args: columns });
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: () => {
      calls.push({ name: 'maybeSingle', args: { ...filters } });
      if (row?.throws) throw new Error('connection reset');
      return Promise.resolve({
        data: row?.data ?? null,
        error: row?.error ?? null,
      });
    },
  };
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      if (rpc.throws) throw new Error('connection reset');
      return Promise.resolve({ data: rpc.data ?? null, error: rpc.error ?? null });
    },
    from: (table: string) => {
      calls.push({ name: 'from', args: table });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

beforeEach(() => {
  mockCaptureException.mockClear();
});

describe('isMissingGeneEligibilityInfra', () => {
  it('recognises every pre-migration shape and nothing else', () => {
    for (const code of ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']) {
      expect(isMissingGeneEligibilityInfra({ code })).toBe(true);
    }
    expect(
      isMissingGeneEligibilityInfra({
        message: 'relation "player_gene_eligibility" does not exist',
      })
    ).toBe(true);
    expect(isMissingGeneEligibilityInfra(null)).toBe(false);
    expect(
      isMissingGeneEligibilityInfra({ code: '42501', message: 'permission denied' })
    ).toBe(false);
    expect(
      isMissingGeneEligibilityInfra({ code: '57014', message: 'statement timeout' })
    ).toBe(false);
  });
});

describe('readGeneEligibility', () => {
  it('reads the projection at the v2 rules version', async () => {
    const { client, calls } = fakeClient({
      data: { eligibleGeneIds: ['gold_trail', 'phoenix'], trialGeneId: 'coilkeeper' },
      trialRow: { data: { trial_offers_seen: 1 } },
    });
    const state = await readGeneEligibility(client, PLAYER);
    expect(state).toEqual({
      available: true,
      eligibleGeneIds: ['gold_trail', 'phoenix'],
      trialGeneId: 'coilkeeper',
      trialOffersRemaining: 2,
    });
    expect(calls[0]).toEqual({
      name: 'read_gene_eligibility',
      args: {
        p_player_id: PLAYER,
        p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
      },
    });
    expect(calls).toContainEqual({
      name: 'maybeSingle',
      args: {
        player_id: PLAYER,
        rules_version: GENE_ELIGIBILITY_RULES_VERSION,
        gene_id: 'coilkeeper',
        state: 'trial',
      },
    });
    expect(GENE_ELIGIBILITY_RULES_VERSION).toBe(2);
  });

  it('sorts, deduplicates and drops ids this build does not know', async () => {
    const { client } = fakeClient({
      data: {
        eligibleGeneIds: ['phoenix', 'gold_trail', 'phoenix', 'shelved_gene'],
        trialGeneId: 'also_not_a_gene',
      },
    });
    expect(await readGeneEligibility(client, PLAYER)).toEqual({
      available: true,
      eligibleGeneIds: ['gold_trail', 'phoenix'],
      trialGeneId: null,
      trialOffersRemaining: 0,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('degrades silently when the migration has not applied here yet', async () => {
    const { client } = fakeClient({
      error: { code: '42P01', message: 'relation does not exist' },
    });
    expect(await readGeneEligibility(client, PLAYER)).toEqual({
      available: false,
      eligibleGeneIds: [],
      trialGeneId: null,
      trialOffersRemaining: 0,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a real failure and still degrades rather than throwing', async () => {
    const { client } = fakeClient({
      error: { code: '42501', message: 'permission denied for function' },
    });
    expect(await readGeneEligibility(client, PLAYER)).toEqual({
      available: false,
      eligibleGeneIds: [],
      trialGeneId: null,
      trialOffersRemaining: 0,
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('treats an unreadable projection as no curriculum state', async () => {
    for (const data of [null, 'nope', [], { eligibleGeneIds: 'all' }]) {
      const { client } = fakeClient({ data });
      expect((await readGeneEligibility(client, PLAYER)).available).toBe(false);
    }
    expect(mockCaptureException).toHaveBeenCalledTimes(4);
  });

  it('survives a thrown transport error', async () => {
    const { client } = fakeClient({ throws: true });
    expect((await readGeneEligibility(client, PLAYER)).available).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe('grantStarterEligibility', () => {
  it('sends the Dynasty starter seven through the RPC', async () => {
    const { client, calls } = fakeClient();
    expect(
      await grantStarterEligibility(client, PLAYER, GENOME_V2_STARTER_POOLS.PRIMAL)
    ).toBe(true);
    expect(calls[0]).toEqual({
      name: 'grant_starter_eligibility',
      args: {
        p_player_id: PLAYER,
        p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
        p_gene_ids: [...GENOME_V2_STARTER_POOLS.PRIMAL],
      },
    });
    expect(calls[0].args).not.toBe(GENOME_V2_STARTER_POOLS.PRIMAL);
  });

  it('reports false without throwing when the write cannot land', async () => {
    const { client } = fakeClient({ error: { code: '42P01' } });
    expect(
      await grantStarterEligibility(client, PLAYER, GENOME_V2_STARTER_POOLS.CYBER)
    ).toBe(false);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('resolveLearningEvent', () => {
  it('promotes through the RPC with the session as its idempotency key', async () => {
    const { client, calls } = fakeClient({ data: { promoted: true } });
    expect(
      await resolveLearningEvent(client, PLAYER, 'coilkeeper', 'session-9', 1)
    ).toBe(true);
    expect(calls[0]).toEqual({
      name: 'resolve_learning_event',
      args: {
        p_player_id: PLAYER,
        p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
        p_gene_id: 'coilkeeper',
        p_session_id: 'session-9',
        p_learning_event_version: 1,
      },
    });
  });

  it('never blocks a settlement: a failure is reported and returned, not thrown', async () => {
    const { client } = fakeClient({
      error: { code: '40001', message: 'could not serialize access' },
    });
    expect(
      await resolveLearningEvent(client, PLAYER, 'coilkeeper', 'session-9', 1)
    ).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const thrown = fakeClient({ throws: true });
    expect(
      await resolveLearningEvent(thrown.client, PLAYER, 'coilkeeper', 'session-9', 1)
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The trial guarantee (WP-C)
// ---------------------------------------------------------------------------

describe('the trial guarantee at run start', () => {
  it('never invents a guarantee the database did not confirm', async () => {
    // Every failure shape answers zero, which composes to "the trial is an
    // ordinary candidate" — the behaviour before the guarantee existed. The
    // opposite default would hand a player forced appearances the ratified
    // three do not allow.
    for (const trialRow of [
      { error: { code: '42703', message: 'column does not exist' } },
      { error: { code: '42501', message: 'permission denied' } },
      { throws: true },
      { data: null },
      { data: { trial_offers_seen: 'two' } },
      { data: { trial_offers_seen: -1 } },
      { data: { trial_offers_seen: 3 } },
    ]) {
      const { client } = fakeClient({
        data: { eligibleGeneIds: [], trialGeneId: 'coilkeeper' },
        trialRow,
      });
      const state = await readGeneEligibility(client, PLAYER);
      expect(state.available).toBe(true);
      expect(state.trialGeneId).toBe('coilkeeper');
      expect(state.trialOffersRemaining).toBe(0);
    }
  });

  it('counts down from three and never below zero', async () => {
    for (const [seen, remaining] of [[0, 3], [1, 2], [2, 1], [3, 0], [9, 0]]) {
      const { client } = fakeClient({
        data: { eligibleGeneIds: [], trialGeneId: 'wall_rush' },
        trialRow: { data: { trial_offers_seen: seen } },
      });
      expect((await readGeneEligibility(client, PLAYER)).trialOffersRemaining)
        .toBe(remaining);
    }
  });

  it('costs no round trip for an account that is not on a trial', async () => {
    const { client, calls } = fakeClient({
      data: { eligibleGeneIds: ['gold_trail'], trialGeneId: null },
    });
    expect((await readGeneEligibility(client, PLAYER)).trialOffersRemaining)
      .toBe(0);
    expect(calls.map((call) => call.name)).toEqual(['read_gene_eligibility']);
  });
});

describe('selectGeneTrial', () => {
  it('sets the trial through the RPC and reports what is left', async () => {
    const { client, calls } = fakeClient({
      data: {
        geneId: 'coilkeeper',
        state: 'trial',
        trialOffersSeen: 1,
        changed: true,
      },
    });
    expect(await selectGeneTrial(client, PLAYER, 'coilkeeper')).toEqual({
      geneId: 'coilkeeper',
      state: 'trial',
      trialOffersRemaining: 2,
      changed: true,
    });
    expect(calls[0]).toEqual({
      name: 'select_gene_trial',
      args: {
        p_player_id: PLAYER,
        p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
        p_gene_id: 'coilkeeper',
      },
    });
  });

  it('reports an already-graduated Gene as unchanged, not as an error', async () => {
    // Switching costs nothing and loses nothing (PEO §4.4), and a Gene that
    // already reached ordinary eligibility is not demoted to a trial for it.
    const { client } = fakeClient({
      data: { geneId: 'phoenix', state: 'offer_eligible', changed: false },
    });
    expect(await selectGeneTrial(client, PLAYER, 'phoenix')).toEqual({
      geneId: 'phoenix',
      state: 'offer_eligible',
      trialOffersRemaining: 0,
      changed: false,
    });
  });

  it('answers null rather than a guessed selection when the write fails', async () => {
    const { client } = fakeClient({
      error: { code: '40001', message: 'could not serialize access' },
    });
    expect(await selectGeneTrial(client, PLAYER, 'coilkeeper')).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const thrown = fakeClient({ throws: true });
    expect(await selectGeneTrial(thrown.client, PLAYER, 'coilkeeper')).toBeNull();

    const junk = fakeClient({ data: { geneId: 'not_a_gene', state: 'trial' } });
    expect(await selectGeneTrial(junk.client, PLAYER, 'coilkeeper')).toBeNull();
  });
});

describe('recordTrialOffer', () => {
  it('consumes one appearance and returns the appearances still guaranteed', async () => {
    const { client, calls } = fakeClient({ data: 2 });
    expect(
      await recordTrialOffer(client, PLAYER, 'coilkeeper', 'session-9')
    ).toBe(2);
    expect(calls[0]).toEqual({
      name: 'record_trial_offer',
      args: {
        p_player_id: PLAYER,
        p_rules_version: GENE_ELIGIBILITY_RULES_VERSION,
        p_gene_id: 'coilkeeper',
        p_session_id: 'session-9',
      },
    });
  });

  it('never blocks a settlement', async () => {
    const { client } = fakeClient({
      error: { code: '40001', message: 'could not serialize access' },
    });
    expect(
      await recordTrialOffer(client, PLAYER, 'coilkeeper', 'session-9')
    ).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const thrown = fakeClient({ throws: true });
    expect(
      await recordTrialOffer(thrown.client, PLAYER, 'coilkeeper', 'session-9')
    ).toBeNull();
  });
});
