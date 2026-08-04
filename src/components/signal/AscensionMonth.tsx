'use client';

/**
 * Ascension — "Score, this month" (Constitution §6.1, §7.1, §12.2).
 *
 * IT LIVES IN `components/signal/` BECAUSE THAT IS WHAT IT IS. §12.2:
 * "Ascension is its monthly aggregation view, not a surface." This component
 * is a reading of the Signal's own history, filed with the Signal, and it is
 * MOUNTED on the leaderboard — Score's district — because §6.1 says it is
 * "presented everywhere as 'Score, this month' — an aggregation view of the
 * skill number, not a third number". It opens no district, adds no tab to the
 * navigation, and is never linked to from Home.
 *
 * WHAT MAKES IT A VIEW RATHER THAN A SURFACE
 *
 *   - Nothing here can be done. There is no button that starts, takes, opens,
 *     claims or collects anything. The only interactive elements are two
 *     links to adjacent months — navigation, not action. §12.2's cap of one
 *     daily surface is untouched because this is not a second thing to attend.
 *   - Nothing here has a cadence. A month is not "up" or "due"; there is no
 *     countdown, no notification and no unread state. A player who never opens
 *     the leaderboard plays exactly the same Signals (§6.1: "ignoring it costs
 *     nothing").
 *   - Nothing here is a currency (§12.2). `points` is Score, summed. It is not
 *     a balance, it buys nothing, and no DNA figure appears in this file.
 *   - Nothing here is for sale (Rule 7). No price, offer, entitlement or
 *     upsell — zero commercial surface, and the tier marks §6.1 promises are
 *     earned-only, never sold, and are not granted by this component at all.
 *
 * THE COPY LAW (Rule 5, Rule 6) — ENFORCED BY TEST
 *
 * A month with twenty-eight unplayed days must read as a month with three
 * Signals in it. So:
 *
 *   - `signalsScored` is NEVER rendered against `daysInMonth`. "3 of 31" is a
 *     hole with a number on it. The month reports what was scored, full stop.
 *   - The day list contains only days that were played. An unplayed day has no
 *     row, no dash, no greyed cell and no empty square, because a grid with
 *     gaps in it is a guilt device with a nice font.
 *   - Every forward-looking number counts UP or counts what is still OPEN:
 *     places open, days ahead, points to the next tier. None of them is a
 *     deadline.
 *   - The rendered text is swept for `lost|lose|missed out|broke|expire|decay|
 *     debt|behind` by `AscensionMonth.test.tsx`. Note that the sweep catches
 *     "close"/"closed" too (it contains "lose"), which is why this file says
 *     "archived" — an accident that turned out to be the better word anyway.
 *
 * Nothing displayed can go down. Points are a sum of the best ten of a set
 * that only grows, so the number is monotonic within the cycle by
 * construction (§6.1 "Promotion-only within a cycle"; see `ascension.ts`).
 * There is therefore no state in which this component shows a player less than
 * it showed them yesterday, which is Rule 6 satisfied structurally rather than
 * by careful wording.
 *
 * THE FLAG (rollback path, tested)
 *
 * `ASCENSION_V1_ENABLED` is read before anything else and the component
 * returns null when it is off — no fetch, no markup, no trace.
 * `AscensionMonth.flagOff.test.tsx` exercises that path directly.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ASCENSION_V1_ENABLED } from '@/lib/ascension/config';
import { ascensionMonthPath } from '@/lib/share/artifactUrls';
import {
  ascensionMonthKey,
  ascensionMonthSummary,
  ascensionPoints,
  ascensionTierNote,
  formatAscensionMonth,
  isAscensionMonthKey,
  monthAfter,
  previousAscensionMonth,
  type AscensionMonthReading,
} from '@/shared/game/ascension';
import { formatAmount } from '@/shared/format/amount';

/** The shape `GET /api/signal/ascension` publishes (see that route's contract). */
export interface AscensionView {
  live: boolean;
  reading: AscensionMonthReading | null;
  currentMonth: string;
}

export interface AscensionMonthProps {
  /** Supabase access token. A month is a per-player read; no token, no read. */
  token: string | undefined;
}

type LoadState = 'loading' | 'ready' | 'error';

