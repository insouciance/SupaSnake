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
  currentDrop: PremiumDrop | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStatus: (accessToken: string) => Promise<void>;
  reset: () => void;
}

export const initialState = {
  live: false,
  isPremium: false,
  status: null as string | null,
  billingInterval: null as 'month' | 'year' | null,
  currentPeriodEnd: null as string | null,
  cancelAtPeriodEnd: false,
  currentDrop: null as PremiumDrop | null,
  isLoading: false,
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

  reset: () => set({ ...initialState }),
}));
