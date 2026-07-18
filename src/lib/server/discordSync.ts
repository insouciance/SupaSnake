/**
 * Discord event-feed producers + consumer + Linked Roles refresh
 * (Player Identity v1 section 8.4, migration 024).
 *
 * - enqueueMasteryLevelup: the session route's producer - M5+ only
 *   (M1-4 are too chatty), only when the player's clan has a Discord
 *   space. Idempotent via dedup_key.
 * - refreshLinkedRolesForPlayer: recompute + push the 5 registered
 *   metadata fields through the player's OWN OAuth grant. No-ops when
 *   the player has no live link. Called after records refresh, mastery
 *   grants and settlement reads - always NON-FATAL.
 * - drainDiscordOutbox: the consumer - batch<=N oldest pending rows,
 *   attempts-based exponential skip, dead-letter at 5 attempts, one
 *   webhook post per row into the owning clan's channel. Used by the
 *   5-minute cron (batch 10) and opportunistically (batch 3) after
 *   duel settlement reads.
 * - sweepStaleDiscordLinks: the section 8.5 30-day sweep for
 *   refresh-dead grants.
 *
 * Everything here is PRE-MIGRATION-024 SAFE and never throws into its
 * caller: a missing table reads as "Discord not live yet".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { levelForXp } from '@/shared/game/mastery';
import { RESEARCH_NODES } from '@/shared/game/gauntlet';
import { decryptSecret } from './crypto';
import {
  executeWebhook,
  getLiveDiscordLink,
  isMissingDiscordInfra,
  pushRoleConnection,
  type LinkedRolesMetadata,
  type WebhookMessage,
} from './discord';

/** Founder window (mirrors the 022 view's is_founder cutoff). */
const FOUNDER_CUTOFF = Date.parse('2026-07-20T00:00:00Z');

export const OUTBOX_DEAD_AT = 5;

// ---------------------------------------------------------------------------
// Producers (TS side - SQL producers live in migration 024)
// ---------------------------------------------------------------------------

/**
 * Enqueue a mastery_levelup feed event (M5+ only) when the player's
 * clan has a Discord space. Non-fatal, idempotent per
 * (player, dynasty, level).
 */
export async function enqueueMasteryLevelup(
  supabase: SupabaseClient,
  playerId: string,
  dynasty: string,
  level: number
): Promise<void> {
  if (level < 5) return;
  try {
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('user_id')
      .eq('id', playerId)
      .single();
    if (playerError || !player?.user_id) return;

    const { data: membership, error: membershipError } = await supabase
      .from('clan_members')
      .select('clan_id')
      .eq('player_id', player.user_id)
      .maybeSingle();
    if (membershipError || !membership) return;

    const { data: link, error: linkError } = await supabase
      .from('discord_clan_links')
      .select('clan_id')
      .eq('clan_id', membership.clan_id)
      .maybeSingle();
    if (linkError) {
      if (!isMissingDiscordInfra(linkError)) {
        console.error('discord_clan_links read error:', linkError);
      }
      return;
    }
    if (!link) return;

    const { data: identity } = await supabase
      .from('player_identity_view')
      .select('display_handle')
      .eq('player_id', playerId)
      .maybeSingle();

    const { error: insertError } = await supabase
      .from('discord_event_outbox')
      .upsert(
        {
          event_type: 'mastery_levelup',
          clan_id: membership.clan_id,
          dedup_key: `mastery_levelup:${playerId}:${dynasty}:${level}`,
          payload: {
            handle: identity?.display_handle ?? 'A handler',
            dynasty,
            level,
          },
        },
        { onConflict: 'dedup_key', ignoreDuplicates: true }
      );
    if (insertError && !isMissingDiscordInfra(insertError)) {
      console.error('mastery_levelup enqueue error:', insertError);
    }
  } catch (err) {
    console.error('enqueueMasteryLevelup error:', { playerId, err });
  }
}

// ---------------------------------------------------------------------------
// Linked Roles metadata refresh (section 8.4)
// ---------------------------------------------------------------------------

/**
 * Recompute the 5 registered metadata fields from server-trusted state
 * and push them through the player's own grant. No-ops without a live
 * link; NEVER throws (every caller treats this as fire-and-forget).
 */
