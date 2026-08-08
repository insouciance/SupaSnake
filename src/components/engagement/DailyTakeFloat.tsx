'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  collectDailyTake,
  fetchDailyTake,
  type DailyTakeSlot,
} from '@/lib/game/dailyTake';
import { DnaGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { SnakeCubeChrome, snakeCubeVars } from '@/components/home/SnakeCubeButton';
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
 * ── THE COIN IS A SEGMENT OF THE SNAKE (owner ruling, 2026-08-08) ────────
 *
 * Home's controls stopped being rectangles: "the buttons could look like the
 * segments of the snake, i.e. cubes ... will make it very coherent, a great
 * composition." The rail took that ruling and this token did not, which left
 * exactly one pressable on Home still wearing the old amber-chip grammar —
 * and one exception is what a player reads as an element that arrived from
 * somewhere else.
 *
 * So the press IS a cube, drawn by `snakeCubeArt.ts` through
 * `SnakeCubeChrome`, at the rail's own construction and with nothing forked:
 * the same silhouette, the same authored bands, the same hero angle, the same
 * block-and-travel press, the same cube-shaped focus ring. The DNA glyph is
 * paint on its front face, exactly as the rail's icons are.
 *
 * THE AMBER SURVIVES THE CHANGE, which is why this is a re-dress and not a
 * different object. Venom Orange means "the thing to press", and a body
 * segment of this creature is amber — so the token is still a warm printed
 * thing you pick up off a dark room, said in the material the rest of Home is
 * now made of instead of in a rectangle of the same colour.
 *
 * WHAT STAYS SQUARE TO THE SCREEN. `SnakeCubeButton`'s own rule: the glyph
 * slot is projected into the face's plane, so anything inside it LEANS, and
 * "a badge that leans is a badge that looks broken". The amount and the streak
 * are numbers a player reads, not paint — so they ride the cube as siblings of
 * the drawing, upright: the denomination plate under the coin and the streak
 * badge on its shoulder, both travelling with the cube on press rather than
 * standing still while it moves.
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
    <div className={`flex flex-col items-center ${className}`}>
      {/* The overhang is RESERVED rather than allowed to spill: the plate hangs
          below the cube and the streak badge past its shoulder, and a token
          that overlapped whatever Home puts under it would be a layout bug
          waiting for a longer number. */}
      <div className="relative -rotate-2 pb-6 pr-2 pt-1">
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
          style={snakeCubeVars()}
          className="snake-cube group pointer-events-auto relative h-[72px] w-[72px] min-h-[44px] min-w-[44px] disabled:cursor-wait"
        >
          <SnakeCubeChrome glyphClassName="text-[color:var(--snake-ink)]">
            <span className="block h-[26px] w-[26px]">
              <DnaGlyph />
            </span>
          </SnakeCubeChrome>

          {/* THE DENOMINATION PLATE. Upright, because it is a number; printed
              stock, because a near-white object on the night ground is the
              strongest value step this palette has and the amount is the one
              thing on the token a player must read at a glance. */}
          <span className="absolute -bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-[#fffdf8] px-2 py-0.5 text-ink shadow-[var(--ink-drop-void-1)] transition-transform group-active:translate-x-[calc(-50%+3px)] group-active:translate-y-[3px] motion-reduce:transition-none">
            <span className="label-arcade block text-[8px] leading-none text-ink/70">
              {phase === 'collecting' ? 'Taking…' : "Today's Take"}
            </span>
            <span className="heading-display block text-[15px] leading-tight text-ink">
              +{formatAmount(amount)}
            </span>
          </span>

          {/* THE STREAK, on the cube's shoulder — the same corner and the same
              overhang the rail's notification badge takes, for the same
              reason: it is a status mark ON the object rather than part of the
              object's face. */}
          {streaked && (
            <span className="absolute -right-1 -top-1 z-10 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-ink px-1.5 py-0.5 text-center transition-transform group-active:translate-x-[3px] group-active:translate-y-[3px] motion-reduce:transition-none">
              <span className="label-arcade block text-[7px] leading-none text-bone-white/70">
                Day
              </span>
              <span className="heading-display block text-[11px] leading-tight text-venom-orange">
                {slot.streakDays}
              </span>
            </span>
          )}
        </button>
      </div>
      {phase === 'error' && (
        <p
          className="font-body text-[10px] text-bone-white/70"
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
