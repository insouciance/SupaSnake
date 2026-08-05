'use client';

/**
 * HandleClaimModal - the claim ceremony (Player Identity v1 section 3.3).
 * One input, live availability check (debounced against
 * GET /api/player/handle?check=), precise error copy per claim_handle's
 * codes, cooldown messaging with the next-change date. Surfaced at:
 * game-over after the first extraction (generated names only), the
 * account-upgrade success flow, and settings > Identity.
 *
 * A claim is never required - the close affordance is always live.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { HANDLE_REGEX } from '@/lib/identity/handle';
import { IconCheck, IconEdit, IconX } from '@/components/ui/icons';
import {
  FunnelStages,
  attachAttributionToPerson,
  trackFunnelStageOnce,
} from '@/lib/analytics/funnel';

export interface HandleClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the claimed handle after a successful claim. */
  onClaimed?: (handle: string) => void;
  /** Optional context line ("That run deserves a name on it."). */
  prompt?: string;
  /** Changing an existing handle (copy shifts from claim to change). */
  currentHandle?: string | null;
}

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable'; reason: string }
  | { state: 'offline' };

const REASON_COPY: Record<string, string> = {
  invalid_format: '3–16 characters: letters, numbers, underscore.',
  reserved: 'That name is reserved.',
  taken: 'Already taken.',
};

const CLAIM_ERROR_COPY: Record<string, string> = {
  invalid_format: '3–16 characters: letters, numbers, underscore.',
  reserved: 'That name is reserved — try another.',
  taken: 'Someone claimed that one first — try another.',
  cooldown: 'Handle changes wait 30 days.',
};

export function HandleClaimModal({
  isOpen,
  onClose,
  onClaimed,
  prompt,
  currentHandle = null,
}: HandleClaimModalProps): React.ReactElement | null {
  const { getToken } = useAuth();
  const [value, setValue] = useState('');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [nextChangeAt, setNextChangeAt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);

  const checkAvailability = useCallback(
    async (candidate: string) => {
      const seq = ++checkSeq.current;
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch(
          `/api/player/handle?check=${encodeURIComponent(candidate)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (seq !== checkSeq.current) return; // stale
        if (!response.ok) {
          setAvailability({ state: 'idle' });
          return;
        }
        const data = await response.json();
        if (seq !== checkSeq.current) return;
        if (data.live === false) {
          setAvailability({ state: 'offline' });
        } else if (data.available) {
          setAvailability({ state: 'available' });
        } else {
          setAvailability({
            state: 'unavailable',
            reason: String(data.reason ?? 'taken'),
          });
        }
      } catch {
        if (seq === checkSeq.current) setAvailability({ state: 'idle' });
      }
    },
    [getToken]
  );

  // Debounced live check as the player types
  useEffect(() => {
    if (!isOpen) return;
    setClaimError(null);
    setNextChangeAt(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value) {
      setAvailability({ state: 'idle' });
      return;
    }
    if (!HANDLE_REGEX.test(value)) {
      setAvailability({ state: 'unavailable', reason: 'invalid_format' });
      return;
    }
    setAvailability({ state: 'checking' });
    debounceRef.current = setTimeout(() => checkAvailability(value), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, isOpen, checkAvailability]);

  const handleSubmit = useCallback(async () => {
    if (submitting || !HANDLE_REGEX.test(value)) return;
    setSubmitting(true);
    setClaimError(null);
    setNextChangeAt(null);
    try {
      const token = await getToken();
      if (!token) {
        setClaimError('Sign in to claim a handle.');
        return;
      }
      const response = await fetch('/api/player/handle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ handle: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        // Identify (§11.5, §11.7): claiming the free handle is the lead
        // event — visitor becomes named. Once per browser, and never for a
        // later handle *change*, which is not a new identification.
        if (!currentHandle) {
          attachAttributionToPerson();
          trackFunnelStageOnce(FunnelStages.IDENTIFY, { method: 'handle_claim' });
        }
        onClaimed?.(String(data.handle ?? value));
        onClose();
        return;
      }
      if (response.status === 503) {
        setClaimError('Handles are not live yet — try again soon.');
        return;
      }
      if (response.status === 429) {
        setClaimError('Slow down a moment, then try again.');
        return;
      }
      const code = String(data.error ?? 'invalid_format');
      setClaimError(CLAIM_ERROR_COPY[code] ?? 'Claim failed — try again.');
      if (code === 'cooldown' && data.nextChangeAt) {
        setNextChangeAt(String(data.nextChangeAt));
      }
    } catch {
      setClaimError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  }, [value, submitting, getToken, onClaimed, onClose, currentHandle]);

  if (!isOpen) return null;

  const canSubmit =
    HANDLE_REGEX.test(value) &&
    availability.state !== 'unavailable' &&
    !submitting;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={currentHandle ? 'Change your handle' : 'Claim your handle'}
      data-testid="handle-claim-modal"
    >
      <div
        className="panel-glow modal-frame modal-tray-narrow [--glow:#22d3ee] p-6 space-y-4 animate-pop-in"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="heading-display text-xl text-bone-white flex items-center gap-2">
            <IconEdit size={20} className="text-venom-orange" />
            {currentHandle ? 'Change Handle' : 'Claim Your Handle'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            data-testid="handle-claim-close"
            className="-m-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-beige/60 transition-colors hover:bg-bone-white/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
          >
            <IconX size={20} />
          </button>
        </div>

        <p className="text-beige/70 font-body text-sm">
          {prompt ??
            (currentHandle
              ? `You are ${currentHandle}. Pick the next name other handlers will see.`
              : 'The name other handlers will see — on boards, in duels, on your card.')}
        </p>

        <div className="space-y-1.5">
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) handleSubmit();
            }}
            maxLength={16}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="e.g. Souci"
            data-testid="handle-claim-input"
            className="w-full px-3 py-2.5 rounded-arcade bg-void/70 border border-scale-blue-light/60 focus:border-venom-orange/70 outline-none font-body text-bone-white placeholder:text-beige/30"
          />
          <p className="text-xs font-body min-h-[1.1rem]" data-testid="handle-claim-status">
            {availability.state === 'checking' && (
              <span className="text-beige/50">Checking…</span>
            )}
            {availability.state === 'available' && (
              <span className="text-rarity-uncommon inline-flex items-center gap-1">
                <IconCheck size={12} /> Available
              </span>
            )}
            {availability.state === 'unavailable' && (
              <span className="text-strike-red">
                {REASON_COPY[availability.reason] ?? 'Unavailable.'}
              </span>
            )}
            {availability.state === 'offline' && (
              <span className="text-beige/50">
                Handles are not live yet — try again soon.
              </span>
            )}
            {availability.state === 'idle' && !value && (
              <span className="text-beige/40">
                3–16 characters: letters, numbers, underscore.
              </span>
            )}
          </p>
        </div>

        {claimError && (
          <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade px-3 py-2">
            <p className="text-strike-red font-body text-sm" data-testid="handle-claim-error">
              {claimError}
              {nextChangeAt && (
                <span className="block text-beige/70 mt-0.5">
                  Next change: {new Date(nextChangeAt).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="btn-neutral px-5 py-2.5 min-h-[44px]"
            data-testid="handle-claim-later"
          >
            Later
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="handle-claim-submit"
            className={`btn-go px-6 py-2.5 min-h-[44px] ${
              canSubmit ? '' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Claiming…' : currentHandle ? 'Change' : 'Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HandleClaimModal;
