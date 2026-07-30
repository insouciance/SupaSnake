'use client';

/**
 * Season Playoff Bracket (Design v2 §8.4) - rendered on the clan page
 * under the Gauntlet panel. Self-fetching from GET /api/season (same
 * pattern as GauntletPanel): hidden entirely while { live: false }
 * (pre-migration-021), while no season is running, and outside content -
 * the bracket appears in the final 2 weeks (quarterfinals in season week
 * 6, the championship week - semifinals + score-decided final - in week
 * 7), and the champions banner history renders whenever it exists.
 *
 * Champion rewards are cosmetics + banner history only - never economy.
 */

import { useEffect, useState } from 'react';
import { IconShield, IconTrophy } from '@/components/ui/icons';

interface BracketClan {
  id: string;
  name: string;
  tag: string;
}

export interface PlayoffMatchView {
  round: 'quarterfinal' | 'semifinal';
  slot: number;
  week_start: string;
  seed_a: number;
  seed_b: number | null;
  clan_a: BracketClan | null;
  clan_b: BracketClan | null;
  score_a: number | null;
  score_b: number | null;
  settled: boolean;
  winner: string | null;
}

export interface ChampionView {
  seq: number;
  season: string;
  clan_name: string;
  clan_tag: string | null;
  decided_at: string;
}

interface SeasonPayload {
  live: boolean;
  season: { name: string; playoff_phase: 'none' | 'quarterfinal' | 'championship' } | null;
  playoffs: PlayoffMatchView[];
  champions: ChampionView[];
}

const ROUND_LABEL: Record<PlayoffMatchView['round'], string> = {
  quarterfinal: 'Quarterfinals',
  semifinal: 'Championship Week',
};

function MatchRow({ match }: { match: PlayoffMatchView }) {
  const sideClass = (clanId: string | null | undefined) =>
    match.winner && clanId === match.winner
      ? 'text-venom-orange font-bold'
      : match.winner
        ? 'text-beige/50'
        : 'text-bone-white';

  return (
    <div
      data-testid={`playoff-${match.round}-${match.slot}`}
      className="rounded-arcade border border-scale-blue-light/40 bg-void/50 px-3 py-2 text-sm font-body"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={sideClass(match.clan_a?.id)}>
          <span className="text-beige/40 mr-1.5">#{match.seed_a}</span>
          {match.clan_a ? `[${match.clan_a.tag}] ${match.clan_a.name}` : '—'}
        </span>
        <span className="font-mono text-beige/80">
          {match.score_a ?? (match.settled ? 0 : '–')}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {match.clan_b ? (
          <>
            <span className={sideClass(match.clan_b.id)}>
              <span className="text-beige/40 mr-1.5">#{match.seed_b}</span>
              [{match.clan_b.tag}] {match.clan_b.name}
            </span>
            <span className="font-mono text-beige/80">
              {match.score_b ?? (match.settled ? 0 : '–')}
            </span>
          </>
        ) : (
          <span className="text-beige/40 text-xs uppercase tracking-wide">
            Bye — advances
          </span>
        )}
      </div>
    </div>
  );
}

interface PlayoffBracketProps {
  accessToken?: string;
}

export function PlayoffBracket({ accessToken }: PlayoffBracketProps) {
  const [data, setData] = useState<SeasonPayload | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetch('/api/season', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setData(payload as SeasonPayload);
      })
      .catch((err) => console.error('Failed to fetch season playoffs:', err));
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!data || !data.live) return null;

  const hasBracket = data.playoffs.length > 0;
  const hasChampions = data.champions.length > 0;
  if (!hasBracket && !hasChampions) return null;

  const rounds: PlayoffMatchView['round'][] = ['quarterfinal', 'semifinal'];

  return (
    <div
      data-testid="playoff-bracket"
      className="panel-glow p-5 space-y-4"
      style={{ '--glow': '#22d3ee' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <IconShield size={20} className="text-[#7df9ff]" />
        <h3 className="heading-display text-lg text-bone-white">
          Season Playoffs
        </h3>
        {data.season && (
          <span className="text-beige/50 text-xs font-body ml-auto">
            {data.season.name}
          </span>
        )}
      </div>

      {hasBracket &&
        rounds.map((round) => {
          const matches = data.playoffs
            .filter((m) => m.round === round)
            .sort((a, b) => a.slot - b.slot);
          if (matches.length === 0) return null;
          return (
            <div key={round} className="space-y-2">
              <p className="label-arcade">{ROUND_LABEL[round]}</p>
              {matches.map((match) => (
                <MatchRow key={`${round}-${match.slot}`} match={match} />
              ))}
              {round === 'semifinal' && (
                <p className="text-beige/50 text-xs font-body">
                  Champion: the semifinal winner with the higher counted
                  score this week — cosmetics + banner, never economy.
                </p>
              )}
            </div>
          );
        })}

      {hasChampions && (
        <div className="space-y-2" data-testid="champions-history">
          <p className="label-arcade">Champions</p>
          {data.champions.map((champion) => (
            <div
              key={champion.seq}
              className="flex items-center gap-2 rounded-arcade border border-venom-orange/40 bg-void/50 px-3 py-2 text-sm font-body"
            >
              <IconTrophy size={15} className="text-venom-orange" />
              <span className="text-bone-white font-bold">
                {champion.clan_tag ? `[${champion.clan_tag}] ` : ''}
                {champion.clan_name}
              </span>
              <span className="text-beige/50 text-xs ml-auto">{champion.season}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PlayoffBracket;
