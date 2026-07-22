'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCodexStore } from '@/lib/stores/codexStore';
import { NavBar } from '@/components/ui/NavBar';
import { StrainChip } from '@/components/traits/StrainChip';
import { IconDna, IconFlask } from '@/components/ui/icons';

export default function CodexPage() {
  const { session, isAuthenticated } = useAuth();
  const {
    live,
    unlocked,
    bankedRuns,
    unlockAt,
    data,
    isLoading,
    error,
    fetchCodex,
  } = useCodexStore();

  useEffect(() => {
    if (session?.access_token) void fetchCodex(session.access_token);
  }, [session?.access_token, fetchCodex]);

  return (
    <div className="app-bg min-h-screen text-bone-white px-4 sm:px-6 pt-8 pb-28 sm:pb-8 sm:pr-16">
      <NavBar />
      <main className="max-w-6xl mx-auto" data-testid="codex-page">
        <header className="mb-8 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl text-venom-orange text-glow-orange">
                Genome Codex
              </h1>
              <p className="text-beige font-body">
                Every gene you tried, every fusion you found, every build you banked.
              </p>
            </div>
            <Link href="/lab" className="btn-secondary inline-flex items-center gap-2 px-4 py-2">
              <IconFlask size={16} /> Back to Lab
            </Link>
          </div>
        </header>

        {!isAuthenticated ? (
          <section className="panel-elevated p-8 text-center">
            <p className="text-beige mb-4">Sign in to read your Genome Codex.</p>
            <Link href="/login" className="btn-go inline-block px-7 py-3">Sign In</Link>
          </section>
        ) : isLoading ? (
          <div className="panel p-8 text-center text-beige/60">Opening the Codex…</div>
        ) : error ? (
          <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-4">
            {error}
          </div>
        ) : !live || !data ? (
          !live ? (
            <div className="panel p-8 text-center text-beige/70">
              The Genome Codex is not live on this server yet.
            </div>
          ) : !unlocked ? (
            <div className="panel p-8 text-center text-beige/70" data-testid="codex-locked">
              Bank {unlockAt} runs to open the Genome Codex. You have banked{' '}
              {bankedRuns}.
            </div>
          ) : (
            <div className="panel p-8 text-center text-beige/70">
              The Genome Codex is unavailable right now.
            </div>
          )
        ) : (
          <div className="space-y-10 animate-fade-up">
            <section className="panel-elevated p-5" aria-label="Codex completion">
              <div className="flex items-end justify-between gap-4 mb-3">
                <div>
                  <p className="font-display text-xl text-bone-white">Archive completion</p>
                  <p className="text-sm text-beige/60">
                    {data.progress.discovered} / {data.progress.total} discoveries
                  </p>
                </div>
                <span className="font-mono text-2xl text-venom-orange">
                  {data.progress.percent}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-void-deep overflow-hidden border border-scale-blue-light/40">
                <div
                  className="h-full bg-gradient-to-r from-feral via-cyber to-venom-orange transition-all"
                  style={{ width: `${data.progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-beige/55 mt-3">
                Complete the archive to unlock the legendary Genome Weaver board skin.
                {data.progress.genomeWeaverUnlocked ? ' Unlocked.' : ''}
              </p>
            </section>

            <section>
              <h2 className="heading-display text-2xl mb-4">Strain milestones</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {data.strains.map((entry) => (
                  <article key={entry.strain} className="panel p-4">
                    <StrainChip strain={entry.strain} size="md" />
                    <div className="mt-4 space-y-3 text-sm">
                      {(['expression', 'apex'] as const).map((tier) => {
                        const milestone = entry[tier];
                        return (
                          <div key={tier} className={milestone.discovered ? '' : 'opacity-45'}>
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
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2 className="heading-display text-2xl">Splices</h2>
                <p className="text-xs text-beige/50">First discovery awards 250 DNA</p>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {data.splices.map((splice) => (
                  <article
                    key={splice.id}
                    className={`panel p-5 ${splice.discovered ? '' : 'opacity-55'}`}
                    data-testid={`codex-splice-${splice.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-display text-lg text-bone-white">
                        {splice.discovered ? splice.name : '???'}
                      </h3>
                      <div className="flex gap-1">
                        {splice.strains.map((strain) => (
                          <StrainChip key={strain} strain={strain} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-beige/70 mt-3">
                      {splice.discovered
                        ? splice.effect
                        : 'Fuse the right pair of genes to reveal this splice.'}
                    </p>
                    <p className="text-xs text-strike-red/75 mt-2">
                      {splice.discovered ? splice.cost : 'Recipe hidden'}
                    </p>
                    <p className="text-xs font-mono text-beige/50 mt-3">
                      {splice.discoveries} runs · {splice.banks} banked
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2 className="heading-display text-2xl">Genes</h2>
                <p className="text-xs text-beige/50">Stats: latest {data.sampleSize} Genome runs</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.genes.map((gene) => (
                  <article
                    key={gene.id}
                    className={`panel p-4 ${gene.discovered ? '' : 'opacity-50'}`}
                    data-testid={`codex-gene-${gene.id}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-display text-bone-white">
                        {gene.discovered ? gene.name : 'Unknown Gene'}
                      </h3>
                      <div className="flex gap-1">
                        {gene.strains.map((strain) => (
                          <StrainChip key={strain} strain={strain} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-beige/70 mt-3">
                      {gene.discovered ? gene.effect : 'Pick this gene in a run to archive it.'}
                    </p>
                    {gene.discovered && (
                      <p className="text-xs text-strike-red/75 mt-2">{gene.cost}</p>
                    )}
                    <p className="text-xs font-mono text-beige/50 mt-3">
                      {gene.picks} picks · {gene.banks} banked
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
