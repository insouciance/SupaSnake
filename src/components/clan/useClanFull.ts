'use client';

/**
 * Typed client reads for the competitive clan surface.
 *
 * Membership, permissions, contribution evidence, Glory terms, and founding
 * price all come from the server. This module stores no clan or progression
 * state in the browser; a successful mutation is followed by a fresh read.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerIdentity } from '@/lib/identity/types';
import type { ClanJoinPolicy, ClanRole, ClanRoleLabel } from '@/lib/clan/types';

export interface ClanPermissions {
  invite: boolean;
  reviewApplications: boolean;
  removeMembers: boolean;
  manageCoLeaders: boolean;
  manageSettings: boolean;
  transferOwnership: boolean;
  assignGlory: boolean;
}

export interface ClanContribution {
  cycleIndex: number;
  hasEligibleContribution: boolean;
  bestFiveDepth: number | null;
  rank: number | null;
  eligibleResults: number;
  bestGeneration: number | null;
  lastContributedAt: string | null;
}

export interface ClanRosterEntry {
  userId: string;
  role: ClanRole;
  roleLabel: ClanRoleLabel;
  permissions: ClanPermissions;
  joinedAt: string;
  /** Earliest membership start ever, across leave/rejoin. */
  tenureSince: string;
  identity: PlayerIdentity | null;
  contribution: ClanContribution;
}

export interface ClanInviteSummary {
  id: string;
  clanId?: string;
  clanName?: string | null;
  clanTag?: string | null;
  invitedByUserId?: string;
  expiresAt: string;
}

export interface ClanApplicationSummary {
  id: string;
  clanId?: string;
  applicantUserId?: string;
  status: string;
  createdAt: string;
  clanName?: string | null;
  clanTag?: string | null;
  identity?: PlayerIdentity | null;
}

export interface ClanDiscordSummary {
  linked: boolean;
  model?: string;
  guildId?: string;
  channelId?: string;
  inviteUrl?: string | null;
}

export interface ClanGloryTerms {
  maxSeats: number;
  rewardDna: number;
  minimumTenureSeconds: number;
  minimumContributionDepth: number;
  allowOwnerSelfAward: boolean;
  allowPendingReassignment: boolean;
}

export interface ClanGlorySeatSummary {
  id: string;
  seat: number;
  holderUserId: string;
  holderIdentity: PlayerIdentity | null;
  assignedByUserId: string;
  sourceCycleIndex: number;
  effectiveCycleIndex: number;
  effectiveAt: string;
  evidenceDepth: number;
  evidenceRank: number;
  evidenceContributionCount: number;
  rewardDna: number;
  assignedAt: string;
  state: 'pending' | 'active' | 'completed';
  rewarded: boolean;
}

export interface CompetitiveClanConfig {
  foundingDnaCost: number;
  policies: ClanJoinPolicy[];
  roleLabels: Record<ClanRole, ClanRoleLabel>;
  permissions: Record<ClanRole, ClanPermissions>;
  glory: ClanGloryTerms;
}

export interface ClanFullView {
  clan: Record<string, unknown> | null;
  membership?: {
    clanId: string;
    role: ClanRole;
    roleLabel: ClanRoleLabel;
    permissions: ClanPermissions;
    joinedAt: string;
    tenureSince?: string;
  };
  settings?: { joinPolicy: ClanJoinPolicy };
  identity?: {
    bannerId: string | null;
    emblemId: string | null;
    colorPrimary: string | null;
    colorSecondary: string | null;
  };
  invite?: { code: string | null; url: string | null };
  limits?: {
    maxMembers: number;
    softFullMembers: number;
    availableSpots?: number;
  };
  cycle?: {
    index: number;
    phase?: string;
    startsAt?: string;
    activeEndsAt?: string;
    intermissionEndsAt?: string;
    [key: string]: unknown;
  };
  roster?: ClanRosterEntry[];
  applications?: ClanApplicationSummary[];
  glory?: { terms: ClanGloryTerms; seats: ClanGlorySeatSummary[] };
  myInvites?: ClanInviteSummary[];
  myApplications?: ClanApplicationSummary[];
  discord?: ClanDiscordSummary;
  competitiveConfig?: CompetitiveClanConfig;
}

export interface ClanDirectoryRow {
  id: string;
  name: string;
  tag: string | null;
  bannerId: string | null;
  emblemId: string | null;
  colorPrimary: string | null;
  memberCount: number;
  maxMembers: number;
  availableSpots: number;
  joinPolicy: ClanJoinPolicy;
  bestWeekDepth: number;
  lastHuntedWeek: string | null;
  lastHuntKind?: 'energy_battle' | 'legacy_week' | null;
  recentActivityAt: string | null;
}

export interface ClanDirectoryFilters {
  query: string;
  policy: ClanJoinPolicy | 'all';
  hasSpace: boolean;
}

export function useClanFull(accessToken: string | undefined) {
  const [view, setView] = useState<ClanFullView | null>(null);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<ClanFullView | null> => {
    if (!accessToken) {
      setView(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/clan?view=full', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => ({}))) as ClanFullView & {
        error?: string;
      };
      if (!response.ok) {
        setView(null);
        setError(payload.error ?? 'Could not load your clan');
        return null;
      }
      setView(payload);
      return payload;
    } catch {
      setView(null);
      setError('Could not load your clan');
      return null;
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, loading, error, refresh };
}

export function useClanDirectory(filters: ClanDirectoryFilters) {
  const [clans, setClans] = useState<ClanDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(
    () => `${filters.query.trim()}\u0000${filters.policy}\u0000${filters.hasSpace}`,
    [filters.hasSpace, filters.policy, filters.query]
  );

  const refresh = useCallback(async (): Promise<void> => {
    const [query, policy, hasSpace] = key.split('\u0000');
    const params = new URLSearchParams({ view: 'directory' });
    if (query) params.set('q', query);
    if (policy !== 'all') params.set('policy', policy);
    if (hasSpace === 'true') params.set('hasSpace', 'true');

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/clan?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        clans?: ClanDirectoryRow[];
        error?: string;
      };
      if (!response.ok) {
        setClans([]);
        setError(payload.error ?? 'Could not search clans');
        return;
      }
      setClans(payload.clans ?? []);
    } catch {
      setClans([]);
      setError('Could not search clans');
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 180);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  return { clans, loading, error, refresh };
}

export interface ClanActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  result?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/** POST one server-authoritative action. Callers refresh after `ok: true`. */
export async function clanAction(
  accessToken: string | undefined,
  body: Record<string, unknown>
): Promise<ClanActionResult> {
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
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : 'Request failed',
        code: typeof data.code === 'string' ? data.code : undefined,
        payload: data,
      };
    }
    const nested = data.result;
    return {
      ok: true,
      result:
        nested && typeof nested === 'object'
          ? (nested as Record<string, unknown>)
          : data,
      payload: data,
    };
  } catch {
    return { ok: false, error: 'Request failed' };
  }
}
