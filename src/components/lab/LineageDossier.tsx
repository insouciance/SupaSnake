'use client';

/**
 * A server-backed snake passport. Retired specimens are immutable pedigree
 * chapters, never selectable inventory and never rendered as currently owned.
 */

import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconEgg } from '@/components/ui/icons';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';
import type {
  LineageDossier as LineageDossierContract,
  LineageSpecimen,
} from '@/shared/progression/career';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';

export type LineageDossierData = LineageDossierContract;

interface DossierResponse {
  dossiers?: LineageDossierData[];
}

interface LineageDossierProps {
  accessToken: string;
  variantId: string;
  specimenId: string;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function RunFacts({ runs }: { runs: LineageSpecimen['runs'] }) {
  if (runs.completed <= 0) {
    return <p className="font-body text-xs text-beige/55">Its first run is still ahead.</p>;
  }
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 font-body text-xs">
      <div>
        <dt className="text-beige/50">Runs / extractions</dt>
        <dd className="font-mono text-bone-white">{runs.completed} / {runs.extractions}</dd>
      </div>
      <div>
        <dt className="text-beige/50">Best Score</dt>
        <dd className="font-mono text-bone-white">{runs.bestScore.toLocaleString()}</dd>
      </div>
      <div>
        <dt className="text-beige/50">Best Yield</dt>
        <dd className="font-mono text-bone-white">{runs.bestYield.toLocaleString()}</dd>
      </div>
      <div>
        <dt className="text-beige/50">Highest commitment</dt>
        <dd className="font-mono text-bone-white">{runs.highestEnergy} Energy</dd>
      </div>
      {runs.clanDepthDelivered > 0 && (
        <div className="col-span-2">
          <dt className="text-beige/50">Clan Depth delivered</dt>
          <dd className="font-mono text-cosmic">{runs.clanDepthDelivered.toLocaleString()}</dd>
        </div>
      )}
    </dl>
  );
}

function LineageDossierEnabled({
  accessToken,
  variantId,
  specimenId,
}: LineageDossierProps) {
  const [dossiers, setDossiers] = useState<LineageDossierData[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/progression/lineage', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`lineage dossiers ${response.status}`);
        return (await response.json()) as DossierResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setDossiers(Array.isArray(data.dossiers) ? data.dossiers : []);
        setUnavailable(false);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const dossier = useMemo(
    () =>
      dossiers.find((entry) => entry.specimens.some((specimen) => specimen.id === specimenId)) ??
      dossiers.find((entry) => entry.variant.id === variantId) ??
      null,
    [dossiers, specimenId, variantId]
  );
  const specimens = useMemo(
    () =>
      [...(dossier?.specimens ?? [])].sort(
        (a, b) => b.generation - a.generation || b.acquiredAt.localeCompare(a.acquiredAt)
      ),
    [dossier?.specimens]
  );
  const current = specimens.find((specimen) => specimen.id === specimenId) ?? null;

  useEffect(() => {
    if (!current || typeof window === 'undefined') return;
    const id = `lineage-specimen-${current.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    if (window.location.hash !== `#${id}`) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current]);

  useRecognitionSeen('lineage', dossier !== null, accessToken, {
    artifactRefs: specimens.map((specimen) => specimen.id),
  });

  if (loading) {
    return (
      <div className="rounded-[16px] border border-scale-blue-light/25 bg-void-deep/55 p-3" data-testid="lineage-dossier-loading">
        <p className="font-body text-xs text-beige/55 animate-pulse">Opening lineage dossier…</p>
      </div>
    );
  }
  if (!dossier) {
    return unavailable ? (
      <p className="font-body text-xs text-beige/50" role="status">
        The lineage dossier is temporarily unavailable. The specimen remains secured.
      </p>
    ) : null;
  }

  return (
    <section
      id="lineage"
      className="rounded-[18px] border border-scale-blue-light/30 bg-void-deep/60 p-3"
      aria-labelledby="lineage-dossier-title"
      data-testid="lineage-dossier"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-arcade text-beige/55">Snake passport</p>
          <h3 id="lineage-dossier-title" className="font-display text-base text-bone-white">
            {dossier.variant.name} lineage
          </h3>
        </div>
        {dossier.highestActiveGeneration === null ? (
          <span className="rounded-full border border-scale-blue-light/25 bg-void/45 px-2 py-1 font-body text-xs text-beige/55">
            No active specimen
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-cosmic/35 bg-cosmic/10 px-2 py-1 font-mono text-xs text-cosmic">
            <IconEgg size={13} /> Gen {dossier.highestActiveGeneration}
          </span>
        )}
      </div>

      {current && (
        <div className="mt-3 rounded-[15px] border border-venom-orange/20 bg-void/45 p-3" data-testid="lineage-current-passport">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-body text-sm text-bone-white">Gen {current.generation} passport</p>
            {current.status === 'active' && current.owned ? (
              <span className="inline-flex items-center gap-1 font-body text-[10px] uppercase tracking-wide text-rarity-uncommon">
                <IconCheck size={11} /> Active
              </span>
            ) : (
              <span className="font-body text-[10px] uppercase tracking-wide text-beige/55">
                Retired · breeding receipt refunded
              </span>
            )}
            {current.equippable && (
              <span className="font-body text-[10px] uppercase tracking-wide text-cosmic">
                Highest active generation
              </span>
            )}
          </div>
          <RunFacts runs={current.runs} />
        </div>
      )}

      {specimens.length > 0 && (
        <details className="group mt-3 overflow-hidden rounded-[15px] border border-scale-blue-light/20 bg-void/30">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-body text-xs font-semibold text-beige/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber [&::-webkit-details-marker]:hidden">
            <span>Pedigree chapters</span>
            <span className="font-mono text-beige/50">{specimens.length}</span>
          </summary>
          <ol className="space-y-1.5 border-t border-scale-blue-light/15 p-2">
            {specimens.map((specimen) => {
              const retired = specimen.status === 'retired_refunded';
              return (
                <li
                  key={`${specimen.status}-${specimen.id}`}
                  id={`lineage-specimen-${specimen.id}`}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-scale-blue-light/15 bg-void/35 px-3 py-2"
                  data-specimen-status={specimen.status}
                  data-owned={specimen.owned ? 'true' : 'false'}
                  data-equippable={specimen.equippable ? 'true' : 'false'}
                >
                  <div>
                    <p className={`font-body text-xs ${retired ? 'text-beige/60' : 'text-bone-white'}`}>
                      Gen {specimen.generation} · {retired ? 'Retired by refund' : specimen.equippable ? 'Current' : 'Active pedigree'}
                    </p>
                    <p className="font-body text-[10px] text-beige/45">
                      {retired
                        ? `Retired ${shortDate(specimen.retiredAt)}`
                        : `Bred ${shortDate(specimen.acquiredAt)}`}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-beige/55">
                    {specimen.runs.extractions} extraction{specimen.runs.extractions === 1 ? '' : 's'}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}

export function LineageDossier(props: LineageDossierProps) {
  if (!CAREER_SPINE_V1_ENABLED) return null;
  return <LineageDossierEnabled {...props} />;
}

export default LineageDossier;
