'use client';

/**
 * Clan roster and the invite link (Constitution §9.2, Rule 8).
 *
 * WHAT THIS COMPONENT DELIBERATELY CANNOT DO
 *
 * The acceptance criterion for WP-1.02 is that NO OFFICER LEVER EXISTS — no
 * endpoint, no column, no UI affordance. Three affordances stood here before
 * and all three are gone:
 *
 *   - Promote / Demote buttons. There is no officer rank to move anyone into.
 *   - "Weekly counted DNA" next to every member's name. That was the graded
 *     number Rule 8 forbids: a per-member figure, on the roster, sorted next
 *     to a rank chip, which is a cut line waiting for someone to draw it. The
 *     columns behind it are dropped in migration 048, so it cannot come back
 *     by accident.
 *   - The invite-by-handle console, which was officer-only. §9.2 makes invite
 *     links the only recruitment surface, so the clan's code is shown to
 *     EVERY member instead — recruiting is something a clan does, not
 *     something a rank does.
 *
 * What a member's Depth contributed to the clan's week is shown on the hunt
 * panel, additively ("Sans_Souci fed 2,315 segments"), with no bar beside it.
 *
 * Removal survives, as §9.2's "plain roster management", owner-only, and it
 * carries no number about the person being removed.
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
  member: 'bg-void/60 border-scale-blue-light/50 text-beige',
};

function formatSince(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

export function ClanRoster({ accessToken, view, onChanged }: ClanRosterProps) {
  const roster = view.roster ?? [];
  const role = view.membership?.role ?? 'member';
  const isOwner = role === 'owner';
  const invite = view.invite;
  const maxMembers = view.limits?.maxMembers ?? 12;

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

  const shareLink = invite?.url
    ? `${typeof window === 'undefined' ? '' : window.location.origin}${invite.url}`
    : null;

  return (
    <section className="mb-10 animate-fade-up" data-testid="clan-roster">
      <h2 className="heading-display text-2xl text-bone-white mb-4 flex items-center gap-2">
        <IconUser size={22} />
        Roster
        <span className="text-sm font-body text-beige/60">
          {roster.length}/{maxMembers}
        </span>
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
                  <span className="text-xs font-body text-beige/70" title="In this clan since">
                    since {formatSince(member.tenureSince ?? member.joinedAt)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-arcade border text-xs font-display uppercase ${ROLE_CHIP[member.role] ?? ROLE_CHIP.member}`}
                  >
                    {member.role}
                  </span>
                  {isOwner && member.role !== 'owner' && (
                    <button
                      onClick={() =>
                        act(
                          { action: 'remove_member', targetUserId: member.userId },
                          'Removed from the clan'
                        )
                      }
                      disabled={busy}
                      className="btn-neutral px-3 py-1 text-xs min-h-[32px]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The invite link — every member can share the way in (§9.2) */}
        {invite?.code && (
          <div className="mt-5 border-t border-scale-blue-light/30 pt-4" data-testid="invite-link">
            <p className="label-arcade mb-2">Invite link</p>
            <p className="font-display text-lg text-bone-white tracking-widest">{invite.code}</p>
            {shareLink && (
              <p className="text-xs font-body text-beige/60 break-all mt-1">{shareLink}</p>
            )}
            {isOwner && (
              <button
                onClick={() =>
                  act({ action: 'rotate_invite_code' }, 'New invite code issued')
                }
                disabled={busy}
                className="btn-neutral px-4 py-2 text-sm min-h-[40px] mt-3"
                data-testid="rotate-invite-code"
              >
                New code
              </button>
            )}
          </div>
        )}

        {message && <p className="text-beige text-sm font-body mt-3">{message}</p>}
      </div>
    </section>
  );
}

/**
 * The invite inbox — pending invites issued before this rework.
 *
 * Nothing creates one any more (recruitment is the code), but Rule 5 says a
 * pending invite is not destroyed by a design change, so it stays answerable
 * until it expires on its own.
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
