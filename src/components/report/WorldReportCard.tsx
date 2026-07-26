'use client';

/**
 * The World Report on Home — return without debt (Constitution §7.5).
 *
 * "When a player comes back after three or more absent days, one screen —
 * never blocking Launch, Rule 1 and the two-tap law intact — reports what
 * moved... It is written as news, never as debt: no claims, no catch-up tasks,
 * nothing owed."
 *
 * This is the surface. The reading itself is composed server-side by
 * `composeWorldReport`, swept for Rule 5 vocabulary there, and published by
 * `GET /api/report`. This component decides only how sentences and links are
 * arranged on a page — it holds no product knowledge, derives no number and
 * makes no second judgement about what a player deserves to be told.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT DOES NOT BLOCK LAUNCH, AND IT COULD NOT
 *
 *   It renders inside Home's bottom-anchored launch dock, which grows UPWARD.
 *   LAUNCH does not move when this card appears, and the card is not a modal,
 *   has no backdrop, traps no focus and has no dismiss-before-you-play gate.
 *   open → LAUNCH → START is the same sequence it was before this component
 *   existed (§5, Rule 10). It renders only on Home; nothing here mounts, fires
 *   or sounds during a run (Rule 1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THERE IS NO "SEEN" STATE, AND THERE MUST NEVER BE ONE
 *
 *   Nothing here writes. The card is not marked read, not stamped, not
 *   dismissed-forever and not persisted — `dismissed` is component state and
 *   dies with the page. It stops appearing on its own, by the only mechanism
 *   §7.5 needs: the report is derived from the player's LAST RUN, so the moment
 *   they play, they were not away, and there is no report to compose. The
 *   feature retires itself by the player doing the thing it exists to make
 *   pleasant.
 *
 *   That is a design constraint, not an economy. A "seen" row is state that can
 *   be stale, can be wrong, and can be RESET — and a return screen that can be
 *   reset is a return screen that can be made to feel owed. There is no row
 *   here for that to happen to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULE 5, RULE 7, RULE 8, §12.2 — WHAT IS NOT IN THIS FILE
 *
 *   No claim button, no collect verb, no currency, no balance, no amount, no
 *   countdown, no expiry, no progress bar, no rank, no position, no cut line,
 *   no price, no offer, no upsell, and no POST of any kind. The only network
 *   call this component can make is one GET, and the only interactive elements
 *   it renders are a close button and links to artifacts that were already
 *   public. Nothing a player does here changes anything anywhere.
 *
 *   The chrome copy — every string this file authors rather than renders — is
 *   held to the same Rule 5 vocabulary as the report itself, and swept for it
 *   by `WorldReportCard.test.tsx` over the real rendered DOM.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A FAILURE RENDERS NOTHING, DELIBERATELY
 *
 *   If the read fails, the card is absent — no error state, no retry, no
 *   apology. Unlike the Signal, there is nothing here a player can act on and
 *   nothing they can be prevented from doing, so an error message would be pure
 *   noise on the one screen that is supposed to make coming back feel good.
 *   Server-side the failure is already in Sentry (Rule 11).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FLAG (rollback path, tested)
 *
 *   `WORLD_REPORT_V1_ENABLED` is read at module scope and this component
 *   returns null when it is off — before any fetch, so a flag-off deployment
 *   makes no request and leaves no trace. That path is exercised directly by
 *   `WorldReportCard.flagOff.test.tsx`, never inferred from an omitted flag.
 */

import { useEffect, useState } from 'react';

import { WORLD_REPORT_V1_ENABLED } from '@/lib/report/config';
import type { WorldReport } from '@/lib/report/worldReport';

/** The shape `GET /api/report` publishes. See that route's contract. */
export interface WorldReportView {
  live: boolean;
  report: WorldReport | null;
}

type LoadState = 'loading' | 'ready' | 'error';

export interface WorldReportCardProps {
  /**
   * Supabase access token. The report is a per-player read of that player's
   * own absence; no token, no read.
   */
  token: string | undefined;
}

export function WorldReportCard({ token }: WorldReportCardProps) {
  const [view, setView] = useState<WorldReportView | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!WORLD_REPORT_V1_ENABLED || !token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/report', {
          headers: { Authorization: `Bearer ${token}` },
        });
        // The route answers 200 with `report: null` for every ordinary "nothing
        // to report" reason, so a non-ok response here is a genuine failure and
        // reads as one. (The repo's known `.then(res => res.json())` defect.)
        if (!response.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data = (await response.json()) as WorldReportView;
        if (cancelled) return;
        setView(data);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!WORLD_REPORT_V1_ENABLED) return null;
  if (state !== 'ready') return null;
  if (dismissed) return null;

  const report = view?.report ?? null;
  if (view?.live !== true || !report) return null;

  return (
    <section
      data-testid="world-report-card"
      aria-labelledby="world-report-headline"
      className="panel-glow animate-pop-in w-full max-w-md space-y-4 p-5 text-left"
      style={{ '--glow': '#22d3ee' } as React.CSSProperties}
    >
      <header className="flex items-start justify-between gap-3">
        <h2
          id="world-report-headline"
          className="heading-display text-lg text-venom-orange"
          data-testid="world-report-headline"
        >
          {report.headline}
        </h2>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          data-testid="world-report-close"
          aria-label="Close the world report"
          className="label-arcade shrink-0 rounded border border-bone-white/20 px-2 py-1 text-xs text-bone-white/70 transition-colors hover:text-venom-orange-light"
        >
          Close
        </button>
      </header>

      {/* Sections come from the server in reading order and are rendered in
          it. This component chooses none of them, omits none of them and
          reorders none of them. */}
      {report.sections.map((section) => (
        <section
          key={section.id}
          data-testid={`world-report-section-${section.id}`}
          className="space-y-1"
        >
          <h3 className="label-arcade text-bone-white/80">{section.title}</h3>
          <ul className="space-y-1">
            {section.lines.map((line, index) => (
              <li
                key={`${section.id}-${index}`}
                className="font-body text-sm text-beige"
              >
                {line.href ? (
                  // Rule 14: the line IS the link. Every fact a returning
                  // player reads here is readable at a canonical URL that
                  // already has an image and a way in — a Serpent week, a
                  // Signal day. Never an endpoint, never a claim.
                  <a
                    href={line.href}
                    className="underline decoration-bone-white/30 underline-offset-2 transition-colors hover:text-venom-orange-light"
                  >
                    {line.text}
                  </a>
                ) : (
                  line.text
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
