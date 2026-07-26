'use client';

/**
 * The notification opt-in panel — the ONLY place a push subscription can be
 * created (Constitution Rule 1, Rule 5, §12.4).
 *
 * Mounted on `/settings` and nowhere else. Every gate is in
 * `src/lib/pwa/pushOptIn.ts`; this file is the wiring and the markup.
 *
 * The shape of the interaction is deliberately unglamorous: two independent
 * switches, both off, no pre-tick, no "recommended", no explanation of what
 * the player is missing. Turning the last one off PATCHes an empty trigger
 * list, and "Turn off" unsubscribes the browser AND revokes the row, so a
 * player who wants out does not have to find two different controls.
 *
 * Rule 11 on the client half: every response status is checked. A 503 (the
 * migration is not applied) rolls the switch back and says so, rather than
 * leaving a UI that claims a subscription exists when none was stored.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGameStore } from '@/lib/store/gameStore';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import {
  PUSH_OPT_IN_COPY,
  PUSH_OPT_IN_SURFACE,
  applicationServerKey,
  canRequestPermission,
  consentedTriggers,
} from '@/lib/pwa/pushOptIn';
import { PUSH_TRIGGERS, PUSH_TRIGGER_IDS, type PushTriggerId } from '@/lib/push/triggers';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function PushOptInPanel() {
  const { session, isAnonymous } = useAuth();
  const [selected, setSelected] = useState<Set<PushTriggerId>>(new Set());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'unsupported'
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(currentPermission());
  }, []);

  const token = session?.access_token;

  const persist = useCallback(
    async (triggers: PushTriggerId[]) => {
      if (!token) return false;

      // Rule 1: read the live store at the moment of the act, not at render.
      const { isPlaying, isDeathSequence } = useGameStore.getState();
      if (
        !canRequestPermission({
          flagEnabled: PWA_V1_ENABLED,
          supported: pushSupported(),
          pathname: PUSH_OPT_IN_SURFACE,
          runActive: isPlaying || isDeathSequence,
          permission: currentPermission(),
        })
      ) {
        return false;
      }

      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const response = await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          triggers,
        }),
      });

      if (!response.ok) {
        setError(PUSH_OPT_IN_COPY.saveError);
        return false;
      }
      setEndpoint(json.endpoint ?? null);
      return true;
    },
    [token]
  );

  const updateTriggers = useCallback(
    async (triggers: PushTriggerId[]) => {
      if (!token || !endpoint) return false;
      const response = await fetch('/api/push/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint, triggers }),
      });
      if (!response.ok) {
        setError(PUSH_OPT_IN_COPY.saveError);
        return false;
      }
      return true;
    },
    [token, endpoint]
  );

  const toggle = useCallback(
    async (id: PushTriggerId) => {
      if (busy) return;
      setBusy(true);
      setError(null);

      const previous = new Set(selected);
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);

      const triggers = consentedTriggers(next);
      const ok = endpoint ? await updateTriggers(triggers) : await persist(triggers);
      if (!ok) setSelected(previous);
      setBusy(false);
    },
    [busy, selected, endpoint, persist, updateTriggers]
  );

  const turnOff = useCallback(async () => {
    if (!token || !endpoint || busy) return;
    setBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      /* The row is revoked below regardless; a stale browser subscription
         cannot receive anything once the server refuses to send to it. */
    }

    const response = await fetch(
      `/api/push/subscription?endpoint=${encodeURIComponent(endpoint)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) setError(PUSH_OPT_IN_COPY.saveError);
    else {
      setSelected(new Set());
      setEndpoint(null);
    }
    setBusy(false);
  }, [token, endpoint, busy]);

  if (!PWA_V1_ENABLED) return null;

  if (isAnonymous) {
    return (
      <div className="panel-elevated p-6" data-testid="push-opt-in">
        <h2 className="heading-display text-xl text-bone-white mb-1">
          {PUSH_OPT_IN_COPY.title}
        </h2>
        <p className="text-beige text-sm font-body">
          {PUSH_OPT_IN_COPY.intro} Create an account to choose them.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-elevated p-6" data-testid="push-opt-in">
      <h2 className="heading-display text-xl text-bone-white mb-1">{PUSH_OPT_IN_COPY.title}</h2>
      <p className="text-beige text-sm font-body">{PUSH_OPT_IN_COPY.intro}</p>
      <p className="text-beige text-sm font-body mt-1">{PUSH_OPT_IN_COPY.ceiling}</p>

      {permission === 'unsupported' && (
        <p className="text-beige text-sm font-body mt-4">{PUSH_OPT_IN_COPY.unsupported}</p>
      )}
      {permission === 'denied' && (
        <p className="text-beige text-sm font-body mt-4">{PUSH_OPT_IN_COPY.blocked}</p>
      )}

      {permission !== 'unsupported' && permission !== 'denied' && (
        <ul className="mt-4 space-y-3">
          {PUSH_TRIGGER_IDS.map((id) => {
            const definition = PUSH_TRIGGERS[id];
            const on = selected.has(id);
            return (
              <li key={id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-bone-white text-sm font-body">{definition.consentLabel}</p>
                  <p className="text-beige text-xs font-body">
                    {definition.consentDescription}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={definition.consentLabel}
                  disabled={busy}
                  onClick={() => void toggle(id)}
                  className={`shrink-0 rounded-arcade border px-3 py-1 text-xs ${
                    on
                      ? 'border-venom-orange text-venom-orange'
                      : 'border-scale-blue-light text-beige'
                  }`}
                >
                  {on ? PUSH_OPT_IN_COPY.disable : PUSH_OPT_IN_COPY.enable}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {endpoint && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void turnOff()}
          className="mt-4 rounded-arcade border border-scale-blue-light px-3 py-1 text-xs text-bone-white"
        >
          {PUSH_OPT_IN_COPY.disable}
        </button>
      )}

      {error && <p className="text-strike-red text-sm font-body mt-3">{error}</p>}
    </div>
  );
}
