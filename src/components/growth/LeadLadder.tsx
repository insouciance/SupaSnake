'use client';

/**
 * The lead ladder as a surface (Constitution §11.7).
 *
 * §11.7's mechanism is public existence: "leaderboards show unclaimed
 * provisional entries ('Unclaimed Specimen #7f3a — is this you? Claim your
 * handle'), and claiming the free handle is what enrols a player in
 * Ascension, founds or joins a clan, and signs shared artifacts."
 *
 * So this renders on the board, where the argument is visible rather than
 * asserted: you are already on the list, under a name that is not yours.
 *
 * WHAT IT REUSES, AND WHAT IT THEREFORE IS NOT
 *
 *   The claim itself is the shipped `HandleClaimModal` — same debounced
 *   availability check against `GET /api/player/handle?check=`, same
 *   `claim_handle` RPC from migration 022, same per-code error copy, same
 *   IDENTIFY event. This component contributes the ARGUMENT and the RUNG;
 *   it contributes no identity logic, no second handle format, no second
 *   normaliser, and no second claim path.
 *
 * FOUR RULES IT IS BUILT AGAINST
 *
 *   Rule 7  — zero commercial content. The ladder's rendered rungs stop at
 *             `advocate`; `patron` exists in the model for the funnel and is
 *             never drawn here. Nothing links to the district.
 *   Rule 5/6— the copy never threatens. There is no "before it's gone", no
 *             countdown, no reserved-for-24-hours. A claimed name cannot be
 *             lost by being away, and claiming takes nothing away, so the
 *             invitation is allowed to be calm.
 *   §11.4   — "guest conversion stays respectful (no nags)". One dismissal
 *             is remembered for the session; the prompt does not come back
 *             on the next board tab.
 *   Rule 1  — this is a board surface. It cannot render during a run.
 *
 * Behind NEXT_PUBLIC_LEAD_LADDER_V1 (default off) — flag off, renders null.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HandleClaimModal } from '@/components/identity/HandleClaimModal';
import { LEAD_LADDER_V1_ENABLED } from '@/lib/features/leadLadder';
import {
  LADDER_ORDER,
  LADDER_RUNGS,
  LadderRungs,
  RENDERED_RUNGS,
  currentRung,
  nextRung,
  promptFor,
  provisionalCallout,
  type LadderState,
} from '@/lib/growth/leadLadder';
import { setLadderRung, trackLadderPrompt } from '@/lib/analytics/funnel';

export interface LeadLadderProps {
  /** What the mounting surface can actually see. Unknown fields stay unset. */
  state: LadderState;
  /**
   * The name the player is shown on the board right now — the generated
   * `handler-NNNN` while unclaimed, their handle once claimed. Null when the
   * surface cannot see it, which suppresses the provisional callout rather
   * than guessing at it.
   */
  displayHandle?: string | null;
  /** Called with the claimed handle so the host can refresh its own view. */
  onClaimed?: (handle: string) => void;
}

