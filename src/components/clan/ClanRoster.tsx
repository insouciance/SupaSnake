'use client';

/** Competitive roster: visible verified contribution, earned rank, and roles. */

import { useMemo, useState } from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { IconUser } from '@/components/ui/icons';
import { clanMemberReportHref } from '@/lib/clan/report';
import {
  clanAction,
  type ClanFullView,
  type ClanRosterEntry,
} from './useClanFull';
import { formatAmount } from '@/shared/format/amount';

interface ClanRosterProps {
  accessToken?: string;
  view: ClanFullView;
  viewerUserId?: string;
  onChanged: () => void;
}

const ROLE_CHIP: Record<string, string> = {
  owner: 'border-venom-orange/70 bg-venom-orange/15 text-venom-orange',
  co_leader: 'border-cosmic/70 bg-cosmic/15 text-cosmic-glow',
  member: 'border-scale-blue-light/50 bg-void/60 text-beige',
};

function memberName(member: ClanRosterEntry): string {
  return member.identity?.displayHandle ?? 'Handler';
}

function formatSince(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

type PendingAction =
  | { kind: 'remove'; member: ClanRosterEntry }
  | { kind: 'transfer'; member: ClanRosterEntry }
  | null;

function ConfirmRosterAction({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Exclude<PendingAction, null>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = memberName(pending.member);
  const transfer = pending.kind === 'transfer';
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="roster-confirm-title"
      aria-describedby="roster-confirm-description"
      data-testid="roster-confirmation"
    >
      <div className="panel-elevated w-full max-w-sm p-6">
        <h3 id="roster-confirm-title" className="heading-display text-2xl text-bone-white">
          {transfer ? `Make ${name} Leader?` : `Remove ${name}?`}
        </h3>
        <p id="roster-confirm-description" className="mt-2 text-sm font-body text-beige/75">
          {transfer
            ? 'They become Leader immediately. You remain in the clan as a Co-leader.'
            : 'They leave the active roster. Their earned history remains, but future runs no longer contribute here.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-neutral min-h-[44px] px-4">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={transfer ? 'btn-go min-h-[44px] px-4' : 'min-h-[44px] rounded-arcade border border-strike-red bg-strike-red/15 px-4 font-display uppercase text-strike-red hover:bg-strike-red/25'}
          >
            {busy ? 'Working…' : transfer ? 'Transfer leadership' : 'Remove member'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClanRoster({ accessToken, view, viewerUserId, onChanged }: ClanRosterProps) {
  const roster = useMemo(() => view.roster ?? [], [view.roster]);
  const permissions = view.membership?.permissions;
  const maxMembers = view.limits?.maxMembers ?? 12;
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const ordered = useMemo(
    () => [...roster].sort((a, b) => {
      const aRank = a.contribution.rank ?? Number.POSITIVE_INFINITY;
      const bRank = b.contribution.rank ?? Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (b.role === 'owner' && a.role !== 'owner') return 1;
      return memberName(a).localeCompare(memberName(b));
    }),
    [roster]
  );

  const act = async (
    member: ClanRosterEntry,
    body: Record<string, unknown>,
    successMessage: string
  ) => {
    setBusyUserId(member.userId);
    setMessage(null);
    const result = await clanAction(accessToken, body);
    setBusyUserId(null);
    setMessage(result.ok ? successMessage : result.error ?? 'Request failed');
    if (result.ok) await onChanged();
    return result.ok;
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { member, kind } = pending;
    const ok = await act(
      member,
      kind === 'transfer'
        ? { action: 'transfer_ownership', targetUserId: member.userId }
        : { action: 'remove_member', targetUserId: member.userId },
      kind === 'transfer' ? `${memberName(member)} is now Leader` : `${memberName(member)} removed`
    );
    if (ok) setPending(null);
  };

  return (
    <section className="animate-fade-up" data-testid="clan-roster">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="heading-display text-2xl text-bone-white flex items-center gap-2">
            <IconUser size={22} />
            Clan standings
          </h2>
          <p className="mt-1 text-sm font-body text-beige/65">
            Rank reflects each member&apos;s verified best five in this battle.
          </p>
        </div>
        <span className="shrink-0 font-display text-sm text-beige">
          {roster.length}/{maxMembers}
        </span>
      </div>

      <div className="space-y-3">
        {ordered.map((member) => {
          const contribution = member.contribution;
          const isSelf = member.userId === viewerUserId;
          const canChangeRole = Boolean(permissions?.manageCoLeaders) && member.role !== 'owner' && !isSelf;
          const canTransfer = Boolean(permissions?.transferOwnership) && member.role !== 'owner' && !isSelf;
          const canRemove = Boolean(permissions?.removeMembers)
            && member.role !== 'owner'
            && !isSelf
            && !(view.membership?.role === 'co_leader' && member.role !== 'member');
          const hasManagement = canChangeRole || canTransfer || canRemove;
          return (
            <article
              key={member.userId}
              className="panel p-3 sm:p-4"
              data-testid="roster-row"
              data-role={member.role}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-arcade border font-display text-lg ${
                    contribution.rank === 1
                      ? 'border-venom-orange bg-venom-orange/15 text-venom-orange'
                      : 'border-scale-blue-light/50 bg-void/60 text-beige'
                  }`}
                  aria-label={contribution.rank ? `Contribution rank ${contribution.rank}` : 'Not ranked yet'}
                >
                  {contribution.rank ? `#${contribution.rank}` : '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {member.identity ? (
                        <PlayerCard identity={member.identity} variant="row" isSelf={isSelf} />
                      ) : (
                        <p className="font-display text-bone-white">Handler</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isSelf && <span className="text-xs font-body text-beige/60">You</span>}
                      <span className={`rounded-arcade border px-2 py-1 text-xs font-display uppercase ${ROLE_CHIP[member.role]}`}>
                        {member.roleLabel}
                      </span>
                    </div>
                  </div>

                  {contribution.hasEligibleContribution ? (
                    <div className="mt-3 grid grid-cols-3 gap-2" data-testid="member-contribution">
                      <div className="rounded-arcade bg-void/45 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-beige/50">Best five</p>
                        <p className="font-display text-bone-white">{contribution.bestFiveDepth === undefined ? undefined : formatAmount(contribution.bestFiveDepth)} <span className="text-xs text-beige/55">Depth</span></p>
                      </div>
                      <div className="rounded-arcade bg-void/45 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-beige/50">Results</p>
                        <p className="font-display text-bone-white">{contribution.eligibleResults}/5</p>
                      </div>
                      <div className="rounded-arcade bg-void/45 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-beige/50">Snake</p>
                        <p className="font-display text-bone-white">Gen {contribution.bestGeneration ?? '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-arcade border border-dashed border-scale-blue-light/35 px-3 py-2 text-xs font-body text-beige/55" data-testid="no-eligible-result">
                      No eligible Energy result in this battle yet.
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-body text-beige/45">
                      Member since {formatSince(member.tenureSince ?? member.joinedAt)}
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={clanMemberReportHref(
                          view.membership?.clanId ?? '',
                          member.userId,
                          memberName(member)
                        )}
                        className="inline-flex min-h-[44px] items-center px-2 text-xs font-body text-beige/45 hover:text-bone-white"
                        aria-label={`Report handle ${memberName(member)}`}
                      >
                        Report
                      </a>
                      {hasManagement && (
                        <details className="relative">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center rounded-arcade border border-scale-blue-light/50 px-3 text-sm font-body text-beige hover:text-bone-white">
                          Manage
                        </summary>
                        <div className="mt-2 flex flex-wrap justify-end gap-2 sm:absolute sm:right-0 sm:z-20 sm:w-max sm:rounded-arcade sm:border sm:border-scale-blue-light/50 sm:bg-scale-blue-dark sm:p-2 sm:shadow-xl">
                          {canChangeRole && (
                            <button
                              type="button"
                              disabled={busyUserId === member.userId}
                              onClick={() => void act(
                                member,
                                { action: 'set_role', targetUserId: member.userId, role: member.role === 'co_leader' ? 'member' : 'co_leader' },
                                member.role === 'co_leader' ? `${memberName(member)} is now a Member` : `${memberName(member)} is now a Co-leader`
                              )}
                              className="btn-neutral min-h-[44px] px-4 text-xs"
                            >
                              {member.role === 'co_leader' ? 'Make Member' : 'Make Co-leader'}
                            </button>
                          )}
                          {canTransfer && (
                            <button type="button" onClick={() => setPending({ kind: 'transfer', member })} className="btn-neutral min-h-[44px] px-4 text-xs">
                              Make Leader
                            </button>
                          )}
                          {canRemove && (
                            <button type="button" onClick={() => setPending({ kind: 'remove', member })} className="min-h-[44px] rounded-arcade border border-strike-red/60 px-4 text-xs font-display uppercase text-strike-red">
                              Remove
                            </button>
                          )}
                        </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {roster.length === 0 && <div className="panel p-6 text-center text-beige">No members yet.</div>}
      {message && <p className="mt-3 text-sm font-body text-beige" role="status">{message}</p>}
      {pending && (
        <ConfirmRosterAction
          pending={pending}
          busy={busyUserId === pending.member.userId}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmPending()}
        />
      )}
    </section>
  );
}

/** Pending direct invitations remain visible and answerable. */
export function InviteInbox({
  accessToken,
  view,
  onChanged,
}: {
  accessToken?: string;
  view: ClanFullView;
  onChanged: () => void;
}) {
  const invites = view.myInvites ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const respond = async (inviteId: string, accept: boolean) => {
    setBusyId(inviteId);
    setMessage(null);
    const result = await clanAction(accessToken, { action: 'respond_invite', inviteId, accept });
    setBusyId(null);
    setMessage(result.ok ? (accept ? 'Welcome to the clan!' : 'Invite declined') : result.error ?? 'Request failed');
    if (result.ok) onChanged();
  };

  return (
    <section className="panel-glow [--glow:#f97316] p-4" data-testid="invite-inbox">
      <h2 className="heading-display text-xl text-bone-white">Your invitations</h2>
      <div className="mt-3 space-y-3">
        {invites.map((invite) => (
          <div key={invite.id} className="rounded-arcade border border-scale-blue-light/40 bg-void/40 p-3">
            <p className="font-display text-bone-white">
              {invite.clanName ?? 'A clan'} {invite.clanTag && <span className="text-beige/70">[{invite.clanTag}]</span>}
            </p>
            <p className="mt-1 text-xs font-body text-beige/55">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void respond(invite.id, true)} disabled={busyId === invite.id} className="btn-go min-h-[44px] px-4">Accept</button>
              <button type="button" onClick={() => void respond(invite.id, false)} disabled={busyId === invite.id} className="btn-neutral min-h-[44px] px-4">Decline</button>
            </div>
          </div>
        ))}
      </div>
      {message && <p className="mt-3 text-sm font-body text-beige" role="status">{message}</p>}
    </section>
  );
}
