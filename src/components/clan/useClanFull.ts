'use client';

/**
 * The full clan surface read (Identity v1 I3): one authed fetch of
 * /api/clan?view=full shared by the identity editor, roster, Discord
 * panel and invite inbox. Pre-024 the payload simply lacks the new
 * sections and every consumer renders its degraded state.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlayerIdentity } from '@/lib/identity/types';

export interface ClanRosterEntry {
  userId: string;
  role: 'owner' | 'officer' | 'member';
  weeklyContribution: number;
  totalContribution: number;
  joinedAt: string;
  identity: PlayerIdentity | null;
}

export interface ClanInviteSummary {
  id: string;
  clanId?: string;
  clanName?: string | null;
  clanTag?: string | null;
  handle?: string | null;
  expiresAt: string;
}

export interface ClanDiscordSummary {
  linked: boolean;
  model?: string;
  guildId?: string;
  channelId?: string;
  inviteUrl?: string | null;
}

export interface ClanFullView {
  clan: Record<string, unknown> | null;
  membership?: { clanId: string; role: string; joinedAt: string };
  identity?: {
    bannerId: string | null;
    emblemId: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
    heraldry: string[];
  };
  roster?: ClanRosterEntry[];
  pendingInvites?: ClanInviteSummary[];
  myInvites?: ClanInviteSummary[];
  discord?: ClanDiscordSummary;
}

export function useClanFull(accessToken: string | undefined) {
  const [view, setView] = useState<ClanFullView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch('/api/clan?view=full', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        setView(null);
        return;
      }
      setView((await response.json()) as ClanFullView);
    } catch (error) {
      console.error('Failed to load clan view:', error);
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { view, loading, refresh };
}

/** POST an action to /api/clan; returns { ok, error }. */
export async function clanAction(
  accessToken: string | undefined,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const response = await fetch('/api/clan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? 'Request failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Request failed' };
  }
}