export function LeadLadder({
  state,
  displayHandle = null,
  onClaimed,
}: LeadLadderProps): React.ReactElement | null {
  const [claimOpen, setClaimOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);

  const rung = currentRung(state);
  const prompt = promptFor(rung);
  const rungHeight = LADDER_ORDER.indexOf(rung);

  useEffect(() => {
    if (!LEAD_LADDER_V1_ENABLED) return;
    setLadderRung(rung, rungHeight);
  }, [rung, rungHeight]);

  useEffect(() => {
    if (!LEAD_LADDER_V1_ENABLED || !prompt || dismissed) return;
    trackLadderPrompt(prompt.rung, false);
  }, [prompt, dismissed]);

  const openClaim = useCallback(() => {
    if (!prompt) return;
    trackLadderPrompt(prompt.rung, true);
    setClaimOpen(true);
  }, [prompt]);

  const followPrompt = useCallback(() => {
    if (prompt) trackLadderPrompt(prompt.rung, true);
  }, [prompt]);

  const handleClaimed = useCallback(
    (handle: string) => {
      setClaimed(handle);
      onClaimed?.(handle);
    },
    [onClaimed]
  );

  if (!LEAD_LADDER_V1_ENABLED) return null;

  const nextUp = nextRung(rung);
  const showsProvisional =
    prompt?.rung === LadderRungs.NAMED && displayHandle !== null && !claimed;

  return (
    <section
      data-testid="lead-ladder"
      aria-label="Your standing"
      className="mb-8 rounded-arcade border-2 border-scale-blue-light/60 bg-void/50 p-4 sm:p-5"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {RENDERED_RUNGS.map((step) => {
          const stepIndex = LADDER_ORDER.indexOf(step);
          const reached = stepIndex <= rungHeight;
          const isCurrent = step === rung;
          return (
            <li
              key={step}
              data-testid={`ladder-rung-${step}`}
              data-reached={reached ? 'true' : 'false'}
              className={`font-body text-xs uppercase tracking-widest ${
                isCurrent
                  ? 'text-venom-orange'
                  : reached
                    ? 'text-bone-white'
                    : 'text-beige/50'
              }`}
            >
              {LADDER_RUNGS[step].label}
              {step !== RENDERED_RUNGS[RENDERED_RUNGS.length - 1] && (
                <span aria-hidden="true" className="ml-2 text-beige/40">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 font-body text-sm text-beige">
        {claimed
          ? LADDER_RUNGS[LadderRungs.NAMED].meaning
          : LADDER_RUNGS[rung].meaning}
      </p>

      {claimed && (
        <p
          data-testid="ladder-claimed"
          className="mt-2 font-body text-sm text-bone-white"
        >
          The board reads {claimed} now. It is yours to keep — no renewal, no
          expiry, and being away never takes it back.
        </p>
      )}

      {prompt && !dismissed && !claimed && (
        <div className="mt-4 space-y-3 border-t border-scale-blue-light/40 pt-4">
          {showsProvisional && (
            <p
              data-testid="ladder-provisional"
              className="heading-display text-base text-bone-white"
            >
              {provisionalCallout(displayHandle!)}
            </p>
          )}
          <p className="font-body text-sm leading-relaxed text-beige">
            {prompt.reason}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {prompt.href ? (
              <Link
                href={prompt.href}
                data-testid="ladder-prompt-action"
                onClick={followPrompt}
                className="btn-go inline-flex min-h-[44px] items-center px-6 py-2"
              >
                {prompt.action}
              </Link>
            ) : (
              <button
                type="button"
                data-testid="ladder-prompt-action"
                onClick={openClaim}
                className="btn-go inline-flex min-h-[44px] items-center px-6 py-2"
              >
                {prompt.action}
              </button>
            )}
            <button
              type="button"
              data-testid="ladder-dismiss"
              onClick={() => setDismissed(true)}
              className="min-h-[44px] font-body text-sm text-beige underline decoration-dotted hover:text-bone-white"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {!prompt && nextUp && RENDERED_RUNGS.includes(nextUp) && (
        // The rung above is real but this surface may not invite it — see
        // LADDER_PROMPTS. Say what it is; ask for nothing. The
        // RENDERED_RUNGS guard is Rule 7: an `advocate` reaching the top of
        // the drawn ladder must NOT be told what comes after it, because
        // what comes after it is the district.
        <p className="mt-3 font-body text-xs text-beige/70">
          Next: {LADDER_RUNGS[nextUp].label}. {LADDER_RUNGS[nextUp].meaning}
        </p>
      )}

      <HandleClaimModal
        isOpen={claimOpen}
        onClose={() => setClaimOpen(false)}
        onClaimed={handleClaimed}
        prompt="Your runs are already on this board. Put your name on them."
      />
    </section>
  );
}
