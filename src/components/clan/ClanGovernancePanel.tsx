'use client';

/** Recruitment and policy tools, shown only to the roles that own them. */

import { useState } from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import type { ClanJoinPolicy } from '@/lib/clan/types';
import { clanAction, type ClanFullView } from './useClanFull';

interface ClanGovernancePanelProps {
  accessToken?: string;
  view: ClanFullView;
  onChanged: () => void;
}

const POLICY_COPY: Record<ClanJoinPolicy, string> = {
  open: 'Players with space available join immediately.',
  application: 'Leaders review each request before the player joins.',
  invite_only: 'Only a direct invitation or invite code can admit a player.',
};

export function ClanGovernancePanel({ accessToken, view, onChanged }: ClanGovernancePanelProps) {
  const permissions = view.membership?.permissions;
  const applications = view.applications ?? [];
  const [handle, setHandle] = useState('');
  const [policy, setPolicy] = useState<ClanJoinPolicy>(view.settings?.joinPolicy ?? 'application');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (key: string, body: Record<string, unknown>, success: string) => {
    setBusy(key);
    setMessage(null);
    const result = await clanAction(accessToken, body);
    setBusy(null);
    setMessage(result.ok ? success : result.error ?? 'Request failed');
    if (result.ok) onChanged();
    return result.ok;
  };

  const copyInvite = async () => {
    const path = view.invite?.url;
    if (!path) return;
    const link = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Invite link copied');
    } catch {
      setMessage(link);
    }
  };

  if (!permissions?.invite && !permissions?.reviewApplications && !permissions?.manageSettings) {
    return null;
  }

  return (
    <section className="space-y-4 animate-fade-up" data-testid="clan-governance">
      <div>
        <h2 className="heading-display text-2xl text-bone-white">Recruit & manage</h2>
        <p className="mt-1 text-sm font-body text-beige/65">
          The server verifies every invitation, application, and role permission.
        </p>
      </div>

      {permissions.reviewApplications && (
        <details className="panel p-4" open={applications.length > 0}>
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between font-display uppercase text-bone-white">
            Applications
            <span className="rounded-full bg-venom-orange/15 px-2.5 py-1 text-xs text-venom-orange">{applications.length}</span>
          </summary>
          {applications.length === 0 ? (
            <p className="pt-3 text-sm font-body text-beige/55">No application needs a decision.</p>
          ) : (
            <div className="space-y-3 pt-3">
              {applications.map((application) => (
                <div key={application.id} className="rounded-arcade border border-scale-blue-light/40 bg-void/45 p-3" data-testid="clan-application">
                  {application.identity ? (
                    <PlayerCard identity={application.identity} variant="row" />
                  ) : (
                    <p className="font-display text-bone-white">Handler</p>
                  )}
                  <p className="mt-1 text-xs font-body text-beige/50">Applied {new Date(application.createdAt).toLocaleDateString()}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy === application.id}
                      onClick={() => void act(application.id, { action: 'approve_application', applicationId: application.id }, 'Application accepted')}
                      className="btn-go min-h-[44px] px-4"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy === application.id}
                      onClick={() => void act(application.id, { action: 'reject_application', applicationId: application.id }, 'Application declined')}
                      className="btn-neutral min-h-[44px] px-4"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
      )}

      {permissions.invite && (
        <details className="panel p-4">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-display uppercase text-bone-white">
            Invite players
          </summary>
          <div className="space-y-4 pt-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act('invite', { action: 'invite', handle: handle.trim() }, `Invitation sent to ${handle.trim()}`).then((ok) => {
                  if (ok) setHandle('');
                });
              }}
            >
              <label htmlFor="clan-invite-handle" className="text-sm font-body text-beige">Exact player handle</label>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  id="clan-invite-handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  pattern="[A-Za-z0-9_]{3,16}"
                  maxLength={16}
                  placeholder="Snake_Handler"
                  className="min-h-[44px] min-w-0 rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 font-body text-bone-white focus:border-venom-orange focus:outline-none"
                />
                <button type="submit" disabled={busy === 'invite' || !/^[A-Za-z0-9_]{3,16}$/.test(handle.trim())} className="btn-go min-h-[44px] px-5">
                  Invite
                </button>
              </div>
              <p className="mt-1 text-xs font-body text-beige/50">Exact handle only. The invitation expires automatically.</p>
            </form>

            {view.invite?.code && (
              <div className="rounded-arcade border border-scale-blue-light/40 bg-void/45 p-3" data-testid="invite-code">
                <p className="label-arcade">Shareable code</p>
                <p className="mt-1 font-display text-xl tracking-[0.22em] text-bone-white">{view.invite.code}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copyInvite()} className="btn-neutral min-h-[44px] px-4">Copy link</button>
                  {permissions.manageSettings && (
                    <button type="button" disabled={busy === 'rotate'} onClick={() => void act('rotate', { action: 'rotate_invite_code' }, 'New invite code created')} className="btn-neutral min-h-[44px] px-4">
                      Replace code
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {permissions.manageSettings && (
        <details className="panel p-4">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-display uppercase text-bone-white">
            Membership settings
          </summary>
          <div className="pt-3">
            <label htmlFor="clan-join-policy" className="text-sm font-body text-beige">Who can join?</label>
            <select
              id="clan-join-policy"
              value={policy}
              onChange={(event) => setPolicy(event.target.value as ClanJoinPolicy)}
              className="mt-1 min-h-[44px] w-full rounded-arcade border border-scale-blue-light/60 bg-void/70 px-3 font-body text-bone-white focus:border-venom-orange focus:outline-none"
            >
              <option value="open">Open</option>
              <option value="application">Application</option>
              <option value="invite_only">Invite only</option>
            </select>
            <p className="mt-2 text-xs font-body text-beige/55">{POLICY_COPY[policy]}</p>
            <button
              type="button"
              disabled={busy === 'settings' || policy === view.settings?.joinPolicy}
              onClick={() => void act('settings', { action: 'update_settings', joinPolicy: policy }, 'Membership setting saved')}
              className="btn-go mt-3 min-h-[44px] px-5"
            >
              Save setting
            </button>
          </div>
        </details>
      )}

      {message && <p className="text-sm font-body text-beige" role="status">{message}</p>}
    </section>
  );
}

export default ClanGovernancePanel;
