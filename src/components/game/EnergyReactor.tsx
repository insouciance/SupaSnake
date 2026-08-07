'use client';

import { useEffect, useState } from 'react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { IconBolt } from '@/components/ui/icons';
import {
  energyCommitmentMultiplier,
  type EnergyStatus,
} from '@/shared/game/energyEnvelope';
import { GAME_CONFIG } from '@/shared/config/game';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { describe as describeLexiconEntry } from '@/shared/game/lexicon';

/** The Energy Commitment rule, from the one registry that owns its numbers. */
const ENERGY_LEXICON = describeLexiconEntry('mechanic', 'charges');

interface EnergyReactorProps {
  energy: EnergyStatus | null;
  value: number;
  onChange: (commitment: number) => void;
  clanBattle?: {
    active: boolean;
    fifthBestToBeat?: number;
  } | null;
}

/**
 * THE ENERGY REACTOR (owner ruling: Setup is three elements, and this is the
 * middle one - "the commitment control with the mode collapse").
 *
 * WHAT IT REPLACES, AND WHY. The old control was a stepper, a slider, a dial,
 * a "Lean" shortcut and a "Max" shortcut - five ways to set one number, three
 * of which could be operated by accident. A slider in particular is the wrong
 * instrument for this decision: it is continuous, reversible and cheap to drag,
 * and what it sets is a NON-REFUNDABLE stake. The gesture has to cost
 * something, so the reactor charges ONE ROD PER PRESS and there is no way to
 * sweep to six.
 *
 * THE METAPHOR IS LOAD-BEARING, not decoration. Six rods in a housing; each
 * press seats one rod; the output gauge above them reads what the core is
 * making. That is why the numbers are placed where they are - the multiplier
 * is the reactor's OUTPUT, so it sits at the top where an output reads, and
 * the stock is FUEL REMAINING, so it sits under the housing where a supply
 * reads. Nothing here is a label beside a number.
 *
 * THE MODE COLLAPSE. Free play is not a mode any more, it is the reactor at
 * zero: cold housing, empty rods, and the panel says FREE PLAY across the
 * core. That is the owner's structural ruling - "zero is free play" - and it
 * removes the Earn/Free/Anomaly toggle from Setup entirely. A player who wants
 * a free run does not choose a mode; they simply do not charge the reactor,
 * which is also the honest description of what the economy does.
 *
 * Energy is never sold and the surface never implies it can be: the only way
 * the stock rises is the recovery line under the housing.
 */