function AscensionMonthInner({ token }: AscensionMonthProps) {
  const searchParams = useSearchParams();
  const requested = searchParams.get('month');
  const month =
    requested && isAscensionMonthKey(requested) ? requested : ascensionMonthKey();

  const [view, setView] = useState<AscensionView | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setState('loading');
      try {
        const response = await fetch(
          `/api/signal/ascension?month=${encodeURIComponent(month)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // The route answers 200 with `live: false` for every ordinary "not
        // live" reason, so a non-ok response is a genuine failure and reads as
        // one rather than being parsed as a month.
        if (!response.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data = (await response.json()) as AscensionView;
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
  }, [token, month]);

  // Loading renders nothing rather than a skeleton: this block sits below the
  // board, and a placeholder that reflows the page under a reader's eyes is
  // worse than a block that simply arrives.
  if (state === 'loading' || !token) return null;

  if (state === 'error') {
    return (
      <section
        data-testid="ascension-month"
        className="mt-8 rounded-lg border border-beige/20 bg-void-deep/40 p-4"
      >
        <h2 className="heading-display text-lg text-bone-white">Score, this month</h2>
        <p className="font-body text-sm text-beige/70 mt-1">
          This month&rsquo;s reading is unavailable right now. Your Signals are
          unaffected.
        </p>
      </section>
    );
  }

  const reading = view?.reading ?? null;

  if (!reading) {
    return (
      <section
        data-testid="ascension-month"
        className="mt-8 rounded-lg border border-beige/20 bg-void-deep/40 p-4"
      >
        <h2 className="heading-display text-lg text-bone-white">Score, this month</h2>
        <p className="font-body text-sm text-beige/70 mt-1">
          There is no Ascension month at that date.
        </p>
      </section>
    );
  }

  // Flag off, or migration 049 unapplied: the reading is real but empty, and
  // saying "not open yet" is honest where showing a zeroed month is not.
  if (view?.live !== true) {
    return (
      <section
        data-testid="ascension-month"
        className="mt-8 rounded-lg border border-beige/20 bg-void-deep/40 p-4"
      >
        <h2 className="heading-display text-lg text-bone-white">Score, this month</h2>
        <p className="font-body text-sm text-beige/70 mt-1">
          Ascension has not opened yet. Signals play exactly the same either way.
        </p>
      </section>
    );
  }

  const previous = previousAscensionMonth(reading.month);
  // Offerability is decided against the SERVER's month, never the browser's
  // (§7.1 decision 8: one clock for the whole world). A device with a clock
  // set forward cannot conjure a link to a month that has not started.
  const after = monthAfter(reading.month);
  const following = after && view?.currentMonth && after <= view.currentMonth ? after : null;

  return (
    <section
      data-testid="ascension-month"
      className="mt-8 rounded-lg border border-beige/20 bg-void-deep/40 p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="heading-display text-lg text-bone-white">Score, this month</h2>
        <p className="font-body text-sm text-beige/70" data-testid="ascension-label">
          {reading.label}
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          className="heading-display text-3xl text-bone-white"
          data-testid="ascension-points"
        >
          {ascensionPoints(reading.points)}
        </p>
        <p
          className="font-body text-sm uppercase tracking-wide text-beige"
          data-testid="ascension-tier"
        >
          {reading.tier.name}
        </p>
      </div>

      <p className="font-body text-sm text-beige/80 mt-2" data-testid="ascension-summary">
        {ascensionMonthSummary(reading)}
      </p>
      <p className="font-body text-sm text-beige/60 mt-1" data-testid="ascension-tier-note">
        {ascensionTierNote(reading)}
      </p>

      {/* Only days that were played. There is no row for a day nobody ran. */}
      {reading.days.length > 0 && (
        <ul className="mt-4 space-y-1" data-testid="ascension-days">
          {reading.days.map((day) => (
            <li
              key={day.day}
              data-testid={`ascension-day-${day.day}`}
              className="flex items-baseline justify-between font-body text-sm"
            >
              <span className={day.counted ? 'text-bone-white' : 'text-beige/50'}>
                Signal #{day.index}
              </span>
              <span className={day.counted ? 'text-bone-white' : 'text-beige/50'}>
                {formatAmount(day.score)}
                {day.counted ? ' · counts' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Rule 14: a month is linkable, so the adjacent months are links and
          not a dropdown. Both are ordinary navigation — nothing here acts. */}
      <nav className="mt-4 flex items-center justify-between font-body text-sm">
        {previous ? (
          <Link
            href={ascensionMonthPath(previous)}
            className="text-beige/70 hover:text-bone-white min-h-[44px] inline-flex items-center"
            data-testid="ascension-previous"
          >
            &larr; {formatAscensionMonth(previous)}
          </Link>
        ) : (
          <span />
        )}
        {following ? (
          <Link
            href={ascensionMonthPath(following)}
            className="text-beige/70 hover:text-bone-white min-h-[44px] inline-flex items-center"
            data-testid="ascension-next"
          >
            {formatAscensionMonth(following)} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </section>
  );
}

/**
 * The flag gate and the `useSearchParams` boundary, in that order.
 *
 * The flag is checked in the outer component so that with Ascension off there
 * is no Suspense boundary, no hook and no child to mount — `return null` is
 * the entire off path. The Suspense wrapper exists because `useSearchParams`
 * requires one during prerender; its fallback is null for the same reason the
 * loading state is.
 */
export function AscensionMonth({ token }: AscensionMonthProps) {
  if (!ASCENSION_V1_ENABLED) return null;
  return (
    <Suspense fallback={null}>
      <AscensionMonthInner token={token} />
    </Suspense>
  );
}
