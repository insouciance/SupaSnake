'use client';

/** Searchable clan discovery with truthful, policy-specific actions. */

import Link from 'next/link';
import type { ClanJoinPolicy } from '@/lib/clan/types';
import { emblemById } from '@/lib/clan/heraldry';
import { formatWeekStart } from '@/lib/serpent/briefing';
import { IconShield } from '@/components/ui/icons';
import type { ClanDirectoryRow as DirectoryRow } from './useClanFull';

export type ClanDirectoryRow = DirectoryRow;

const POLICY_LABEL: Record<ClanJoinPolicy, string> = {
  open: 'Open',
  application: 'Application',
  invite_only: 'Invite only',
};

export interface ClanDirectoryProps {
  clans: ClanDirectoryRow[];
  loading?: boolean;
  error?: string | null;
  query?: string;
  policy?: ClanJoinPolicy | 'all';
  hasSpace?: boolean;
  pendingClanIds?: ReadonlySet<string>;
  busyClanId?: string | null;
  onQueryChange?: (value: string) => void;
  onPolicyChange?: (value: ClanJoinPolicy | 'all') => void;
  onHasSpaceChange?: (value: boolean) => void;
  onRequestMembership?: (clan: ClanDirectoryRow) => void;
}

function activityLabel(clan: ClanDirectoryRow): string {
  if (!clan.recentActivityAt) return 'No recent verified result';
  const date = new Date(clan.recentActivityAt);
  if (Number.isNaN(date.getTime())) return 'Recently active';
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 1) return 'Active this hour';
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days}d ago`;
}

function MembershipAction({
  clan,
  pending,
  busy,
  onRequest,
}: {
  clan: ClanDirectoryRow;
  pending: boolean;
  busy: boolean;
  onRequest?: (clan: ClanDirectoryRow) => void;
}) {
  if (clan.availableSpots <= 0) {
    return <span className="text-beige/55 text-sm font-body">Full</span>;
  }
  if (clan.joinPolicy === 'invite_only') {
    return (
      <span className="text-beige/60 text-sm font-body" data-testid="invite-only-state">
        Invite required
      </span>
    );
  }
  if (pending) {
    return (
      <span
        className="inline-flex min-h-[44px] items-center rounded-arcade border border-cosmic/50 bg-cosmic/10 px-4 text-sm font-body text-cosmic-glow"
        data-testid="application-pending"
      >
        Application sent
      </span>
    );
  }

  const isOpen = clan.joinPolicy === 'open';
  return (
    <button
      type="button"
      onClick={() => onRequest?.(clan)}
      disabled={busy || !onRequest}
      className="btn-go min-h-[44px] min-w-[6.5rem] px-5 py-2 disabled:opacity-55"
      aria-label={`${isOpen ? 'Join' : 'Apply to'} ${clan.name}`}
      data-testid={isOpen ? 'join-open-clan' : 'apply-clan'}
    >
      {busy ? 'Working…' : isOpen ? 'Join' : 'Apply'}
    </button>
  );
}

export function ClanDirectory({
  clans,
  loading = false,
  error = null,
  query = '',
  policy = 'all',
  hasSpace = true,
  pendingClanIds = new Set<string>(),
  busyClanId = null,
  onQueryChange,
  onPolicyChange,
  onHasSpaceChange,
  onRequestMembership,
}: ClanDirectoryProps) {
  return (
    <section className="space-y-4 animate-fade-up" data-testid="clan-directory">
      <div>
        <h2 className="heading-display text-2xl text-bone-white">Find your clan</h2>
        <p className="mt-1 text-sm font-body text-beige/70">
          Search active clans, compare their current footprint, then join or apply on
          the terms they set.
        </p>
      </div>

      <div className="panel p-3 sm:p-4" role="search" aria-label="Search clans">
        <label htmlFor="clan-search" className="sr-only">Search clan name or tag</label>
        <input
          id="clan-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Search name or tag"
          maxLength={40}
          className="min-h-[44px] w-full rounded-arcade border border-scale-blue-light/60 bg-void/70 px-4 text-bone-white font-body placeholder:text-beige/45 focus:border-venom-orange focus:outline-none"
        />
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="sr-only" htmlFor="clan-policy">Join policy</label>
          <select
            id="clan-policy"
            value={policy}
            onChange={(event) =>
              onPolicyChange?.(event.target.value as ClanJoinPolicy | 'all')
            }
            className="min-h-[44px] rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 text-bone-white font-body focus:border-venom-orange focus:outline-none"
          >
            <option value="all">All join types</option>
            <option value="open">Open</option>
            <option value="application">Application</option>
            <option value="invite_only">Invite only</option>
          </select>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 text-sm font-body text-beige">
            <input
              type="checkbox"
              checked={hasSpace}
              onChange={(event) => onHasSpaceChange?.(event.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            Has space
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-arcade border border-strike-red/70 bg-strike-red/10 p-4" role="alert">
          <p className="font-body text-sm text-strike-red">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="panel p-8 text-center" data-testid="clan-directory-loading" aria-live="polite">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-venom-orange border-t-transparent" />
          <p className="font-body text-beige">Searching clans…</p>
        </div>
      ) : clans.length === 0 ? (
        <div className="panel p-7 text-center" data-testid="clan-directory-empty">
          <p className="font-display text-lg text-bone-white">No matching active clan</p>
          <p className="mt-1 font-body text-sm text-beige/65">
            Try broader filters, use an invite code, or found the clan you want to lead.
          </p>
        </div>
      ) : (
        <div className="grid gap-3" aria-live="polite">
          {clans.map((clan) => {
            const emblem = emblemById(clan.emblemId);
            return (
              <article
                key={clan.id}
                className="panel overflow-hidden p-0"
                data-testid="directory-row"
              >
                <div
                  className="h-1"
                  aria-hidden="true"
                  style={{ background: clan.colorPrimary ?? '#a855f7' }}
                />
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-arcade border border-scale-blue-light/50 bg-void/60 text-xl text-bone-white">
                      {emblem?.glyph ?? <IconShield size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-display text-lg uppercase text-bone-white">
                          {clan.name}
                        </h3>
                        {clan.tag && (
                          <span className="rounded-arcade border border-scale-blue-light/60 bg-void/60 px-2 py-0.5 font-display text-xs text-beige">
                            [{clan.tag}]
                          </span>
                        )}
                        <span className="rounded-full border border-cosmic/45 bg-cosmic/10 px-2 py-0.5 text-[11px] font-body text-cosmic-glow">
                          {POLICY_LABEL[clan.joinPolicy]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-body text-beige/65">
                        <span>{clan.memberCount}/{clan.maxMembers} members</span>
                        <span>{clan.availableSpots} {clan.availableSpots === 1 ? 'spot' : 'spots'} open</span>
                        <span>{activityLabel(clan)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-body">
                        <span className="text-bone-white">
                          Best battle <strong className="text-venom-orange">{clan.bestWeekDepth.toLocaleString()}</strong> Depth
                        </span>
                        {clan.lastHuntedWeek && (
                          <Link
                            href={clan.lastHuntKind === 'energy_battle' ? '/serpent' : `/serpent?week=${clan.lastHuntedWeek}`}
                            className="inline-flex min-h-[44px] items-center text-cosmic-glow hover:text-bone-white"
                            data-testid="directory-week-link"
                          >
                            {clan.lastHuntKind === 'energy_battle' ? 'View battle' : `Battle · ${formatWeekStart(clan.lastHuntedWeek)}`} →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-h-[44px] shrink-0 items-center sm:justify-end">
                    <MembershipAction
                      clan={clan}
                      pending={pendingClanIds.has(clan.id)}
                      busy={busyClanId === clan.id}
                      onRequest={onRequestMembership}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ClanDirectory;
