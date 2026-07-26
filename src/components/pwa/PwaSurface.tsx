'use client';

/**
 * The one PWA mount point (Constitution §11.4, Rule 1).
 *
 * Rendered once from the root layout, below the page, and responsible for
 * three things that all need to outlive a route change:
 *
 *   1. registering the service worker;
 *   2. keeping that worker told whether a run is live, so
 *      `notificationclick` never navigates a live run away (Rule 1);
 *   3. capturing `beforeinstallprompt` and, when — and only when — every gate
 *      in `installPrompt.ts` passes, rendering the install offer.
 *
 * ── WHY THE RUN STORE IS SUBSCRIBED TO OUTSIDE REACT ──────────────────────
 *
 * This component sits in the layout, above every page including `/game`. If
 * it selected run state through `useGameStore(...)` it would re-render on
 * every store write — and the store is written on every tick of a live run.
 * A layout-level component re-rendering at frame rate above an r3f canvas is
 * exactly the kind of quiet frame-cost Rule 1 exists to prevent.
 *
 * So it subscribes with zustand's imperative `subscribe`, writes the value
 * into a ref and into the service worker, and lifts it into React state ONLY
 * on the transition into or out of a run — a handful of times per session.
 *
 * ── THE RUN-COMPLETED SIGNAL ──────────────────────────────────────────────
 *
 * The install offer waits for evidence that the player plays, and the honest
 * evidence is a finished run. The same subscription watches for the
 * `isGameOver` edge and increments the local record. Nothing is rendered and
 * nothing is fetched at that moment; a run ending is not a moment to put a
 * card on the screen, and the offer will not appear until the player has
 * navigated to a calm surface anyway.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/store/gameStore';
import { PWA_V1_ENABLED } from '@/lib/pwa/config';
import { InstallOffer } from '@/components/pwa/InstallOffer';
import {
  canOfferInstall,
  isCalmSurface,
  readInstallRecord,
  recordDismissal,
  recordInstalled,
  recordOfferShown,
  recordRunCompleted,
  type RecordStorage,
} from '@/lib/pwa/installPrompt';

/** The slice of `BeforeInstallPromptEvent` this file uses. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function localStorageOrNull(): RecordStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function PwaSurface() {
  const pathname = usePathname() ?? '/';
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [runActive, setRunActive] = useState(false);
  const [visible, setVisible] = useState(false);

  const runActiveRef = useRef(false);
  const offersThisSession = useRef(0);

  // -------------------------------------------------------------------------
  // Service worker registration
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!PWA_V1_ENABLED) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(() => {
        if (cancelled) return;
        // Seed the worker with the current run state immediately; without a
        // message it defaults to "a run might be live" and never navigates.
        navigator.serviceWorker.controller?.postMessage({
          type: 'supasnake:run-state',
          runActive: runActiveRef.current,
        });
      })
      .catch(() => {
        /* An unavailable worker costs the player nothing. Stay silent. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Run state -> ref, worker, and (only on an edge) React
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!PWA_V1_ENABLED) return;

    const publish = (active: boolean) => {
      runActiveRef.current = active;
      setRunActive(active);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage({
          type: 'supasnake:run-state',
          runActive: active,
        });
      }
    };

    const activeNow = (state: {
      isPlaying: boolean;
      isGameOver: boolean;
      isDeathSequence: boolean;
    }) => state.isPlaying || state.isDeathSequence;

    publish(activeNow(useGameStore.getState()));

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      const active = activeNow(state);
      if (active !== runActiveRef.current) publish(active);

      // The rising edge of "run finished". `isGameOver` latches, so the edge
      // fires exactly once per run.
      if (state.isGameOver && !previous.isGameOver) {
        recordRunCompleted(localStorageOrNull());
      }
    });

    return unsubscribe;
  }, []);

  // -------------------------------------------------------------------------
  // beforeinstallprompt capture
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!PWA_V1_ENABLED) return;
    if (typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Deferring the browser's own banner is the whole point: the offer must
      // appear on our terms (a calm surface, after a run), not on a page load.
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      recordInstalled(localStorageOrNull());
      setPromptEvent(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Eligibility
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!PWA_V1_ENABLED) {
      setVisible(false);
      return;
    }

    const eligible = canOfferInstall({
      flagEnabled: PWA_V1_ENABLED,
      pathname,
      runActive,
      promptAvailable: promptEvent !== null,
      displayStandalone: isStandalone(),
      record: readInstallRecord(localStorageOrNull()),
      offersThisSession: offersThisSession.current,
    });

    if (!eligible) {
      // Leaving a calm surface, or starting a run, takes the card away
      // immediately rather than letting it ride along.
      if (visible && (runActive || !isCalmSurface(pathname))) setVisible(false);
      return;
    }

    offersThisSession.current += 1;
    recordOfferShown(localStorageOrNull());
    setVisible(true);
  }, [pathname, runActive, promptEvent, visible]);

  const dismiss = useCallback(() => {
    recordDismissal(localStorageOrNull());
    setVisible(false);
    setPromptEvent(null);
  }, []);

  const accept = useCallback(async () => {
    const event = promptEvent;
    setVisible(false);
    setPromptEvent(null);
    if (!event) return;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        recordInstalled(localStorageOrNull());
      } else {
        // Declining the browser's own dialog is a dismissal. It is not asked
        // again on the strength of "they only said no to the OS prompt".
        recordDismissal(localStorageOrNull());
      }
    } catch {
      recordDismissal(localStorageOrNull());
    }
  }, [promptEvent]);

  if (!PWA_V1_ENABLED || !visible) return null;

  return <InstallOffer onAccept={accept} onDismiss={dismiss} />;
}
