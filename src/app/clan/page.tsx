'use client';

/** Mobile-first Compete / Clan journey. Normal Energy runs remain the entry. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { ClanJoinPolicy } from '@/lib/clan/types';
import { CLAN_BANNERS, CLAN_EMBLEMS, bannerById, emblemById } from '@/lib/clan/heraldry';
import { CLAN_GAUNTLET_ENABLED, CLAN_PLAYOFFS_ENABLED } from '@/lib/clan/config';
import { clanMemberReportHref, clanReportHref } from '@/lib/clan/report';
import { GAME_CONFIG } from '@/shared/config/game';
import { NavBar } from '@/components/ui/NavBar';
import { IconShield, IconUser } from '@/components/ui/icons';
import { EnergyBattlePanel } from '@/components/clan/EnergyBattlePanel';
import { DuelPanel } from '@/components/clan/DuelPanel';
import { GauntletPanel } from '@/components/clan/GauntletPanel';
import { PlayoffBracket } from '@/components/clan/PlayoffBracket';
import { ClanIdentityEditor } from '@/components/clan/ClanIdentityEditor';
import { ClanDiscordPanel } from '@/components/clan/ClanDiscordPanel';
import { ClanDirectory } from '@/components/clan/ClanDirectory';
import { ClanGovernancePanel } from '@/components/clan/ClanGovernancePanel';
import { ClanGloryPanel } from '@/components/clan/ClanGloryPanel';
import { ClanFoundingPrompt } from '@/components/clan/ClanFoundingPrompt';
import { ClanRoster, InviteInbox } from '@/components/clan/ClanRoster';
import {
  clanAction,
  useClanDirectory,
  useClanFull,
  type ClanDirectoryFilters,
  type ClanDirectoryRow,
  type ClanFullView,
} from '@/components/clan/useClanFull';
import { formatAmount } from '@/shared/format/amount';

type MemberTab = 'overview' | 'members' | 'manage' | 'advanced';
type SoloTab = 'discover' | 'found';

function readString(row: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof row?.[key] === 'string') return row[key] as string;
  }
  return '';
}

function readNumber(row: Record<string, unknown> | null | undefined, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-[44px] shrink-0 rounded-arcade border px-4 py-2 text-sm font-display uppercase transition-colors ${
        active
          ? 'border-venom-orange bg-venom-orange/15 text-venom-orange'
          : 'border-scale-blue-light/45 bg-void/55 text-beige hover:text-bone-white'
      }`}
    >
      {children}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-2 rounded-full bg-strike-red px-1.5 py-0.5 text-[10px] text-white">{count}</span>
      )}
    </button>
  );
}

function ClanHero({ view }: { view: ClanFullView }) {
  const clan = view.clan;
  const banner = bannerById(view.identity?.bannerId);
  const emblem = emblemById(view.identity?.emblemId);
  const memberCount = readNumber(clan, 'member_count', 'memberCount');
  const maxMembers = view.limits?.maxMembers ?? readNumber(clan, 'max_members', 'maxMembers');
  const bestBattle = readNumber(clan, 'best_week_depth', 'bestWeekDepth');
  const lifetimeDepth = readNumber(clan, 'lifetime_depth', 'lifetimeDepth');
  return (
    <section
      className="panel-glow overflow-hidden [--glow:#a855f7]"
      data-testid="clan-hero"
      style={{ background: `linear-gradient(130deg, ${view.identity?.colorPrimary ?? banner.from}bb, ${view.identity?.colorSecondary ?? banner.to}88)` }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-arcade border border-white/25 bg-void/45 text-2xl text-bone-white">
            {emblem?.glyph ?? <IconShield size={24} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate heading-display text-3xl text-bone-white">{readString(clan, 'name')}</h1>
              <span className="rounded-arcade border border-white/25 bg-void/35 px-2 py-1 font-display text-xs text-bone-white">[{readString(clan, 'tag')}]</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-body text-sm text-bone-white/70">
                You are {view.membership?.roleLabel ?? 'Member'} · {view.settings?.joinPolicy === 'open' ? 'Open clan' : view.settings?.joinPolicy === 'application' ? 'Applications' : 'Invite only'}
              </p>
              <a
                href={clanReportHref(readString(clan, 'id'), readString(clan, 'name'))}
                className="inline-flex min-h-[44px] items-center text-xs font-body text-bone-white/55 hover:text-bone-white"
                aria-label={`Report clan ${readString(clan, 'name')}`}
              >
                Report clan
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-arcade border border-white/15 bg-void/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-bone-white/55">Members</p>
            <p className="font-display text-lg text-bone-white">{memberCount}/{maxMembers || 12}</p>
          </div>
          <div className="rounded-arcade border border-white/15 bg-void/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-bone-white/55">Best battle</p>
            <p className="font-display text-lg text-bone-white">{formatAmount(bestBattle)}</p>
          </div>
          <div className="rounded-arcade border border-white/15 bg-void/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-bone-white/55">Lifetime</p>
            <p className="font-display text-lg text-bone-white">{formatAmount(lifetimeDepth)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StandingsPreview({ view }: { view: ClanFullView }) {
  const ranked = [...(view.roster ?? [])]
    .filter((member) => member.contribution.hasEligibleContribution)
    .sort((a, b) => (a.contribution.rank ?? 999) - (b.contribution.rank ?? 999))
    .slice(0, 3);
  return (
    <section className="panel p-4" data-testid="standings-preview">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="heading-display text-xl text-bone-white">Current leaders</h2>
          <p className="mt-1 text-xs font-body text-beige/55">Best-five Depth, verified from Energy runs.</p>
        </div>
        <IconUser size={20} className="text-beige/55" />
      </div>
      {ranked.length ? (
        <ol className="mt-3 space-y-2">
          {ranked.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 rounded-arcade bg-void/45 px-3 py-2">
              <span className="w-8 shrink-0 font-display text-venom-orange">#{member.contribution.rank}</span>
              <span className="min-w-0 flex-1 truncate font-body text-bone-white">{member.identity?.displayHandle ?? 'Handler'}</span>
              <a
                href={clanMemberReportHref(
                  view.membership?.clanId ?? '',
                  member.userId,
                  member.identity?.displayHandle ?? 'Handler'
                )}
                className="inline-flex min-h-[44px] shrink-0 items-center text-[11px] font-body text-beige/45 hover:text-bone-white"
                aria-label={`Report handle ${member.identity?.displayHandle ?? 'Handler'}`}
              >
                Report
              </a>
              <span className="shrink-0 font-display text-bone-white">{member.contribution.bestFiveDepth === undefined ? undefined : formatAmount(member.contribution.bestFiveDepth)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-arcade border border-dashed border-scale-blue-light/35 p-3 text-sm font-body text-beige/55">
          The first verified Energy result establishes this battle&apos;s standings.
        </p>
      )}
    </section>
  );
}

function FoundClanPanel({
  accessToken,
  view,
  onChanged,
  setStatus,
}: {
  accessToken?: string;
  view: ClanFullView;
  onChanged: () => void;
  setStatus: (value: string | null, error?: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [bannerId, setBannerId] = useState(CLAN_BANNERS[0].id);
  const [emblemId, setEmblemId] = useState(CLAN_EMBLEMS[0].id);
  const [joinCode, setJoinCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cost = view.competitiveConfig?.foundingDnaCost;

  const found = async () => {
    if (typeof cost !== 'number') {
      setStatus('The current founding cost is still loading. No DNA was spent.', true);
      return;
    }
    setBusy(true);
    const result = await clanAction(accessToken, {
      action: 'found',
      name: name.trim(),
      bannerId,
      emblemId,
      confirmedFoundingDnaCost: cost,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error ?? 'Could not found clan', true);
      return;
    }
    setConfirming(false);
    setStatus(`${name.trim()} stands. You are its Leader.`);
    onChanged();
  };

  const joinByCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await clanAction(accessToken, { action: 'join_by_code', code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error ?? 'Could not join clan', true);
      return;
    }
    setStatus('Joined clan. Your next eligible run contributes automatically.');
    setJoinCode('');
    onChanged();
  };

  return (
    <div className="space-y-4" data-testid="found-clan-panel">
      <section className="panel-elevated p-5">
        <h2 className="heading-display text-2xl text-bone-white">Found your clan</h2>
        <p className="mt-1 text-sm font-body text-beige/65">Choose a name and standard. You become Leader immediately.</p>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); setConfirming(true); }}>
          <label className="block text-sm font-body text-beige">
            Clan name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={20} required placeholder="Elite Snakes" className="mt-1 min-h-[44px] w-full rounded-arcade border border-scale-blue-light/60 bg-void/70 px-4 text-bone-white focus:border-venom-orange focus:outline-none" />
          </label>
          <div>
            <p className="label-arcade mb-2">Banner</p>
            <div className="flex flex-wrap gap-2">
              {CLAN_BANNERS.map((banner) => (
                <button key={banner.id} type="button" aria-label={`Banner ${banner.name}`} onClick={() => setBannerId(banner.id)} className={`h-11 w-14 rounded-arcade border ${bannerId === banner.id ? 'border-venom-orange ring-2 ring-venom-orange/25' : 'border-scale-blue-light/45'}`} style={{ background: `linear-gradient(120deg, ${banner.from}, ${banner.to})` }} />
              ))}
            </div>
          </div>
          <div>
            <p className="label-arcade mb-2">Emblem</p>
            <div className="flex flex-wrap gap-2">
              {CLAN_EMBLEMS.map((emblem) => (
                <button key={emblem.id} type="button" aria-label={`Emblem ${emblem.name}`} onClick={() => setEmblemId(emblem.id)} className={`h-11 w-11 rounded-arcade border bg-void/65 text-xl text-bone-white ${emblemId === emblem.id ? 'border-venom-orange ring-2 ring-venom-orange/25' : 'border-scale-blue-light/45'}`}>{emblem.glyph}</button>
              ))}
            </div>
          </div>
          <div className="rounded-arcade border border-venom-orange/35 bg-venom-orange/10 p-3">
            <p className="label-arcade">Founding cost</p>
            <p className="mt-1 font-display text-xl text-bone-white">{typeof cost === 'number' ? `${formatAmount(cost)} DNA` : 'Loading server price…'}</p>
            <p className="mt-1 text-xs font-body text-beige/55">Charged once, atomically with creation. No charge occurs if creation fails.</p>
          </div>
          <button type="submit" disabled={busy || typeof cost !== 'number'} className="btn-go min-h-[44px] w-full px-6">Review founding</button>
        </form>
      </section>

      <section className="panel p-5">
        <h2 className="heading-display text-xl text-bone-white">Have an invite?</h2>
        <form className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={joinByCode}>
          <label htmlFor="join-code" className="sr-only">Invite code</label>
          <input id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="INVITE CODE" className="min-h-[44px] min-w-0 rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 font-display tracking-widest text-bone-white focus:border-venom-orange focus:outline-none" />
          <button type="submit" disabled={busy || joinCode.trim().length !== 8} className="btn-go min-h-[44px] px-5">Join</button>
        </form>
      </section>

      {confirming && typeof cost === 'number' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="found-confirm-title" aria-describedby="found-confirm-description">
          <div className="panel-elevated w-full max-w-sm p-6">
            <p className="label-arcade text-venom-orange">Founding commitment</p>
            <h3 id="found-confirm-title" className="mt-1 heading-display text-2xl text-bone-white">Found {name.trim()}?</h3>
            <p id="found-confirm-description" className="mt-2 text-sm font-body text-beige/70">Creating this clan spends {formatAmount(cost)} DNA. You become Leader and can set recruitment, appoint Co-leaders, and recognize Glory Members.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-neutral min-h-[44px] px-4">Cancel</button>
              <button type="button" data-testid="confirm-found-clan" disabled={busy} onClick={() => void found()} className="btn-go min-h-[44px] px-4">{busy ? 'Founding…' : `Spend ${formatAmount(cost)} DNA`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClanPage() {
  if (!GAME_CONFIG.features.clans) redirect('/');
  const { user, session, isAuthenticated } = useAuth();
  const { view, loading, error: viewError, refresh } = useClanFull(session?.access_token);
  const [filters, setFilters] = useState<ClanDirectoryFilters>({ query: '', policy: 'all', hasSpace: true });
  const directory = useClanDirectory(filters);
  const [memberTab, setMemberTab] = useState<MemberTab>('overview');
  const [soloTab, setSoloTab] = useState<SoloTab>('discover');
  const [busyClanId, setBusyClanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inClan = Boolean(view?.clan);
  const permissions = view?.membership?.permissions;
  const canManage = Boolean(permissions && Object.values(permissions).some(Boolean));
  const advancedAvailable = CLAN_GAUNTLET_ENABLED || CLAN_PLAYOFFS_ENABLED;

  useEffect(() => {
    setMemberTab('overview');
  }, [inClan]);

  const pendingClanIds = useMemo(
    () => new Set((view?.myApplications ?? []).map((application) => application.clanId).filter((id): id is string => Boolean(id))),
    [view?.myApplications]
  );

  const refreshAll = async () => {
    await Promise.all([refresh(), directory.refresh()]);
  };

  const status = (text: string | null, isError = false) => setNotice(text ? { text, error: isError } : null);

  const requestMembership = async (clan: ClanDirectoryRow) => {
    setBusyClanId(clan.id);
    setNotice(null);
    const result = await clanAction(session?.access_token, { action: 'apply', clanId: clan.id });
    setBusyClanId(null);
    if (!result.ok) {
      status(result.error ?? 'Could not complete that request', true);
      return;
    }
    const state = result.result?.state;
    status(state === 'joined' ? `Joined ${clan.name}. Your next Energy run can contribute.` : `Application sent to ${clan.name}.`);
    await refreshAll();
  };

  const leave = async () => {
    setLeaving(true);
    const result = await clanAction(session?.access_token, { action: 'leave' });
    setLeaving(false);
    if (!result.ok) {
      status(result.error ?? 'Could not leave clan', true);
      return;
    }
    setLeaveConfirm(false);
    status('You left the active roster. Your earned history remains.');
    await refreshAll();
  };

  if (!isAuthenticated) {
    return (
      <div className="app-bg text-bone-white">
        <NavBar />
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="panel-elevated w-full max-w-sm space-y-5 p-8 text-center">
            <IconShield size={34} className="mx-auto text-venom-orange" />
            <h1 className="heading-display text-4xl text-bone-white">Clans</h1>
            <p className="font-body text-beige">Sign in to compete, contribute, and build a clan reputation.</p>
            <Link href="/login" className="btn-go inline-flex min-h-[44px] items-center px-8">Sign in</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen text-bone-white">
      <NavBar />
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:pb-12 sm:pr-16 sm:pt-8">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="label-arcade text-venom-orange">Compete</p>
            <h1 className="heading-display text-4xl text-bone-white">Clans</h1>
            <p className="mt-1 max-w-xl text-sm font-body text-beige/65">Your ordinary Energy runs become shared attempts. The strongest verified performances earn rank and prestige.</p>
          </div>
          <Link href="/game" className="btn-go inline-flex min-h-[44px] shrink-0 items-center px-5">Play</Link>
        </header>

        {(notice || viewError) && (
          <div className={`mb-4 rounded-arcade border p-3 ${notice?.error || viewError ? 'border-strike-red/70 bg-strike-red/10 text-strike-red' : 'border-rarity-uncommon/60 bg-rarity-uncommon/10 text-rarity-uncommon'}`} role="status">
            <p className="text-sm font-body">{notice?.text ?? viewError}</p>
          </div>
        )}

        {loading && !view ? (
          <div className="panel p-10 text-center" data-testid="clan-page-loading">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-venom-orange border-t-transparent" />
            <p className="font-body text-beige">Loading clan world…</p>
          </div>
        ) : inClan && view ? (
          <div className="space-y-5">
            <ClanHero view={view} />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Clan sections">
              <TabButton active={memberTab === 'overview'} onClick={() => setMemberTab('overview')}>Overview</TabButton>
              <TabButton active={memberTab === 'members'} onClick={() => setMemberTab('members')}>Members</TabButton>
              <TabButton active={memberTab === 'manage'} onClick={() => setMemberTab('manage')} count={view.applications?.length}>{canManage ? 'Manage' : 'Clan details'}</TabButton>
              {advancedAvailable && <TabButton active={memberTab === 'advanced'} onClick={() => setMemberTab('advanced')}>Advanced</TabButton>}
            </div>

            <div role="tabpanel">
              {memberTab === 'overview' && (
                <div className="space-y-5">
                  {session?.access_token && <EnergyBattlePanel accessToken={session.access_token} />}
                  <div className="grid gap-5 lg:grid-cols-2">
                    <StandingsPreview view={view} />
                    <ClanGloryPanel accessToken={session?.access_token} viewerUserId={user?.id} view={view} onChanged={() => void refreshAll()} compact />
                  </div>
                  <Link href="/game" className="btn-go flex min-h-[52px] w-full items-center justify-center px-6 text-lg">Prepare an Energy run</Link>
                </div>
              )}

              {memberTab === 'members' && <ClanRoster accessToken={session?.access_token} viewerUserId={user?.id} view={view} onChanged={refreshAll} />}

              {memberTab === 'manage' && (
                <div className="space-y-5">
                  <ClanGovernancePanel accessToken={session?.access_token} view={view} onChanged={() => void refreshAll()} />
                  <ClanGloryPanel accessToken={session?.access_token} viewerUserId={user?.id} view={view} onChanged={() => void refreshAll()} />
                  <details className="panel p-4">
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-display uppercase text-bone-white">Clan identity</summary>
                    <div className="pt-4"><ClanIdentityEditor accessToken={session?.access_token} view={view} onSaved={() => void refreshAll()} /></div>
                  </details>
                  <details className="panel p-4">
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-display uppercase text-bone-white">Discord home</summary>
                    <div className="pt-4"><ClanDiscordPanel accessToken={session?.access_token} view={view} onChanged={() => void refreshAll()} /></div>
                  </details>
                  <div className="panel p-4">
                    <button type="button" onClick={() => setLeaveConfirm(true)} className="min-h-[44px] text-sm font-body text-strike-red hover:text-bone-white">Leave clan</button>
                    {view.membership?.role === 'owner' && (view.roster?.length ?? 0) > 1 && <p className="text-xs font-body text-beige/50">A Leader must transfer leadership before leaving.</p>}
                  </div>
                </div>
              )}

              {memberTab === 'advanced' && advancedAvailable && (
                <div className="space-y-5">
                  {CLAN_GAUNTLET_ENABLED && <><DuelPanel accessToken={session?.access_token} /><GauntletPanel accessToken={session?.access_token} /></>}
                  {CLAN_PLAYOFFS_ENABLED && <PlayoffBracket accessToken={session?.access_token} />}
                </div>
              )}
            </div>
          </div>
        ) : view ? (
          <div className="space-y-5">
            <InviteInbox accessToken={session?.access_token} view={view} onChanged={() => void refreshAll()} />
            <ClanFoundingPrompt
              accessToken={session?.access_token}
              inClan={false}
              onFound={() => setSoloTab('found')}
              onJoin={() => setSoloTab('found')}
            />
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Join or found a clan">
              <TabButton active={soloTab === 'discover'} onClick={() => setSoloTab('discover')}>Discover</TabButton>
              <TabButton active={soloTab === 'found'} onClick={() => setSoloTab('found')}>Found or invite</TabButton>
            </div>
            <div role="tabpanel">
              {soloTab === 'discover' ? (
                <ClanDirectory
                  clans={directory.clans}
                  loading={directory.loading}
                  error={directory.error}
                  query={filters.query}
                  policy={filters.policy}
                  hasSpace={filters.hasSpace}
                  pendingClanIds={pendingClanIds}
                  busyClanId={busyClanId}
                  onQueryChange={(query) => setFilters((current) => ({ ...current, query }))}
                  onPolicyChange={(policy: ClanJoinPolicy | 'all') => setFilters((current) => ({ ...current, policy }))}
                  onHasSpaceChange={(hasSpace) => setFilters((current) => ({ ...current, hasSpace }))}
                  onRequestMembership={(clan) => void requestMembership(clan)}
                />
              ) : (
                <FoundClanPanel accessToken={session?.access_token} view={view} onChanged={() => void refreshAll()} setStatus={status} />
              )}
            </div>
          </div>
        ) : null}

        {leaveConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-description">
            <div className="panel-elevated w-full max-w-sm p-6">
              <h2 id="leave-title" className="heading-display text-2xl text-bone-white">Leave this clan?</h2>
              <p id="leave-description" className="mt-2 text-sm font-body text-beige/70">Your earned clan history remains. Active run eligibility keeps its immutable start snapshot; future runs will not contribute here.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" disabled={leaving} onClick={() => setLeaveConfirm(false)} className="btn-neutral min-h-[44px] px-4">Cancel</button>
                <button type="button" disabled={leaving} onClick={() => void leave()} className="min-h-[44px] rounded-arcade border border-strike-red bg-strike-red/15 px-4 font-display uppercase text-strike-red">{leaving ? 'Leaving…' : 'Leave clan'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
