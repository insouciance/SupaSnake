'use client';

/**
 * The Genome Codex — the game's lexicon (WP-2.07a).
 *
 * Two layers, deliberately independent, and the point of this rework is
 * that the second no longer gates the first:
 *
 * **The rules** (the `codex-rules` block) are static facts read straight
 * out of `lexiconSection()`. No API call, no player state, no account.
 * They render for a signed-out visitor — which is what resolves a live
 * contradiction: `/codex` sits in the public sitemap
 * (`src/lib/growth/siteMap.ts`) and in the landing pitch's footer while
 * being auth-walled *and* 15-banked-run-gated. A page search engines are
 * invited to index and visitors cannot read is not a page.
 *
 * **The discovery layer** — which genes *you* have found, when, and whether
 * you were first in the world — still needs an account, and still starts
 * recording at the banked-run unlock. That progression is intact; it simply
 * no longer decides whether the rules exist.
 *
 * One piece of content stays hidden: the splice RECIPE. The server nulls
 * `parents` until you have discovered the splice (`api/codex/utils.ts`), so
 * it is absent from the JSON rather than masked here.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCodexStore } from '@/lib/stores/codexStore';
import { NavBar } from '@/components/ui/NavBar';
import { StrainChip } from '@/components/traits/StrainChip';
import { IconDna, IconFlask } from '@/components/ui/icons';
import { GENES } from '@/shared/game/genes';
import {
  ACTIVE_STRAIN_TIERS,
  describe as describeEntry,
  lexiconSection,
  strainTierId,
  type LexiconEntry,
} from '@/shared/game/lexicon';
import { STRAIN_IDS } from '@/shared/game/strains';

/** The line an entry shows where a sibling would show its cost. */
const NO_COST = 'No cost — this one is free.';

