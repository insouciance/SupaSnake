/**
 * The open CLAN REVEAL, read from server attention state (WP-E, PEO §6).
 *
 * The sibling of `openCurriculumInvitation`, deliberately written separately
 * rather than generalised: the two invitations share a row shape and nothing
 * else, and `sourceType` is the discriminator between them. Folding them into
 * one selector would make a change to Gene copy able to move a clan pointer.
 *
 * THE SERVER IS THE LEDGER. There is no browser copy: **Not now** on a phone
 * closes the reveal on a laptop, and a reload cannot resurrect one, because
 * `notificationFromServerItem` drops every row that reached `resolved` or
 * `dismissed` before it ever reaches this store.
 */

import type { GameNotification } from '@/lib/stores/notificationStore';
import {
  CLAN_REVEAL_SOURCE_TYPE,
  clanRevealInvitation,
} from '@/shared/game/clanReveal';

export interface OpenClanRevealInvitation {
  attentionId: string;
  label: string;
  description: string;
  href: string;
  declineLabel: string;
  /** True while the server row is still `unseen`. */
  unseen: boolean;
}

/**
 * The single open clan reveal, or null.
 *
 * Exactly one is expected — the row's constant `source_id` makes a second one
 * impossible — but the oldest wins if a future source ever produces two, so
 * the fold's choice stays deterministic rather than dependent on object key
 * order.
 */
export function openClanRevealInvitation(
  notifications: Record<string, GameNotification>
): OpenClanRevealInvitation | null {
  const candidate = Object.values(notifications)
    .filter(
      (item) =>
        item.serverManaged &&
        item.sourceType === CLAN_REVEAL_SOURCE_TYPE &&
        item.notificationClass === 'attention'
    )
    .sort((left, right) => left.createdAt - right.createdAt)[0];
  if (!candidate) return null;
  const invitation = clanRevealInvitation();
  return {
    attentionId: candidate.id,
    label: invitation.label,
    description: invitation.description,
    href: invitation.href,
    declineLabel: invitation.declineLabel,
    unseen: candidate.serverStatus !== 'seen',
  };
}
