'use client';

/**
 * A player's clan chapter: aggregate 3-day Energy Battle outcomes and equal
 * personal honors. It never exposes another member's attempt, threshold,
 * Energy, generation, absence, or rank. Older duel data survives only as a
 * plainly named archive.
 */

import React from 'react';
import { IconShield } from '@/components/ui/icons';
import type { ClanSection } from '@/lib/chronicle/types';

function outcomeLabel(outcome: ClanSection['battleHistory'][number]['outcome']): string {
  switch (outcome) {
    case 'victor':
      return 'Victory';
    case 'stalemate':
      return 'Stalemate';
    case 'participant':
      return 'Battle completed';
    case 'bye':
      return 'Unmatched cycle';
    default:
      return 'Battle active';
  }
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function ClanChapter({ clan }: { clan: ClanSection }): React.ReactElement {
  return (
    <div className="panel p-4 space-y-4" data-testid="clan-chapter">
      <div className="flex items-center gap-2">
        <IconShield size={18} className="text-[#7df9ff]" />
        <h3 className="heading-display text-base text-bone-white">{clan.name}</h3>
        <span className="font-body text-xs text-[#7df9ff] tracking-wider">[{clan.tag}]</span>
      </div>

      {clan.honors.total > 0 && (
        <div className="rounded-arcade border border-venom-orange/25 bg-venom-orange/5 px-3 py-2" data-testid="clan-honors">
          <p className="label-arcade text-venom-orange">Battle honors</p>
          <p className="mt-1 font-body text-sm text-beige/75">
            {clan.honors.victories} victor · {clan.honors.total} completed
          </p>
        </div>
      )}

      {clan.battleHistory.length > 0 ? (
        <div className="space-y-2" data-testid="clan-energy-history">
          <p className="label-arcade text-beige/55">Energy Battle history</p>
          {clan.battleHistory.map((battle) => (
            <div
              key={battle.battleId}
              className="rounded-arcade border border-scale-blue-light/20 bg-void/45 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-body text-sm text-bone-white">{outcomeLabel(battle.outcome)}</p>
                <p className="font-mono text-xs text-beige/55">{dateLabel(battle.startedAt)}</p>
              </div>
              <p className="mt-1 font-mono text-xs text-beige/65">
                [{clan.tag}] {battle.clanDepth.toLocaleString()}
                {battle.opponent
                  ? ` · [${battle.opponent.tag ?? battle.opponent.name}] ${battle.opponent.depth.toLocaleString()}`
                  : ' · no rival formed'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-body text-xs text-beige/50" data-testid="clan-history-empty">
          The first completed Energy Battle starts this chapter.
        </p>
      )}

      {clan.legacyArchive &&
        (clan.legacyArchive.ratingHistory.length > 0 || clan.legacyArchive.rivalries.length > 0) && (
          <details className="rounded-arcade border border-scale-blue-light/15 bg-void/30 px-3 py-2" data-testid="clan-legacy-archive">
            <summary className="cursor-pointer font-body text-xs text-beige/60">
              Archived weekly duel history
            </summary>
            <div className="mt-2 space-y-1 font-body text-xs text-beige/55">
              <p>Final archived rating: {clan.legacyArchive.rating}</p>
              {clan.legacyArchive.rivalries.map((rivalry) => (
                <p key={`${rivalry.opponentName}-${rivalry.opponentTag}`}>
                  {rivalry.opponentName}{rivalry.opponentTag ? ` [${rivalry.opponentTag}]` : ''}: {rivalry.wins}W · {rivalry.losses}L{rivalry.ties > 0 ? ` · ${rivalry.ties}T` : ''}
                </p>
              ))}
            </div>
          </details>
        )}
    </div>
  );
}

export default ClanChapter;
