'use client';

import { useEffect, useState } from 'react';
import { ChargeMeter } from '@/components/ui/ChargeMeter';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { IconBolt, IconShield } from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import {
  energyCommitmentMultiplier,
  type EnergyStatus,
} from '@/shared/game/energyEnvelope';
import { GAME_CONFIG } from '@/shared/config/game';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { describe as describeLexiconEntry } from '@/shared/game/lexicon';
import { formatAmount } from '@/shared/format/amount';

/** The Energy Commitment rule, from the one registry that owns its numbers. */
const ENERGY_LEXICON = describeLexiconEntry('mechanic', 'charges');

interface EnergyCommitmentSelectorProps {
  energy: EnergyStatus | null;
  value: number;
  onChange: (commitment: number) => void;
  clanBattle?: {
    active: boolean;
    fifthBestToBeat?: number;
  } | null;
}

/**
 * One compact risk control. The rail expresses every commitment without
 * turning six numbers into six equal buttons; maximum charge remains a
 * deliberate two-step choice.
 */
export function EnergyCommitmentSelector({
  energy,
  value,
  onChange,
  clanBattle = null,
}: EnergyCommitmentSelectorProps) {
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
        className="mx-auto w-full rounded-[20px] bg-void/70 p-4"
        data-testid="energy-commitment"
      >
        <p className="font-body text-sm text-beige/60">Checking recovered Energy…</p>
      </section>
    );
  }

  const available = Math.max(0, Math.min(capacity, energy.available));
  const multiplier = energyCommitmentMultiplier(value);
  const railFill = available > 0 ? Math.min(100, Math.max(0, (value / available) * 100)) : 0;

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
      className="relative mx-auto w-full overflow-hidden rounded-[22px] bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.16),transparent_45%),linear-gradient(180deg,rgba(22,32,43,0.94),rgba(6,9,13,0.98))] p-2.5 sm:p-4"
      data-testid="energy-commitment"
      aria-label="Energy Commitment"
    >
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-left">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rarity-legendary/35 bg-rarity-legendary/10 text-rarity-legendary">
            <span className="h-4 w-4"><StrainGlyph id="UMBRA" /></span>
          </span>
          <div>
            {/*
              The one control that spends a non-replaceable resource explains
              itself on tap (WP-D). Its words are the lexicon's, so recovery
              cadence, the lean-run share and "Energy cannot be bought or
              gifted" are stated once and cannot drift between surfaces.
            */}
            {ENERGY_LEXICON ? (
              <InfoPopover
                title={ENERGY_LEXICON.name}
                effect={ENERGY_LEXICON.effect}
                cost={ENERGY_LEXICON.cost}
                label="Energy Commitment: what it does"
                testId="energy-commitment"
                className="min-h-[44px] heading-display text-sm text-rarity-legendary underline decoration-dotted underline-offset-4"
              >
                Energy reactor
              </InfoPopover>
            ) : (
              <p className="heading-display text-sm text-rarity-legendary">Energy reactor</p>
            )}
            <p className="mt-0.5 hidden font-body text-xs text-beige/65 sm:block">Choose how much this run carries.</p>
          </div>
        </div>
        <ChargeMeter charge={energy} className="shrink-0 items-end scale-[0.86] origin-top-right min-[380px]:scale-100" />
      </div>

      {available > 0 ? (
        <>
          <div className="relative mt-1.5 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:mt-3">
            <button
              type="button"
              aria-label="Commit one less Energy"
              onClick={() => requestCommitment(value - 1)}
              disabled={value <= 0}
              className="min-h-[44px] rounded-full border border-scale-blue-light/55 bg-void/80 font-display text-xl text-beige transition-colors hover:border-rarity-legendary/60 hover:text-rarity-legendary disabled:opacity-25 whitespace-nowrap"
              data-testid="energy-decrease"
            >
              −
            </button>

            <div className="text-center" aria-live="polite">
              <div className="relative mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-rarity-legendary/65 bg-void-deep shadow-glow-lg shadow-rarity-legendary/25 sm:h-[88px] sm:w-[88px]">
                <span className="absolute inset-2 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.11),transparent_68%)]" aria-hidden="true" />
                <div className="relative">
                  <span className="block font-display text-2xl leading-none text-rarity-legendary sm:text-3xl">
                    {value > 0 ? value : '0'}
                  </span>
                  <span className="mt-1 block font-body text-[9px] uppercase tracking-[0.12em] text-beige/55">
                    {value > 0 ? 'Energy' : 'Lean'}
                  </span>
                </div>
              </div>
              <p className="mt-1 font-display text-sm text-bone-white sm:mt-1.5 sm:text-lg">
                ×{multiplier.toFixed(value === 0 ? 2 : 1)} harvest
              </p>
            </div>

            <button
              type="button"
              aria-label="Commit one more Energy"
              onClick={() => requestCommitment(value + 1)}
              disabled={value >= available}
              className="min-h-[44px] rounded-full border border-rarity-legendary/55 bg-rarity-legendary/10 font-display text-xl text-rarity-legendary transition-colors hover:bg-rarity-legendary/20 disabled:opacity-25 whitespace-nowrap"
              data-testid="energy-increase"
            >
              +
            </button>
          </div>

          <div className="relative mt-0.5 px-1 sm:mt-2">
            <input
              type="range"
              min={0}
              max={available}
              step={1}
              value={Math.min(value, available)}
              onChange={(event) => requestCommitment(Number(event.target.value))}
              aria-label="Energy commitment"
              aria-valuetext={
                value > 0
                  ? `${value} Energy for ${multiplier.toFixed(1)} times harvest`
                  : 'Lean run for 0.25 times harvest'
              }
              className="relative z-10 h-6 w-full cursor-pointer bg-transparent sm:h-7"
              style={{ accentColor: '#fbbf24' }}
              data-testid="energy-commitment-slider"
            />
            <div className="pointer-events-none absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-scale-blue-light/55">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-cyber via-cosmic to-rarity-legendary shadow-glow-sm shadow-rarity-legendary/40 transition-[width] motion-reduce:transition-none"
                style={{ width: `${railFill}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:mt-1">
            <button
              type="button"
              onClick={() => requestCommitment(0)}
              className="min-h-[44px] rounded-full border border-scale-blue-light/45 bg-void/55 px-3 font-body text-xs text-beige/65 transition-colors hover:border-cyber/45 hover:text-bone-white whitespace-nowrap"
              data-testid="energy-run-lean"
            >
              Lean · ×0.25
            </button>
            <button
              type="button"
              onClick={() => requestCommitment(capacity)}
              disabled={available < capacity || value === capacity}
              className="min-h-[44px] rounded-full border border-rarity-legendary/45 bg-rarity-legendary/10 px-3 font-body text-xs font-semibold text-rarity-legendary transition-colors hover:bg-rarity-legendary/20 disabled:opacity-35 whitespace-nowrap"
              data-testid="energy-commit-6"
            >
              Max · ×{energyCommitmentMultiplier(capacity).toFixed(1)}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[16px] border border-cyber/25 bg-cyber/5 px-3 py-4 text-center">
          <p className="font-display text-lg text-cyber">Lean run · ×0.25</p>
          <p className="mt-1 font-body text-xs text-beige/65">
            No Energy stored. You can still play and one Energy recovers each hour.
          </p>
        </div>
      )}

      <p className="mt-1.5 text-center font-body text-[11px] leading-snug text-beige/65 sm:mt-2 sm:text-xs" data-testid="energy-summary">
        {value > 0 ? `Commit ${value} Energy` : 'Lean run'} · Harvest multiplier:{' '}
        <span className="font-mono font-bold text-rarity-legendary">
          ×{multiplier.toFixed(value === 0 ? 2 : 1)}
        </span>
      </p>
      <p className="mt-0.5 text-center font-body text-[10px] leading-snug text-beige/50 sm:mt-1 sm:text-[11px]">
        {value > 0
          ? `All ${value} committed Energy is consumed when the run begins. A crash or abandonment does not refund it.`
          : 'Lean play consumes no Energy.'}
      </p>

      {clanBattle?.active ? (
        <div
          className="mt-1.5 flex min-h-[36px] items-center gap-2 rounded-full border border-cosmic/35 bg-cosmic/10 px-2.5 py-1.5 text-left sm:mt-3 sm:min-h-[52px] sm:rounded-[14px] sm:px-3 sm:py-2"
          data-testid="energy-clan-eligible"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cosmic/15 text-cosmic-glow sm:h-8 sm:w-8">
            <IconShield size={17} />
          </span>
          <p className="min-w-0 flex-1 truncate font-body text-[10px] leading-snug text-beige/70 sm:whitespace-normal sm:text-xs">
            <span className="font-display text-cosmic-glow">Battle live</span>
            {' · '}
            <span className="sm:hidden">
              {value > 0
                ? (clanBattle.fifthBestToBeat ?? 0) > 0
                  ? `Counts · beat ${formatAmount(clanBattle.fifthBestToBeat ?? 0)}`
                  : 'Counts toward your five'
                : 'Commit 1+ to enter'}
            </span>
            <span className="hidden sm:inline">
              {value > 0
                ? (clanBattle.fifthBestToBeat ?? 0) > 0
                  ? `This run counts. Beat ${formatAmount(clanBattle.fifthBestToBeat ?? 0)} Yield to improve your five.`
                  : 'This run counts. Your strongest five runs contribute.'
                : 'Lean runs do not count. Commit at least 1 Energy to enter this attempt.'}
            </span>
          </p>
        </div>
      ) : null}

      {confirmingMax ? (
        <ModalDialog
          onClose={() => setConfirmingMax(false)}
          ariaLabelledBy="energy-max-title"
          ariaDescribedBy="energy-max-description"
          testId="energy-max-confirmation"
          panelClassName="modal-frame modal-tray-narrow overflow-hidden border bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.22),transparent_48%),linear-gradient(180deg,#16202b,#06090d)] p-5 text-center"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-rarity-legendary bg-rarity-legendary/10 text-rarity-legendary shadow-glow shadow-rarity-legendary/45 motion-safe:animate-glow-pulse motion-reduce:animate-none">
            <IconBolt size={38} />
          </div>
          <p className="label-arcade mt-4 text-rarity-legendary">Maximum charge</p>
          <h2 id="energy-max-title" className="mt-1 heading-display text-2xl text-bone-white">
            Commit all 6 Energy?
          </h2>
          <p id="energy-max-description" className="mt-2 font-body text-sm leading-snug text-beige/70">
            This powers a ×10 harvest run. All six Energy are consumed when the run begins and are not refunded after a crash or abandonment.
          </p>
          <button
            type="button"
            className="btn-go mt-5 min-h-[50px] w-full px-4 py-2 text-sm whitespace-nowrap"
            onClick={() => {
              onChange(capacity);
              setConfirmingMax(false);
            }}
            data-testid="energy-max-confirm"
          >
            Arm ×10 run
          </button>
          <button
            type="button"
            className="btn-neutral mt-2 min-h-[44px] w-full px-4 py-2 text-xs whitespace-nowrap"
            onClick={() => setConfirmingMax(false)}
          >
            Keep {value > 0 ? `${value} Energy` : 'lean run'}
          </button>
        </ModalDialog>
      ) : null}
    </section>
  );
}

export default EnergyCommitmentSelector;
