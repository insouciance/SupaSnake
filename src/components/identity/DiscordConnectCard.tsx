'use client';

/**
 * Settings Discord card (Identity v1 sections 8.3/8.5).
 *
 * Unlinked: connect CTA listing exactly what linking does (per the doc
 * privacy rules - join the official server, clan role, Linked Roles
 * stats; no message content ever, unlink deletes the grant).
 * Linked: shows the Discord username + unlink.
 * Also lands the OAuth redirect (?discord=linked|error&join=invite).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';

interface DiscordStatus {
  live: boolean;
  linked: boolean;
  discordUsername?: string | null;
  revoked?: boolean;
}

export function DiscordConnectCard() {
  const { session } = useAuth();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const accessToken = session?.access_token;

  const loadStatus = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch('/api/discord/status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        setStatus((await response.json()) as DiscordStatus);
      }
    } catch (error) {
      console.error('Discord status load failed:', error);
    }
  }, [accessToken]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // OAuth redirect landing (?discord=linked|error, window-read so the
  // page needs no Suspense boundary)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('discord');
    if (result === 'linked') {
      setNotice(
        params.get('join') === 'invite'
          ? 'Discord linked! Auto-join was blocked — use the invite below to enter the server.'
          : 'Discord linked!'
      );
    } else if (result === 'error') {
      setNotice('Discord linking failed — try again.');
    }
    setInviteUrl(params.get('invite'));
  }, []);

  const connect = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const response = await fetch('/api/discord/link', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.error ?? 'Could not start Discord linking');
    } catch {
      setNotice('Could not start Discord linking');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const response = await fetch('/api/discord/status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        setNotice('Discord unlinked — the grant was revoked and deleted.');
        await loadStatus();
      } else {
        setNotice('Failed to unlink');
      }
    } catch {
      setNotice('Failed to unlink');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-glow [--glow:#5865F2] p-6 mb-6 animate-fade-up" data-testid="discord-connect-card">
      <h2 className="heading-display text-xl text-bone-white mb-2">Discord</h2>

      {status?.linked ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-body text-bone-white">
              Linked as{' '}
              <span className="font-display text-venom-orange">
                {status.discordUsername ?? 'your Discord account'}
              </span>
            </p>
            <p className="text-beige/70 text-sm font-body">
              Clan feed, roles and Linked Role stats are live.
            </p>
          </div>
          <button
            onClick={unlink}
            disabled={busy}
            className="btn-neutral px-5 py-2 min-h-[44px] self-start"
            data-testid="discord-unlink-self"
          >
            Unlink
          </button>
        </div>
      ) : (
        <>
          {status?.revoked && (
            <p className="text-strike-red text-sm font-body mb-2">
              Your Discord link expired — reconnect to restore it.
            </p>
          )}
          <p className="text-beige font-body text-sm mb-3">Connecting Discord will:</p>
          <ul className="text-beige/80 text-sm font-body list-disc list-inside space-y-1 mb-3">
            <li>Join you to the official SupaSnake server</li>
            <li>Give you your clan&apos;s channel role (when your clan is linked)</li>
            <li>
              Share five stats as Linked Roles: mastery, legacy score, champion,
              founder, extractions
            </li>
          </ul>
          <p className="text-beige/50 text-xs font-body mb-4">
            We never read messages; the bot never reads channels; tokens are stored
            encrypted; unlinking revokes and deletes the grant.
          </p>
          <button
            onClick={connect}
            disabled={busy || !accessToken}
            className="btn-go px-6 py-2 min-h-[44px]"
            data-testid="discord-connect"
          >
            Connect Discord
          </button>
        </>
      )}

      {notice && <p className="text-beige text-sm font-body mt-3">{notice}</p>}
      {inviteUrl && (
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-neutral inline-flex items-center px-5 py-2 min-h-[44px] mt-3"
        >
          Join the Server
        </a>
      )}
    </div>
  );
}
