'use client';

/**
 * Own Chronicle /profile (Player Identity v1 section 7): the career
 * surface - same durable career as the public /p/[handle], plus a private
 * server-backed Career Pulse. Records refresh during authoritative
 * settlement; the Chronicle does not expose infrastructure maintenance.
 *
 * WP-0.04: the Early Career collapsible and its achievements panel are
 * gone. The achievement mechanism was retired into the Legacy Records
 * (migration 042), so the Records cabinet below IS the career surface -
 * there is no second progression display to keep in step with it.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { NavBar } from '@/components/ui/NavBar';
import { ChronicleView } from '@/components/chronicle/ChronicleView';
import { CareerPulse } from '@/components/chronicle/CareerPulse';
import {
  ArchetypeSection,
  DigestCard,
  RecallCard,
  type AnalystArtifact,
} from '@/components/chronicle/AnalystSections';
import { IconMedal } from '@/components/ui/icons';
import type { ChroniclePayload } from '@/lib/chronicle/types';

interface AnalystState {
  digest: AnalystArtifact | null;
  digestWeekStart: string | null;
  archetype: AnalystArtifact | null;
  recall: AnalystArtifact | null;
  seasonSeq: number | null;
  seasonName: string | null;
}

export default function ProfilePage() {
  const { user, getToken } = useAuth();
  const [payload, setPayload] = useState<ChroniclePayload | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyst, setAnalyst] = useState<AnalystState | null>(null);

  // Analyst artifacts (Identity v1 I4): every failure renders nothing —
  // the Chronicle never waits on, or breaks over, the Analyst.
  const loadAnalyst = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const state: AnalystState = {
        digest: null,
        digestWeekStart: null,
        archetype: null,
        recall: null,
        seasonSeq: null,
        seasonName: null,
      };

      const digestRes = await fetch('/api/analyst/digest', { headers });
      if (digestRes.ok) {
        const data = await digestRes.json();
        if (data?.digest?.headline) {
          state.digest = data.digest;
          state.digestWeekStart = data.weekStart ?? null;
        }
      }

      let recallRes = await fetch('/api/analyst/recall', { headers });
      if (recallRes.ok) {
        let data = await recallRes.json();
        // No cached Recall yet: ask for a generation once (cache-first,
        // rate-limited server-side; a 429 just leaves the card absent)
        if (data?.live && !data.recall) {
          recallRes = await fetch('/api/analyst/recall', {
            method: 'POST',
            headers,
          });
          if (recallRes.ok) data = await recallRes.json();
        }
        if (data?.recall?.headline) state.recall = data.recall;
        if (data?.archetype?.headline) state.archetype = data.archetype;
        if (data?.season) {
          state.seasonSeq = data.season.seq ?? null;
          state.seasonName = data.season.name ?? null;
        }
      }

      setAnalyst(state);
    } catch {
      // Graceful absence — no Analyst cards.
    }
  }, [getToken]);

  const loadChronicle = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      setAccessToken(token);
      const response = await fetch('/api/chronicle', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setError('Could not load your chronicle');
        return;
      }
      const data = (await response.json()) as ChroniclePayload;
      setPayload(data);
      setError(null);
    } catch {
      setError('Could not load your chronicle');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (user) {
      void loadChronicle();
      void loadAnalyst();
    } else {
      setLoading(false);
    }
  }, [user, loadChronicle, loadAnalyst]);

  if (!user) {
    return (
      <div className="app-bg text-bone-white">
        <NavBar />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="panel-elevated p-8 text-center space-y-6 w-full max-w-sm animate-pop-in">
            <h1 className="heading-display text-2xl text-venom-orange text-glow-orange">
              Please Sign In
            </h1>
            <p className="text-beige font-body">
              Sign in to read your chronicle
            </p>
            <Link href="/login" className="btn-go inline-block px-8 py-3 min-h-[44px]">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg text-bone-white">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-28 sm:pb-12 sm:pr-16">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 animate-fade-up">
          <div>
            <h1 className="heading-display text-4xl text-venom-orange text-glow-orange flex items-center gap-3">
              <IconMedal size={34} />
              The Chronicle
            </h1>
            <p className="text-beige font-body mt-1">
              Your career, on the record
            </p>
          </div>
          {payload?.identity.handle && (
            <Link
              href={`/p/${payload.identity.handle}`}
              className="btn-neutral px-4 py-2.5 min-h-[44px] inline-flex items-center font-body text-sm"
              data-testid="public-profile-link"
            >
              Public view
            </Link>
          )}
        </div>

        {loading ? (
          <p className="font-body text-beige/60 animate-pulse">
            Opening the chronicle…
          </p>
        ) : error ? (
          <p className="font-body text-strike-red">{error}</p>
        ) : payload ? (
          <ChronicleView
            payload={payload}
            isSelf
            careerPulseSlot={
              accessToken ? <CareerPulse accessToken={accessToken} /> : undefined
            }
            archetypeSlot={
              analyst?.archetype && analyst.seasonSeq !== null ? (
                <ArchetypeSection
                  artifact={analyst.archetype}
                  seasonSeq={analyst.seasonSeq}
                />
              ) : undefined
            }
            digestSlot={
              analyst?.digest && analyst.digestWeekStart ? (
                <DigestCard
                  artifact={analyst.digest}
                  weekStart={analyst.digestWeekStart}
                />
              ) : undefined
            }
            recallSlot={
              analyst?.recall && analyst.seasonSeq !== null ? (
                <RecallCard
                  artifact={analyst.recall}
                  identity={payload.identity}
                  seasonSeq={analyst.seasonSeq}
                  seasonName={analyst.seasonName}
                  shareUrl={
                    payload.identity.handle
                      ? `/p/${payload.identity.handle}`
                      : null
                  }
                />
              ) : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}
