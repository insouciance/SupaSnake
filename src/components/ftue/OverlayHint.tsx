'use client';

/**
 * OverlayHint - Page-lifecycle dismissible FTUE hint banner
 *
 * Shows a hint message until dismissed. Hint state can imply what a player has
 * encountered, so it is deliberately memory-only rather than browser-persisted.
 * Styled as a small glowing chip floating over the void.
 */

import { useEffect, useState } from 'react';
import { IconBolt, IconX } from '@/components/ui/icons';

const dismissedHintsThisPage = new Set<string>();

export function isHintDismissed(id: string): boolean {
  return dismissedHintsThisPage.has(id);
}

export function dismissHint(id: string): void {
  dismissedHintsThisPage.add(id);
}

/** Atomically reserve a hint so sibling renderers cannot show it twice. */
export function claimHint(id: string): boolean {
  if (dismissedHintsThisPage.has(id)) return false;
  dismissedHintsThisPage.add(id);
  return true;
}

interface OverlayHintProps {
  /** Stable hint id, e.g. "home-play-dna" */
  id: string;
  /** Hint text */
  message: string;
  /**
   * Called when the player closes the hint.
   *
   * The memory-only `Set` above still keeps the banner from reappearing within
   * the page's lifetime, but it is a render guard, not a ledger: a hint whose
   * state is real player progress (WP-D's curriculum invitation) passes this
   * callback and records the close SERVER-side. Nothing here writes browser
   * storage, and nothing should.
   */
  onDismiss?: () => void;
}

export function OverlayHint({ id, message, onDismiss }: OverlayHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isHintDismissed(id));
  }, [id]);

  const handleDismiss = () => {
    dismissHint(id);
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 panel-glow animate-fade-up max-w-sm w-[calc(100%-2rem)]"
      style={{ '--glow': '#22d3ee' } as React.CSSProperties}
    >
      <IconBolt size={18} className="shrink-0 text-venom-orange" />
      <p className="text-bone-white font-body text-sm flex-1">{message}</p>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss hint"
        className="p-2 -m-1 text-beige/60 hover:text-bone-white transition-colors"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}

export default OverlayHint;
