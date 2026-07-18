/**
 * Discord REST layer (Player Identity v1 section 8, migration 024) -
 * plain fetch against the v10 API, no discord.js. Everything here is
 * SERVER-ONLY: bot token and user OAuth tokens never reach the client,
 * never appear in logs, never ride an error message.
 *
 * - discordFetch: bot-token REST with the proper User-Agent, 429
 *   retry_after handling and typed DiscordApiError failures.
 * - OAuth: code exchange, ROTATING refresh (Discord returns a new
 *   refresh token on every refresh - callers must persist the returned
 *   pair), token revocation.
 * - getFreshAccessToken: decrypt-or-refresh with degradation - a failed
 *   refresh marks the link revoked_at (section 8.5) and returns null.
 * - Linked Roles metadata push (the 5 registered fields).
 * - guilds.join, role assignment, channel+role+webhook provisioning
 *   (both clan models) and widget.json presence (no auth, 60s cache).
 *
 * PRE-MIGRATION-024 SAFE: isMissingDiscordInfra() classifies "the 024
 * tables don't exist yet" so every caller degrades to "Discord not
 * live" instead of failing a request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from './crypto';

export const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_USER_AGENT = 'DiscordBot (https://supasnake.com, 0.1)';

/** Discord permission bits used by provisioning. */
export const PERMISSION_VIEW_CHANNEL = 1 << 10; // 1024

/**
 * Channel-cap guard (section 8.3): official-guild clan links stop at
 * 400 - headroom below Discord's 500-channel guild cap. Past it, new
 * clans get Model B (own server) guidance.
 */
export const OFFICIAL_LINK_CAP = 400;

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/**
 * True when the error just means migration 024 has not been applied
 * yet: missing relation/column/function or a message naming the
 * Discord objects.
 */
export function isMissingDiscordInfra(
  error: SupabaseErrorLike | null | undefined
): boolean {
  if (!error) return false;
  if (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205'
  ) {
    return true;
  }
  return /discord_links|discord_clan_links|discord_event_outbox|update_clan_identity|set_clan_member_role|respond_clan_invite/i.test(
    error.message || ''
  );
}

export class DiscordApiError extends Error {
  status: number;
  code?: number;

  constructor(status: number, message: string, code?: number) {
    super(message);
    this.name = 'DiscordApiError';
    this.status = status;
    this.code = code;
  }
}

export interface DiscordTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  scope: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new DiscordApiError(500, `${name} is not configured`);
  return value;
}

const MAX_ATTEMPTS = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core fetch with 429 handling. auth: 'bot' (default) attaches the bot
 * token; 'none' for webhook/widget calls; a string is a user Bearer
 * token. Returns parsed JSON (or null on 204). Throws DiscordApiError.
 */
export async function discordFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  auth: 'bot' | 'none' | { bearer: string } = 'bot'
): Promise<T | null> {
  const url = path.startsWith('http') ? path : `${DISCORD_API}${path}`;
  const headers: Record<string, string> = {
    'User-Agent': DISCORD_USER_AGENT,
    ...(init.body && !(init.body instanceof URLSearchParams)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  if (auth === 'bot') {
    headers['Authorization'] = `Bot ${requiredEnv('DISCORD_BOT_TOKEN')}`;
  } else if (typeof auth === 'object') {
    headers['Authorization'] = `Bearer ${auth.bearer}`;
  }
  if (init.body instanceof URLSearchParams) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  let lastError: DiscordApiError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      ...init,
      body:
        init.body instanceof URLSearchParams
          ? init.body.toString()
          : init.body,
      headers,
    });

    if (response.status === 429) {
      // Rate limited: honor retry_after (seconds, possibly fractional)
      let retryAfterMs = 1000;
      try {
        const body = (await response.json()) as { retry_after?: number };
        if (typeof body.retry_after === 'number') {
          retryAfterMs = Math.ceil(body.retry_after * 1000);
        }
      } catch {
        const header = response.headers.get('retry-after');
        if (header) retryAfterMs = Math.ceil(parseFloat(header) * 1000);
      }
      lastError = new DiscordApiError(429, 'Rate limited');
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(Math.min(retryAfterMs, 5000));
        continue;
      }
      throw lastError;
    }

    if (response.status === 204) return null;

    if (!response.ok) {
      let message = `Discord API error ${response.status}`;
      let code: number | undefined;
      try {
        const body = (await response.json()) as {
          message?: string;
          code?: number;
        };
        if (body.message) message = body.message;
        code = body.code;
      } catch {
        // keep the generic message
      }
      throw new DiscordApiError(response.status, message, code);
    }

    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  }
  throw lastError ?? new DiscordApiError(500, 'Discord request failed');
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export const DISCORD_OAUTH_SCOPES = 'identify guilds.join role_connections.write';

