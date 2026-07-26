'use client';

/**
 * The World Serpent hunt panel (Constitution §7.3).
 *
 * The week that is running, read for one player. §7.3 fixes the order and this
 * component keeps it: you against your own best week first, the clan against
 * its own best week second. The rival, when there is one, is a layer the clan
 * surface adds on top (§9.4) — it is never the headline here, because at N=1
 * there is no rival and the panel still has to be the whole truth.
 *
 * HOW THIS READS AT N = 1
 *
 *   A solo player in a clan of one, in their first week, with no settled week
 *   behind them, sees: the week's condition, "0 segments" against a best week
 *   of 0, "your best three runs of the week count", their clan of one with the
 *   same number, and one contribution row that is theirs. Nothing is empty,
 *   nothing errors, nothing says they are below anything. The first run they
 *   bank moves every number on the page.
 *
 * FLAG OFF
 *
 *   `GET /api/serpent/panel` answers 200 with `live: false` deliberately so
 *   this component can render an off state rather than an error. Off reads as
 *   "not surfacing yet" — a statement about the Serpent, not about the player,
 *   and with no counter, bar or countdown implying something is owed.
 *
 * PROHIBITED VOCABULARY
 *
 *   No threshold, minimum, requirement, qualification, cut, rank, position or
 *   grade appears in any string this file renders. `cutLines.test.tsx` asserts
 *   it structurally over the rendered text, in every state.
 */

import Link from 'next/link';
import type { SerpentPanel } from '@/lib/server/serpent';
import { formatWeekStart, segments, signedSegments } from '@/lib/serpent/briefing';
import { ContributionList } from '@/components/serpent/ContributionList';
import { IconShield, IconSnake } from '@/components/ui/icons';

export interface SerpentWeekPanelProps {
  panel: SerpentPanel;
  /** The player's own `players.id`, when known, so their row reads as theirs. */
  youPlayerId?: string | null;
}

/** "you vs your best week", stated so it is true on a first week too. */
export function deltaSentence(depth: number, bestWeekDepth: number): string {
  if (bestWeekDepth <= 0) {
    return depth > 0
      ? 'This is the first week you have fed the hunt. It becomes the week everything after it is read against.'
      : 'You have no week behind you yet. Whatever you feed the hunt this week becomes the week everything after it is read against.';
  }
  const delta = depth - bestWeekDepth;
  if (delta > 0) {
    return `That is ${signedSegments(delta)} past your deepest week.`;
  }
  if (delta === 0) {
    return 'That is level with your deepest week.';
  }
  return `Your deepest week stands at ${segments(bestWeekDepth)}; this week is ${segments(
    Math.abs(delta)
  )} shy of it, with the week still running.`;
}

export function SerpentWeekPanel({ panel, youPlayerId }: SerpentWeekPanelProps) {
  if (!panel.live || !panel.week) {
    return (
      <section className="panel-elevated p-6" data-testid="serpent-week-panel-off">
        <h2 className="heading-display text-2xl text-bone-white mb-1">The World Serpent</h2>
        <p className="text-beige/80 font-body">
          The Serpent is not surfacing yet. When it does, a hunt opens every Monday and
          every run you bank feeds it.
        </p>
        <p className="text-beige/60 text-sm font-body mt-2">
          Nothing is waiting on you in the meantime, and nothing you have earned is
          affected by this.
        </p>
      </section>
    );
  }

  const { week, you, clan } = panel;
  const modifier = week.modifiers[0] ?? null;

  return (
    <section className="panel-glow [--glow:#a855f7] p-6" data-testid="serpent-week-panel">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <IconSnake size={26} className="text-cosmic" />
          <h2 className="heading-display text-2xl text-bone-white">The World Serpent</h2>
        </div>
        <p className="text-beige/70 text-sm font-body mt-1">
          Week of {formatWeekStart(week.weekStart)}. It submerges Sunday midnight UTC and
          surfaces again on Monday.
        </p>
        {modifier && (
          <p className="text-beige text-sm font-body mt-2" data-testid="serpent-condition">
            <span className="label-arcade mr-2">This week&rsquo;s condition</span>
            <span className="font-display text-bone-white">{modifier.name}</span>
            <span className="text-beige/70"> — {modifier.effect}</span>
          </p>
        )}
      </header>

      {/* §7.3, first: you against your own best week. */}
      <div
        className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4 mb-4"
        data-testid="serpent-you"
      >
        <p className="label-arcade">Your Depth this week</p>
        <p className="text-3xl font-display text-bone-white">{segments(you.depth)}</p>
        <p className="text-beige/80 text-sm font-body mt-1">
          {deltaSentence(you.depth, you.bestWeekDepth)}
        </p>
        <p className="text-beige/60 text-xs font-body mt-2">
          Your best {you.countedRuns} runs of the week feed the hunt, so a deeper week
          comes from a better run rather than more of them. You have banked{' '}
          {you.attempts} {you.attempts === 1 ? 'run' : 'runs'} into this week so far.
          Serpent runs cost no charge.
        </p>
        <p className="text-beige/60 text-xs font-body mt-1">
          Lifetime Depth {segments(you.lifetimeDepth)} — it only ever goes up.
        </p>
      </div>

      {/* §7.3, second: the clan against its own best week. */}
      {clan ? (
        <div
          className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4"
          data-testid="serpent-clan"
        >
          <p className="label-arcade flex items-center gap-2">
            <IconShield size={12} />
            {clan.name}
            {clan.tag ? ` [${clan.tag}]` : ''}
          </p>
          <p className="text-2xl font-display text-bone-white">{segments(clan.depth)}</p>
          <p className="text-beige/80 text-sm font-body mt-1">
            {clan.memberCount === 1
              ? 'A clan of one is a clan: it hunts every week, it holds its own records, and it is paired the week a matching clan exists.'
              : `${clan.memberCount} members hunting together. Every segment from every member is in this number.`}
          </p>
          <p className="text-beige/70 text-sm font-body mt-1">
            {clan.bestWeekDepth > 0
              ? `Its deepest week so far is ${segments(clan.bestWeekDepth)}.`
              : 'This is its first week on the hunt.'}
          </p>
          <div className="mt-3">
            <ContributionList
              members={clan.members}
              hiddenMembers={clan.hiddenMembers}
              memberCount={clan.memberCount}
              youPlayerId={youPlayerId}
            />
          </div>
          <p className="mt-3">
            <Link
              href="/clan"
              className="text-cosmic-glow hover:text-bone-white font-body text-sm transition-colors"
            >
              Open the clan hunt →
            </Link>
          </p>
        </div>
      ) : (
        <div
          className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4"
          data-testid="serpent-no-clan"
        >
          <p className="text-beige/80 font-body text-sm">
            You are hunting on your own. Everything above already counts — a clan adds a
            second Depth alongside yours, and a rival on the weeks a matching clan exists.
          </p>
          <p className="mt-2">
            <Link
              href="/clan"
              className="text-cosmic-glow hover:text-bone-white font-body text-sm transition-colors"
            >
              Found a clan, or join one with an invite →
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

export default SerpentWeekPanel;
