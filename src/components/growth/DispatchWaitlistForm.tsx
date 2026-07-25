'use client';

/**
 * The Dispatch waitlist — one field (Constitution §11.6).
 *
 * Double opt-in: submitting asks for a confirmation email, nothing more.
 * The copy says so before the button is pressed, because a list you did not
 * knowingly join is the thing this product refuses to be.
 *
 * Rule 7: zero commercial content. No product, no price, no offer — a news
 * and settlement list, described as one.
 */

import { useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/posthog';
import { AnalyticsEvents, EventCategories } from '@/lib/analytics/events';
import { channelOf, readAttribution } from '@/lib/growth/attribution';

type FormState = 'idle' | 'sending' | 'sent' | 'error';

export function DispatchWaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'sending') return;

    setState('sending');
    setMessage(null);

    const attribution = readAttribution();
    try {
      const response = await fetch('/api/growth/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          channel: channelOf(attribution),
          landingPath: attribution?.landingPath ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        setState('error');
        setMessage(data?.error ?? 'Could not sign you up. Try again in a moment.');
        return;
      }

      setState('sent');
      setMessage(data?.message ?? 'Check your inbox for a confirmation link.');
      setEmail('');
      trackEvent(AnalyticsEvents.DISPATCH_WAITLIST_SUBMITTED, {
        channel: channelOf(attribution),
        category: EventCategories.GROWTH,
      });
    } catch {
      setState('error');
      setMessage('Could not reach the server. Try again in a moment.');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="dispatch-waitlist">
      <label
        htmlFor="dispatch-email"
        className="label-arcade block text-venom-orange"
      >
        The Dispatch
      </label>
      <p className="font-body text-sm text-beige">
        Occasional news and the results of the weekly hunt. We send a confirmation
        link first and nothing at all until you click it. Leave any time.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="dispatch-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={state === 'sending'}
          className="min-h-[44px] flex-1 rounded-arcade border border-scale-blue-light bg-void-deep/80 px-3 py-2 font-body text-bone-white placeholder:text-beige/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          data-testid="dispatch-waitlist-submit"
          className="btn-neutral min-h-[44px] px-6 py-2 disabled:cursor-wait disabled:opacity-60"
        >
          {state === 'sending' ? 'Sending…' : 'Join'}
        </button>
      </div>
      {message && (
        <p
          role="status"
          className={`font-body text-sm ${
            state === 'error' ? 'text-strike-red' : 'text-rarity-uncommon'
          }`}
        >
          {message}
        </p>
      )}
      <p className="font-body text-xs text-beige/70">
        Your address is used for the Dispatch and nothing else. See the{' '}
        <Link href="/legal/privacy" className="text-venom-orange hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
