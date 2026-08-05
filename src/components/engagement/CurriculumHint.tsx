'use client';

/**
 * The Workbench banner for an open curriculum invitation (WP-D; PEO §5,
 * CONTEXTUAL PRACTICE and REFERENCE).
 *
 * This is the mount `OverlayHint` never had. It exists on exactly one surface
 * — the destination **Show me** routes to — and it says the two things a
 * player arriving there needs: which power is new, and where to read it.
 *
 * THREE PROPERTIES ARE LOAD-BEARING:
 *
 * 1. **The state is the server's.** Visibility comes from the synced
 *    `player_attention_items` row, and the close writes `seen` back through
 *    the same PATCH the rest of the Career Spine uses. There is no
 *    `localStorage`, `sessionStorage`, cookie or cache anywhere in this
 *    feature — `verify:constitution`'s `local-progress` gate runs with
 *    `honourBaseline: false` and would fail the build outright.
 *
 * 2. **Closing it is `seen`, not `dismissed`.** Reading the banner is not
 *    declining the invitation; a player who closes it here has been
 *    introduced, so the row stays open for the bell and simply stops shouting.
 *    **Not now** on Results is the decline, and it is the only one.
 *
 * 3. **It never renders during a run.** It is mounted on `/codex` only, so
 *    Rule R1 — nothing new between first input and run end — holds by
 *    construction rather than by a guard someone can forget.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { OverlayHint } from '@/components/ftue/OverlayHint';
import { openCurriculumInvitation } from '@/lib/game/curriculumAttention';
import {
  transitionServerNotification,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';
import { PLAYER_EVOLUTION_ENABLED } from '@/lib/features/playerEvolution';
import { curriculumHintMessage } from '@/shared/game/curriculum';

export function CurriculumHint() {
  const { session } = useAuth();
  const notifications = useNotificationStore((state) => state.notifications);
  const token = session?.access_token;
  const seenRef = useRef<string | null>(null);

  const invitation =
    PLAYER_EVOLUTION_ENABLED && CAREER_SPINE_V1_ENABLED
      ? openCurriculumInvitation(notifications)
      : null;
  const attentionId = invitation?.attentionId ?? null;
  const unseen = invitation?.unseen ?? false;

  // Arriving on the Workbench IS the introduction, so the row moves to `seen`
  // without waiting for a close. `seenRef` keeps a re-render from re-issuing
  // the same PATCH; the RPC is idempotent either way.
  useEffect(() => {
    if (!token || !attentionId || !unseen) return;
    if (seenRef.current === attentionId) return;
    seenRef.current = attentionId;
    void transitionServerNotification(attentionId, 'seen', token).catch(
      (error) => console.error('Curriculum hint seen transition failed:', error)
    );
  }, [attentionId, token, unseen]);

  if (!invitation) return null;
  return (
    <OverlayHint
      id={`curriculum-${invitation.geneId}`}
      message={curriculumHintMessage(invitation.geneId)}
    />
  );
}

export default CurriculumHint;
