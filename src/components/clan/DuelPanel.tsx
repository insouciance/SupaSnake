'use client';

/**
 * Clan Duel Panel - "THIS WEEK'S DUEL" card for the clan page.
 *
 * Weekly head-to-head: my clan's live score (top 10 contributors, best 30
 * runs each) vs a rating-adjacent opponent. Shows countdown to the ISO week
 * end, projected ELO change, top contributors, win/loss record, bye state,
 * and last week's result banner (+5% DNA bonus indicator on a win).
 */

import { useEffect, useState } from 'react';
import { IconDna, IconTrophy, IconShield } from '@/components/ui/icons';
import { projectedRatingChange } from '@/lib/clan/elo';
import {
  GAUNTLET_MODIFIERS,
  gauntletBanName,
  parseGauntletBan,
  type GauntletModifierId,
} from '@/shared/game/gauntlet';
import { formatAmount } from '@/shared/format/amount';

export interface DuelOpponent {
  name: string;
  tag: string;
  rating: number;
}

export interface GauntletSideRules {
  dynasty: string | null;
  dynasty2: string | null;
  modifier: string | null;
  topMembers: number;
  bestRuns: number;
  weight: number;
  extractedOnly: boolean;
  banned: string | null;
}

export interface GauntletRivalry {
  wins: number;
  losses: number;
  ties: number;
  meetings: number;
  lastWinnerMe: boolean;
}

/** Gauntlet block on the duel payload (null pre-migration-020). */
export interface DuelGauntlet {
  phase: 'picks_open' | 'locked' | 'scoring';
  picksDeadline: string;
  windowFrom: string;
  windowTo: string;
  revealed: boolean;
  myPicks: { dynasty: string; ban: string | null } | null;
  theirPicks: { dynasty: string; ban: string | null } | null;
  myRules: GauntletSideRules | null;
  theirRules: GauntletSideRules | null;
  rivalry: GauntletRivalry | null;
  revenge: boolean;
}

/** Display name for a modifier id ("vanguard" -> "Vanguard"). */
export function modifierName(id: string | null): string | null {
  if (!id) return null;
  const modifier = GAUNTLET_MODIFIERS[id as GauntletModifierId];
  return modifier ? modifier.name : id;
}

/** Display name for a Genome ban, including legacy bare mutation ids. */
export function mutationName(id: string | null): string | null {
  if (!id) return null;
  return parseGauntletBan(id) ? gauntletBanName(id) : id;
}

export interface DuelContributor {
  name: string;
  dna: number;
}

export interface DuelInfo {
  weekStart: string;
  status: 'active' | 'settled' | 'bye';
  isBye: boolean;
  opponent: DuelOpponent | null;
  myScore: number;
  theirScore: number;
  endsAt: string;
  myTopContributors: DuelContributor[];
  /** Gauntlet evolution (migration 020); absent/null on pre-020 payloads. */
  gauntlet?: DuelGauntlet | null;
}

export interface LastWeekResult {
  result: 'won' | 'lost' | 'tie';
  ratingDelta: number;
  opponentName: string | null;
  myScore: number;
  theirScore: number;
}

export interface DuelData {
  duel: DuelInfo | null;
  rating: number;
  record: { wins: number; losses: number };
  lastWeek: LastWeekResult | null;
}

/** Human countdown to week end, e.g. "4d 12h" / "3h 24m" / "18m" */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'Settling...';
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Bar width percentage relative to the leading score (0 when scoreless). */
export function scoreBarWidth(score: number, otherScore: number): number {
  const max = Math.max(score, otherScore);
  if (max <= 0) return 0;
  return Math.round((score / max) * 100);
}

