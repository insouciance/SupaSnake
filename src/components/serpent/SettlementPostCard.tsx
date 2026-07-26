'use client';

/**
 * The settlement post, one tap from published (Constitution §11.6).
 *
 * "Weekly Serpent settlements auto-compose into a shareable post... The
 * operator's job is to press publish." This is that press, on the player's
 * side of the same artifact: the week composes itself, the post is shown in
 * full before anything happens, and publishing is a tap on
 * `ShareArtifactButton`.
 *
 * NOTHING IS PUBLISHED WITHOUT AN ACT
 *
 *   There is no auto-post, no "we've shared this for you", no pre-ticked box
 *   and no scheduled send. The component renders text and a button; the button
 *   opens the platform's own share sheet. A player who never taps it has
 *   published nothing, and a player who cancels the sheet has published
 *   nothing (`shareArtifact` treats a cancelled sheet as a copy, never as a
 *   consequence — Rule 5: sharing takes nothing away).
 *
 * THE POST IS SHOWN, NOT SUMMARISED
 *
 *   Every line that would go out is on screen before the button is. A share
 *   surface that hides its own text is asking for consent to something the
 *   player has not read.
 *
 * FLAG OFF → nothing renders. The week still reads on `/serpent`; only the
 * publish affordance is absent, and `SettlementPostCard.test.tsx` asserts it.
 *
 * RULE 7: `composeSettlementPost` sweeps its own output and throws on a
 * breach. This component catches that rather than blanking the page — a
 * broken post is a missing card, never a broken week.
 */

import { useMemo } from 'react';
import { ShareArtifactButton } from '@/components/share/ShareArtifactButton';
import { SETTLEMENT_DISPATCH_V1 } from '@/lib/growth/config';
import { composeSettlementPost, type SettlementPost } from '@/lib/growth/settlementPost';
import { formatWeekStart } from '@/lib/serpent/briefing';
import type { SerpentPanel } from '@/lib/server/serpent';

export interface SettlementPostCardProps {
  panel: SerpentPanel;
  /** The week being read, `YYYY-MM-DD` — the same key the briefing uses. */
  weekKey: string;
  now?: number;
}

export function SettlementPostCard({ panel, weekKey, now }: SettlementPostCardProps) {
  const post = useMemo<SettlementPost | null>(() => {
    if (!SETTLEMENT_DISPATCH_V1) return null;
    try {
      return composeSettlementPost(panel, weekKey, now ?? Date.now());
    } catch {
      // Rule 7 refused the copy. The week still reads; the card does not.
      return null;
    }
  }, [panel, weekKey, now]);

  if (!post) return null;

  return (
    <section className="panel-elevated p-6 mt-8" data-testid="settlement-post">
      <h2 className="heading-display text-2xl text-bone-white mb-1">
        The week, ready to post
      </h2>
      <p className="text-beige/70 text-sm font-body">
        Written from the settled week of {formatWeekStart(post.weekKey)}. Nothing goes
        anywhere until you tap publish.
      </p>

      <div
        className="mt-4 rounded-arcade border border-scale-blue-light/40 bg-void/40 p-4"
        data-testid="settlement-post-body"
      >
        {post.lines.map((line, index) => (
          <p
            key={`${index}-${line}`}
            className="font-body text-sm text-beige/90 leading-relaxed"
            data-testid="settlement-post-line"
          >
            {line}
          </p>
        ))}
        <p className="font-body text-sm text-cosmic mt-2 break-all">{post.share.url}</p>
      </div>

      <div className="mt-4">
        <ShareArtifactButton payload={post.share} label="Publish this week" />
      </div>
    </section>
  );
}

export default SettlementPostCard;
