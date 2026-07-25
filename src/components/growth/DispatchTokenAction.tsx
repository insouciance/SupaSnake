'use client';

/**
 * The human half of the double-opt-in round trip.
 *
 * The emailed link lands here and asks for a press. It is deliberately NOT a
 * GET that confirms on load: inbox scanners and link prefetchers follow GET
 * links, and a subscription a machine confirmed is not a subscription.
 * The unsubscribe side uses the same shape for symmetry — one press, one
 * outcome, no questions, no "are you sure", no retention plea (Rule 7).
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export type DispatchAction = 'confirm' | 'unsubscribe';

const ENDPOINTS: Record<DispatchAction, string> = {
  confirm: '/api/growth/dispatch/confirm',
  unsubscribe: '/api/growth/dispatch/unsubscribe',
};

const OUTCOME_COPY: Record<string, string> = {
  confirmed: 'You are on the Dispatch. That is all it takes.',
  'already-confirmed': 'This address was already confirmed. Nothing to do.',
  expired:
    'This confirmation link has expired. Ask for a new one from the SupaSnake home page.',
  invalid:
    'This link is not valid. It may have already been used, or been cut short by your mail client.',
  unsubscribed: 'You are off the list. We will not write again.',
  error: 'Something went wrong on our side. Try again in a moment.',
};

export function DispatchTokenAction({ action }: { action: DispatchAction }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!token || pending) return;
    setPending(true);
    try {
      const response = await fetch(ENDPOINTS[action], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as
        | { outcome?: string }
        | null;
      setOutcome(data?.outcome ?? 'error');
    } catch {
      setOutcome('error');
    } finally {
      setPending(false);
    }
  }, [action, pending, token]);

  const heading =
    action === 'confirm'
      ? 'Confirm your Dispatch subscription'
      : 'Leave the Dispatch';
  const cta = action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe';

  return (
    <div className="panel-glow [--glow:#22d3ee] mx-auto max-w-md space-y-5 p-8 text-center">
      <h1 className="heading-display text-2xl text-venom-orange">{heading}</h1>

      {!token ? (
        <p className="font-body text-beige" role="status">
          {OUTCOME_COPY.invalid}
        </p>
      ) : outcome ? (
        <p className="font-body text-beige" role="status" data-testid="dispatch-outcome">
          {OUTCOME_COPY[outcome] ?? OUTCOME_COPY.error}
        </p>
      ) : (
        <>
          <p className="font-body text-beige">
            {action === 'confirm'
              ? 'One press and the address is on the list. Nothing has been sent until now.'
              : 'One press and the address is removed. No questions.'}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            data-testid="dispatch-token-submit"
            className="btn-go min-h-[48px] px-8 py-3 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? 'Working…' : cta}
          </button>
        </>
      )}

      <Link
        href="/"
        className="block font-body text-sm text-beige hover:text-venom-orange"
      >
        Back to SupaSnake
      </Link>
    </div>
  );
}