export function DuelPanel({ accessToken }: { accessToken?: string | null }) {
  const [data, setData] = useState<DuelData | null>(null);
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/clan/duel', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return; // 404 = not in a clan; hide silently
        const json = (await response.json()) as DuelData;
        if (!cancelled) {
          setData(json);
          setVisible(true);
        }
      } catch {
        // Non-fatal: duel panel simply stays hidden
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Tick the countdown once a minute
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!visible || !data) return null;

  const { duel, rating, record, lastWeek } = data;
  const projection =
    duel && duel.opponent ? projectedRatingChange(rating, duel.opponent.rating) : null;
  const msRemaining = duel ? new Date(duel.endsAt).getTime() - now : 0;

  return (
    <section className="mb-10 animate-fade-up" data-testid="duel-panel">
      <h2 className="heading-display text-2xl text-bone-white mb-4 flex items-center gap-2">
        <IconTrophy size={22} className="text-venom-orange" />
        This Week&apos;s Duel
      </h2>

      {/* Last week's result banner */}
      {lastWeek && (
        <div
          data-testid="last-week-banner"
          className={`p-4 mb-4 rounded-arcade border animate-pop-in ${
            lastWeek.result === 'won'
              ? 'bg-venom-orange/10 border-venom-orange/70'
              : lastWeek.result === 'lost'
                ? 'bg-strike-red/10 border-strike-red/70'
                : 'bg-void/60 border-scale-blue-light/50'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="font-display uppercase text-bone-white">
              {lastWeek.result === 'won' && (
                <>
                  Victory over {lastWeek.opponentName || 'your rival'}!{' '}
                  <span className="text-venom-orange">
                    {lastWeek.ratingDelta >= 0 ? '+' : ''}
                    {lastWeek.ratingDelta} rating
                  </span>
                </>
              )}
              {lastWeek.result === 'lost' && (
                <>
                  Defeat vs {lastWeek.opponentName || 'your rival'}.{' '}
                  <span className="text-strike-red">{lastWeek.ratingDelta} rating</span>
                </>
              )}
              {lastWeek.result === 'tie' && <>Last week ended in a tie. No rating change.</>}
            </p>
          </div>
        </div>
      )}

      <div className="panel-glow [--glow:#22d3ee] p-4 sm:p-6">
        {/* Rating + record chip */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <span className="label-arcade">Clan Duels</span>
          <span
            data-testid="duel-record-chip"
            className="px-3 py-1 bg-void/60 border border-scale-blue-light/50 rounded-arcade text-sm font-display text-bone-white"
          >
            {rating} RATING &middot; {record.wins}W-{record.losses}L
          </span>
        </div>

        {!duel && (
          <p className="text-beige font-body" data-testid="duel-unpaired">
            Your clan joins the bracket next week. Harvest DNA to be ready.
          </p>
        )}

        {duel && duel.isBye && (
          <div className="text-center py-6" data-testid="duel-bye">
            <IconShield size={32} className="text-beige/60 mx-auto mb-2" />
            <p className="heading-display text-xl text-bone-white">Rest week — no opponent</p>
            <p className="text-beige text-sm font-body mt-1">
              Odd clan out this week. Back in the bracket on Monday.
            </p>
          </div>
        )}

        {duel && !duel.isBye && duel.opponent && (
          <div data-testid="duel-active">
            {/* Matchup header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <p className="font-display uppercase text-lg text-bone-white">
                vs {duel.opponent.name}{' '}
                <span className="text-beige/70 text-sm">[{duel.opponent.tag}]</span>
                {duel.gauntlet?.rivalry && (
                  <span
                    data-testid="rivalry-record"
                    className="ml-2 px-2 py-0.5 bg-void/60 border border-scale-blue-light/50 rounded-arcade text-xs font-display text-beige align-middle"
                  >
                    Rivalry {duel.gauntlet.rivalry.wins}W-{duel.gauntlet.rivalry.losses}L
                    {duel.gauntlet.rivalry.ties > 0 ? `-${duel.gauntlet.rivalry.ties}T` : ''}
                  </span>
                )}
                {duel.gauntlet?.revenge && (
                  <span
                    data-testid="revenge-badge"
                    className="ml-2 px-2 py-0.5 bg-strike-red/20 border border-strike-red/70 rounded-arcade text-xs font-display text-strike-red align-middle"
                  >
                    Revenge match
                  </span>
                )}
              </p>
              <p className="text-sm font-body text-beige">
                Their rating: <span className="text-bone-white">{duel.opponent.rating}</span>
                {projection && (
                  <span className="ml-2 text-xs font-display uppercase" data-testid="duel-projection">
                    <span className="text-venom-orange">Win +{projection.win}</span>
                    <span className="text-beige/50"> / </span>
                    <span className="text-strike-red">Lose {projection.loss}</span>
                  </span>
                )}
              </p>
            </div>

            {/* Gauntlet: picks-open hint (Mon-Wed) */}
            {duel.gauntlet && duel.gauntlet.phase === 'picks_open' && (
              <p
                data-testid="gauntlet-picks-open-hint"
                className="text-sm text-beige font-body mb-4 bg-void/40 border border-scale-blue-light/30 rounded-arcade px-3 py-2"
              >
                Blind picks lock <span className="text-bone-white font-display">Wednesday 00:00 UTC</span>
                {' '}&middot; counted runs Thu&ndash;Sun
              </p>
            )}

            {/* Gauntlet: effective rules banner (after Wed reveal) */}
            {duel.gauntlet?.myRules && (
              <div
                data-testid="gauntlet-rules-banner"
                className="mb-4 p-3 bg-cosmic/10 border border-cosmic/60 rounded-arcade text-sm font-body text-beige"
              >
                <p className="font-display uppercase text-cosmic-glow mb-1">Rules in effect</p>
                <p>
                  Counted runs:{' '}
                  <span className="text-bone-white font-display">
                    {duel.gauntlet.myRules.dynasty
                      ? duel.gauntlet.myRules.dynasty +
                        (duel.gauntlet.myRules.dynasty2 ? ` + ${duel.gauntlet.myRules.dynasty2}` : '')
                      : 'Any dynasty'}
                  </span>{' '}
                  &middot; Thu&ndash;Sun only &middot; best {duel.gauntlet.myRules.bestRuns} runs &times; top{' '}
                  {duel.gauntlet.myRules.topMembers} members
                  {duel.gauntlet.myRules.modifier && (
                    <>
                      {' '}&middot;{' '}
                      <span className="text-venom-orange">
                        {modifierName(duel.gauntlet.myRules.modifier)}
                        {duel.gauntlet.myRules.weight !== 1 && ` x${duel.gauntlet.myRules.weight.toFixed(2)}`}
                      </span>
                    </>
                  )}
                </p>
                {duel.gauntlet.myRules.banned && (
                  <p data-testid="gauntlet-ban-received" className="mt-1 text-strike-red">
                    {mutationName(duel.gauntlet.myRules.banned)} affects your Genome this week
                  </p>
                )}
                {duel.gauntlet.theirRules?.banned && (
                  <p data-testid="gauntlet-ban-given" className="mt-1 text-venom-orange">
                    You chose {mutationName(duel.gauntlet.theirRules.banned)} against {duel.opponent.name}
                  </p>
                )}
              </div>
            )}

            {/* Live score bars */}
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex justify-between text-sm font-body mb-1">
                  <span className="text-venom-orange font-display uppercase">My Clan</span>
                  <span className="text-bone-white flex items-center gap-1">
                    <IconDna size={12} />
                    {formatAmount(duel.myScore)}
                  </span>
                </div>
                <div className="h-3 bg-void/60 border border-scale-blue-light/40 rounded-arcade overflow-hidden">
                  <div
                    data-testid="my-score-bar"
                    className="h-full bg-venom-orange shadow-[0_0_8px_#22d3ee] transition-all"
                    style={{ width: `${scoreBarWidth(duel.myScore, duel.theirScore)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-body mb-1">
                  <span className="text-strike-red font-display uppercase">{duel.opponent.name}</span>
                  <span className="text-bone-white flex items-center gap-1">
                    <IconDna size={12} />
                    {formatAmount(duel.theirScore)}
                  </span>
                </div>
                <div className="h-3 bg-void/60 border border-scale-blue-light/40 rounded-arcade overflow-hidden">
                  <div
                    data-testid="their-score-bar"
                    className="h-full bg-strike-red shadow-[0_0_8px_#ef4444] transition-all"
                    style={{ width: `${scoreBarWidth(duel.theirScore, duel.myScore)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Countdown */}
            <p className="text-sm text-beige font-body mb-4" data-testid="duel-countdown">
              Week ends in{' '}
              <span className="text-bone-white font-display">{formatCountdown(msRemaining)}</span>
            </p>

            {/* Top contributors */}
            {duel.myTopContributors.length > 0 && (
              <div>
                <p className="label-arcade mb-2">Top Contributors</p>
                <ul className="space-y-1">
                  {duel.myTopContributors.map((contributor, index) => (
                    <li
                      key={`${contributor.name}-${index}`}
                      className="flex items-center justify-between text-sm font-body bg-void/40 border border-scale-blue-light/30 rounded-arcade px-3 py-1.5"
                    >
                      {/* Identity v1: contributor names come from
                          player_identity_view (display_handle) - the
                          generated handler-NNNN form renders muted */}
                      <span
                        className={
                          contributor.name.startsWith('handler-')
                            ? 'text-beige/50'
                            : 'text-bone-white'
                        }
                      >
                        <span className="text-beige/60 mr-2">{index + 1}.</span>
                        {contributor.name}
                      </span>
                      <span className="text-venom-orange flex items-center gap-1 font-display">
                        <IconDna size={12} />
                        {formatAmount(contributor.dna)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-beige/50 font-body mt-2" data-testid="counted-rules-footer">
                  {duel.gauntlet?.myRules
                    ? `Top ${duel.gauntlet.myRules.topMembers} members count · best ${duel.gauntlet.myRules.bestRuns} runs each · Thu-Sun window · skill wins, not volume`
                    : 'Top 10 members count · best 30 runs each · skill wins, not volume'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
