'use client';

/**
 * The founding prompt (Constitution §9.2, §7.3).
 *
 * "at Serpent unlock (8 banks), one skippable prompt: found your clan (name it,
 * pick preset heraldry) or join by invite code/link."
 *
 * ONE PROMPT. SKIPPABLE. AND SILENT BEFORE IT.
 *
 *   The eight banked runs are a ramp beat, not a gate, and this component is
 *   written so that nothing can read them as one. Below the beat it renders
 *   `null` — no counter, no progress bar, no "N more runs to go", no locked
 *   card with a padlock. A player at three banked runs has never been told
 *   there is something they have not reached, because being told is exactly
 *   what would turn a ramp into a cut line (Rule 8).
 *
 *   Above it, the prompt appears once. "Not now" dismisses it permanently and
 *   the clan page is still reachable from navigation forever after, with the
 *   same founding form on it. Dismissal is a UI preference and lives in
 *   `localStorage`; it is not progress, nothing depends on it, and losing it
 *   costs the player one prompt they can dismiss again.
 *
 * WHY IT IS NOT ON RESULTS
 *
 *   §12.2 caps Results at three layers with exactly one recommended action, and
 *   WP-1.06 spends all three. A prompt for a different system landing there
 *   would be a fourth thing competing with that one action. It lives on the two
 *   surfaces it is about — the clan page and the Serpent battle — where a player
 *   arrives by navigation and Rule 7's "never by interruption" is satisfied by
 *   construction.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SERPENT_UNLOCK_BANKED_RUNS } from '@/lib/serpent/config';
import { IconShield } from '@/components/ui/icons';

export const FOUNDING_PROMPT_DISMISSED_KEY = 'supasnake.clanFoundingPrompt.dismissed';

export interface ClanFoundingPromptProps {
  accessToken?: string | null;
  /** The player already belongs to a clan; there is nothing to prompt. */
  inClan: boolean;
  /**
   * The banked-run count, when the caller already has it. `undefined` means
   * "nobody has looked" and the component reads `/api/player` itself; `null`
   * means "the caller looked and there is no count", which is a no-prompt
   * state and not a reason to look again.
   */
  bankedRuns?: number | null;
  /** Opens the founding form in place. Falls back to a link to /clan. */
  onFound?: () => void;
  /** Opens the invite-code form in place. Falls back to a link to /clan. */
  onJoin?: () => void;
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(FOUNDING_PROMPT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function ClanFoundingPrompt({
  accessToken,
  inClan,
  bankedRuns,
  onFound,
  onJoin,
}: ClanFoundingPromptProps) {
  const [fetchedBankedRuns, setFetchedBankedRuns] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch('/api/player', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        genomeFtue?: { bankedRuns?: number } | null;
      };
      const banked = json.genomeFtue?.bankedRuns;
      if (typeof banked === 'number') setFetchedBankedRuns(banked);
    } catch {
      // A prompt that cannot confirm the ramp beat simply does not appear.
    }
  }, [accessToken]);

  useEffect(() => {
    if (bankedRuns !== undefined) return;
    void load();
  }, [bankedRuns, load]);

  const banked = bankedRuns !== undefined ? bankedRuns : fetchedBankedRuns;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(FOUNDING_PROMPT_DISMISSED_KEY, 'true');
    } catch {
      // A browser refusing storage costs the player one repeat of one prompt.
    }
  };

  if (inClan || dismissed) return null;
  if (banked === null || banked < SERPENT_UNLOCK_BANKED_RUNS) return null;

  return (
    <section
      className="panel-glow [--glow:#a855f7] p-6 mb-8 animate-pop-in"
      data-testid="clan-founding-prompt"
    >
      <h2 className="heading-display text-2xl text-bone-white flex items-center gap-2 mb-1">
        <IconShield size={22} className="text-cosmic" />
        The World Serpent is hunting
      </h2>
      <p className="text-beige/80 font-body text-sm">
        Every three-day battle turns your ordinary Energy runs into clan attempts. Your
        strongest five banked Yields contribute automatically—there is no separate mode.
      </p>
      <p className="text-beige/70 font-body text-sm mt-2">
        A clan of one is a clan. It holds its own records and is paired when another clan
        enters the same battle cycle.
      </p>

      <div className="flex flex-wrap gap-3 mt-4">
        {onFound ? (
          <button
            type="button"
            onClick={onFound}
            data-testid="founding-prompt-found"
            className="btn-go px-6 py-2 min-h-[44px]"
          >
            Found your clan
          </button>
        ) : (
          <Link
            href="/clan"
            data-testid="founding-prompt-found"
            className="btn-go px-6 py-2 min-h-[44px] inline-flex items-center"
          >
            Found your clan
          </Link>
        )}

        {onJoin ? (
          <button
            type="button"
            onClick={onJoin}
            data-testid="founding-prompt-join"
            className="btn-neutral px-6 py-2 min-h-[44px]"
          >
            I have an invite
          </button>
        ) : (
          <Link
            href="/clan"
            data-testid="founding-prompt-join"
            className="btn-neutral px-6 py-2 min-h-[44px] inline-flex items-center"
          >
            I have an invite
          </Link>
        )}

        <button
          type="button"
          onClick={dismiss}
          data-testid="founding-prompt-dismiss"
          className="text-beige/70 hover:text-bone-white font-body text-sm min-h-[44px] px-2 transition-colors"
        >
          Not now
        </button>
      </div>
      <p className="text-beige/50 font-body text-xs mt-3">
        Skipping costs nothing. The clan page stays in your navigation and this is the same
        form you will find there.
      </p>
    </section>
  );
}

export default ClanFoundingPrompt;
