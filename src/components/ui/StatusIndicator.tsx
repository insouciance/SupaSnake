'use client';

/**
 * StatusIndicator - System status dot with label
 * Emissive status dots over the void (dots stay circular by design).
 */

interface StatusIndicatorProps {
  /** Status label text */
  label: string;
  /** Status state */
  status: 'online' | 'offline' | 'warning' | 'syncing';
  /** Show pulse animation for active states */
  pulse?: boolean;
}

const STATUS_COLORS = {
  online: 'bg-rarity-uncommon',
  offline: 'bg-strike-red',
  warning: 'bg-rarity-legendary',
  syncing: 'bg-venom-orange',
} as const;

const STATUS_GLOW = {
  online: 'shadow-[0_0_8px_rgba(74,222,128,0.7)]',
  offline: 'shadow-[0_0_8px_rgba(244,63,94,0.7)]',
  warning: 'shadow-[0_0_8px_rgba(251,191,36,0.7)]',
  syncing: 'shadow-[0_0_8px_rgba(34,211,238,0.7)]',
} as const;

export function StatusIndicator({
  label,
  status,
  pulse = false,
}: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-2 h-2 rounded-full
          ${STATUS_COLORS[status]}
          ${STATUS_GLOW[status]}
          ${pulse && status !== 'offline' ? 'animate-pulse' : ''}
        `}
      />
      <span className="text-sm font-body font-semibold text-beige">{label}</span>
    </div>
  );
}

export default StatusIndicator;
