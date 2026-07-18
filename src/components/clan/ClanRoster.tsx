'use client';

/**
 * Clan roster (Identity v1 section 8.2) - the clan's face: a wall of
 * row-variant PlayerCards with role chips and weekly counted DNA.
 *
 * - Owner: promote/demote buttons (officer <-> member; never owner -
 *   the RPC refuses ownership changes).
 * - Officers: invite-by-handle + the pending invite list.
 */

import { useState } from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { IconUser } from '@/components/ui/icons';
import { clanAction, type ClanFullView } from './useClanFull';

interface ClanRosterProps {
  accessToken?: string;
  view: ClanFullView;
  onChanged: () => void;
}

const ROLE_CHIP: Record<string, string> = {
  owner: 'bg-venom-orange/20 border-venom-orange/70 text-venom-orange',
  officer: 'bg-cosmic/20 border-cosmic/70 text-cosmic-glow',
  member: 'bg-void/60 border-scale-blue-light/50 text-beige',
};

export function ClanRoster({ accessToken, view, onChanged }: ClanRosterProps) {
  const roster = view.roster ?? [];
  const role = view.membership?.role ?? 'member';
  const isOwner = role === 'owner';
  const isOfficer = isOwner || role === 'officer';

  const [inviteHandle, setInviteHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    setMessage(null);
    const result = await clanAction(accessToken, body);
    setBusy(false);
    setMessage(result.ok ? successMessage : result.error ?? 'Request failed');
    if (result.ok) onChanged();
  };

  return (
    <section className="mb-10 animate-fade-up" data-testid="clan-roster">
      <h2 className="heading-display text-2xl text-bone-white mb-4 flex items-center gap-2">
        <IconUser size={22} />
        Roster
      </h2>
      <div className="panel-elevated p-4 sm:p-6">
        {roster.length === 0 ? (
          <p className="text-beige font-body">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {roster.map((member) => (
              <li
                key={member.userId}
                className="flex flex-col sm:flex-row sm:items-center gap-2 bg-void/40 border border-scale-blue-light/40 rounded-arcade p-2"
                data-testid="roster-row"
              >
                <div className="flex-1 min-w-0">
                  {member.identity ? (
                    <PlayerCard identity={member.identity} variant="row" />
                  ) : (
                    <p className="font-body text-beige px-2">Handler</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 px-2 sm:px-0">
                  <span className="text-xs font-body text-beige/70" title="Weekly counted DNA">
                    {member.weeklyContribution.toLocaleString()} DNA
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-arcade border text-xs font-display uppercase ${ROLE_CHIP[member.role] ?? ROLE_CHIP.member}`}
                  >
                    {member.role}
                  </span>
                  {isOwner && member.role === 'member' && (
                    <button
                      onClick={() =>
                        act(
                          { action: 'set_role', targetUserId: member.userId, role: 'officer' },
                          'Promoted to officer'
                        )
                      }
                      disabled={busy}
                      className="btn-neutral px-3 py-1 text-xs min-h-[32px]"
                    >
                      Promote
                    </button>
                  )}
                  {isOwner && member.role === 'officer' && (
                    <button
                      onClick={() =>
                        act(
                          { action: 'set_role', targetUserId: member.userId, role: 'member' },
                          'Demoted to member'
                        )
                      }
                      disabled={busy}
                      className="btn-neutral px-3 py-1 text-xs min-h-[32px]"
                    >
                      Demote
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Officer invite console */}
        {isOfficer && (
          <div className="mt-5 border-t border-scale-blue-light/30 pt-4" data-testid="invite-console">
            <p className="label-arcade mb-2">Invite a handler</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (inviteHandle) {
                  act({ action: 'invite', handle: inviteHandle }, `Invited ${inviteHandle}`);
                  setInviteHandle('');
                }
              }}
            >
              <input
                type="text"
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value)}
                placeholder="Handle (3-16 chars)"
                pattern="[A-Za-z0-9_]{3,16}"
                className="flex-1 px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
              />
              <button type="submit" disabled={busy || !inviteHandle} className="btn-go px-5 py-2 min-h-[44px]">
                Invite
              </button>
            </form>
            {(view.pendingInvites ?? []).length > 0 && (
              <div className="mt-3">
                <p className="label-arcade mb-1">Pending invites</p>
                <ul className="space-y-1">
                  {(view.pendingInvites ?? []).map((invite) => (
                    <li key={invite.id} className="text-sm font-body text-beige flex justify-between">
                      <span>{invite.handle ?? 'Unnamed handler'}</span>
                      <span className="text-beige/50">
                        expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {message && <p className="text-beige text-sm font-body mt-3">{message}</p>}
      </div>
    </section>
  );
}

/**
 * The invite inbox (section 8.2) - pending invites for a player, shown
 * on the clan page (members see it too; accept refuses in SQL while in
 * a clan).
 */
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const respond = async (inviteId: string, accept: boolean) => {
    setBusy(true);
    setMessage(null);
    const result = await clanAction(accessToken, {
      action: 'respond_invite',
      inviteId,
      accept,
    });
    setBusy(false);
    setMessage(result.ok ? (accept ? 'Welcome to the clan!' : 'Invite declined') : result.error ?? 'Request failed');
    if (result.ok) onChanged();
  };

  return (
    <section className="mb-10 animate-fade-up" data-testid="invite-inbox">
      <h2 className="heading-display text-2xl text-bone-white mb-4">Clan Invites</h2>
      <div className="panel-glow [--glow:#f97316] p-4 space-y-2">
        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-void/40 border border-scale-blue-light/40 rounded-arcade p-3"
          >
            <div>
              <p className="font-display text-bone-white">
                {invite.clanName ?? 'A clan'}{' '}
                {invite.clanTag && <span className="text-beige/70">[{invite.clanTag}]</span>}
              </p>
              <p className="text-xs text-beige/60 font-body">
                Expires {new Date(invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => respond(invite.id, true)}
                disabled={busy}
                className="btn-go px-5 py-2 min-h-[44px]"
              >
                Accept
              </button>
              <button
                onClick={() => respond(invite.id, false)}
                disabled={busy}
                className="btn-neutral px-5 py-2 min-h-[44px]"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
        {message && <p className="text-beige text-sm font-body">{message}</p>}
      </div>
    </section>
  );
}
