'use client';

/**
 * The Workbench's read of the account's curriculum state (WP-D).
 *
 * ANNOTATE, NEVER GATE. This hook adds truthful labels to an instrument that
 * stays completely free: every rule, cost, Strain route and Splice remains
 * readable and simulatable whether or not a Gene is offer-eligible today
 * (PEO boundary 2). If the fetch fails, the flag is off, or the account is
 * signed out, `state` is null and the Workbench renders exactly what it
 * rendered before this file existed.
 *
 * Nothing is cached in the browser: the projection is re-read per Dynasty and
 * per mount, because eligibility is server progress and boundary 9 puts it
 * nowhere else.
 */

import { useCallback, useEffect, useState } from 'react';
import { PLAYER_EVOLUTION_ENABLED } from '@/lib/features/playerEvolution';
import {
  type CurriculumGeneAnnotation,
} from '@/shared/game/curriculum';
import type { GenomeV2ActiveGeneId, GenomeV2Dynasty } from '@/shared/game/genes';

export interface CurriculumProjection {
  live: boolean;
  dynasty: GenomeV2Dynasty;
  bankedRuns: number;
  trialsOpen: boolean;
  trialGeneId: GenomeV2ActiveGeneId | null;
  candidates: GenomeV2ActiveGeneId[];
  genes: CurriculumGeneAnnotation[];
}

export interface CurriculumHandle {
  /** Null whenever there is nothing truthful to annotate. */
  state: CurriculumProjection | null;
  /** True while a choose/switch is in flight. */
  pending: boolean;
  /** Player-facing failure of the last choose/switch, if any. */
  error: string | null;
  chooseTrial: (geneId: GenomeV2ActiveGeneId) => void;
}

function parseProjection(body: unknown): CurriculumProjection | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (value.live !== true) return null;
  if (!Array.isArray(value.genes) || !Array.isArray(value.candidates)) return null;
  return value as unknown as CurriculumProjection;
}

export function useCurriculum(
  dynasty: GenomeV2Dynasty,
  token: string | undefined
): CurriculumHandle {
  const [state, setState] = useState<CurriculumProjection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PLAYER_EVOLUTION_ENABLED || !token) {
      setState(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/genome/curriculum?dynasty=${dynasty}`,
          {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!response.ok) throw new Error(`Curriculum read failed (${response.status})`);
        const parsed = parseProjection(await response.json());
        if (!cancelled) setState(parsed);
      } catch (caught) {
        // A failed annotation is a quiet absence, never an error state on a
        // free instrument: the player came here to read rules, not to be told
        // a labelling service is down.
        console.error('Curriculum read failed:', caught);
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dynasty, token]);

  const chooseTrial = useCallback(
    (geneId: GenomeV2ActiveGeneId) => {
      if (!PLAYER_EVOLUTION_ENABLED || !token) return;
      setPending(true);
      setError(null);
      void (async () => {
        try {
          const response = await fetch('/api/genome/curriculum', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ dynasty, geneId }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              typeof (body as { error?: unknown } | null)?.error === 'string'
                ? String((body as { error: string }).error)
                : 'That trial could not be set.'
            );
          }
          const parsed = parseProjection(body);
          if (parsed) setState(parsed);
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : 'That trial could not be set.'
          );
        } finally {
          setPending(false);
        }
      })();
    },
    [dynasty, token]
  );

  return { state, pending, error, chooseTrial };
}
