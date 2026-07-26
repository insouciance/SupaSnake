'use client';

/**
 * The World Signal on Home — the ONE daily surface (Constitution §7.2, §12.2).
 *
 * WP-1.03 built the engine, the two routes and the session wiring but left the
 * day invisible: nothing on Home referenced it, so a player had no way to see
 * or take the day's objective. This is that surface, and it is the only one —
 * it stands in the slot the retired Contracts board used to occupy (§13), and
 * it does not sit beside a revived one. There is no second daily counter, no
 * second claim and no second streak anywhere in this file.
 *
 * WHAT IT IS, AND WHAT IT IS NOT
 *
 *   - It is a CHIP in the launch dock and a card the player opens from it.
 *     Both grow upward from a bottom-anchored dock, so LAUNCH does not move
 *     and the ≤3-tap law (§5, Rule 10) is untouched: open → LAUNCH → START is
 *     exactly the same sequence it was before this component existed. The
 *     Signal is a surface a player CHOOSES to look at, never a gate in front
 *     of play.
 *   - It is not a claim endpoint. §7.2: "rewards settle automatically — no
 *     claim cascades, ever." Nothing here collects anything; the flat
 *     first-completion bonus is paid by settlement, which the player cannot
 *     invoke. The only write this component can cause is opening the day's
 *     attempt.
 *   - It is not a commercial surface (Rule 7). No price, no offer, no
 *     entitlement, no upsell — the day's bonus is a game reward.
 *   - It renders only on Home. Nothing here mounts, fires or sounds during a
 *     run (Rule 1).
 *
 * ABSENCE IS NOT DESTRUCTIVE (Rule 5)
 *
 * The copy in this file never says "lost", "missed", "expires" or "don't break
 * it", and it never shows a number that goes down. A day the player did not
 * play simply is not shown: the panel only ever reports TODAY, so there is no
 * decaying figure to display and no archive to guilt anybody with. The marks
 * line reports a cumulative TOTAL, which §7.2 makes explicitly
 * non-consecutive — the word "streak" does not appear here, because the count
 * behind it has no memory of gaps.
 *
 * THE FLAG (rollback path, tested)
 *
 * `SIGNAL_V1_ENABLED` is read at module scope and the component returns null
 * when it is off — no fetch, no chip, no card, no measurable trace. That path
 * is exercised directly by `SignalSurface.flagOff.test.tsx`, never inferred
 * from an omitted flag.
 *
 * HOW TAKING WORKS, AND WHY IT LAUNCHES
 *
 * The server binds the day's attempt to an OPEN run: migration 049's
 * `begin_signal_objective_run` refuses any session that is not this player's
 * open run, so "take an objective" and "start the run you took it for" are one
 * act, not two. `onTake` therefore hands the objective id to Home's launch
 * flow, which starts the run with `mode: 'signal'` — the one request shape
 * that grants the §8.6 exemption at the moment the charge is decided. Taking
 * first and starting later would burn a charge on the day's exempt run, which
 * is why this component does not POST the objective on its own.
 *
 * The button copy says so plainly. A player is never surprised into a run.
 */

import { useCallback, useEffect, useState } from 'react';
import { SIGNAL_V1_ENABLED } from '@/lib/signal/config';
import { signalDayIndex, signalDayKeyToDate } from '@/shared/game/signal';

// ---------------------------------------------------------------------------
// The shape `GET /api/signal/panel` publishes (see that route's contract)
// ---------------------------------------------------------------------------

export interface SignalSurfaceObjective {
  id: string;
  kind: string;
  target: number;
  label: string;
  description: string;
  bonusDna: number;
}

export interface SignalSurfaceDay {
  id: string;
  day: string;
  startsAt: string;
  endsAt: string;
  seed: string;
  condition: { id: string; name: string; effect: string; strainTilt: string };
  objectives: SignalSurfaceObjective[];
}

export interface SignalSurfaceView {
  live: boolean;
  day: SignalSurfaceDay | null;
  you: {
    chosen: boolean;
    objectiveId: string | null;
    objective: SignalSurfaceObjective | null;
    progress: number;
    target: number;
    completed: boolean;
    bonusPaid: boolean;
  };
  marks: {
    signalsCompleted: number;
    reached: number[];
    next: number | null;
  };
}

type LoadState = 'loading' | 'ready' | 'error';

export interface SignalSurfaceProps {
  /** Supabase access token. The panel is a per-player read; no token, no read. */
  token: string | undefined;
  /**
   * Take one of the day's three. Resolves true when the run is on its way, so
   * the card can close; false leaves the card open with the error Home set.
   */
  onTake: (objectiveId: string) => Promise<boolean>;
  /** A take is in flight (Home owns the launch state machine). */
  taking?: boolean;
  /** Whatever went wrong in Home's launch flow, verbatim. */
  takeError?: string | null;
}

/**
 * "Signal #N" — N is `signalDayIndex`, the authoritative 0-based day number
 * from `src/shared/game/signal.ts`, and it is displayed WITHOUT an offset. A
 * recent defect came from adding one; there is deliberately no arithmetic
 * between the engine and the string below.
 */
export function signalDayLabel(dayKey: string): string | null {
  const date = signalDayKeyToDate(dayKey);
  if (!date) return null;
  return `Signal #${signalDayIndex(date)}`;
}

