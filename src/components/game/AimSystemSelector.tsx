'use client';

/**
 * AimSystemSelector - the aim system picker.
 *
 * `row` layout: compact horizontal chip row for the Run Setup page.
 * `list` layout: stacked rows with descriptions for the Settings mirror.
 *
 * WP-0.07: there are no locked chips. Constitution §6.1 makes all four aim
 * systems universal settings from the first run, so this component takes no
 * progression, unlock or account state at all - every chip renders selectable
 * for every player, including a fresh anonymous account whose profile has not
 * loaded yet. The picker is one control among the setup page's others; it
 * adds no tap to open → LAUNCH → START → board (Rule 10).
 */

import {
  AIM_SYSTEMS,
  type AimSystemId,
} from '@/lib/game/aimSystems';

interface AimSystemSelectorProps {
  selected: AimSystemId;
  onSelect: (id: AimSystemId) => void;
  layout?: 'row' | 'list';
  disabled?: boolean;
}

export function AimSystemSelector({
  selected,
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
        const isSelected = def.id === selected;

        return (
          <button
            key={def.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid={`aim-chip-${def.id}`}
            disabled={disabled}
            onClick={() => !isSelected && onSelect(def.id)}
            title={def.description}
            className={`rounded-arcade border font-body transition-all text-left ${
              isList ? 'px-4 py-3 w-full' : 'px-3 py-1.5'
            } ${
              isSelected
                ? 'border-venom-orange bg-venom-orange/10 text-venom-orange shadow-glow-sm shadow-venom-orange/50'
                : 'border-scale-blue-light/60 bg-void/70 text-bone-white hover:border-venom-orange/70'
            }`}
          >
            <span className={`flex items-center gap-1.5 ${isList ? 'text-base' : 'text-sm'}`}>
              <span className={isSelected ? 'font-bold' : ''}>{def.name}</span>
            </span>
            {isList && (
              <span className="block mt-0.5 text-sm text-beige/70">
                {def.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default AimSystemSelector;
