'use client';

import { useEffect, useState } from 'react';
import { ChargeMeter } from '@/components/ui/ChargeMeter';
import {
  energyCommitmentMultiplier,
  type EnergyStatus,
} from '@/shared/game/energyEnvelope';
import { GAME_CONFIG } from '@/shared/config/game';

interface EnergyCommitmentSelectorProps {
  energy: EnergyStatus | null;
  value: number;
  onChange: (commitment: number) => void;
  clanBattle?: {
    active: boolean;
    fifthBestToBeat?: number;
  } | null;
}

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
  }, [energy, onChange, value]);

  if (!energy) {
    return <p className="font-body text-sm text-beige/60">Checking recovered Energy…</p>;
  }

  const multiplier = energyCommitmentMultiplier(value);
  const maxNeedsConfirmation = value === capacity;

  const choose = (commitment: number) => {
    if (commitment === capacity) {
      if (!confirmingMax) {
        setConfirmingMax(true);
        return;
      }
      setConfirmingMax(false);
    } else {
      setConfirmingMax(false);
    }
    onChange(commitment);
  };

  return (
    <section
      className="rounded-arcade border border-venom-orange/35 bg-void/55 p-4"
      data-testid="energy-commitment"
      aria-label="Energy Commitment"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-venom-orange">Energy Commitment</p>
          <p className="mt-1 max-w-lg font-body text-xs text-beige/65">
            Power this run with recovered Energy. All committed Energy is
            consumed when the run begins—even if you crash or leave.
          </p>
        </div>
        <ChargeMeter charge={energy} />
      </div>

      {energy.available > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {Array.from({ length: energy.available }, (_, index) => index + 1).map(
            (commitment) => {
              const selected = value === commitment;
              const needsConfirm = commitment === capacity && confirmingMax && !selected;
              return (
                <button
                  key={commitment}
                  type="button"
                  onClick={() => choose(commitment)}
                  data-testid={`energy-commit-${commitment}`}
                  aria-pressed={selected}
                  className={`min-h-[48px] rounded-arcade border px-2 py-2 font-mono text-sm transition-colors ${
                    selected
                      ? 'border-venom-orange bg-venom-orange/20 text-bone-white shadow-glow-sm shadow-venom-orange/35'
                      : needsConfirm
                        ? 'border-strike-red bg-strike-red/15 text-strike-red'
                        : 'border-scale-blue-light/45 bg-void/60 text-beige hover:border-venom-orange/70'
                  }`}
                >
                  <span className="block font-bold">
                    {needsConfirm ? 'Confirm 6' : `${commitment} Energy`}
                  </span>
                  <span className="block text-[11px] opacity-75">
                    ×{energyCommitmentMultiplier(commitment).toFixed(1)}
                  </span>
                </button>
              );
            }
          )}
        </div>
      ) : (
        <p className="mt-4 font-body text-sm text-beige/75">
          No Energy stored. You can still start a lean run at ×0.25 harvest.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm text-bone-white" data-testid="energy-summary">
          {value > 0 ? `Commit ${value} Energy` : 'Lean run'} · Harvest multiplier:{' '}
          <span className="font-mono font-bold text-venom-orange">
            ×{multiplier.toFixed(value === 0 ? 2 : 1)}
          </span>
        </p>
        {value > 0 && (
          <button
            type="button"
            onClick={() => {
              setConfirmingMax(false);
              onChange(0);
            }}
            className="min-h-[44px] px-2 font-body text-xs text-beige/60 underline hover:text-bone-white"
            data-testid="energy-run-lean"
          >
            Save Energy and run lean
          </button>
        )}
      </div>

      {maxNeedsConfirmation && (
        <p className="mt-2 font-body text-xs text-strike-red">
          Maximum commitment selected. Starting will consume all six Energy.
        </p>
      )}
      {clanBattle?.active && value > 0 && (
        <p className="mt-3 border-t border-scale-blue-light/20 pt-3 font-body text-xs text-cosmic" data-testid="energy-clan-eligible">
          This Energy run counts toward your clan battle.
          {(clanBattle.fifthBestToBeat ?? 0) > 0
            ? ` Beat ${clanBattle.fifthBestToBeat} Yield to improve your five.`
            : ' Your strongest five runs contribute.'}
        </p>
      )}
    </section>
  );
}

export default EnergyCommitmentSelector;
