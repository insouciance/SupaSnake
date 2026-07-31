'use client';

/**
 * IdentityPanel - the settings Identity tab (Player Identity v1
 * sections 3-5): own Player Card preview, handle management (claim /
 * 30-day change), and the equip grid of owned cosmetics per slot.
 *
 * Anti-dead-surface rules (section 7.2): slots with nothing owned render
 * a single forward-looking line - never an empty grid, never a 0-count.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { HandleClaimModal } from '@/components/identity/HandleClaimModal';
import { IconEdit } from '@/components/ui/icons';
import type { PlayerIdentity } from '@/lib/identity/types';

interface InventoryItem {
  id: string;
  name: string;
  slot: string;
  rarity: string;
  dynasty: string | null;
  seasonSeq: number | null;
  render: unknown;
  acquiredAt: string | null;
  source: string | null;
}

interface LoadoutRow {
  slot: string;
  position: number;
  cosmetic_id: string;
}

const SLOT_ORDER = ['title', 'banner', 'badge', 'trail', 'board_accent', 'emblem'] as const;

const SLOT_LABEL: Record<string, string> = {
  title: 'Title',
  banner: 'Banner',
  badge: 'Badges (wear 3)',
  trail: 'Trail',
  board_accent: 'Board Accent',
  emblem: 'Emblem',
};

/** Section 7.2: forward-looking empty-state copy, never a zero. */
const SLOT_EMPTY_COPY: Record<string, string> = {
  title: 'Titles come from season capstones and mastery M10 — your first is waiting at the top of a track.',
  banner: 'The Hatchery Standard flies for you until you earn another.',
  badge: 'Badges arrive with the season track — your first banked runs start the collection.',
  trail: 'Mastery rungs award body trails — bank runs in one dynasty to light the first.',
  board_accent: 'Board accents unlock at mastery M4 — keep banking.',
  emblem: 'Your first emblem lands at mastery M1 — one banked run away.',
};

const RARITY_BORDER: Record<string, string> = {
  common: 'border-scale-blue-light/50',
  uncommon: 'border-rarity-uncommon/70',
  rare: 'border-rarity-rare/70',
  epic: 'border-rarity-epic/70',
  legendary: 'border-rarity-legendary/70',
};

