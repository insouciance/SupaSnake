'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatWeekCountdown, type AnomalyBoardView } from '@/components/game/AnomalyPanel';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { STRAINS } from '@/shared/game/strains';

/**
 * THE ANOMALY, MOVED HOME (owner ruling: Setup is three elements; the anomaly
 * entry leaves it and lands on Home, "lightweight").
 *
 * WHY THIS SLOT. The anomaly is not a setting, which is why it never belonged
 * beside the Energy control - it is a thing that is TRUE THIS WEEK and false
 * the rest of the time. So it is placed the way a temporal fact is placed: it
 * takes the top of the command dock when it is live and it does not exist at
 * all when it is not. Nothing is reserved, nothing greys out, and Home on an
 * ordinary day is exactly the Home that shipped.
 *
 * The dock is bottom-anchored and grows UPWARD, which is the property that
 * makes this safe: the card cannot move the Play chip and cannot stand in
 * front of it, the same guarantee the World Report and the Signal are placed
 * under. Rule 10 holds by geometry rather than by promise.
 *
 * WHY A CARD AND NOT A CHIP. The rail is four chips - Play, Lab, Compete, You
 * - and they are DESTINATIONS, permanently true. A fifth chip that appears and
 * vanishes would teach the player that the rail is unreliable. A drawn card is
 * the right object for a thing with an expiry date: it is the one surface on
 * Home that is allowed to look like it was printed this week.
 *
 * WHY IT IS INK. The first pass filled it with COSMIC violet, which spends a
 * dynasty's colour on something that is not that dynasty - exactly the
 * confusion T-2 exists to prevent, and the same mistake cyan was pulled from
 * global-accent duty for. The card takes the one treatment that introduces no
 * meaning at all: ink fill, paper type. `.ink-chip-selected` already rules
 * this as "the strongest contrast available without introducing a colour that
 * means nothing else", and on a near-white room the one black object on the
 * page is the loudest thing a printed page can do. The WEEK's hue is carried
 * by the strain tile, where it is already the thing being read.
 *
 * It reads the same `GET /api/anomaly` the board entry always read, so nothing
 * here invents state: no live anomaly, no card.
 */
export function HomeAnomalyFlash({ token }: { token: string | null | undefined }) {
  const [board, setBoard] = useState<AnomalyBoardView | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/anomaly', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as AnomalyBoardView;
        if (!cancelled) setBoard(data);
      } catch {
        /* A missing weekly modifier is not an error the player needs told
           about; the card simply does not appear. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!board?.live) return null;

  return (
    <Link
      href="/game?mode=anomaly"
      data-testid="home-anomaly-flash"
      aria-label={`This week's Anomaly: ${board.anomaly.name}. ${board.anomaly.effect}. Rotates in ${formatWeekCountdown(board.anomaly.endsAt, now)}.`}
      className="animate-fade-up pointer-events-auto mx-auto flex w-full max-w-sm -rotate-1 items-center gap-3 rounded-[var(--radius-card)] border-[length:var(--ink-w-3)] border-ink bg-ink px-3 py-2.5 text-left shadow-[var(--ink-drop-3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink p-1.5 text-ink"
        style={{ backgroundColor: STRAINS[board.anomaly.strainBias].color }}
      >
        <StrainGlyph id={board.anomaly.strainBias} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="label-arcade block text-[9px] text-beige">
          This week only · rotates in {formatWeekCountdown(board.anomaly.endsAt, now)}
        </span>
        <span className="heading-display block truncate text-base text-venom-orange-light">
          {board.anomaly.name}
        </span>
        <span className="block truncate font-body text-[11px] text-bone-white/80">
          {board.anomaly.effect}
        </span>
      </span>
    </Link>
  );
}

export default HomeAnomalyFlash;
