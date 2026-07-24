'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  notificationList,
  useNotificationStore,
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

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const notifications = useNotificationStore((state) => state.notifications);
  const hasHydrated = useNotificationStore((state) => state.hasHydrated);
  const clear = useNotificationStore((state) => state.clear);
  const ordered = useMemo(() => notificationList(notifications), [notifications]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const badge = ordered.length > 0
    ? {
        kind: ordered.some((item) => item.badgeKind === 'numeric')
          ? ('numeric' as const)
          : ('exclamation' as const),
        count: ordered.reduce(
          (sum, item) => sum + (item.badgeKind === 'numeric' ? item.count ?? 0 : 0),
          0
        ),
      }
    : { kind: 'hidden' as const, count: 0 };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-arcade border border-scale-blue-light/60 bg-void-deep/80 text-beige transition-colors hover:border-venom-orange hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
        aria-label={ordered.length > 0 ? `Notifications, ${ordered.length} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {hasHydrated && (
          <NotificationBadge
            kind={badge.kind}
            count={badge.count}
            animate={false}
            className="absolute -right-1 -top-1"
          />
        )}
      </button>

      {open && (
        <section
          className="absolute right-0 z-[80] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-arcade border-2 border-scale-blue-light bg-void-deep shadow-2xl"
          role="dialog"
          aria-label="Notification center"
        >
          <header className="border-b border-scale-blue-light/40 px-4 py-3">
            <h2 className="font-display text-sm uppercase tracking-wider text-bone-white">
              Notifications
            </h2>
          </header>

          {ordered.length === 0 ? (
            <p className="px-4 py-6 text-center font-body text-sm text-beige/70">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-[min(60dvh,28rem)] overflow-y-auto">
              {ordered.map((notification) => (
                <li key={notification.id} className="border-b border-scale-blue-light/20 last:border-0">
                  {notification.href ? (
                    <Link
                      href={notification.href}
                      className="flex min-h-[64px] gap-3 px-4 py-3 text-left transition-colors hover:bg-scale-blue/20 focus:outline-none focus-visible:bg-scale-blue/30"
                      onClick={() => {
                        if (notification.clearOnOpen !== false) clear(notification.id);
                        setOpen(false);
                      }}
                    >
                      <NotificationBadge
                        kind={notification.badgeKind}
                        count={notification.count}
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
                  ) : (
                    <div className="flex min-h-[64px] gap-3 px-4 py-3">
                      <NotificationBadge
                        kind={notification.badgeKind}
                        count={notification.count}
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
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

