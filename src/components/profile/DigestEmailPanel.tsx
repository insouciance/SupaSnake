'use client';

/**
 * DigestEmailPanel (Identity v1 §9.2) — settings toggle for the weekly
 * Analyst digest email. Strictly opt-in; registered accounts only (a
 * guest has no email to send to). PATCHes /api/player with optimistic
 * rollback, mirroring AimSystemPanel.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';

export function DigestEmailPanel() {
  const { session, isAnonymous } = useAuth();
  const [optedIn, setOptedIn] = useState(false);
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;

    fetch('/api/player', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setOptedIn(data.emailDigestOptIn === true);
      })
      .catch((err) => console.error('Failed to load digest opt-in:', err));

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleToggle = useCallback(async () => {
    const previous = optedIn;
    const next = !optedIn;
    setOptedIn(next); // optimistic
    setError(null);
    try {
      const response = await fetch('/api/player', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email_digest_opt_in: next }),
      });
      if (response.status === 503) {
        setLive(false);
        setOptedIn(previous);
        return;
      }
      if (!response.ok) {
        throw new Error(`Digest opt-in PATCH rejected (${response.status})`);
      }
    } catch (err) {
      console.error('Failed to save digest opt-in, rolling back:', err);
      setOptedIn(previous);
      setError('Could not save your preference. Please try again.');
    }
  }, [optedIn, session?.access_token]);

  if (isAnonymous) {
    return (
      <div className="panel-elevated p-6 animate-fade-up">
        <h2 className="heading-display text-xl text-bone-white mb-1">
          Weekly Digest Email
        </h2>
        <p className="text-beige text-sm font-body">
          The Analyst can mail you a weekly recap of your runs. Create an
          account to switch it on.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-elevated p-6 animate-fade-up">
      <h2 className="heading-display text-xl text-bone-white mb-1">
        Weekly Digest Email
      </h2>
      <p className="text-beige text-sm font-body mb-4">
        Every Monday, The Analyst can send your week in the Lab — runs,
        extractions, records — to your account email.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={optedIn}
        onClick={handleToggle}
        disabled={!live}
        className={`btn-arcade text-sm px-5 py-2 ${optedIn ? 'btn-go' : 'btn-neutral'}`}
        data-testid="digest-email-toggle"
      >
        {optedIn ? 'Digest email: ON' : 'Digest email: OFF'}
      </button>
      {!live && (
        <p className="text-beige/60 text-sm font-body mt-3">
          The digest email opens with the next update.
        </p>
      )}
      {error && (
        <p className="text-strike-red text-sm font-body mt-3">{error}</p>
      )}
      <p className="text-beige/50 text-xs font-body mt-4">
        Privacy: one email a week, only when you played; your address is
        never shared and never used for anything else. Turn it off here
        any time.
      </p>
    </div>
  );
}

export default DigestEmailPanel;