export function SignalSurface({
  token,
  onTake,
  taking = false,
  takeError = null,
}: SignalSurfaceProps) {
  const [view, setView] = useState<SignalSurfaceView | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [open, setOpen] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!SIGNAL_V1_ENABLED || !token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/signal/panel', {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Rule 11 / the repo's known `.then(res => res.json())` defect: a 500
        // is not a panel. The route answers 200 with `live: false` for every
        // ordinary "not live" reason, so a non-ok response here is a genuine
        // failure and reads as one.
        if (!response.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data = (await response.json()) as SignalSurfaceView;
        if (cancelled) return;
        setView(data);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token, reloads]);

  const handleTake = useCallback(
    async (objectiveId: string) => {
      const launched = await onTake(objectiveId);
      if (launched) setOpen(false);
    },
    [onTake]
  );

  if (!SIGNAL_V1_ENABLED) return null;
  if (state === 'loading') return null;

  const day = view?.day ?? null;
  const live = view?.live === true && day !== null;
  const dayLabel = day ? signalDayLabel(day.day) : null;

  const chipText =
    state === 'error'
      ? 'Signal unavailable'
      : !live
        ? 'Signal · quiet today'
        : view!.you.completed
          ? `${dayLabel} · complete`
          : view!.you.chosen
            ? `${dayLabel} · ${view!.you.objective?.label ?? 'taken'}`
            : `${dayLabel} · ${day!.condition.name}`;

  return (
    <div className="flex flex-col items-center gap-3" data-testid="signal-surface">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls="signal-card"
        data-testid="signal-chip"
        className="label-arcade flex items-center gap-2 rounded-full border border-bone-white/20 px-3 py-1 text-bone-white/80 transition-colors hover:text-venom-orange-light"
      >
        {/* A beacon, never a badge with a number counting down. The day is
            open; nothing about it is running out on the player (Rule 5). */}
        {live && !view!.you.chosen && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-venom-orange shadow-glow-sm shadow-venom-orange/80 animate-glow-pulse"
            aria-hidden="true"
          />
        )}
        <span>{chipText}</span>
      </button>

      {open && (
        <div
          id="signal-card"
          data-testid="signal-card"
          className="panel-glow animate-pop-in w-full max-w-md space-y-4 p-5 text-left"
          style={{ '--glow': '#22d3ee' } as React.CSSProperties}
        >
          {state === 'error' && (
            <div className="space-y-3" data-testid="signal-error">
              <h2 className="heading-display text-lg text-bone-white">
                The Signal did not answer
              </h2>
              <p className="font-body text-sm text-beige">
                Today&apos;s Signal could not be reached. Your runs are unaffected —
                LAUNCH works exactly as it does every day.
              </p>
              <button
                type="button"
                onClick={() => {
                  setState('loading');
                  setReloads((n) => n + 1);
                }}
                className="label-arcade rounded border border-bone-white/30 px-4 py-2 text-sm text-bone-white/80 transition-colors hover:text-venom-orange-light"
                data-testid="signal-retry"
              >
                Try again
              </button>
            </div>
          )}

          {state === 'ready' && !live && (
            <div className="space-y-2" data-testid="signal-off">
              <h2 className="heading-display text-lg text-bone-white">
                No Signal today
              </h2>
              <p className="font-body text-sm text-beige">
                The Signal is quiet right now. Every run still Scores, still ranks
                and still counts.
              </p>
            </div>
          )}

          {state === 'ready' && live && (
            <>
              <header className="space-y-1">
                <h2 className="heading-display text-lg text-venom-orange">
                  {dayLabel}
                </h2>
                <p className="label-arcade text-bone-white/80">
                  {day!.condition.name}
                </p>
                <p className="font-body text-sm text-beige">{day!.condition.effect}</p>
                <p className="font-body text-xs text-beige/70">
                  Gene pool tilts {day!.condition.strainTilt} today.
                </p>
              </header>

              {view!.you.chosen ? (
                <section className="space-y-2" data-testid="signal-taken">
                  <p className="label-arcade text-bone-white/80">
                    You took {view!.you.objective?.label ?? view!.you.objectiveId}
                  </p>
                  <p className="font-body text-sm text-beige">
                    {view!.you.objective?.description}
                  </p>
                  <p className="font-mono text-sm text-bone-white">
                    {view!.you.progress} / {view!.you.target}
                  </p>
                  {view!.you.completed && (
                    <p className="font-body text-sm text-rarity-uncommon">
                      Complete. The bonus settles on its own — there is nothing to
                      collect.
                    </p>
                  )}
                </section>
              ) : (
                <section className="space-y-3" data-testid="signal-objectives">
                  <p className="font-body text-xs text-beige/70">
                    Take one. It starts today&apos;s Signal run and costs no Energy.
                  </p>
                  {day!.objectives.map((objective) => (
                    <button
                      key={objective.id}
                      type="button"
                      disabled={taking}
                      onClick={() => void handleTake(objective.id)}
                      data-testid={`signal-objective-${objective.id}`}
                      className="w-full rounded border border-bone-white/20 px-4 py-3 text-left transition-colors hover:border-venom-orange disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="label-arcade block text-venom-orange">
                        {objective.label}
                      </span>
                      <span className="font-body block text-sm text-beige">
                        {objective.description}
                      </span>
                      <span className="font-mono block text-xs text-bone-white/70">
                        +{objective.bonusDna} DNA on first completion
                      </span>
                    </button>
                  ))}
                  {takeError && (
                    <p
                      role="alert"
                      className="font-body text-sm text-strike-red"
                      data-testid="signal-take-error"
                    >
                      {takeError}
                    </p>
                  )}
                </section>
              )}

              {/* Cumulative and non-consecutive (§7.2). A total, never a
                  streak, and never a number that can fall. */}
              <footer className="font-body text-xs text-beige/70">
                {view!.marks.signalsCompleted} Signals completed in total
                {view!.marks.next !== null
                  ? ` · next mark at ${view!.marks.next}`
                  : ''}
              </footer>
            </>
          )}
        </div>
      )}
    </div>
  );
}
