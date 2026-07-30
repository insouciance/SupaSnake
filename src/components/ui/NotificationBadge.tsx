import type { NotificationBadgeKind } from '@/lib/stores/notificationStore';

interface NotificationBadgeProps {
  kind: NotificationBadgeKind;
  count?: number;
  label?: string;
  animate?: boolean;
  className?: string;
}

export function NotificationBadge({
  kind,
  count = 0,
  label,
  animate = true,
  className = '',
}: NotificationBadgeProps) {
  if (kind === 'hidden') return null;

  const numericCount = Math.max(0, Math.floor(count));
  if (kind === 'numeric' && numericCount === 0) return null;

  const visibleText =
    kind === 'numeric' ? (numericCount > 9 ? '9+' : numericCount) : kind === 'dot' ? '' : '!';
  const accessibleLabel =
    label ??
    (kind === 'numeric'
      ? `${numericCount} item${numericCount === 1 ? ' needs' : 's need'} attention`
      : kind === 'dot'
        ? 'New recognition'
        : 'Action needs attention');

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-void-deep font-body font-black leading-none text-bone-white shadow-sm motion-reduce:animate-none ${
        kind === 'dot'
          ? 'h-2.5 w-2.5 min-w-0 bg-cosmic p-0'
          : 'h-[18px] min-w-[18px] bg-strike-red px-1 text-[10px]'
      } ${
        animate ? 'animate-pulse' : ''
      } ${className}`}
      aria-label={accessibleLabel}
      role="status"
    >
      <span aria-hidden="true">{visibleText}</span>
    </span>
  );
}