/** Pick the registered redirect URI matching the request host. */
export function redirectUriForHost(host: string | null): string {
  const isLocal =
    !!host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'));
  return isLocal
    ? requiredEnv('DISCORD_REDIRECT_URI_LOCAL')
    : requiredEnv('DISCORD_REDIRECT_URI');
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv('DISCORD_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DISCORD_OAUTH_SCOPES,
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function tokenPairFromResponse(body: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}): DiscordTokenPair {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    scope: body.scope ?? '',
  };
}

export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<DiscordTokenPair> {
  const body = await discordFetch<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  }>(
    '/oauth2/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: requiredEnv('DISCORD_CLIENT_ID'),
        client_secret: requiredEnv('DISCORD_CLIENT_SECRET'),
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    },
    'none'
  );
  if (!body?.access_token || !body.refresh_token) {
    throw new DiscordApiError(502, 'Token exchange returned no tokens');
  }
  return tokenPairFromResponse(body);
}

/**
 * Refresh grant. Discord ROTATES refresh tokens: the response carries a
 * NEW refresh token and the old one dies - callers must persist the
 * whole returned pair.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<DiscordTokenPair> {
  const body = await discordFetch<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  }>(
    '/oauth2/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: requiredEnv('DISCORD_CLIENT_ID'),
        client_secret: requiredEnv('DISCORD_CLIENT_SECRET'),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    },
    'none'
  );
  if (!body?.access_token || !body.refresh_token) {
    throw new DiscordApiError(502, 'Token refresh returned no tokens');
  }
  return tokenPairFromResponse(body);
}

export async function revokeDiscordToken(token: string): Promise<void> {
  await discordFetch(
    '/oauth2/token/revoke',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: requiredEnv('DISCORD_CLIENT_ID'),
        client_secret: requiredEnv('DISCORD_CLIENT_SECRET'),
        token,
        token_type_hint: 'access_token',
      }),
    },
    'none'
  );
}

export async function getCurrentUser(accessToken: string): Promise<DiscordUser> {
  const user = await discordFetch<DiscordUser>('/users/@me', {}, {
    bearer: accessToken,
  });
  if (!user?.id) throw new DiscordApiError(502, 'users/@me returned no id');
  return user;
}

// ---------------------------------------------------------------------------
// Token custody: decrypt-or-refresh with rotating-pair persistence
// ---------------------------------------------------------------------------

interface DiscordLinkRow {
  player_id: string;
  discord_user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string | null;
  revoked_at: string | null;
}

export interface LiveDiscordLink {
  discordUserId: string;
  accessToken: string;
}

/**
 * The player's live Discord grant, refreshing when (nearly) expired.
 * Rotating refresh: the returned pair is ALWAYS persisted before use.
 * On refresh failure the link is marked revoked_at (section 8.5
 * degradation) and null returns - callers no-op. NEVER throws.
 */
