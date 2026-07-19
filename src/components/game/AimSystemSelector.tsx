'use client';

/**
 * AimSystemSelector - the aim meta-progression picker.
 *
 * `row` layout: compact horizontal chip row for the pre-game overlay.
 * `list` layout: stacked rows with descriptions for the Settings mirror.
 *
 * Locked systems render dimmed with a lock icon and their unlock hint;
 * unlock state is derived from server stats (and re-validated server-side
 * on PATCH - this component is presentation only).
 */

import {
  AIM_SYSTEMS,
  DEFAULT_AIM_SYSTEM,
  type AimStats,
  type AimSystemId,
} from '@/lib/game/aimSystems';
import { IconLock } from '@/components/ui/icons';

interface AimSystemSelectorProps {
  selected: AimSystemId;
  /** Unlock stats from /api/player; null = not loaded, only default usable */
  stats: AimStats | null;
  onSelect: (id: AimSystemId) => void;
  layout?: 'row' | 'list';
  disabled?: boolean;
}

export function AimSystemSelector({
  selected,
  stats,
  onSelect,
  layout = 'row',
  disabled = false,
}: AimSystemSelectorProps) {
  const isList = layout === 'list';

  return (
    <div
      className={
        isList
          ? 'flex flex-col gap-2'
          : 'flex flex-wrap justify-center gap-2'
      }
      role="radiogroup"
      aria-label="Aim system"
    >
      {AIM_SYSTEMS.map((def) => {
        // The default system is usable even before stats load; everything
        // else derives from the shared unlock predicates
        const unlocked =
          def.id === DEFAULT_AIM_SYSTEM || (stats !== null && def.isUnlocked(stats));
        const isSelected = def.id === selected;

        return (
          <button
            key={def.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid={`aim-chip-${def.id}`}
            disabled={disabled || !unlocked}
            onClick={() => unlocked && !isSelected && onSelect(def.id)}
            title={unlocked ? def.description : def.unlockHint}
            className={`rounded-arcade border font-body transition-all text-left ${
              isList ? 'px-4 py-3 w-full' : 'px-3 py-1.5'
            } ${
              isSelected
                ? 'border-venom-orange bg-venom-orange/10 text-venom-orange shadow-glow-sm shadow-venom-orange/50'
                : unlocked
                  ? 'border-scale-blue-light/60 bg-void/70 text-bone-white hover:border-venom-orange/70'
                  : 'border-scale-blue-light/30 bg-void/50 text-beige/40 cursor-not-allowed'
            }`}
          >
            <span className={`flex items-center gap-1.5 ${isList ? 'text-base' : 'text-sm'}`}>
              {!unlocked && <IconLock size={isList ? 15 : 13} />}
              <span className={isSelected ? 'font-bold' : ''}>{def.name}</span>
            </span>
            {isList && (
              <span className="block mt-0.5 text-sm text-beige/70">
                {unlocked ? def.description : def.unlockHint}
              </span>
            )}
            {!isList && !unlocked && (
              <span className="block text-[10px] leading-tight text-beige/50">
                {def.unlockHint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default AimSystemSelector;
