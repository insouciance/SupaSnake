'use client';

/**
 * Share an artifact (WP-1.08, Constitution §11.3).
 *
 * THE WP-0.08 LESSON, ENFORCED AT THE CALL SITE
 *
 * `navigator.share` silently drops `url` on several platforms when `files`
 * is present, which is how the shipped Genome Card reached players with no
 * way back in (GT §8). Every payload this button accepts is built by
 * `@/lib/share/artifactUrls`, which appends the URL as the last line of
 * `text` as well as setting `url` — so the link survives whichever field the
 * platform decides to honour. This component never assembles text itself.
 *
 * Degradation, in order: the native share sheet, then the clipboard, then a
 * visible URL the player can select. There is no path on which the button
 * does nothing, and no path on which it reports success it did not have.
 *
 * Rule 7: nothing here is commercial. Rule 5/6: sharing takes nothing away,
 * so there is no confirmation, no cost and no consequence to cancelling.
 */

import { useCallback, useState } from 'react';
import type { SharePayload } from '@/lib/share/artifactUrls';

export type ShareOutcome = 'idle' | 'shared' | 'copied' | 'manual';

export interface ShareArtifactButtonProps {
  payload: SharePayload;
  label?: string;
  className?: string;
}

/**
 * Perform the share. Exported for tests: the fallback ladder is the part
 * that is easy to get wrong and impossible to see in a screenshot.
 */
export async function shareArtifact(payload: SharePayload): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return 'shared';
    } catch {
      // A cancelled sheet is not a failure; fall through to the clipboard so
      // the player still ends up holding the link.
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload.text);
      return 'copied';
    } catch {
      // Clipboard permission denied — show the URL instead.
    }
  }
  return 'manual';
}

const MESSAGES: Record<Exclude<ShareOutcome, 'idle'>, string> = {
  shared: 'Shared',
  copied: 'Link copied',
  manual: 'Copy this link:',
};

export function ShareArtifactButton({
  payload,
  label = 'Share',
  className,
}: ShareArtifactButtonProps) {
  const [outcome, setOutcome] = useState<ShareOutcome>('idle');

  const onClick = useCallback(() => {
    void shareArtifact(payload).then(setOutcome);
  }, [payload]);

  return (
    <span className="inline-flex flex-col gap-1" data-testid="share-artifact">
      <button
        type="button"
        onClick={onClick}
        className={
          className ??
          'font-body text-beige underline transition-colors hover:text-bone-white'
        }
        data-testid="share-artifact-button"
      >
        {label}
      </button>
      {outcome !== 'idle' && (
        <span className="font-body text-sm text-beige/70" data-testid="share-artifact-status">
          {MESSAGES[outcome]}
          {outcome === 'manual' && (
            <span className="ml-1 select-all text-cosmic" data-testid="share-artifact-url">
              {payload.url}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default ShareArtifactButton;