export async function getLiveDiscordLink(
  supabase: SupabaseClient,
  playerId: string
): Promise<LiveDiscordLink | null> {
  try {
    const { data, error } = await supabase
      .from('discord_links')
      .select(
        'player_id, discord_user_id, access_token_enc, refresh_token_enc, token_expires_at, revoked_at'
      )
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) {
      if (!isMissingDiscordInfra(error)) {
        console.error('discord_links read error:', { playerId, error });
      }
      return null;
    }
    if (!data) return null;
    const link = data as DiscordLinkRow;
    if (link.revoked_at) return null;

    const expiresAt = link.token_expires_at
      ? new Date(link.token_expires_at).getTime()
      : 0;
    const needsRefresh = expiresAt - Date.now() < 60_000;

    if (!needsRefresh) {
      const { error: touchError } = await supabase
        .from('discord_links')
        .update({ last_used_at: new Date().toISOString() })
        .eq('player_id', playerId);
      if (touchError && !isMissingDiscordInfra(touchError)) {
        console.error('discord_links touch error:', { playerId, error: touchError });
      }
      return {
        discordUserId: link.discord_user_id,
        accessToken: decryptSecret(link.access_token_enc),
      };
    }

    // Refresh (rotating): persist the returned pair FIRST, then use it
    try {
      const pair = await refreshAccessToken(decryptSecret(link.refresh_token_enc));
      const { error: persistError } = await supabase
        .from('discord_links')
        .update({
          access_token_enc: encryptSecret(pair.accessToken),
          refresh_token_enc: encryptSecret(pair.refreshToken),
          token_expires_at: new Date(
            Date.now() + pair.expiresIn * 1000
          ).toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq('player_id', playerId);
      if (persistError) {
        console.error('discord_links refresh persist error:', {
          playerId,
          error: persistError,
        });
        return null;
      }
      return { discordUserId: link.discord_user_id, accessToken: pair.accessToken };
    } catch (refreshError) {
      // Section 8.5: refresh failure degrades to revoked - the 30-day
      // sweep deletes the row; the UI shows unlink-with-notice.
      console.error('Discord token refresh failed - degrading link:', {
        playerId,
        status:
          refreshError instanceof DiscordApiError ? refreshError.status : null,
      });
      const { error: revokeError } = await supabase
        .from('discord_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('player_id', playerId);
      if (revokeError && !isMissingDiscordInfra(revokeError)) {
        console.error('discord_links degrade error:', { playerId, error: revokeError });
      }
      return null;
    }
  } catch (err) {
    console.error('getLiveDiscordLink error:', { playerId, err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Linked Roles metadata (section 8.4 - exactly 5 registered fields)
// ---------------------------------------------------------------------------

export interface LinkedRolesMetadata {
  mastery_level: number;
  legacy_score: number;
  gauntlet_champion: 0 | 1;
  founder: 0 | 1;
  extraction_count: number;
}

export async function pushRoleConnection(
  accessToken: string,
  platformUsername: string,
  metadata: LinkedRolesMetadata
): Promise<void> {
  await discordFetch(
    `/users/@me/applications/${requiredEnv('DISCORD_CLIENT_ID')}/role-connection`,
    {
      method: 'PUT',
      body: JSON.stringify({
        platform_name: 'SupaSnake',
        platform_username: platformUsername,
        metadata,
      }),
    },
    { bearer: accessToken }
  );
}

// ---------------------------------------------------------------------------
// Guild membership + roles
// ---------------------------------------------------------------------------

/**
 * guilds.join: add the OAuth'd user to a guild the bot is in. Returns
 * 'joined' (201) or 'already' (204). Throws on 403 (missing perms /
 * user cap) - callers fall back to the invite link.
 */
export async function addGuildMember(
  guildId: string,
  discordUserId: string,
  accessToken: string
): Promise<'joined' | 'already'> {
  const result = await discordFetch<{ user?: unknown }>(
    `/guilds/${guildId}/members/${discordUserId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ access_token: accessToken }),
    },
    'bot'
  );
  return result === null ? 'already' : 'joined';
}

export async function addMemberRole(
  guildId: string,
  discordUserId: string,
  roleId: string
): Promise<void> {
  await discordFetch(
    `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    { method: 'PUT' },
    'bot'
  );
}

export async function getGuild(
  guildId: string
): Promise<{ id: string; name: string }> {
  const guild = await discordFetch<{ id: string; name: string }>(
    `/guilds/${guildId}`,
    {},
    'bot'
  );
  if (!guild?.id) throw new DiscordApiError(404, 'Guild not found');
  return guild;
}

// ---------------------------------------------------------------------------
// Clan space provisioning (both models): private channel + role +
// webhook + invite. Cleans up partial state on failure.
// ---------------------------------------------------------------------------

export interface ProvisionedClanSpace {
  guildId: string;
  channelId: string;
  roleId: string;
  webhookId: string;
  webhookToken: string;
  inviteUrl: string | null;
}

export async function provisionClanSpace(
  guildId: string,
  clan: { name: string; tag: string }
): Promise<ProvisionedClanSpace> {
  let roleId: string | null = null;
  let channelId: string | null = null;
  try {
    const role = await discordFetch<{ id: string }>(
      `/guilds/${guildId}/roles`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Clan ${clan.tag}`,
          mentionable: true,
        }),
      },
      'bot'
    );
    if (!role?.id) throw new DiscordApiError(502, 'Role creation returned no id');
    roleId = role.id;

    // Private text channel: @everyone denied VIEW_CHANNEL, clan role
    // allowed - visibility rides the role (section 8.3).
    const channel = await discordFetch<{ id: string }>(
      `/guilds/${guildId}/channels`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `clan-${clan.tag.toLowerCase()}`,
          type: 0,
          topic: `${clan.name} — SupaSnake clan feed`,
          permission_overwrites: [
            {
              id: guildId, // @everyone shares the guild id
              type: 0,
              deny: String(PERMISSION_VIEW_CHANNEL),
            },
            {
              id: role.id,
              type: 0,
              allow: String(PERMISSION_VIEW_CHANNEL),
            },
          ],
        }),
      },
      'bot'
    );
    if (!channel?.id) throw new DiscordApiError(502, 'Channel creation returned no id');
    channelId = channel.id;

    const webhook = await discordFetch<{ id: string; token: string }>(
      `/channels/${channel.id}/webhooks`,
      {
        method: 'POST',
        body: JSON.stringify({ name: 'SupaSnake Herald' }),
      },
      'bot'
    );
    if (!webhook?.id || !webhook.token) {
      throw new DiscordApiError(502, 'Webhook creation returned no token');
    }

    let inviteUrl: string | null = null;
    try {
      const invite = await discordFetch<{ code: string }>(
        `/channels/${channel.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ max_age: 0, max_uses: 0, unique: true }),
        },
        'bot'
      );
      if (invite?.code) inviteUrl = `https://discord.gg/${invite.code}`;
    } catch {
      // Invite creation is best-effort (widget invite covers the gap)
      inviteUrl = null;
    }

    return {
      guildId,
      channelId: channel.id,
      roleId: role.id,
      webhookId: webhook.id,
      webhookToken: webhook.token,
      inviteUrl,
    };
  } catch (err) {
    // Roll back partial provisioning so a retry starts clean
    if (channelId) {
      try {
        await deleteChannel(channelId);
      } catch {
        /* best effort */
      }
    }
    if (roleId) {
      try {
        await deleteRole(guildId, roleId);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
}

export async function deleteChannel(channelId: string): Promise<void> {
  await discordFetch(`/channels/${channelId}`, { method: 'DELETE' }, 'bot');
}

export async function deleteRole(guildId: string, roleId: string): Promise<void> {
  await discordFetch(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' }, 'bot');
}

// ---------------------------------------------------------------------------
// Webhook execution (the event feed post)
// ---------------------------------------------------------------------------

export interface WebhookMessage {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }>;
}

export async function executeWebhook(
  webhookId: string,
  webhookToken: string,
  message: WebhookMessage
): Promise<void> {
  await discordFetch(
    `/webhooks/${webhookId}/${webhookToken}`,
    {
      method: 'POST',
      body: JSON.stringify(message),
    },
    'none'
  );
}

// ---------------------------------------------------------------------------
// widget.json presence (no auth) - cached 60s in-memory per guild
// ---------------------------------------------------------------------------

export interface GuildWidget {
  presence_count: number;
  instant_invite: string | null;
  members: Array<{
    username: string;
    status: string;
    avatar_url?: string;
  }>;
}

const WIDGET_CACHE_TTL_MS = 60_000;
const widgetCache = new Map<string, { at: number; widget: GuildWidget | null }>();

/** Test hook - the cache is module-global in a serverless instance. */
export function clearWidgetCache(): void {
  widgetCache.clear();
}

/**
 * The guild's widget.json (the "someone's home" presence signal). null
 * when the widget is disabled or the fetch fails - presence is always
 * optional. Cached 60 seconds.
 */
export async function getGuildWidget(guildId: string): Promise<GuildWidget | null> {
  const cached = widgetCache.get(guildId);
  if (cached && Date.now() - cached.at < WIDGET_CACHE_TTL_MS) {
    return cached.widget;
  }
  let widget: GuildWidget | null = null;
  try {
    const raw = await discordFetch<{
      presence_count?: number;
      instant_invite?: string | null;
      members?: Array<{ username?: string; status?: string; avatar_url?: string }>;
    }>(`/guilds/${guildId}/widget.json`, {}, 'none');
    if (raw) {
      widget = {
        presence_count: raw.presence_count ?? 0,
        instant_invite: raw.instant_invite ?? null,
        members: (raw.members ?? []).slice(0, 24).map((m) => ({
          username: m.username ?? 'unknown',
          status: m.status ?? 'online',
          avatar_url: m.avatar_url,
        })),
      };
    }
  } catch (err) {
    if (!(err instanceof DiscordApiError && err.status === 403)) {
      console.error('widget.json fetch failed:', {
        guildId,
        status: err instanceof DiscordApiError ? err.status : null,
      });
    }
    widget = null;
  }
  widgetCache.set(guildId, { at: Date.now(), widget });
  return widget;
}