export function IdentityPanel(): React.ReactElement {
  const { getToken } = useAuth();
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadout, setLoadout] = useState<LoadoutRow[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [equipError, setEquipError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const response = await fetch('/api/player/identity', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setLoading(false);
        return;
      }
      const data = await response.json();
      setIdentity(data.identity ?? null);
      setInventory(Array.isArray(data.inventory) ? data.inventory : []);
      setLoadout(Array.isArray(data.loadout) ? data.loadout : []);
      setLive(data.live !== false);
    } catch (err) {
      console.error('Failed to load identity:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const equippedAt = useCallback(
    (slot: string, position: number): string | null =>
      loadout.find((row) => row.slot === slot && row.position === position)
        ?.cosmetic_id ?? null,
    [loadout]
  );

  const equip = useCallback(
    async (slot: string, position: number, cosmeticId: string | null) => {
      setEquipError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch('/api/player/cosmetics/equip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ slot, position, cosmeticId }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setEquipError(
            response.status === 503
              ? 'Cosmetics are not live yet.'
              : `Could not equip (${data.error ?? response.status}).`
          );
          return;
        }
        await refresh();
      } catch (err) {
        console.error('Equip failed:', err);
        setEquipError('Network error — try again.');
      }
    },
    [getToken, refresh]
  );

  /** Toggle an item: equipped -> unequip; else equip (badges find a free position). */
  const handleItemTap = useCallback(
    (item: InventoryItem) => {
      if (item.slot === 'badge') {
        const worn = loadout.find(
          (row) => row.slot === 'badge' && row.cosmetic_id === item.id
        );
        if (worn) {
          equip('badge', worn.position, null);
          return;
        }
        const free = [1, 2, 3].find((position) => !equippedAt('badge', position));
        if (free === undefined) {
          setEquipError('All 3 badge slots are worn — unequip one first.');
          return;
        }
        equip('badge', free, item.id);
        return;
      }
      const current = equippedAt(item.slot, 1);
      equip(item.slot, 1, current === item.id ? null : item.id);
    },
    [loadout, equip, equippedAt]
  );

  if (loading) {
    return (
      <div className="panel-elevated p-6 animate-fade-up">
        <h2 className="heading-display text-xl text-bone-white mb-4">Identity</h2>
        <p className="text-beige/50 font-body">Loading…</p>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="panel-elevated p-6 animate-fade-up">
        <h2 className="heading-display text-xl text-bone-white mb-4">Identity</h2>
        <p className="text-beige/60 font-body text-sm">
          Your identity loads once you have played a run.
        </p>
      </div>
    );
  }

  const bySlot = new Map<string, InventoryItem[]>();
  for (const item of inventory) {
    const list = bySlot.get(item.slot) ?? [];
    list.push(item);
    bySlot.set(item.slot, list);
  }

  return (
    <div className="panel-elevated p-6 animate-fade-up space-y-6" data-testid="identity-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="heading-display text-xl text-bone-white">Identity</h2>
        <button
          onClick={() => setClaimOpen(true)}
          data-testid="identity-handle-button"
          className="btn-neutral inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-sm"
        >
          <IconEdit size={15} />
          {identity.isGenerated ? 'Claim handle' : 'Change handle'}
        </button>
      </div>

      {/* The card everyone else sees */}
      <PlayerCard
        identity={identity}
        variant="full"
        isSelf
        onClaim={() => setClaimOpen(true)}
      />

      {identity.isGenerated && (
        <p className="text-beige/60 font-body text-sm">
          You play as <span className="text-beige">{identity.displayHandle}</span> until
          you claim a name. The first claim is free; changes wait 30 days.
        </p>
      )}

      {!live && (
        <p className="text-beige/50 font-body text-sm">
          Cosmetics are not live yet — earned items will appear here.
        </p>
      )}

      {equipError && (
        <p className="text-strike-red font-body text-sm" data-testid="identity-equip-error">
          {equipError}
        </p>
      )}

      {/* Equip grid: owned cosmetics per slot */}
      {live && (
        <div className="space-y-5">
          {SLOT_ORDER.map((slot) => {
            const items = bySlot.get(slot) ?? [];
            return (
              <div key={slot} data-testid={`identity-slot-${slot}`}>
                <p className="label-arcade mb-2">{SLOT_LABEL[slot]}</p>
                {items.length === 0 ? (
                  <p className="text-beige/50 font-body text-sm">
                    {SLOT_EMPTY_COPY[slot]}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => {
                      const worn = loadout.some(
                        (row) => row.slot === slot && row.cosmetic_id === item.id
                      );
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleItemTap(item)}
                          data-testid={`identity-item-${item.id}`}
                          aria-pressed={worn}
                          title={`${item.name} (${item.rarity})${worn ? ' — worn' : ''}`}
                          className={`px-3 py-2 rounded-arcade border font-body text-sm transition-all min-h-[44px] ${
                            RARITY_BORDER[item.rarity] ?? RARITY_BORDER.common
                          } ${
                            worn
                              ? 'bg-venom-orange/15 text-bone-white shadow-glow-sm shadow-venom-orange/30'
                              : 'bg-void/50 text-beige hover:text-bone-white'
                          }`}
                        >
                          {item.name}
                          {worn && <span className="ml-1.5 text-venom-orange">●</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <HandleClaimModal
        isOpen={claimOpen}
        onClose={() => setClaimOpen(false)}
        onClaimed={() => refresh()}
        currentHandle={identity.isGenerated ? null : identity.displayHandle}
      />
    </div>
  );
}

export default IdentityPanel;
