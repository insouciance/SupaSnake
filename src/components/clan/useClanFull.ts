'use client';

/**
 * The full clan surface read: one authed fetch of `/api/clan?view=full`,
 * shared by the heraldry editor, the roster, the Discord panel and the invite
 * inbox.
 *
 * WHAT WP-1.02 REMOVED FROM THIS SHAPE (Rule 8, and the acceptance criterion
 * "no officer lever exists")
 *
 *   `ClanRosterEntry.weeklyContribution` / `.totalContribution` — the graded
 *   pair. Gone from the payload because they are gone from the schema
 *   (migration 048). A roster entry now carries a handle, a role of two
 *   values, and when the member joined. There is no number on it a surface
 *   could sort by and then draw a line under.
 *
 *   `role: 'officer'` — there is no officer.
 *
 *   `pendingInvites` — the officer's invite console. Recruitment is the
 *   invite code (§9.2: "invite links are the only recruitment surface"), and
 *   every member can share it.
 *
 * `myInvites` stays: an invite issued before the rework can still be
 * answered, because Rule 5 says a change never destroys something pending.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlayerIdentity } from '@/lib/identity/types';

export interface ClanRosterEntry {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  /** Earliest membership start ever, across leave/rejoin (Rule 6: tenure). */
  tenureSince: string;
  identity: PlayerIdentity | null;
}

export interface ClanInviteSummary {
  id: string;
  clanId?: string;
  clanName?: string | null;
  clanTag?: string | null;
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
  membership?: {
    clanId: string;
    role: string;
    joinedAt: string;
    tenureSince?: string;
  };
  identity?: {
    bannerId: string | null;
    emblemId: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
  };
  /** The acquisition artifact (§11.3, Rule 14): a code and the URL for it. */
  invite?: { code: string | null; url: string | null };
  limits?: { maxMembers: number; softFullMembers: number };
  roster?: ClanRosterEntry[];
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
): Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }> {
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
    return { ok: true, result: data as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Request failed' };
  }
}
