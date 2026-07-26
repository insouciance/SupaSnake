'use client';

/**
 * The clan hunt panel (Constitution §9.2–9.4, §7.3).
 *
 * This is the surface that stands where the deleted "Clan Energy Bonus" panel
 * used to: what a clan actually gives is the Serpent hunt, and this renders it
 * off `GET /api/clan/hunt`.
 *
 * THE STRUCTURE IS §9.4's ARGUMENT, IN ORDER
 *
 *   1. The primary block — the clan against its own best week. Self-referential,
 *      so it cannot walkover, cannot embarrass, and works at every population.
 *      It is rendered first and unconditionally, before the rival is even read.
 *   2. The additive contribution list — who fed the hunt, with no cut line, no
 *      minimum and no bar (§9.2, Rule 8).
 *   3. The rival layer — present only on the weeks a symmetric clan existed.
 *      When it is absent the panel says so in one calm sentence and moves on;
 *      an absent rival is a property of the week, not a shortfall of the clan.
 *
 * HOW THIS READS AT N = 1
 *
 *   A clan of one, in its first week, with no rival and nothing settled behind
 *   it, reads: "Your clan fed 0 segments" against a first week, "a clan of one
 *   is a clan" stating why that is complete, one contribution row (theirs), and
 *   "no clan was matched to yours this week". Four true statements and no empty
 *   shells. Every one of them stays true and keeps its meaning as members and
 *   weeks accumulate — the panel is designed at N=1 and scaled up, not the
 *   reverse.
 *
 * WHAT IS NOT HERE, AND WILL NOT BE (Rule 8)
 *
 *   No member is graded, ordered by position, or measured against another. No
 *   reward on this surface depends on anyone's number. There is no officer, so
 *   there is no lever, so there is no place to put one. And no commercial
 *   surface: this is navigation, and Rule 7 keeps the store in its district.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClanHuntPanel as ClanHuntPanelData } from '@/lib/server/clanHunt';
import { formatWeekStart, segments, signedSegments } from '@/lib/serpent/briefing';
import { ContributionList } from '@/components/serpent/ContributionList';
import { IconMedal, IconShield } from '@/components/ui/icons';

export interface ClanHuntPanelProps {
  accessToken?: string | null;
  /** Injected in tests and by any caller that already holds the payload. */
  data?: ClanHuntPanelData | null;
}

/** The clan against its own best week, stated so a first week reads too. */
export function primarySentence(
  depth: number,
  bestWeekDepth: number,
  isBestWeekSoFar: boolean
): string {
  if (bestWeekDepth <= 0) {
    return depth > 0
      ? 'This is the clan’s first week on the hunt, and it is already the week everything after it is read against.'
      : 'This is the clan’s first week on the hunt. Whatever it feeds becomes the week everything after it is read against.';
  }
  if (isBestWeekSoFar) {
    return `Deeper than any week the clan has had, by ${signedSegments(
      depth - bestWeekDepth
    )}.`;
  }
  const delta = bestWeekDepth - depth;
  if (delta === 0) {
    return 'Level with the clan’s deepest week.';
  }
  return `The clan’s deepest week stands at ${segments(
    bestWeekDepth
  )}; this week is ${segments(delta)} shy of it, with the week still running.`;
}

