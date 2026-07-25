/**
 * Tests for Contracts API - mapping, pick/claim decisions, offer determinism
 */

import { describe, it, expect } from '@jest/globals';
import {
  mapContractRow,
  mapClaimRow,
  mapPickErrorStatus,
  mapClaimErrorStatus,
  computePicksRemaining,
  selectDailyOffers,
  type ContractRpcRow,
} from './utils';

/** The 6 Phase-1-active contracts of the 12-pool (migration 015) */
const ACTIVE_POOL = [
  'banker',
  'deep_run',
  'redline',
  'collector',
  'sprinter',
  'nerve',
] as const;

function buildRow(overrides: Partial<ContractRpcRow> = {}): ContractRpcRow {
  return {
    contract_id: 'banker',
    contract_type: 'extract_n',
    name: 'Banker',
    description: 'Bank 3 extractions',
    params: { count: 3 },
    reward_dna: 400,
    reward_xp: 150,
    offered_slot: 1,
    picked: false,
    progress: { current: 0, target: 3 },
    completed_at: null,
    claimed_at: null,
    ...overrides,
  };
}

describe('Contracts API logic', () => {
  describe('mapContractRow', () => {
    it('maps an unpicked offer row to camelCase', () => {
      expect(mapContractRow(buildRow())).toEqual({
        contractId: 'banker',
        contractType: 'extract_n',
        name: 'Banker',
        description: 'Bank 3 extractions',
        params: { count: 3 },
        rewardDna: 400,
        rewardXp: 150,
        offeredSlot: 1,
        picked: false,
        progress: { current: 0, target: 3 },
        completed: false,
        claimed: false,
      });
    });

    it('derives completed/claimed from the timestamp columns', () => {
      const view = mapContractRow(
        buildRow({
          picked: true,
          progress: { current: 3, target: 3 },
          completed_at: '2026-07-18T10:00:00Z',
          claimed_at: '2026-07-18T11:00:00Z',
        })
      );
      expect(view.completed).toBe(true);
      expect(view.claimed).toBe(true);
    });

    it('defaults null params/progress defensively', () => {
      const view = mapContractRow(buildRow({ params: null, progress: null }));
      expect(view.params).toEqual({});
      expect(view.progress).toEqual({ current: 0, target: 0 });
    });
  });

  describe('computePicksRemaining', () => {
    it('starts at 2 with nothing picked', () => {
      expect(
        computePicksRemaining([{ picked: false }, { picked: false }, { picked: false }])
      ).toBe(2);
    });

    it('counts down per picked contract and floors at 0', () => {
      expect(
        computePicksRemaining([{ picked: true }, { picked: false }, { picked: false }])
      ).toBe(1);
      expect(
        computePicksRemaining([{ picked: true }, { picked: true }, { picked: false }])
      ).toBe(0);
      expect(
        computePicksRemaining([{ picked: true }, { picked: true }, { picked: true }])
      ).toBe(0);
    });

    it('is 2 for an empty board (offers not yet generated)', () => {
      expect(computePicksRemaining([])).toBe(2);
    });
  });

  describe('mapClaimRow', () => {
    it('maps the claim_contract RPC row to camelCase', () => {
      expect(
        mapClaimRow({
          contract_id: 'nerve',
          dna_granted: 600,
          xp_granted: 150,
        })
      ).toEqual({
        contractId: 'nerve',
        dnaGranted: 600,
        xpGranted: 150,
      });
    });
  });

  describe('mapPickErrorStatus', () => {
    it('maps pick-limit to 409 Conflict', () => {
      expect(mapPickErrorStatus('Pick limit reached (2 per day)')).toBe(409);
    });

    it('maps unknown offers and missing player to 404', () => {
      expect(mapPickErrorStatus('Contract not offered today')).toBe(404);
      expect(mapPickErrorStatus('Player not found')).toBe(404);
    });

    it('maps validation errors to 400', () => {
      expect(mapPickErrorStatus('Pick 1 or 2 contracts')).toBe(400);
      expect(mapPickErrorStatus('Duplicate contract ids')).toBe(400);
      expect(mapPickErrorStatus(null)).toBe(400);
    });
  });

  describe('mapClaimErrorStatus', () => {
    it('maps already-claimed (idempotency) to 409', () => {
      expect(mapClaimErrorStatus('Contract already claimed')).toBe(409);
    });

    it('maps not-complete to 409 (retryable after play)', () => {
      expect(mapClaimErrorStatus('Contract not complete')).toBe(409);
    });

    it('maps unknown contract / missing player to 404', () => {
      expect(mapClaimErrorStatus('Contract not offered today')).toBe(404);
      expect(mapClaimErrorStatus('Player not found')).toBe(404);
    });

    it('maps unpicked claims and unknown errors to 400', () => {
      expect(mapClaimErrorStatus('Contract not picked')).toBe(400);
      expect(mapClaimErrorStatus(undefined)).toBe(400);
    });
  });

  describe('selectDailyOffers (mirror of offer_daily_contracts SQL)', () => {
    const player = '550e8400-e29b-41d4-a716-446655440000';
    const other = '660e8400-e29b-41d4-a716-446655440001';

    it('is deterministic: same player + date always yields the same 3', () => {
      const a = selectDailyOffers(player, '2026-07-18', ACTIVE_POOL);
      const b = selectDailyOffers(player, '2026-07-18', ACTIVE_POOL);
      expect(a).toEqual(b);
      expect(a).toHaveLength(3);
    });

    it('returns 3 distinct contracts from the active pool only', () => {
      const offers = selectDailyOffers(player, '2026-07-18', ACTIVE_POOL);
      expect(new Set(offers).size).toBe(3);
      for (const id of offers) {
        expect(ACTIVE_POOL).toContain(id);
      }
    });

    it('reshuffles across days for the same player', () => {
      const days = Array.from({ length: 10 }, (_, i) =>
        selectDailyOffers(player, `2026-07-${String(10 + i).padStart(2, '0')}`, ACTIVE_POOL).join(',')
      );
      expect(new Set(days).size).toBeGreaterThan(1);
    });

    it('differs across players on the same day (independent seeds)', () => {
      const days = Array.from({ length: 10 }, (_, i) => `2026-07-${10 + i}`);
      const differs = days.some(
        (d) =>
          selectDailyOffers(player, d, ACTIVE_POOL).join(',') !==
          selectDailyOffers(other, d, ACTIVE_POOL).join(',')
      );
      expect(differs).toBe(true);
    });

    it('caps at the pool size when the pool is small', () => {
      expect(selectDailyOffers(player, '2026-07-18', ['banker', 'nerve'])).toHaveLength(2);
    });
  });
});
