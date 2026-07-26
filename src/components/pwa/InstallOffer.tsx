'use client';

/**
 * The install offer card (Constitution §11.4, Rule 5).
 *
 * Presentation only — every decision about whether this may appear was made
 * by `canOfferInstall`, and every word it says comes from `INSTALL_COPY` so
 * the Rule 5 and Rule 7 sweeps in `installPrompt.test.ts` read exactly what a
 * player reads.
 *
 * Deliberately a corner card and not a modal: it does not cover the page, it
 * does not trap focus, it takes no scroll lock, and both buttons are the same
 * visual weight — "Not now" is not a grey whisper next to a glowing "Add it".
 * A dismissal is permanent, so the dismiss control is a first-class one.
 *
 * `aria-live="polite"` rather than `assertive`: this is worth mentioning and
 * never worth interrupting.
 */

import { INSTALL_COPY } from '@/lib/pwa/installPrompt';

interface InstallOfferProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export function InstallOffer({ onAccept, onDismiss }: InstallOfferProps) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={INSTALL_COPY.title}
      data-testid="pwa-install-offer"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-arcade border border-scale-blue-light/60 bg-void/95 p-4 shadow-lg backdrop-blur sm:left-auto sm:right-4"
    >
      <h2 className="heading-display text-base text-bone-white">{INSTALL_COPY.title}</h2>
      <p className="mt-2 text-sm text-beige">{INSTALL_COPY.body}</p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="flex-1 rounded-arcade border border-venom-orange/60 px-3 py-2 text-sm text-venom-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
        >
          {INSTALL_COPY.accept}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 rounded-arcade border border-scale-blue-light/60 px-3 py-2 text-sm text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-bone-white"
        >
          {INSTALL_COPY.dismiss}
        </button>
      </div>
    </div>
  );
}