export function ClanHuntPanel({ accessToken, data }: ClanHuntPanelProps) {
  const [panel, setPanel] = useState<ClanHuntPanelData | null>(data ?? null);
  const [loaded, setLoaded] = useState(data !== undefined && data !== null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch('/api/clan/hunt', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        setLoaded(true);
        return;
      }
      const json = (await response.json()) as ClanHuntPanelData;
      setPanel(json);
      setLoaded(true);
    } catch {
      // The hunt is a reading, never a mutation. A failed read leaves the
      // panel absent rather than showing a number nobody can vouch for.
      setLoaded(true);
    }
  }, [accessToken]);

  useEffect(() => {
    if (data) return;
    void load();
  }, [data, load]);

  if (!loaded && !panel) return null;

  if (!panel || !panel.live) {
    return (
      <section className="panel-elevated p-6 mb-6" data-testid="clan-hunt-panel-off">
        <h3 className="heading-display text-xl text-bone-white mb-1">The weekly hunt</h3>
        <p className="text-beige/80 font-body text-sm">
          The World Serpent is not surfacing yet. When it does, this clan hunts it every
          week and its Depth is read against its own best week.
        </p>
      </section>
    );
  }

  const { clan, week, primary, members, hiddenMembers, rival, rivalry, laurels } = panel;
  const memberCount = clan?.memberCount ?? Math.max(members.length + hiddenMembers, 1);

  return (
    <section className="panel-glow [--glow:#a855f7] p-6 mb-6" data-testid="clan-hunt-panel">
      <header className="mb-4">
        <h3 className="heading-display text-xl text-bone-white flex items-center gap-2">
          <IconShield size={18} className="text-cosmic" />
          The weekly hunt
        </h3>
        {week && (
          <p className="text-beige/70 text-sm font-body mt-1">
            Week of {formatWeekStart(week.weekStart)} — it submerges Sunday midnight UTC.{' '}
            <Link
              href={`/serpent?week=${week.weekStart}`}
              className="text-cosmic-glow hover:text-bone-white transition-colors"
            >
              Open the Serpent week
            </Link>
          </p>
        )}
      </header>

      {/* 1. The self-referential primary — always, at every N. */}
      <div
        className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4"
        data-testid="clan-hunt-primary"
      >
        <p className="label-arcade">Clan Depth this week</p>
        <p className="text-3xl font-display text-bone-white">{segments(primary.depth)}</p>
        <p
          className="text-beige/80 text-sm font-body mt-1"
          data-testid="clan-hunt-primary-line"
        >
          {primarySentence(primary.depth, primary.bestWeekDepth, primary.isBestWeekSoFar)}
        </p>
        <p className="text-beige/60 text-xs font-body mt-2">
          {memberCount === 1
            ? 'A clan of one is a clan. It hunts every week, it holds its own records, and it is paired the week a matching clan exists.'
            : `${memberCount} members, and the clan's Depth is their segments added together.`}{' '}
          Lifetime Depth {segments(primary.lifetimeDepth)} — it only ever goes up.
        </p>
      </div>

      {/* 2. Additive contribution. */}
      <div className="mt-4">
        <ContributionList
          members={members}
          hiddenMembers={hiddenMembers}
          memberCount={memberCount}
        />
      </div>

      {/* 3. The rival layer, when the week has one. */}
      <div className="mt-4" data-testid="clan-hunt-rival">
        {rival ? (
          <div className="bg-void/60 border border-scale-blue-light/50 rounded-arcade p-4">
            <p className="label-arcade">
              Matched this week with {rival.name}
              {rival.tag ? ` [${rival.tag}]` : ''}
              {rival.standingRival ? ' — your standing rival' : ''}
            </p>
            <p className="text-bone-white font-display mt-1">
              {segments(rival.yourDepth)} against {segments(rival.theirDepth)}
            </p>
            <p className="text-beige/70 text-sm font-body mt-1">
              {rival.settled
                ? rival.outcome === 'won'
                  ? 'The laurel is yours, and it stays yours.'
                  : rival.outcome === 'lost'
                    ? 'The laurel went to them this week. Nothing of yours moved with it.'
                    : 'The week was level.'
                : 'Both clans are still hunting. Whatever happens here, your own best week is the reading that stands.'}
            </p>
            {rivalry && rivalry.meetings > 0 && (
              <p
                className="text-beige/60 text-xs font-body mt-2"
                data-testid="clan-hunt-rivalry"
              >
                {rivalry.meetings} {rivalry.meetings === 1 ? 'week' : 'weeks'} against them
                so far: {rivalry.wins} to you, {rivalry.losses} to them, {rivalry.draws}{' '}
                level.
                {rivalry.streakLength > 0 &&
                  ` ${rivalry.streakIsYours ? 'You have' : 'They have'} taken the last ${
                    rivalry.streakLength
                  } of them.`}
                {rivalry.closestMargin > 0 &&
                  ` The closest week came down to ${segments(rivalry.closestMargin)}.`}
              </p>
            )}
          </div>
        ) : (
          <p className="text-beige/60 text-sm font-body" data-testid="clan-hunt-no-rival">
            No clan was matched to yours this week. Pairing happens only when a clan of
            similar size and similar recent activity is hunting too — the hunt above
            resolves either way, which is the part that always works.
          </p>
        )}
      </div>

      {laurels > 0 && (
        <p
          className="text-beige/70 text-sm font-body mt-4 flex items-center gap-2"
          data-testid="clan-hunt-laurels"
        >
          <IconMedal size={14} className="text-venom-orange" />
          {laurels} {laurels === 1 ? 'laurel' : 'laurels'} in the clan&rsquo;s heraldry.
          Laurels are kept, never spent.
        </p>
      )}
    </section>
  );
}

export default ClanHuntPanel;
