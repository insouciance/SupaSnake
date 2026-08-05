'use client';

/**
 * useSnakeCosmetics - the chamber's wardrobe, held where the server holds it.
 *
 * Reads GET /api/player/cosmetics, writes through
 * POST /api/player/cosmetics/equip, and keeps NOTHING in browser storage:
 * cosmetics are identity and identity is server-authoritative (Constitution
 * R11). A client-owned loadout would be the first cosmetic a player could
 * grant themselves.
 *
 * ── THE PREVIEW CONTRACT ─────────────────────────────────────────────────
 *
 * `displayLoadout` is what the chamber paints. It is the server's answer,
 * overlaid by (a) whatever the player is currently hovering, and (b) an
 * in-flight equip. Both overlays are pictures, not facts:
 *
 *   - the hover overlay is dropped the moment the pointer leaves;
 *   - the in-flight overlay is REPLACED by the server's answer, and on a
 *     refusal it is dropped and the refusal is surfaced.
 *
 * The distinction matters because the alternative — keeping the optimistic
 * paint after a refusal — is a client showing a player a cosmetic the server
 * says they do not have. Doctrine FM-2: report the reason, do not swallow it
 * into a generic state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EMPTY_SNAKE_COSMETIC_CATALOG,
  parseSnakeCosmeticCatalog,
  previewLoadout,
  snakeCosmeticAction,
  type SnakeCosmeticCatalog,
  type SnakeCosmeticItem,
  type SnakeCosmeticLoadout,
} from '@/lib/cosmetics/snakeCosmetics';

/** Player-facing refusals. Plain words; never a status code, never a stack. */
const EQUIP_MESSAGES: Record<string, string> = {
  not_owned: 'You do not have that one yet.',
  slot_mismatch: 'That does not go there.',
  invalid_slot: 'That does not go there.',
  already_equipped: 'Already on.',
  player_not_found: 'Sign in to change your look.',
};

const EQUIP_FALLBACK = 'Could not change that. Try again.';

export interface UseSnakeCosmetics {
  catalog: SnakeCosmeticCatalog;
  /** What the chamber should paint right now, previews included. */
  displayLoadout: SnakeCosmeticLoadout;
  loading: boolean;
  busy: boolean;
  error: string | null;
  preview: (item: SnakeCosmeticItem | null) => void;
  equip: (item: SnakeCosmeticItem) => Promise<void>;
  refresh: () => void;
}

export function useSnakeCosmetics(token: string | undefined): UseSnakeCosmetics {
  const [catalog, setCatalog] = useState<SnakeCosmeticCatalog>(
    EMPTY_SNAKE_COSMETIC_CATALOG
  );
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<SnakeCosmeticItem | null>(null);
  const [pending, setPending] = useState<SnakeCosmeticItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Guards a late response from an unmounted component and from overwriting a
  // newer answer with an older one.
  const generation = useRef(0);

  useEffect(() => {
    if (!token) {
      setCatalog(EMPTY_SNAKE_COSMETIC_CATALOG);
      return;
    }
    const mine = ++generation.current;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch('/api/player/cosmetics', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || mine !== generation.current) return;
        if (!res.ok) {
          // A wardrobe that cannot load is a bare snake, not a broken Home.
          setCatalog(EMPTY_SNAKE_COSMETIC_CATALOG);
          return;
        }
        setCatalog(parseSnakeCosmeticCatalog(await res.json()));
      } catch {
        if (!cancelled && mine === generation.current) {
          setCatalog(EMPTY_SNAKE_COSMETIC_CATALOG);
        }
      } finally {
        if (!cancelled && mine === generation.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const preview = useCallback((item: SnakeCosmeticItem | null) => {
    // Only an item the player could actually put on previews. Showing a
    // locked item on the snake would be the menu making a promise the equip
    // call is about to refuse.
    if (item && snakeCosmeticAction(item) === 'equip') {
      setHovered(item);
      return;
    }
    setHovered(null);
  }, []);

  const equip = useCallback(
    async (item: SnakeCosmeticItem) => {
      const action = snakeCosmeticAction(item);
      if (action !== 'equip' && action !== 'unequip') return;
      if (!token) {
        setError(EQUIP_MESSAGES.player_not_found);
        return;
      }

      setBusy(true);
      setError(null);
      setPending(item);
      setHovered(null);

      try {
        const res = await fetch('/api/player/cosmetics/equip', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            slot: item.slot,
            position: 1,
            // Tapping what is already on takes it off — one control, two
            // directions, which is what a wardrobe does.
            cosmeticId: action === 'unequip' ? null : item.id,
          }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = typeof body?.error === 'string' ? body.error : '';
          setError(EQUIP_MESSAGES[code] ?? EQUIP_FALLBACK);
          return;
        }

        // The server has spoken. Adopt its answer rather than trusting the
        // optimistic paint: re-read, so `equipped`/`owned` on every row is
        // what the database says and not what this client inferred.
        refresh();
      } catch {
        setError(EQUIP_FALLBACK);
      } finally {
        setBusy(false);
        setPending(null);
      }
    },
    [token, refresh]
  );

  const displayLoadout = useMemo(() => {
    let loadout = catalog.loadout;
    if (pending) loadout = previewLoadout(loadout, pending);
    if (hovered) loadout = previewLoadout(loadout, hovered);
    return loadout;
  }, [catalog.loadout, hovered, pending]);

  return {
    catalog,
    displayLoadout,
    loading,
    busy,
    error,
    preview,
    equip,
    refresh,
  };
}

export default useSnakeCosmetics;
