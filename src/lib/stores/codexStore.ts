/**
 * Client state for the free-for-everyone Genome Codex.
 *
 * `unlocked` used to decide whether there WAS a catalog. Since WP-2.07a it
 * only decides whether the discovery layer has started recording: the
 * catalog arrives at every banked-run count, so `data` is populated
 * whenever the server sent one. The two facts are now independent, and the
 * store keeps them independent.
 */

import { create } from 'zustand';
import type { CodexPayload } from '@/app/api/codex/utils';
import { GAME_CONFIG } from '@/shared/config/game';

interface CodexState {
  /** Stable auth owner for every account-derived field below. */
  ownerId: string | null;
  live: boolean;
  unlocked: boolean;
  bankedRuns: number;
  unlockAt: number;
  data: CodexPayload | null;
  isLoading: boolean;
  error: string | null;
  fetchCodex: (ownerId: string, accessToken: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  ownerId: null as string | null,
  live: false,
  unlocked: false,
  bankedRuns: 0,
  unlockAt: GAME_CONFIG.genome.ftue.splicesAt,
  data: null as CodexPayload | null,
  isLoading: false,
  error: null as string | null,
};

// A response may arrive after logout, account replacement, or a newer token
// refresh. Only the latest request under the still-current owner may commit.
let requestEpoch = 0;

export const useCodexStore = create<CodexState>((set, get) => ({
  ...initialState,
  fetchCodex: async (ownerId, accessToken) => {
    const requestId = ++requestEpoch;
    set((state) => state.ownerId === ownerId
      ? { isLoading: true, error: null }
      : { ...initialState, ownerId, isLoading: true });
    try {
      const response = await fetch('/api/codex', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load the Codex');
      }
      if (requestId !== requestEpoch || get().ownerId !== ownerId) return;
      set({
        ownerId,
        live: payload.live === true,
        unlocked: payload.live === true && payload.unlocked === true,
        bankedRuns:
          typeof payload.bankedRuns === 'number'
            ? Math.max(0, Math.floor(payload.bankedRuns))
            : 0,
        unlockAt:
          typeof payload.unlockAt === 'number'
            ? Math.max(0, Math.floor(payload.unlockAt))
            : GAME_CONFIG.genome.ftue.splicesAt,
        // The catalog is present whenever the server sent one — the
        // discovery gate no longer decides whether there is anything to
        // read. A pre-2.07a server (no `genes` array) still yields null.
        data:
          payload.live === true && Array.isArray(payload.genes)
            ? (payload as CodexPayload)
            : null,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== requestEpoch || get().ownerId !== ownerId) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load the Codex',
      });
    }
  },
  reset: () => {
    requestEpoch += 1;
    set({ ...initialState });
  },
}));
