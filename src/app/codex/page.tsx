'use client';

/**
 * `/codex` is retained as a compatibility URL, but players now enter one
 * Genome Research instrument: the Workbench. The former rules/archive tab was
 * a second destination containing the same genes, Strains, and Splices in a
 * less useful format. Personal discovery, Genome Weaver, world-first/history,
 * notification anchors, and the read-only v1 archive remain intact below the
 * instrument as one optional Research Record.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { WorkbenchView } from '@/components/workbench/WorkbenchView';
import { LegacyGenomeArchive } from '@/components/game/genome/LegacyGenomeArchive';
import { GENOME_V2_ENABLED } from '@/lib/features/genomeV2';
import { useCodexStore } from '@/lib/stores/codexStore';
import { NavBar } from '@/components/ui/NavBar';
import { useRecognitionSeen } from '@/components/ui/useRecognitionSeen';
import { StrainChip } from '@/components/traits/StrainChip';
import { IconDna, IconFlask } from '@/components/ui/icons';
import {
  GENES,
  GENOME_V2_GENES,
  isGeneId,
  isGenomeV2ActiveGeneId,
} from '@/shared/game/genes';

function catalogGeneName(id: string, rulesVersion?: 1 | 2): string {
  if (rulesVersion === 2 && isGenomeV2ActiveGeneId(id)) {
    return GENOME_V2_GENES[id].name;
  }
  return isGeneId(id) ? GENES[id].name : id;
}

function ResearchShell({ studyRef = null }: { studyRef?: string | null }) {
  const { session, isAuthenticated } = useAuth();
  const [recordOpen, setRecordOpen] = useState(false);
  const {
    ownerId: codexOwnerId,
    live: storedLive,
    unlocked: storedUnlocked,
    bankedRuns: storedBankedRuns,
    unlockAt: storedUnlockAt,
    data: storedData,
    isLoading: storedIsLoading,
    error: storedError,
    fetchCodex,
    reset: resetCodex,
  } = useCodexStore();
  const accessToken = session?.access_token;
  const authOwnerId = typeof session?.user?.id === 'string' && session.user.id.length > 0
    ? session.user.id
    : null;
  const hasAuthenticatedOwner = isAuthenticated && Boolean(authOwnerId && accessToken);
  const ownsCodexState = Boolean(authOwnerId && codexOwnerId === authOwnerId);
  const live = ownsCodexState ? storedLive : false;
  const unlocked = ownsCodexState ? storedUnlocked : false;
  const bankedRuns = ownsCodexState ? storedBankedRuns : 0;
  const unlockAt = ownsCodexState ? storedUnlockAt : 0;
  const data = ownsCodexState ? storedData : null;
  const isLoading = hasAuthenticatedOwner
    ? (!ownsCodexState || storedIsLoading)
    : false;
  const error = ownsCodexState ? storedError : null;

  useEffect(() => {
    if (!isAuthenticated || !accessToken || !authOwnerId) {
      resetCodex();
      return;
    }
    void fetchCodex(authOwnerId, accessToken);
  }, [accessToken, authOwnerId, fetchCodex, isAuthenticated, resetCodex]);

  const renderedDiscoveryArtifacts = useMemo(() => {
    if (!data) return [];
    const refs: string[] = [];
    for (const gene of data.genes) {
      if (gene.discovered) refs.push(`gene:${gene.id}`);
    }
    for (const splice of data.splices) {
      if (splice.discovered) refs.push(`splice:${splice.id}`);
    }
    for (const strain of data.strains) {
      if (strain.expression.discovered) refs.push(`expression:${strain.strain}`);
      if (strain.apex.discovered) refs.push(`apex:${strain.strain}`);
    }
    if (data.progress.genomeWeaverUnlocked) refs.push('genome_weaver');
    return refs;
  }, [data]);

  useRecognitionSeen(
    'codex',
    recordOpen && hasAuthenticatedOwner && !isLoading && data !== null,
    accessToken,
    { artifactRefs: renderedDiscoveryArtifacts }
  );

  // Existing notification and share links use `#codex-*`. They now open the
  // subordinate Research Record before scrolling, so compatibility never
  // recreates the discarded Archive destination.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.slice(1).startsWith('codex-')) {
      setRecordOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!recordOpen || !data || typeof window === 'undefined') return;
    const id = window.location.hash.slice(1);
    if (!id.startsWith('codex-')) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data, recordOpen]);

  return (
    <div className="app-bg min-h-screen px-4 pb-28 pt-8 text-bone-white sm:px-6 sm:pb-8 sm:pr-16">
      <NavBar />
      <main className="mx-auto w-full max-w-6xl" data-testid="codex-page">
        <header className="mb-8 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl text-venom-orange text-glow-orange">
                Genome Research
              </h1>
              <p className="font-body text-beige">
                Touch a possible Genome. Follow what it awakens. Rewind and try another path.
              </p>
            </div>
            <Link href="/lab" className="btn-secondary inline-flex items-center gap-2 px-4 py-2">
              <IconFlask size={16} /> Back to Lab
            </Link>
          </div>
        </header>

        <WorkbenchView studyRef={studyRef} />

        <details
          className="panel-elevated mt-8 overflow-hidden"
          open={recordOpen}
          onToggle={(event) => setRecordOpen(event.currentTarget.open)}
          data-testid="research-record"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic">
            <span>
              <strong className="block font-display text-lg text-bone-white">Your Research Record</strong>
              <small className="font-body text-xs text-beige/55">
                Discoveries, Genome Weaver progress, and earlier Genome history
              </small>
            </span>
            <span aria-hidden="true" className="font-mono text-lg text-cosmic">{recordOpen ? '−' : '+'}</span>
          </summary>

          <div className="space-y-10 border-t border-cosmic/20 px-4 py-6 sm:px-5">
            {!hasAuthenticatedOwner ? (
              <section className="panel p-6 text-center" data-testid="codex-signed-out">
                <p className="mb-4 font-body text-beige">
                  The Workbench is open to everyone. Sign in to connect discoveries,
                  world-first history, and Genome Weaver progress to your account.
                </p>
                <Link href="/login" className="btn-go inline-block px-7 py-3">
                  Sign In
                </Link>
              </section>
            ) : isLoading ? (
              <div className="panel p-8 text-center text-beige/60">Reading your Genome history…</div>
            ) : error ? (
              <div className="rounded-arcade border border-strike-red/70 bg-strike-red/15 p-4">
                {error}
              </div>
            ) : !live ? (
              <div className="panel p-8 text-center text-beige/70">
                The discovery record is not live on this server yet.
              </div>
            ) : !data ? (
              <div className="panel p-8 text-center text-beige/70">
                The discovery record is unavailable right now.
              </div>
            ) : (
              <div className="space-y-10 animate-fade-up" data-testid="research-record-content">
                {!unlocked && (
                  <p
                    className="panel p-4 text-center font-body text-sm text-beige/70"
                    data-testid="codex-discovery-pending"
                  >
                    Personal discovery history begins at {unlockAt} banked runs.
                    You have banked {bankedRuns}. Every rule and experiment above is already open.
                  </p>
                )}

                <section id="codex-genome-weaver" className="panel p-5" aria-label="Genome Weaver progress">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-display text-xl text-bone-white">Genome Weaver</p>
                      <p className="text-sm text-beige/60">
                        {data.progress.discovered} / {data.progress.total} discoveries
                      </p>
                    </div>
                    <span className="font-mono text-2xl text-venom-orange">
                      {data.progress.percent}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border border-scale-blue-light/40 bg-void-deep">
                    <div
                      className="h-full bg-gradient-to-r from-feral via-cyber to-venom-orange transition-all"
                      style={{ width: `${data.progress.percent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-beige/55">
                    Complete the record to unlock the legendary Genome Weaver board skin.
                    {data.progress.genomeWeaverUnlocked ? ' Unlocked.' : ''}
                  </p>
                </section>

                <section>
                  <h3 className="heading-display mb-4 text-xl">Strain milestones</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {data.strains.map((entry) => (
                      <article
                        key={entry.strain}
                        id={`codex-strain-${entry.strain}`}
                        className="panel p-4"
                      >
                        <StrainChip strain={entry.strain} size="md" showGlyph />
                        <div className="mt-4 space-y-3 text-sm">
                          {(['expression', 'apex'] as const).map((tier) => {
                            const milestone = entry[tier];
                            return (
                              <div
                                key={tier}
                                id={`codex-${tier}-${entry.strain}`}
                                className={milestone.discovered ? '' : 'opacity-45'}
                              >
                                <div className="flex justify-between gap-2">
                                  <span className="font-display capitalize">{tier}</span>
                                  <span className="inline-flex items-center gap-1 font-mono text-cyber">
                                    <IconDna size={12} /> {milestone.rewardDna}
                                  </span>
                                </div>
                                <p className="text-xs text-beige/60">
                                  {milestone.discovered ? 'Discovered' : 'Undiscovered'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h3 className="heading-display text-xl">Splice history</h3>
                    <p className="text-xs text-beige/50">First discovery awards 250 DNA</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.splices.map((splice) => (
                      <article
                        key={splice.id}
                        id={`codex-splice-${splice.id}`}
                        className={`panel p-5 ${splice.discovered ? '' : 'opacity-70'}`}
                        data-testid={`codex-splice-${splice.id}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="font-display text-lg text-bone-white">{splice.name}</h4>
                          <div className="flex gap-1">
                            {splice.strains.map((strain) => (
                              <StrainChip key={strain} strain={strain} showGlyph />
                            ))}
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-body text-cosmic/80" data-testid={`codex-recipe-${splice.id}`}>
                          {splice.parents
                            ? `Recipe: ${catalogGeneName(splice.parents[0], splice.rulesVersion)} + ${catalogGeneName(splice.parents[1], splice.rulesVersion)}`
                            : 'Recipe undiscovered'}
                        </p>
                        <p className="mt-3 text-xs font-mono text-beige/50">
                          {splice.discoveries} runs · {splice.banks} banked
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h3 className="heading-display text-xl">Gene history</h3>
                    <p className="text-xs text-beige/50">Latest {data.sampleSize} Genome runs</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.genes.map((gene) => (
                      <article
                        key={gene.id}
                        id={`codex-gene-${gene.id}`}
                        className={`panel p-4 ${gene.discovered ? '' : 'opacity-70'}`}
                        data-testid={`codex-gene-${gene.id}`}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <h4 className="font-display text-bone-white">{gene.name}</h4>
                          <div className="flex gap-1">
                            {gene.strains.map((strain) => (
                              <StrainChip key={strain} strain={strain} showGlyph />
                            ))}
                          </div>
                        </div>
                        <p className="mt-3 text-xs font-mono text-beige/50">
                          {gene.discovered ? 'Discovered' : 'Not yet discovered'} · {gene.picks} picks · {gene.banks} banked
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                {data.legacyArchive ? (
                  <LegacyGenomeArchive archive={data.legacyArchive} />
                ) : null}
              </div>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}

function ResearchWithParams() {
  const searchParams = useSearchParams();
  // Both the historical `?view=archive` and `?view=workbench` URLs now resolve
  // to this one instrument. Only the opaque settled-run reference still
  // changes what opens on the Workbench.
  const studyRef = GENOME_V2_ENABLED ? searchParams?.get('result') : null;
  return <ResearchShell studyRef={studyRef} />;
}

export default function CodexPage() {
  return (
    <Suspense fallback={<ResearchShell />}>
      <ResearchWithParams />
    </Suspense>
  );
}
