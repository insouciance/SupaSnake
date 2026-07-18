'use client';

/**
 * RunInsightCard (Identity v1 §9.2) — the post-run Analyst card on the
 * game-over screen. Lazy-loads POST /api/analyst/insight after the run
 * ends and NEVER blocks or breaks the game-over flow: pre-025, disabled,
 * rate-limited, guest without a token — every non-success renders
 * nothing (or a brief shimmer while loading).
 */

import { useEffect, useState } from 'react';

interface InsightContent {
  headline: string;
  body: string;
  tips: string[];
}

interface RunInsightCardProps {
  sessionId: string | null;
  accessToken: string | null | undefined;
}

export function RunInsightCard({ sessionId, accessToken }: RunInsightCardProps) {
  const [insight, setInsight] = useState<InsightContent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !accessToken) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setLoading(true);
    setInsight(null);

    // The game-over results POST and this fetch race; a 409 ("session
    // not ended yet") retries briefly, everything else renders nothing.
    const attempt = (retriesLeft: number) => {
      fetch('/api/analyst/insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId }),
      })
        .then(async (res) => {
          if (res.status === 409 && retriesLeft > 0 && !cancelled) {
            timers.push(setTimeout(() => attempt(retriesLeft - 1), 1500));
            return undefined;
          }
          if (!res.ok) return null; // 503 pre-025 / 429 / anything: no card
          const data = await res.json();
          return data?.insight ?? null;
        })
        .then((content) => {
          if (cancelled || content === undefined) return;
          setLoading(false);
          if (
            content &&
            typeof content.headline === 'string' &&
            typeof content.body === 'string'
          ) {
            setInsight({
              headline: content.headline,
              body: content.body,
              tips: Array.isArray(content.tips)
                ? content.tips.filter((t: unknown) => typeof t === 'string')
                : [],
            });
          }
        })
        .catch(() => {
          /* graceful absence — the Analyst never breaks game-over */
          if (!cancelled) setLoading(false);
        });
    };
    attempt(2);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [sessionId, accessToken]);

  if (loading) {
    return (
      <div
        className="panel p-4 text-left animate-pop-in"
        data-testid="run-insight-loading"
      >
        <p className="label-arcade">The Analyst</p>
        <div className="mt-2 h-3 w-2/3 rounded bg-scale-blue/40 shimmer-overlay" />
        <div className="mt-2 h-3 w-full rounded bg-scale-blue/30 shimmer-overlay" />
      </div>
    );
  }

  if (!insight) return null;

  return (
    <div
      className="panel-glow [--glow:#22d3ee] p-4 text-left animate-pop-in"
      data-testid="run-insight-card"
    >
      <p className="label-arcade">The Analyst</p>
      <p className="heading-display text-lg text-bone-white mt-1">
        {insight.headline}
      </p>
      <p className="font-body text-sm text-beige mt-2">{insight.body}</p>
      {insight.tips.length > 0 && (
        <ul className="mt-3 space-y-1">
          {insight.tips.map((tip, i) => (
            <li key={i} className="font-body text-sm text-cyber/90">
              ▸ {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RunInsightCard;
