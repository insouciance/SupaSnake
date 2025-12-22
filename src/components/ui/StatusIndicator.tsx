'use client';

/**
 * StatusIndicator - System status dot with label
 * Used for cockpit-style "systems check" displays
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
  online: 'bg-green-500',
  offline: 'bg-strike-red',
  warning: 'bg-yellow-500',
  syncing: 'bg-venom-orange',
} as const;

const STATUS_GLOW = {
  online: 'shadow-[0_0_6px_rgba(34,197,94,0.6)]',
  offline: 'shadow-[0_0_6px_rgba(164,36,36,0.6)]',
  warning: 'shadow-[0_0_6px_rgba(234,179,8,0.6)]',
  syncing: 'shadow-[0_0_6px_rgba(217,131,36,0.6)]',
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
      <span className="text-sm font-body text-beige">{label}</span>
    </div>
  );
}

export default StatusIndicator;