export async function refreshLinkedRolesForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<boolean> {
  try {
    const link = await getLiveDiscordLink(supabase, playerId);
    if (!link) return false;

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('created_at, handle, legacy_score')
      .eq('id', playerId)
      .single();
    if (playerError || !player) return false;

    const { data: masteryRows } = await supabase
      .from('player_mastery')
      .select('xp')
      .eq('player_id', playerId);
    const masteryLevel = (masteryRows ?? []).reduce(
      (best: number, row: { xp: number }) => Math.max(best, levelForXp(row.xp ?? 0)),
      0
    );

    const { data: recordRows } = await supabase
      .from('player_records')
      .select('record_id, value, tier')
      .eq('player_id', playerId)
      .in('record_id', ['crowned', 'clean_getaways']);
    let gauntletChampion: 0 | 1 = 0;
    let extractionCount = 0;
    for (const row of recordRows ?? []) {
      if (row.record_id === 'crowned' && Number(row.value) > 0) gauntletChampion = 1;
      if (row.record_id === 'clean_getaways') extractionCount = Number(row.value) || 0;
    }

    const metadata: LinkedRolesMetadata = {
      mastery_level: masteryLevel,
      legacy_score: player.legacy_score ?? 0,
      gauntlet_champion: gauntletChampion,
      founder:
        player.created_at && Date.parse(player.created_at) < FOUNDER_CUTOFF
          ? 1
          : 0,
      extraction_count: extractionCount,
    };

    const platformUsername = player.handle ?? 'handler';
    await pushRoleConnection(link.accessToken, platformUsername, metadata);
    return true;
  } catch (err) {
    // Non-fatal by contract - metadata refresh must never fail a request
    console.error('refreshLinkedRolesForPlayer error:', { playerId, err });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Embed formatting (pure - unit tested)
// ---------------------------------------------------------------------------

const EMBED_COLOR = 0xf97316; // venom orange

interface DuelSideJson {
  id?: string;
  name?: string;
  tag?: string;
  score?: number;
}

/** The webhook message for an outbox row. Null = unknown type (dead). */
export function messageForEvent(
  eventType: string,
  payload: Record<string, unknown>
): WebhookMessage | null {
  switch (eventType) {
    case 'duel_settled': {
      const a = (payload.clan_a ?? {}) as DuelSideJson;
      const b = (payload.clan_b ?? {}) as DuelSideJson;
      const winner = payload.winner as string | null | undefined;
      const delta = Number(payload.rating_delta ?? 0);
      const winnerLine = !winner
        ? 'Tie — no rating change'
        : winner === a.id
          ? `**${a.name}** take the week (±${delta} rating)`
          : `**${b.name}** take the week (±${delta} rating)`;
      return {
        embeds: [
          {
            title: '⚔️ Duel settled',
            description: `**${a.name}** [${a.tag}] ${a.score ?? 0} — ${b.score ?? 0} [${b.tag}] **${b.name}**\n${winnerLine}`,
            color: EMBED_COLOR,
            fields: [
              {
                name: 'Week',
                value: String(payload.week_start ?? ''),
                inline: true,
              },
            ],
          },
        ],
      };
    }
    case 'gauntlet_unlock': {
      const nodeId = String(payload.node_id ?? '');
      const node = RESEARCH_NODES.find((n) => n.id === nodeId);
      return {
        embeds: [
          {
            title: '🔬 Research complete',
            description: `**${payload.clan_name}** unlocked **${node?.name ?? nodeId}**${node ? ` — ${node.description}` : ''}`,
            color: EMBED_COLOR,
          },
        ],
      };
    }
    case 'mastery_levelup':
      return {
        embeds: [
          {
            title: '🐍 Mastery milestone',
            description: `**${payload.handle}** reached **${payload.dynasty} Mastery ${payload.level}**`,
            color: EMBED_COLOR,
          },
        ],
      };
    case 'season_champion':
      return {
        content: '@everyone',
        embeds: [
          {
            title: '👑 SEASON CHAMPIONS',
            description: `**${payload.clan_name}** [${payload.clan_tag}] are the **${payload.season_name}** champions!`,
            color: 0xfacc15, // gold
          },
        ],
      };
    case 'member_joined':
      return {
        embeds: [
          {
            title: '🤝 New member',
            description: `**${payload.handle}** joined **${payload.clan_name}** [${payload.clan_tag}]`,
            color: EMBED_COLOR,
          },
        ],
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Consumer: the outbox drain
// ---------------------------------------------------------------------------

/**
 * Exponential skip (spec: attempts-based created_at cutoff). attempts
 * only grow on failure, so requiring age >= backoff(attempts) delays
 * each retry: 5m, 10m, 20m, 40m.
 */
export function outboxBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return 5 * 60_000 * Math.pow(2, attempts - 1);
}

interface OutboxRow {
  id: string;
  event_type: string;
  clan_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
}

export interface DrainResult {
  live: boolean;
  scanned: number;
  sent: number;
  failed: number;
  dead: number;
}

/**
 * Drain up to `limit` pending outbox rows into their clans' webhooks.
 * NEVER throws; pre-024 (missing table) reports live:false.
 */
export async function drainDiscordOutbox(
  supabase: SupabaseClient,
  limit: number
): Promise<DrainResult> {
  const result: DrainResult = { live: true, scanned: 0, sent: 0, failed: 0, dead: 0 };
  try {
    const { data, error } = await supabase
      .from('discord_event_outbox')
      .select('id, event_type, clan_id, payload, attempts, created_at')
      .eq('status', 'pending')
      .lt('attempts', OUTBOX_DEAD_AT)
      .order('created_at', { ascending: true })
      .limit(Math.max(limit * 4, limit));

    if (error) {
      if (isMissingDiscordInfra(error)) {
        return { ...result, live: false };
      }
      console.error('Outbox scan error:', error);
      return result;
    }

    const now = Date.now();
    const eligible = ((data ?? []) as OutboxRow[])
      .filter((row) => now - Date.parse(row.created_at) >= outboxBackoffMs(row.attempts))
      .slice(0, limit);
    result.scanned = eligible.length;
    if (eligible.length === 0) return result;

    // One clan-link read per distinct clan in the batch
    const clanIds = Array.from(new Set(eligible.map((r) => r.clan_id)));
    const { data: linkRows, error: linkError } = await supabase
      .from('discord_clan_links')
      .select('clan_id, webhook_id, webhook_token_enc')
      .in('clan_id', clanIds);
    if (linkError) {
      if (!isMissingDiscordInfra(linkError)) {
        console.error('Outbox clan-links read error:', linkError);
      }
      return result;
    }
    const links = new Map(
      (linkRows ?? []).map((row: { clan_id: string; webhook_id: string; webhook_token_enc: string }) => [
        row.clan_id,
        row,
      ])
    );

    for (const row of eligible) {
      const link = links.get(row.clan_id);
      const message = link ? messageForEvent(row.event_type, row.payload ?? {}) : null;

      if (!link || !message) {
        // No destination / unknown type: dead-letter immediately
        const { error: deadError } = await supabase
          .from('discord_event_outbox')
          .update({
            status: 'dead',
            attempts: row.attempts + 1,
            last_error: !link ? 'no_clan_link' : 'unknown_event_type',
          })
          .eq('id', row.id);
        if (deadError) console.error('Outbox dead-letter error:', deadError);
        result.dead += 1;
        continue;
      }

      try {
        await executeWebhook(link.webhook_id, decryptSecret(link.webhook_token_enc), message);
        const { error: sentError } = await supabase
          .from('discord_event_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', row.id);
        if (sentError) console.error('Outbox sent-mark error:', sentError);
        result.sent += 1;
      } catch (postError) {
        const attempts = row.attempts + 1;
        const isDead = attempts >= OUTBOX_DEAD_AT;
        const { error: failError } = await supabase
          .from('discord_event_outbox')
          .update({
            attempts,
            status: isDead ? 'dead' : 'pending',
            last_error:
              postError instanceof Error ? postError.message.slice(0, 500) : 'post_failed',
          })
          .eq('id', row.id);
        if (failError) console.error('Outbox fail-mark error:', failError);
        if (isDead) result.dead += 1;
        else result.failed += 1;
      }
    }
    return result;
  } catch (err) {
    console.error('drainDiscordOutbox error:', err);
    return result;
  }
}

/**
 * Section 8.5: delete grants that have been refresh-dead (revoked_at)
 * for 30+ days. Non-fatal.
 */
export async function sweepStaleDiscordLinks(supabase: SupabaseClient): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('discord_links')
      .delete()
      .lt('revoked_at', cutoff)
      .select('player_id');
    if (error) {
      if (!isMissingDiscordInfra(error)) {
        console.error('Stale discord_links sweep error:', error);
      }
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    console.error('sweepStaleDiscordLinks error:', err);
    return 0;
  }
}
