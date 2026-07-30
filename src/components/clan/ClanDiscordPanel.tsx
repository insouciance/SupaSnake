'use client';

/**
 * Clan Discord panel (Identity v1 sections 8.3/8.4).
 *
 * Not linked (owner): the two-model choice -
 *   Model A "official server" (one click, per-clan private channel +
 *   role in the SupaSnake guild) and Model B "your own server" (invite
 *   the bot, paste the server id).
 * Linked: widget presence (online count + avatar chips via the
 * /api/discord/widget proxy - the browser never talks to Discord),
 * invite link + an "open channel" deep link (https - the app/desktop
 * client intercepts it).
 */

import { useCallback, useEffect, useState } from 'react';
import { clanAction, type ClanFullView } from './useClanFull';

interface WidgetPresence {
  onlineCount: number;
  members: Array<{ username: string; status: string; avatarUrl: string | null }>;
}

interface ClanDiscordPanelProps {
  accessToken?: string;
  view: ClanFullView;
  onChanged: () => void;
}

export function ClanDiscordPanel({ accessToken, view, onChanged }: ClanDiscordPanelProps) {
  const discord = view.discord ?? { linked: false };
  const role = view.membership?.role ?? 'member';
  // Rule 8 / §9.2: there is no officer rank. Linking a Discord home is an
  // owner act, like heraldry and the invite code.
  const isOwner = role === 'owner';
  const clanId = view.membership?.clanId;

  const [presence, setPresence] = useState<WidgetPresence | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(discord.inviteUrl ?? null);
  const [ownGuildId, setOwnGuildId] = useState('');
  const [showOwnForm, setShowOwnForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPresence = useCallback(async () => {
    if (!discord.linked || !accessToken || !clanId) return;
    try {
      const response = await fetch(`/api/discord/widget?clan=${encodeURIComponent(clanId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        presence?: WidgetPresence | null;
        inviteUrl?: string | null;
      };
      setPresence(data.presence ?? null);
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
    } catch (error) {
      console.error('Presence load failed:', error);
    }
  }, [discord.linked, accessToken, clanId]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  const link = async (body: Record<string, unknown>, okMessage: string) => {
    if (!accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/clan/discord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage((data as { error?: string }).error ?? 'Request failed');
      } else {
        setMessage(okMessage);
        onChanged();
      }
    } catch {
      setMessage('Request failed');
    } finally {
      setBusy(false);
    }
  };

  const channelUrl =
    discord.linked && discord.guildId && discord.channelId
      ? `https://discord.com/channels/${discord.guildId}/${discord.channelId}`
      : null;

  return (
    <section className="mb-10 animate-fade-up" data-testid="clan-discord-panel">
      <h2 className="heading-display text-2xl text-bone-white mb-4">Discord</h2>
      <div className="panel-glow [--glow:#5865F2] p-6">
        {discord.linked ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-bone-white font-display uppercase">
                  {discord.model === 'own' ? 'Clan server linked' : 'Official server — clan channel live'}
                </p>
                <p className="text-beige text-sm font-body">
                  Presence and selected career milestones can post here. Energy Battle
                  attempts and teammate performance stay private in the game.
                </p>
              </div>
              <div className="flex gap-2">
                {channelUrl && (
                  <a
                    href={channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-go px-5 py-2 min-h-[44px] inline-flex items-center"
                    data-testid="open-channel"
                  >
                    Open Channel
                  </a>
                )}
                {inviteUrl && (
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-neutral px-5 py-2 min-h-[44px] inline-flex items-center"
                    data-testid="discord-invite"
                  >
                    Invite Link
                  </a>
                )}
              </div>
            </div>

            {/* Presence: the "someone's home" signal */}
            {presence ? (
              <div className="bg-void/50 border border-scale-blue-light/40 rounded-arcade p-3" data-testid="discord-presence">
                <p className="label-arcade mb-2">
                  {presence.onlineCount} online now
                </p>
                <div className="flex flex-wrap gap-2">
                  {presence.members.map((member, index) => (
                    <span
                      key={`${member.username}-${index}`}
                      className="flex items-center gap-1.5 px-2 py-1 bg-void/60 border border-scale-blue-light/40 rounded-arcade text-xs font-body text-beige"
                      title={member.status}
                    >
                      {member.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.avatarUrl}
                          alt=""
                          className="w-4 h-4 rounded-full"
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-rarity-uncommon inline-block" />
                      )}
                      {member.username}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-beige/50 text-xs font-body">
                Presence unavailable (server widget may be disabled).
              </p>
            )}

            {isOwner && (
              <button
                onClick={() => link({ action: 'unlink' }, 'Discord unlinked')}
                disabled={busy}
                className="text-strike-red hover:text-bone-white text-sm font-body transition-colors mt-4 min-h-[32px]"
                data-testid="discord-unlink"
              >
                Unlink Discord
              </button>
            )}
          </>
        ) : isOwner ? (
          <>
            <p className="text-bone-white font-body mb-1">
              Give your clan a home. Discord <em>is</em> the clan&apos;s conversation layer;
              SupaSnake keeps Energy Battle attempts, thresholds and member comparisons private.
            </p>
            <p className="text-beige/70 text-sm font-body mb-4">
              Two ways to link — a private channel + role in the official SupaSnake server
              (one click), or the bot joins a server your clan already owns. Selected shared
              milestones may appear, never a member performance feed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() =>
                  link({ action: 'link_official' }, 'Clan channel created in the official server')
                }
                disabled={busy}
                className="btn-go px-5 py-2 min-h-[44px]"
                data-testid="link-official"
              >
                Link Official Server
              </button>
              <button
                onClick={() => setShowOwnForm((v) => !v)}
                disabled={busy}
                className="btn-neutral px-5 py-2 min-h-[44px]"
                data-testid="link-own-toggle"
              >
                Use Our Own Server
              </button>
            </div>
            {showOwnForm && (
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ownGuildId) {
                    link(
                      { action: 'link_own', guildId: ownGuildId },
                      'Clan channel created in your server'
                    );
                  }
                }}
              >
                <p className="text-beige/70 text-xs font-body">
                  Invite the SupaSnake bot to your server (Manage Channels, Manage Roles,
                  Manage Webhooks, Create Instant Invite), then paste your Server ID.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ownGuildId}
                    onChange={(e) => setOwnGuildId(e.target.value.trim())}
                    placeholder="Server ID"
                    pattern="\d{5,25}"
                    className="flex-1 px-4 py-2 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-bone-white font-body placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={busy || !ownGuildId}
                    className="btn-go px-5 py-2 min-h-[44px]"
                  >
                    Link
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="text-beige font-body">
            Your clan hasn&apos;t linked a Discord home yet — ask the clan&apos;s owner.
          </p>
        )}
        {message && <p className="text-beige text-sm font-body mt-3">{message}</p>}
      </div>
    </section>
  );
}
