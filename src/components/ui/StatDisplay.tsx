'use client';

import { formatAmount } from '@/shared/format/amount';

/**
 * StatDisplay - Numeric stat with label
 * Monospace numbers for technical/cockpit aesthetic; arcade section labels.
 *
 * A numeric `value` is an AMOUNT and renders as a whole number. Pass a
 * pre-formatted string for factors, percentages, rates, and durations.
 */

interface StatDisplayProps {
  /** Stat label */
  label: string;
  /** Stat value (number or string) */
  value: string | number;
  /** Optional suffix (e.g., "DNA", "#") */
  suffix?: string;
  /** Optional prefix (e.g., "#", "$") */
  prefix?: string;
  /** Highlight color for value */
  highlight?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: {
    value: 'text-lg',
    label: 'text-xs',
  },
  md: {
    value: 'text-2xl',
    label: 'text-xs',
  },
  lg: {
    value: 'text-3xl',
    label: 'text-sm',
  },
} as const;

export function StatDisplay({
  label,
  value,
  suffix,
  prefix,
  highlight = false,
  size = 'md',
}: StatDisplayProps) {
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div className="flex flex-col">
      <span className={`label-arcade ${sizeClasses.label}`}>
        {label}
      </span>
      <div
        className={`font-mono font-bold ${sizeClasses.value} ${
          highlight
            ? 'text-venom-orange [text-shadow:0_0_14px_rgba(34,211,238,0.45)]'
            : 'text-bone-white'
        }`}
      >
        {prefix}
        {typeof value === 'number' ? formatAmount(value) : value}
        {suffix && <span className="text-beige/60 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

export default StatDisplay;