export function EnergyReactor({
  energy,
  value,
  onChange,
  clanBattle = null,
}: EnergyReactorProps) {
  const [confirmingMax, setConfirmingMax] = useState(false);
  const capacity = GAME_CONFIG.economy.energy.capacity;

  useEffect(() => {
    if (!energy) return;
    if (value > energy.available) onChange(energy.available > 0 ? 1 : 0);
    if (energy.available < capacity) setConfirmingMax(false);
  }, [capacity, energy, onChange, value]);

  if (!energy) {
    return (
      <section
        className="paper-recess mx-auto w-full p-4 text-center"
        data-testid="energy-commitment"
      >
        <p className="font-body text-sm text-ink/60">Checking recovered Energy…</p>
      </section>
    );
  }

  const available = Math.max(0, Math.min(capacity, energy.available));
  const multiplier = energyCommitmentMultiplier(value);
  const staked = value > 0;

  const requestCommitment = (requested: number) => {
    const next = Math.max(0, Math.min(available, Math.round(requested)));
    if (next === capacity && value !== capacity) {
      setConfirmingMax(true);
      return;
    }
    setConfirmingMax(false);
    onChange(next);
  };

  return (
    <section
      className="mx-auto w-full text-center"
      data-testid="energy-commitment"
      aria-label="Energy Reactor"
    >
      {/* THE OUTPUT GAUGE. What the core is currently making, stated before
          the controls that change it - an instrument reads out, then you
          adjust it. */}
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="text-left">
          {ENERGY_LEXICON ? (
            <InfoPopover
              title={ENERGY_LEXICON.name}
              effect={ENERGY_LEXICON.effect}
              cost={ENERGY_LEXICON.cost}
              label="Energy Reactor: what it does"
              testId="energy-commitment"
              className="label-arcade min-h-[44px] text-[10px] text-ink/60 underline decoration-dotted underline-offset-4"
            >
              Energy reactor
            </InfoPopover>
          ) : (
            <p className="label-arcade text-[10px] text-ink/60">Energy reactor</p>
          )}
          <p
            className="heading-display text-lg leading-none text-ink sm:text-xl"
            aria-live="polite"
            data-testid="energy-summary"
          >
            {staked ? `Staked · ${value} Energy` : 'Free play'}
          </p>
        </div>
        <p className="heading-display shrink-0 text-right text-2xl leading-none text-venom-orange-dark sm:text-3xl">
          ×{multiplier.toFixed(staked ? 1 : 2)}
          <span className="label-arcade ml-1 text-[9px] text-ink/50">harvest</span>
        </p>
      </div>

      {/* THE CORE. Six rods in ONE HOUSING, and the two controls stand
          OUTSIDE it. That separation is the whole readability of the
          instrument: inside the housing everything is a rod, so a control
          sharing the housing's row reads as a seventh rod you cannot seat.
          The rods are separated by the GAP between them, because six
          identical cells are a FIELD and a field is never drawn with lines
          (T-3); the housing itself is a recess, which is a fill step. */}
      <div className="mt-1.5 flex items-stretch gap-1.5 sm:mt-2 sm:gap-2">
        <button
          type="button"
          aria-label="Release one Energy"
          onClick={() => requestCommitment(value - 1)}
          disabled={value <= 0}
          data-testid="energy-decrease"
          className="btn-paper inline-flex min-h-[54px] w-11 shrink-0 items-center justify-center text-xl disabled:opacity-25 sm:min-h-[60px] sm:w-12"
        >
          −
        </button>

        <div
          className="paper-recess relative flex min-w-0 flex-1 items-stretch gap-1.5 p-1.5"
          role="group"
          aria-label={`${value} of ${capacity} rods seated`}
        >
          {Array.from({ length: capacity }, (_, index) => {
            const seated = index < value;
            const reachable = index < available;
            return (
              <span
                key={index}
                aria-hidden="true"
                data-seated={seated ? 'true' : 'false'}
                data-testid={`energy-rod-${index + 1}`}
                className={`min-h-[42px] flex-1 rounded-[var(--radius-chip)] sm:min-h-[48px] border-[length:var(--ink-w-2)] border-ink transition-colors ${
                  seated
                    ? 'bg-venom-orange shadow-[inset_0_-6px_0_rgba(180,102,28,0.55)]'
                    : reachable
                      ? 'bg-[color:var(--fill-paper-3)]'
                      : 'bg-[color:var(--fill-paper-3)] opacity-40'
                }`}
              />
            );
          })}
          {!staked ? (
            <span
              aria-hidden="true"
              className="heading-display pointer-events-none absolute inset-0 flex items-center justify-center text-sm tracking-[0.18em] text-ink"
            >
              FREE PLAY
            </span>
          ) : null}
        </div>

        {/* THE CHARGE LEVER. One rod per press, and deliberately the biggest
            control on the row: it is the gesture that stakes the run. There is
            no way to sweep to six, which is the point - what it sets is
            non-refundable. */}
        <button
          type="button"
          aria-label="Charge one Energy"
          onClick={() => requestCommitment(value + 1)}
          disabled={value >= available}
          data-testid="energy-increase"
          className="btn-go inline-flex min-h-[54px] w-14 shrink-0 items-center justify-center text-2xl disabled:opacity-25 sm:min-h-[60px] sm:w-16"
        >
          +
        </button>
      </div>

      {/* FUEL REMAINING, under the housing where a supply reads. */}
      <p className="mt-1 px-1 text-left font-body text-[10px] leading-snug text-ink/60 sm:mt-1.5 sm:text-[11px]">
        <span data-testid="energy-stock">
          Stock {available}/{capacity}
        </span>
        {available < capacity ? ' · one recovers each hour' : ' · full'}
        {staked
          ? ` · all ${value} are consumed at launch and a crash does not refund them`
          : ' · free play consumes none'}
      </p>

      {/* The two shortcuts survive as EXPLICIT statements of the extremes
          rather than as a second way to set the middle. `energy-run-lean` and
          `energy-commit-6` keep their names: they are the same two decisions
          the released control offered, and the e2e legs read them. */}
      <div className="mt-1 flex items-center justify-between gap-2 sm:mt-1.5">
        <button
          type="button"
          onClick={() => requestCommitment(0)}
          disabled={value === 0}
          data-testid="energy-run-lean"
          className="btn-paper min-h-[44px] px-3 py-1.5 text-[11px] disabled:opacity-30"
        >
          Go cold · ×0.25
        </button>
        <button
          type="button"
          onClick={() => requestCommitment(capacity)}
          disabled={available < capacity || value === capacity}
          data-testid="energy-commit-6"
          className="btn-paper min-h-[44px] px-3 py-1.5 text-[11px] disabled:opacity-30"
        >
          Full core · ×{energyCommitmentMultiplier(capacity).toFixed(1)}
        </button>
      </div>

      {clanBattle?.active ? (
        <p
          className="mt-2 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-cosmic px-2.5 py-1.5 text-left font-body text-[11px] leading-snug text-bone-white"
          data-testid="energy-clan-eligible"
        >
          <span className="heading-display">Battle live</span>
          {' · '}
          {staked
            ? 'this run counts toward your strongest five'
            : 'free runs do not count — charge at least one rod'}
        </p>
      ) : null}

      {confirmingMax ? (
        <ModalDialog
          onClose={() => setConfirmingMax(false)}
          ariaLabelledBy="energy-max-title"
          ariaDescribedBy="energy-max-description"
          testId="energy-max-confirmation"
          panelClassName="paper-tray modal-tray-narrow overflow-hidden p-5 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-[length:var(--ink-w-3)] border-ink bg-venom-orange text-ink shadow-[var(--ink-drop-2)]">
            <IconBolt size={32} />
          </div>
          <p className="label-arcade mt-4 text-ink/60">Full core</p>
          <h2 id="energy-max-title" className="heading-display mt-1 text-2xl text-ink">
            Seat all {capacity} rods?
          </h2>
          <p id="energy-max-description" className="mt-2 font-body text-sm leading-snug text-ink/70">
            This powers a ×{energyCommitmentMultiplier(capacity).toFixed(1)} harvest run. All {capacity} Energy
            are consumed when the run begins and are not refunded after a crash
            or abandonment.
          </p>
          <button
            type="button"
            className="btn-go mt-5 min-h-[50px] w-full px-4 py-2 text-sm"
            onClick={() => {
              onChange(capacity);
              setConfirmingMax(false);
            }}
            data-testid="energy-max-confirm"
          >
            Arm the full core
          </button>
          <button
            type="button"
            className="btn-paper mt-2 min-h-[44px] w-full px-4 py-2 text-xs"
            onClick={() => setConfirmingMax(false)}
          >
            Keep {value > 0 ? `${value} seated` : 'free play'}
          </button>
        </ModalDialog>
      ) : null}
    </section>
  );
}

export default EnergyReactor;
