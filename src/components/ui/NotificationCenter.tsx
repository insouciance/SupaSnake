'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogFocusTrap } from '@/hooks/useDialogFocusTrap';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog';
import {
  attentionBadge,
  dispatchNotificationAction,
  notificationActionForHref,
  notificationList,
  transitionServerNotification,
  useNotificationStore,
  type GameNotification,
} from '@/lib/stores/notificationStore';
import { NotificationBadge } from './NotificationBadge';

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NotificationItem({
  notification,
  token,
  onAction,
}: {
  notification: GameNotification;
  token?: string;
  onAction: () => void;
}) {
  const action = notification.action ?? notificationActionForHref(notification.href);

  return (
    <li className="border-b border-scale-blue-light/20 last:border-0">
      <Link
        href={notification.href}
        className="flex min-h-[72px] gap-3 px-4 py-3 text-left transition-colors hover:bg-scale-blue/20 focus:outline-none focus-visible:bg-scale-blue/30"
        onClick={() => {
          if (action) dispatchNotificationAction(action);
          trackEvent(AnalyticsEvents.NOTIFICATION_OPENED, {
            notification_id: notification.id,
            notification_class: notification.notificationClass,
            destination: notification.destination,
            category: 'engagement',
          });
          if (notification.serverManaged && token) {
            void transitionServerNotification(
              notification.id,
              'seen',
              token
            ).catch((error) => {
              console.error('Failed to mark attention seen:', error);
            });
          }
          onAction();
        }}
      >
        <NotificationBadge
          kind={notification.badgeKind}
          count={notification.count}
          label={`${notification.title} needs attention`}
          animate={false}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0">
          <span className="block font-body text-sm font-bold text-bone-white">
            {notification.title}
          </span>
          <span className="mt-0.5 block font-body text-xs text-beige/75">
            {notification.description}
          </span>
          {notification.actionLabel && (
            <span className="mt-1 block font-body text-xs font-bold text-venom-orange">
              {notification.actionLabel}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function NotificationDialog({
  notifications,
  token,
  onClose,
}: {
  notifications: GameNotification[];
  token?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusTrap(dialogRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center overflow-hidden p-3 sm:p-6 [padding-top:calc(0.75rem+env(safe-area-inset-top))] [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal-frame modal-tray-narrow flex max-h-full min-h-0 flex-col overflow-hidden border bg-void-deep"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-scale-blue-light/40 px-4 py-3">
          <div>
            <h2
              id="notification-center-title"
              className="font-display text-sm uppercase tracking-wider text-bone-white"
            >
              Notifications
            </h2>
            <p className="mt-0.5 font-body text-xs text-beige/60">
              Actions stay here until they are resolved or acknowledged.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-arcade border border-scale-blue-light/50 text-beige transition-colors hover:border-venom-orange hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
            aria-label="Close notifications"
          >
            <CloseIcon />
          </button>
        </header>

        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center font-body text-sm text-beige/70">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-testid="notification-list"
          >
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                token={token}
                onAction={onClose}
              />
            ))}
          </ul>
        )}
      </section>
    </div>,
    document.body
  );
}

export function NotificationCenter() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const notifications = useNotificationStore((state) => state.notifications);
  const hasHydrated = useNotificationStore((state) => state.hasHydrated);
  const ordered = useMemo(
    () => notificationList(notifications, 'attention'),
    [notifications]
  );
  const badge = useMemo(() => attentionBadge(notifications), [notifications]);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-arcade border border-scale-blue-light/60 bg-void-deep/80 text-beige transition-colors hover:border-venom-orange hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
        aria-label={
          ordered.length > 0
            ? `Notifications, ${ordered.length} action${ordered.length === 1 ? '' : 's'} available`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {hasHydrated && (
          <NotificationBadge
            kind={badge.kind}
            count={badge.count}
            label={
              badge.kind === 'numeric'
                ? `${badge.count ?? 0} items need attention`
                : ordered.length === 1
                  ? '1 action needs attention'
                  : `${ordered.length} actions need attention`
            }
            animate={false}
            className="absolute -right-1 -top-1"
          />
        )}
      </button>

      {open && (
        <NotificationDialog
          notifications={ordered}
          token={session?.access_token}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
