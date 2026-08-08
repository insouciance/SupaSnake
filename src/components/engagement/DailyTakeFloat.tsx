'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  collectDailyTake,
  fetchDailyTake,
  type DailyTakeSlot,
} from '@/lib/game/dailyTake';
import { DnaGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { formatAmount } from '@/shared/format/amount';

/**
 * THE DAILY TAKE, MOVED HOME (ruling D2).
 *
 * It used to be a tray on the Results screen of the day's first run, which put
 * the game's ONE economic collect (§7.2, §12.2) inside the surface that exists
 * to tell a player how their run went. Two unrelated things competed: a run's
 * recognition, and a daily that has nothing to do with that run. Results keeps
 * the run; the Take comes here.
 *
 * WHY A TOKEN AND NOT A CARD. The consequential audit maps this element to
 * "Daily Take as a drawn token" (D5), and the distinction is doing real work.
 * Home already has ONE daily SURFACE — the World Signal (§7.2), which states
 * the day's condition and its objectives and is the thing a player READS. A
 * second card would be a second daily surface, and the cap forbids that. A
 * token is not a surface: it carries no daily information at all — no
 * condition, no objective, no schedule — only an amount and the tap that takes
 * it. You read the Signal; you pick this up. It moves, it does not duplicate.
 *
 * IT DISAPPEARS. There is no empty state, no greyed-out coin and no "come back
 * tomorrow" slot holding space. When there is nothing to collect this renders
 * `null`, exactly as `HomeAnomalyFlash` does, so Home on an already-collected
 * day is precisely the Home that shipped. Rule 5 — an absence is never
 * destructive — is also why a failure resolves quietly: the day's Take keeps,
 * and the next visit offers it again.
 *
 * WHY AMBER. Venom Orange is the product's single semantic warm and it means
 * "the thing to press". Spent as a FILL with an ink contour and a hard
 * displaced block, never as a keyline or a glow — this is a printed coin lying
 * on the paper room, not a lit UI affordance.
 *
 * SERVER AUTHORITY IS UNCHANGED. The amount, the tier, the streak and the day
 * are all derived server-side; this component sends a POST with no body to the
 * existing collect route and believes the answer. A double tap is safe by
 * construction — the double-collect guard is a compare-and-set inside
 * migration 050's transaction, not this disabled attribute.
 */

type Phase = 'idle' | 'collecting' | 'collected' | 'error';

export interface DailyTakeFloatProps {
  /** Supabase access token. Without one there is nobody to pay. */
  token: string | null | undefined;
  /** Positioning from the mount site; the token owns only its own drawing. */
  className?: string;
}

export function DailyTakeFloat({ token, className = '' }: DailyTakeFloatProps) {
  const [slot, setSlot] = useState<DailyTakeSlot | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [paid, setPaid] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const found = await fetchDailyTake(token);
      if (!cancelled) setSlot(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const collect = useCallback(async () => {
    if (!token || phase === 'collecting' || phase === 'collected') return;
    setPhase('collecting');
    const outcome = await collectDailyTake(token);
    if (outcome.status === 'collected') {
      // The server's amount is the authority, but it answers 0 on a replayed
      // collect. The slot's figure is the same server's preview of the same
      // day, so it is the honest thing to show when the grant landed on an
      // earlier call.
      setPaid(outcome.amount > 0 ? outcome.amount : (slot?.amount ?? 0));
      setPhase('collected');
      return;
    }
    // `unavailable` is not a failure worth a red state: there is nothing
    // deployed to collect from, and the day keeps.
    setPhase(outcome.status === 'unavailable' ? 'collected' : 'error');
    if (outcome.status === 'unavailable') setPaid(0);
  }, [phase, slot?.amount, token]);

  if (!token || !slot) return null;

  const amount = paid ?? slot.amount;
  const streaked = slot.streakDays > 0;

  if (phase === 'collected') {
    return (
      <div
        data-testid="daily-take-float"
        data-phase="collected"
        role="status"
        className={`pointer-events-none flex -rotate-2 items-center gap-2 rounded-[var(--radius-card)] border-[length:var(--ink-w-3)] border-ink bg-ink px-3 py-2 shadow-[var(--ink-drop-3)] ${className}`}
      >
        <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 text-venom-orange">
          <DnaGlyph />
        </span>
        <span className="heading-display whitespace-nowrap text-sm text-venom-orange">
          {amount > 0 ? `TOOK ${formatAmount(amount)}` : 'TOOK IT'}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void collect()}
        disabled={phase === 'collecting'}
        data-testid="daily-take-float"
        data-phase={phase}
        aria-label={
          streaked
            ? `Take today's ${amount} DNA. Day ${slot.streakDays} streak.`
            : `Take today's ${amount} DNA.`
        }
        className="pointer-events-auto flex min-h-[52px] -rotate-2 items-center gap-2.5 rounded-[var(--radius-card)] border-[length:var(--ink-w-3)] border-ink bg-venom-orange px-3.5 py-2 text-ink shadow-[var(--ink-drop-3)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--ink-drop-3)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-wait motion-reduce:transition-none motion-reduce:hover:transform-none"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-[#fffdf8] p-1.5 text-ink"
        >
          <DnaGlyph />
        </span>
        <span className="min-w-0 text-left">
          <span className="label-arcade block text-[9px] text-ink/70">
            {phase === 'collecting' ? 'Taking…' : "Today's Take"}
          </span>
          <span className="heading-display block whitespace-nowrap text-lg leading-none text-ink">
            +{formatAmount(amount)}
          </span>
        </span>
        {streaked && (
          <span className="ml-0.5 shrink-0 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-ink px-1.5 py-1 text-center">
            <span className="label-arcade block text-[8px] leading-none text-bone-white/70">
              Day
            </span>
            <span className="heading-display block text-xs leading-tight text-venom-orange">
              {slot.streakDays}
            </span>
          </span>
        )}
      </button>
      {phase === 'error' && (
        <p
          className="font-body text-[10px] text-ink/60"
          role="status"
          data-testid="daily-take-float-error"
        >
          Not now — it keeps.
        </p>
      )}
    </div>
  );
}

export default DailyTakeFloat;
