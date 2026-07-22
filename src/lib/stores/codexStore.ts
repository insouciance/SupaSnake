/** Client state for the free-for-everyone Genome Codex. */

import { create } from 'zustand';
import type { CodexPayload } from '@/app/api/codex/utils';
import { GAME_CONFIG } from '@/shared/config/game';

interface CodexState {
  live: boolean;
  unlocked: boolean;
  bankedRuns: number;
  unlockAt: number;
  data: CodexPayload | null;
  isLoading: boolean;
  error: string | null;
  fetchCodex: (accessToken: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  live: false,
  unlocked: false,
  bankedRuns: 0,
  unlockAt: GAME_CONFIG.genome.ftue.splicesAt,
  data: null as CodexPayload | null,
  isLoading: false,
  error: null as string | null,
};

export const useCodexStore = create<CodexState>((set) => ({
  ...initialState,
  fetchCodex: async (accessToken) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/codex', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load the Codex');
      }
      set({
        live: payload.live === true,
        unlocked: payload.live === true && payload.unlocked !== false,
        bankedRuns:
          typeof payload.bankedRuns === 'number'
            ? Math.max(0, Math.floor(payload.bankedRuns))
            : 0,
        unlockAt:
          typeof payload.unlockAt === 'number'
            ? Math.max(0, Math.floor(payload.unlockAt))
            : GAME_CONFIG.genome.ftue.splicesAt,
        data:
          payload.live === true && payload.unlocked !== false
            ? (payload as CodexPayload)
            : null,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load the Codex',
      });
    }
  },
  reset: () => set({ ...initialState }),
}));
