'use client';

/**
 * Chronicle Analyst sections (Identity v1 §9.2) — own-profile surfaces
 * for the seasonal archetype, the weekly digest card, and the flagship
 * season Recall share card. All three render nothing gracefully when
 * their artifact doesn't exist yet (pre-025, mid-season, no runs).
 */

import { useCallback, useState } from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import type { PlayerIdentity } from '@/lib/identity/types';
import {
  ARCHETYPES,
  type ArchetypeSlug,
  type DigestFacts,
  type RecallFacts,
} from '@/lib/analyst/facts';

export interface AnalystArtifact {
  headline: string;
  body: string;
  tips: string[];
  badge?: string;
  archetype?: string;
  facts?: unknown;
}

// ---------------------------------------------------------------------------
// Archetype — badge + description + "how you played" line
// ---------------------------------------------------------------------------

const ARCHETYPE_GLYPH: Record<ArchetypeSlug, string> = {
  surgeon: '✂',
  daredevil: '☄',
  loyalist: '♜',
  polymath: '◈',
  alchemist: '⚗',
  purist: '➰',
  redliner: '⚡',
  metronome: '♪',
  hatchling: '❋',
};

export function ArchetypeSection({
  artifact,
  seasonSeq,
}: {
  artifact: AnalystArtifact;
  seasonSeq: number;
}) {
  const slug = (artifact.archetype ?? 'hatchling') as ArchetypeSlug;
  const meta = ARCHETYPES[slug] ?? ARCHETYPES.hatchling;
  return (
    <div
      className="panel-glow [--glow:#a855f7] p-5 flex items-start gap-4"
      data-testid="archetype-card"
    >
      <div
        className="flex-shrink-0 w-14 h-14 rounded-arcade border border-rarity-epic/70 bg-void flex items-center justify-center text-2xl text-rarity-epic"
        aria-hidden
      >
        {ARCHETYPE_GLYPH[slug]}
      </div>
      <div className="min-w-0">
        <p className="label-arcade">Season {seasonSeq} Archetype</p>
        <p className="heading-display text-xl text-bone-white mt-0.5">
          {meta.name}
        </p>
        <p className="font-body text-xs text-rarity-epic/90 uppercase tracking-wider mt-0.5">
          {meta.fantasy}
        </p>
        <p className="font-body text-sm text-beige mt-2">{artifact.body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly digest card
// ---------------------------------------------------------------------------

export function DigestCard({
  artifact,
  weekStart,
}: {
  artifact: AnalystArtifact;
  weekStart: string;
}) {
  const facts = (artifact.facts ?? null) as DigestFacts | null;
  return (
    <div className="panel-glow [--glow:#22d3ee] p-5" data-testid="digest-card">
      <p className="label-arcade">The Analyst — Week of {weekStart}</p>
      <p className="heading-display text-lg text-bone-white mt-1">
        {artifact.headline}
      </p>
      <p className="font-body text-sm text-beige mt-2">{artifact.body}</p>
      {facts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <DigestStat label="Runs" value={String(facts.runs)} />
          <DigestStat label="DNA Banked" value={String(facts.totalDna)} />
          <DigestStat label="Extraction" value={`${facts.extractionRatePct}%`} />
          <DigestStat label="Best Run" value={String(facts.bestDnaRun)} />
        </div>
      )}
      {artifact.tips.length > 0 && (
        <ul className="mt-3 space-y-1">
          {artifact.tips.map((tip, i) => (
            <li key={i} className="font-body text-sm text-cyber/90">
              ▸ {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DigestStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-arcade border border-scale-blue-light/40 bg-void/60 px-3 py-2 text-center">
      <p className="label-arcade text-[10px]">{label}</p>
      <p className="heading-display text-lg text-bone-white">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Season Recall — the flagship shareable card
// ---------------------------------------------------------------------------

export function RecallCard({
  artifact,
  identity,
  seasonSeq,
  seasonName,
  shareUrl,
}: {
  artifact: AnalystArtifact;
  identity: PlayerIdentity;
  seasonSeq: number;
  seasonName: string | null;
  shareUrl: string | null;
}) {
  const facts = (artifact.facts ?? null) as RecallFacts | null;
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    const url = `${window.location.origin}${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `SupaSnake — Season ${seasonSeq} Recall`,
          text: artifact.headline,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }, [shareUrl, seasonSeq, artifact.headline]);

  const stats: Array<{ label: string; value: string }> = facts
    ? [
        { label: 'Runs', value: String(facts.totalRuns) },
        { label: 'DNA Banked', value: String(facts.totalDna) },
        { label: 'Best Run', value: String(facts.bestDnaRun) },
        { label: 'Extraction', value: `${facts.extractionRatePct}%` },
        { label: 'Days Played', value: String(facts.activeDays) },
        { label: 'New Variants', value: String(facts.variantsAcquired) },
      ]
    : [];

  return (
    <div
      className="panel-glow [--glow:#facc15] p-0 overflow-hidden"
      data-testid="recall-card"
    >
      <div className="bg-gradient-to-b from-void to-void-deep p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="label-arcade">Season {seasonSeq} Recall</p>
            {seasonName && (
              <p className="heading-display text-sm text-venom-orange text-glow-orange">
                {seasonName}
              </p>
            )}
          </div>
          {shareUrl && (
            <button
              type="button"
              onClick={handleShare}
              className="btn-arcade btn-neutral text-xs px-4 py-2"
              data-testid="recall-share"
            >
              {copied ? 'Link copied' : 'Share'}
            </button>
          )}
        </div>

        <PlayerCard identity={identity} variant="full" />

        <div>
          <p className="heading-display text-2xl text-bone-white text-glow">
            {artifact.headline}
          </p>
          <p className="font-body text-sm text-beige mt-2">{artifact.body}</p>
          {facts?.archetypeName && (
            <p className="font-body text-xs text-rarity-epic uppercase tracking-widest mt-2">
              {facts.archetypeName}
            </p>
          )}
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-arcade border border-scale-blue-light/40 bg-void/70 px-3 py-3 text-center"
              >
                <p className="label-arcade text-[10px]">{s.label}</p>
                <p className="heading-display text-xl text-bone-white">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {facts?.clan && (
          <p className="font-body text-xs text-beige/70">
            {facts.clan.champion
              ? `Season champions with ${facts.clan.name} [${facts.clan.tag}]`
              : `Rode with ${facts.clan.name} [${facts.clan.tag}] — ${facts.clan.duelWins}W / ${facts.clan.duelLosses}L in the duels`}
          </p>
        )}
      </div>
    </div>
  );
}
