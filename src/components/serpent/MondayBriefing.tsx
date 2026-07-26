'use client';

/**
 * The Monday briefing (Constitution §7.3).
 *
 * "Sunday midnight UTC it submerges, the hunt settles, and Monday's Signal
 * carries the result... The Monday briefing leads with you vs your best week,
 * then the clan vs its best week, then the rival comparison if one was paired."
 *
 * That order is this component, top to bottom, and each block stands alone: a
 * player with no clan gets the first block and a true sentence in place of the
 * second; a clan with no symmetric rival that week gets the first two and no
 * third, with no apology and no empty slot (§9.4 — "no symmetric rival this
 * week → no pairing, no shame").
 *
 * RULE 5 IS THE HARD CASE, SO IT IS THE ONE WRITTEN FIRST
 *
 *   The player who most needs a Monday briefing is the one who was not there.
 *   `defaultBriefingWeek()` is calendar-derived rather than read from their
 *   history precisely so that a player with no row for last week still gets
 *   last week's briefing. It tells them the week passed and that nothing of
 *   theirs moved: no decay, no debt, no backlog, their deepest week still
 *   standing at whatever it was. A missed week costs that week's opportunity
 *   and nothing else, and the copy says exactly that.
 *
 * EVERY WEEK HAS A URL (Rule 14)
 *
 *   `?week=YYYY-MM-DD` selects the week; the picker is a row of links, not a
 *   dropdown, so each one is copyable and a stranger opening it sees a real
 *   week. An unparseable or future key renders an honest "no such week" rather
 *   than silently falling back, because a wrong URL should say it is wrong.
 */

import Link from 'next/link';
import type { SerpentPanel } from '@/lib/server/serpent';
import type { ClanHuntRival } from '@/lib/server/clanHunt';
import {
  formatWeekStart,
  listBriefingWeeks,
  readWeekBriefing,
  segments,
  signedSegments,
} from '@/lib/serpent/briefing';

export interface MondayBriefingProps {
  panel: SerpentPanel;
  /** `?week=` from the URL. Falls back to the week that just submerged. */
  weekKey: string;
  /** The paired rival, when one existed for the week being read (§9.4). */
  rival?: ClanHuntRival | null;
  /** The week the rival belongs to, so a stale pairing is never mislabelled. */
  rivalWeekStart?: string | null;
  now?: number;
}

/** How the rival week is read once it settled. Never a grade, always a fact. */
export function rivalSentence(rival: ClanHuntRival): string {
  const both = `${segments(rival.yourDepth)} against ${segments(rival.theirDepth)}`;
  if (!rival.settled) {
    return `Paired with ${rival.name} — ${both} when the week was last read.`;
  }
  if (rival.outcome === 'won') {
    return `Paired with ${rival.name}: ${both}. The laurel is yours, and it stays yours.`;
  }
  if (rival.outcome === 'lost') {
    return `Paired with ${rival.name}: ${both}. The laurel went to them this week; nothing of yours moved with it.`;
  }
  return `Paired with ${rival.name}: ${both}. The week was level.`;
}

export function MondayBriefing({
  panel,
  weekKey,
  rival,
  rivalWeekStart,
  now = Date.now(),
}: MondayBriefingProps) {
  const briefing = readWeekBriefing(panel, weekKey, now);
  const weeks = listBriefingWeeks(panel, now);

  const picker = (
    <nav className="flex flex-wrap gap-2 mt-4" aria-label="Serpent weeks">
      {weeks.map((week) => (
        <Link
          key={week}
          href={`/serpent?week=${week}`}
          data-testid="briefing-week-link"
          aria-current={week === weekKey ? 'page' : undefined}
          className={`px-2.5 py-1 rounded-arcade border font-body text-xs transition-colors ${
            week === weekKey
              ? 'border-cosmic/70 bg-cosmic/20 text-cosmic-glow'
              : 'border-scale-blue-light/50 text-beige/70 hover:text-bone-white'
          }`}
        >
          {formatWeekStart(week)}
        </Link>
      ))}
    </nav>
  );

  if (!briefing) {
    return (
      <section className="panel-elevated p-6" data-testid="monday-briefing-unknown">
        <h2 className="heading-display text-2xl text-bone-white mb-1">Monday briefing</h2>
        <p className="text-beige/80 font-body">
          There is no Serpent week at <span className="font-display">{weekKey}</span>. Weeks
          start on a Monday, and a week that has not begun has nothing to report yet.
        </p>
        {picker}
      </section>
    );
  }

  return (
    <section className="panel-elevated p-6" data-testid="monday-briefing">
      <h2 className="heading-display text-2xl text-bone-white mb-1">Monday briefing</h2>
      <p className="text-beige/70 text-sm font-body">
        Week of {formatWeekStart(briefing.weekStart)}
        {briefing.modifier ? ` — ${briefing.modifier.name}` : ''}
        {briefing.submerged ? '. Submerged.' : '. Still running.'}
      </p>

      {/* First: you against your own best week. */}
      <div className="mt-4" data-testid="briefing-you">
        {briefing.hunted ? (
          <>
            <p className="text-2xl font-display text-bone-white">
              You fed {segments(briefing.yourDepth)}.
            </p>
            <p className="text-beige/80 font-body text-sm mt-1">
              {briefing.deepestYet
                ? briefing.priorBest > 0
                  ? `Deeper than any week before it, by ${signedSegments(
                      briefing.deltaVsPriorBest
                    )}. It stands as your deepest week.`
                  : 'Your first week on the hunt. It stands as your deepest week.'
                : `Your deepest week stands at ${segments(
                    briefing.priorBest
                  )}; this one read ${segments(briefing.yourDepth)}. Both weeks keep their place in your history.`}
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-display text-bone-white">
              You did not hunt this week.
            </p>
            <p className="text-beige/80 font-body text-sm mt-1">
              The week passed and its runs went with it. Nothing of yours went with them:
              your Depth, your records, your snakes and your lineage all stand exactly
              where you left them, and there is no catching up waiting for you.
            </p>
            {briefing.priorBest > 0 && (
              <p className="text-beige/70 font-body text-sm mt-1">
                Your deepest week still stands at {segments(briefing.priorBest)}.
              </p>
            )}
            <p className="text-beige/70 font-body text-sm mt-1">
              The Serpent surfaces again every Monday, and the next week is a fresh one.
            </p>
          </>
        )}
      </div>

      {/* Second: the clan against its own best week. */}
      <div className="mt-4" data-testid="briefing-clan">
        {briefing.clanDepth === null ? (
          <p className="text-beige/80 font-body text-sm">
            You hunted this week without a clan, so this week&rsquo;s Depth is yours alone.
          </p>
        ) : (
          <p className="text-beige/80 font-body text-sm">
            Your clan fed {segments(briefing.clanDepth)} that week — every member&rsquo;s
            segments added together, and nothing else.
          </p>
        )}
      </div>

      {/* Third, and only when it exists: the rival layer. */}
      <div className="mt-4" data-testid="briefing-rival">
        {rival && rivalWeekStart === briefing.weekStart ? (
          <p className="text-beige/80 font-body text-sm">{rivalSentence(rival)}</p>
        ) : (
          <p className="text-beige/60 font-body text-sm">
            No clan was matched to yours this week. The hunt reads against your own best
            week, which is the part that always works.
          </p>
        )}
      </div>

      {picker}
    </section>
  );
}

export default MondayBriefing;
