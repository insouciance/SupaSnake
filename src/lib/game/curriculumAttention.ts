/**
 * The open curriculum INVITATION, read from server attention state (WP-D).
 *
 * THE SERVER IS THE LEDGER. Results, the Workbench banner and the bell all
 * derive from the same `player_attention_items` row synced by
 * `NotificationProvider`; none of them remembers anything locally. That is
 * boundary 9 ("the browser is not the curriculum ledger") made mechanical: a
 * **Not now** on a phone closes the invitation on a laptop, and a reload
 * cannot resurrect one, because there is no second copy to disagree with.
 *
 * `status` is carried as `serverStatus`, which `notificationFromServerItem`
 * drops entirely once a row reaches `resolved` or `dismissed` — so a declined
 * invitation simply is not in the store, and no consumer needs to filter for
 * it.
 */

import type { GameNotification } from '@/lib/stores/notificationStore';
import {
  CURRICULUM_SOURCE_TYPE,
  curriculumGeneFromArtifactRef,
  curriculumInvitation,
} from '@/shared/game/curriculum';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';

export interface OpenCurriculumInvitation {
  attentionId: string;
  geneId: GenomeV2ActiveGeneId;
  label: string;
  description: string;
  href: string;
  declineLabel: string;
  /** True while the server row is still `unseen`. */
  unseen: boolean;
}

/**
 * The single open invitation, or null.
 *
 * At most one is expected — a settlement promotes at most one Gene — but the
 * oldest wins if two ever coexist, so the player is never asked to read two
 * new rules at once (boundary 5) and the queue drains in the order it filled.
 */
export function openCurriculumInvitation(
  notifications: Record<string, GameNotification>
): OpenCurriculumInvitation | null {
  const candidates = Object.values(notifications)
    .filter(
      (item) =>
        item.serverManaged &&
        item.sourceType === CURRICULUM_SOURCE_TYPE &&
        item.notificationClass === 'attention'
    )
    .sort((left, right) => left.createdAt - right.createdAt);
  for (const candidate of candidates) {
    const geneId = curriculumGeneFromArtifactRef(candidate.artifactRef);
    if (!geneId) continue;
    const invitation = curriculumInvitation(geneId);
    return {
      attentionId: candidate.id,
      geneId,
      label: invitation.label,
      description: invitation.description,
      href: invitation.href,
      declineLabel: invitation.declineLabel,
      unseen: candidate.serverStatus !== 'seen',
    };
  }
  return null;
}