/** One documented entry: name, what it does, what it costs. */
function LexiconRow({ entry }: { entry: LexiconEntry }) {
  return (
    <article className="panel p-4" data-testid={`lexicon-${entry.kind}-${entry.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          className="font-display text-bone-white"
          style={entry.color ? { color: entry.color } : undefined}
        >
          {entry.name}
        </h3>
        {entry.strains && entry.strains.length > 0 && entry.kind !== 'strain' && (
          <div className="flex gap-1">
            {entry.strains.map((strain) => (
              <StrainChip key={strain} strain={strain} />
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 font-body text-sm text-beige/75">{entry.effect}</p>
      <p
        className={`mt-2 font-body text-xs ${
          entry.cost ? 'text-strike-red/75' : 'text-beige/40'
        }`}
      >
        {entry.cost || NO_COST}
      </p>
      {entry.runNotice && (
        <p className="mt-2 font-body text-xs text-cosmic">{entry.runNotice.text}</p>
      )}
    </article>
  );
}

function LexiconGrid({
  title,
  entries,
  blurb,
  testId,
}: {
  title: string;
  entries: LexiconEntry[];
  blurb: string;
  testId: string;
}) {
  return (
    <section data-testid={testId}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="heading-display text-2xl">{title}</h2>
        <p className="text-xs text-beige/50">{blurb}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <LexiconRow key={`${entry.kind}:${entry.id}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}

/** The five families, each with its three activation tiers beneath it. */
function StrainLadder() {
  return (
    <section data-testid="lexicon-strains">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="heading-display text-2xl">Strains</h2>
        <p className="text-xs text-beige/50">
          Five families, three tiers each. Genes, heirloom traits and lineage
          all pay into the same points.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {STRAIN_IDS.map((strain) => {
          const family = describeEntry('strain', strain);
          if (!family) return null;
          return (
            <article
              key={strain}
              className="panel p-4"
              data-testid={`lexicon-strain-${strain}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StrainChip strain={strain} size="md" />
                <p className="font-body text-xs text-beige/60">{family.effect}</p>
              </div>
              <div className="mt-3 space-y-3">
                {ACTIVE_STRAIN_TIERS.map((tier) => {
                  const entry = describeEntry('strainTier', strainTierId(strain, tier));
                  if (!entry) return null;
                  return (
                    <div
                      key={tier}
                      className="border-l-2 pl-3"
                      style={{ borderColor: `${family.color ?? '#ffffff'}66` }}
                      data-testid={`lexicon-tier-${strain}-${tier}`}
                    >
                      <p className="font-display text-sm text-bone-white">
                        {entry.name}
                      </p>
                      <p className="mt-1 font-body text-xs text-beige/75">
                        {entry.effect}
                      </p>
                      <p
                        className={`mt-1 font-body text-xs ${
                          entry.cost ? 'text-strike-red/75' : 'text-beige/40'
                        }`}
                      >
                        {entry.cost || NO_COST}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
                Every rule the game plays by — and, once you sign in, every one
                you have found for yourself.
              </p>
            </div>
            <Link href="/lab" className="btn-secondary inline-flex items-center gap-2 px-4 py-2">
              <IconFlask size={16} /> Back to Lab
            </Link>
          </div>
        </header>

        {/* ── The rules. No account, no API, no gate. ─────────────────── */}
        <div className="space-y-10 animate-fade-up" data-testid="codex-rules">
          <LexiconGrid
            testId="lexicon-mechanics"
            title="How a run works"
            blurb="The vocabulary, in the order you meet it."
            entries={lexiconSection('mechanic')}
          />
          <LexiconGrid
            testId="lexicon-dynasties"
            title="Dynasties"
            blurb="Three genuinely different rulesets."
            entries={lexiconSection('dynasty')}
          />
          <LexiconGrid
            testId="lexicon-traits"
            title="Traits"
            blurb="Permanent, snake-bound sidegrades. Bred, never bought."
            entries={lexiconSection('trait')}
          />
          <StrainLadder />
          <LexiconGrid
            testId="lexicon-anomalies"
            title="Anomaly weeks"
            blurb="One rotating modifier per ISO week."
            entries={lexiconSection('anomaly')}
          />
        </div>

        {/* ── The discovery layer. This one needs an account. ─────────── */}
        <div className="mt-12 space-y-10">
          <h2 className="heading-display text-2xl text-venom-orange">
            Your discoveries
          </h2>

          {!isAuthenticated ? (
            <section className="panel p-6 text-center" data-testid="codex-signed-out">
              <p className="text-beige mb-4 font-body">
                The rules above are the same for everyone. Sign in to see which
                of them you have found, when, and whether you were first in the
                world.
              </p>
              <Link href="/login" className="btn-go inline-block px-7 py-3">
                Sign In
              </Link>
            </section>
          ) : isLoading ? (
            <div className="panel p-8 text-center text-beige/60">Opening the Codex…</div>
          ) : error ? (
            <div className="bg-strike-red/15 border border-strike-red/70 rounded-arcade p-4">
              {error}
            </div>
          ) : !live ? (
            <div className="panel p-8 text-center text-beige/70">
              The discovery archive is not live on this server yet.
            </div>
          ) : !data ? (
            <div className="panel p-8 text-center text-beige/70">
              The discovery archive is unavailable right now.
            </div>
          ) : (
            <div className="space-y-10 animate-fade-up">
              {!unlocked && (
                <p
                  className="panel p-4 text-center font-body text-sm text-beige/70"
                  data-testid="codex-discovery-pending"
                >
                  Discoveries start being recorded at {unlockAt} banked runs.
                  You have banked {bankedRuns}. Nothing above waits on that —
                  only the archive below does.
                </p>
              )}

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
                <h3 className="heading-display text-xl mb-4">Strain milestones</h3>
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
                  <h3 className="heading-display text-xl">Splices</h3>
                  <p className="text-xs text-beige/50">First discovery awards 250 DNA</p>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {data.splices.map((splice) => (
                    <article
                      key={splice.id}
                      className={`panel p-5 ${splice.discovered ? '' : 'opacity-75'}`}
                      data-testid={`codex-splice-${splice.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="font-display text-lg text-bone-white">
                          {splice.name}
                        </h4>
                        <div className="flex gap-1">
                          {splice.strains.map((strain) => (
                            <StrainChip key={strain} strain={strain} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-beige/70 mt-3">{splice.effect}</p>
                      <p className="text-xs text-strike-red/75 mt-2">{splice.cost}</p>
                      {/* The one thing still withheld — and the server, not
                          this page, is what withholds it. */}
                      <p
                        className="text-xs font-body text-cosmic/80 mt-2"
                        data-testid={`codex-recipe-${splice.id}`}
                      >
                        {splice.parents
                          ? `Recipe: ${GENES[splice.parents[0]].name} + ${GENES[splice.parents[1]].name}`
                          : 'Recipe hidden — fuse the right pair to reveal it'}
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
                  <h3 className="heading-display text-xl">Genes</h3>
                  <p className="text-xs text-beige/50">
                    Stats: latest {data.sampleSize} Genome runs
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.genes.map((gene) => (
                    <article
                      key={gene.id}
                      className={`panel p-4 ${gene.discovered ? '' : 'opacity-75'}`}
                      data-testid={`codex-gene-${gene.id}`}
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h4 className="font-display text-bone-white">{gene.name}</h4>
                        <div className="flex gap-1">
                          {gene.strains.map((strain) => (
                            <StrainChip key={strain} strain={strain} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-beige/70 mt-3">{gene.effect}</p>
                      <p className="text-xs text-strike-red/75 mt-2">{gene.cost}</p>
                      <p className="text-xs font-mono text-beige/50 mt-3">
                        {gene.discovered ? 'Archived' : 'Not yet archived'} ·{' '}
                        {gene.picks} picks · {gene.banks} banked
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
