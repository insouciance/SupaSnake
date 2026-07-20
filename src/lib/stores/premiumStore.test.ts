/**
 * Tests for the premium store - status hydration from /api/premium/status
 * and the idempotency-aware stipend claim flow.
 */

import { usePremiumStore, initialState } from './premiumStore';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: object) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('premiumStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePremiumStore.setState({ ...initialState });
  });

  describe('fetchStatus', () => {
    it('hydrates state from the status API', async () => {
      mockFetch.mockReturnValue(
        jsonResponse(200, {
          live: true,
          isPremium: true,
          status: 'active',
          billingInterval: 'month',
          currentPeriodEnd: '2026-08-19T00:00:00Z',
          cancelAtPeriodEnd: false,
          stipendClaimedToday: false,
          currentDrop: {
            id: 'premium_trail_ion_wake',
            name: 'Ion Wake',
            slot: 'trail',
            rarity: 'epic',
            claimed: false,
          },
        })
      );

      await usePremiumStore.getState().fetchStatus('token-1');
      const state = usePremiumStore.getState();

      expect(mockFetch).toHaveBeenCalledWith('/api/premium/status', {
        headers: { Authorization: 'Bearer token-1' },
      });
      expect(state.live).toBe(true);
      expect(state.isPremium).toBe(true);
      expect(state.billingInterval).toBe('month');
      expect(state.currentDrop?.name).toBe('Ion Wake');
      expect(state.isLoading).toBe(false);
    });

    it('records the error and never grants premium on failure', async () => {
      mockFetch.mockReturnValue(jsonResponse(500, { error: 'boom' }));

      await usePremiumStore.getState().fetchStatus('token-1');
      const state = usePremiumStore.getState();

      expect(state.isPremium).toBe(false);
      expect(state.error).toBe('boom');
    });
  });

  describe('claimStipend', () => {
    it('marks today claimed and flags the drop on success', async () => {
      usePremiumStore.setState({
        isPremium: true,
        currentDrop: {
          id: 'premium_trail_ion_wake',
          name: 'Ion Wake',
          slot: 'trail',
          rarity: 'epic',
          claimed: false,
        },
      });
      mockFetch.mockReturnValue(
        jsonResponse(200, {
          success: true,
          energy: 8,
          grantedEnergy: 3,
          dropGranted: 'premium_trail_ion_wake',
        })
      );

      const result = await usePremiumStore.getState().claimStipend('token-1');
      const state = usePremiumStore.getState();

      expect(result).toEqual({
        success: true,
        energy: 8,
        dropGranted: 'premium_trail_ion_wake',
      });
      expect(state.stipendClaimedToday).toBe(true);
      expect(state.currentDrop?.claimed).toBe(true);
    });

    it('treats already_claimed as a quiet no-op (another tab won)', async () => {
      mockFetch.mockReturnValue(jsonResponse(409, { error: 'already_claimed' }));

      const result = await usePremiumStore.getState().claimStipend('token-1');
      const state = usePremiumStore.getState();

      expect(result.success).toBe(false);
      expect(state.stipendClaimedToday).toBe(true);
      expect(state.error).toBeNull();
    });

    it('surfaces other failures without marking the day claimed', async () => {
      mockFetch.mockReturnValue(jsonResponse(403, { error: 'premium_required' }));

      const result = await usePremiumStore.getState().claimStipend('token-1');
      const state = usePremiumStore.getState();

      expect(result.success).toBe(false);
      expect(state.stipendClaimedToday).toBe(false);
      expect(state.error).toBe('premium_required');
    });
  });

  it('reset returns to the initial state', () => {
    usePremiumStore.setState({ isPremium: true, stipendClaimedToday: true });
    usePremiumStore.getState().reset();
    expect(usePremiumStore.getState().isPremium).toBe(false);
    expect(usePremiumStore.getState().stipendClaimedToday).toBe(false);
  });
});
