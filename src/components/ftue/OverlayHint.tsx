'use client';

/**
 * OverlayHint - One-time dismissible FTUE hint banner
 *
 * Shows a hint message until dismissed; the dismissal is remembered in
 * localStorage per hint id, so each hint appears at most once.
 * Styled as a small glowing chip floating over the void.
 */

import { useEffect, useState } from 'react';
import { IconBolt, IconX } from '@/components/ui/icons';

export function hintStorageKey(id: string): string {
  return `hint-dismissed-${id}`;
}

interface OverlayHintProps {
  /** Stable hint id, e.g. "home-play-dna" */
  id: string;
  /** Hint text */
  message: string;
}

export function OverlayHint({ id, message }: OverlayHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(hintStorageKey(id))) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private mode) - skip the hint
    }
  }, [id]);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(hintStorageKey(id), '1');
    } catch {
      // Ignore storage failures; hide for this session anyway
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-24 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 panel-glow animate-fade-up max-w-md w-[calc(100%-2rem)]"
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
