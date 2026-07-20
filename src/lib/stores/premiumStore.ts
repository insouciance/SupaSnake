/**
 * Premium Store - Zustand state for the SupaSnake Premium subscription
 *
 * State mirrors /api/premium/status (server-authoritative; the client
 * never derives entitlement itself). Actions call the premium API routes
 * with the caller's access token.
 */

import { create } from 'zustand';

export interface PremiumDrop {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  claimed: boolean;
}

interface PremiumState {
  // Data (from /api/premium/status)
  live: boolean;
  isPremium: boolean;
  status: string | null;
  billingInterval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stipendClaimedToday: boolean;
  currentDrop: PremiumDrop | null;

  // UI state
  isLoading: boolean;
  isClaimingStipend: boolean;
  error: string | null;

  // Actions
  fetchStatus: (accessToken: string) => Promise<void>;
  claimStipend: (
    accessToken: string
  ) => Promise<{ success: boolean; energy?: number; dropGranted?: string | null }>;
  reset: () => void;
}

export const initialState = {
  live: false,
  isPremium: false,
  status: null as string | null,
  billingInterval: null as 'month' | 'year' | null,
  currentPeriodEnd: null as string | null,
  cancelAtPeriodEnd: false,
  stipendClaimedToday: false,
  currentDrop: null as PremiumDrop | null,
  isLoading: false,
  isClaimingStipend: false,
  error: null as string | null,
};

export const usePremiumStore = create<PremiumState>((set) => ({
  ...initialState,

  fetchStatus: async (accessToken) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/premium/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load premium status');
      }
      set({
        live: data.live === true,
        isPremium: data.isPremium === true,
        status: data.status ?? null,
        billingInterval: data.billingInterval ?? null,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
        stipendClaimedToday: data.stipendClaimedToday === true,
        currentDrop: data.currentDrop ?? null,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load premium status',
      });
    }
  },

  claimStipend: async (accessToken) => {
    set({ isClaimingStipend: true, error: null });
    try {
      const response = await fetch('/api/premium/claim-stipend', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        // already_claimed just means another tab/session got there first
        if (data.error === 'already_claimed') {
          set({ stipendClaimedToday: true, isClaimingStipend: false });
          return { success: false };
        }
        throw new Error(data.error || 'Failed to claim stipend');
      }
      set((state) => ({
        stipendClaimedToday: true,
        isClaimingStipend: false,
        currentDrop:
          data.dropGranted && state.currentDrop
            ? { ...state.currentDrop, claimed: true }
            : state.currentDrop,
      }));
      return {
        success: true,
        energy: typeof data.energy === 'number' ? data.energy : undefined,
        dropGranted: data.dropGranted ?? null,
      };
    } catch (err) {
      set({
        isClaimingStipend: false,
        error: err instanceof Error ? err.message : 'Failed to claim stipend',
      });
      return { success: false };
    }
  },

  reset: () => set({ ...initialState }),
}));
