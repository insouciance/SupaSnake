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

  const visibleText = kind === 'numeric' ? (numericCount > 99 ? '99+' : numericCount) : '!';
  const accessibleLabel =
    label ??
    (kind === 'numeric'
      ? `${numericCount} item${numericCount === 1 ? ' needs' : 's need'} attention`
      : 'Action needs attention');

  return (
    <span
      className={`inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full border border-void-deep bg-strike-red px-1 font-body text-[10px] font-black leading-none text-bone-white shadow-sm motion-reduce:animate-none ${
        animate ? 'animate-pulse' : ''
      } ${className}`}
      aria-label={accessibleLabel}
      role="status"
    >
      <span aria-hidden="true">{visibleText}</span>
    </span>
  );
}
