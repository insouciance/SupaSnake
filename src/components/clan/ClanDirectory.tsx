'use client';

/**
 * The clan directory (Constitution §9.2).
 *
 * The directory is deliberately short and alive: clans appear through a
 * current/recent Energy Battle or preserved Serpent history. Total-population
 * counts are never displayed anywhere.
 *
 * The server half already guarantees the first sentence — `GET
 * /api/clan?view=directory` returns alive clans and has no field for a total.
 * This component's job is to render that list without smuggling back in any of
 * the things the list was designed to avoid.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 *   No total. Not "12 clans hunting", not "showing 12 of N". A newcomer who is
 *   told how many clans exist has been told how small or how large they are
 *   against everyone, which is the comparison §9.2 removes.
 *   No Join button. Recruitment is the invite link; the directory exists so a
 *   newcomer sees a living world, not so clans can be walked into uninvited.
 *   No capacity ratio. "3/20 members" is a bar in the costume of a fraction,
 *   and a bar is what Rule 8 forbids. A row says how many people are in a
 *   clan, full stop — and at one member it says "1 member" without apology,
 *   because a clan of one is a clan and appears here on exactly the same terms
 *   as a clan of twenty.
 *   No ordering claim. The rows arrive in the server's order because a list has
 *   to arrive in some order; nothing is numbered, ranked or placed.
 *
 * THE EMPTY DIRECTORY IS A REAL STATE, NOT AN ERROR
 *
 *   Pre-launch, and on any week nothing has settled, this list is empty — and
 *   that is the state a solo player actually meets. It reads as an opening
 *   rather than a void: no clan has settled a hunt yet, and founding one puts
 *   the first name here. That is true, it costs nothing to act on, and it never
 *   suggests the player arrived too late.
 */

import Link from 'next/link';
import { formatWeekStart, segments } from '@/lib/serpent/briefing';
import { IconShield } from '@/components/ui/icons';

export interface ClanDirectoryRow {
  id: string;
  name: string;
  tag: string | null;
  memberCount: number;
  bestWeekDepth: number;
  lastHuntedWeek: string | null;
  lastHuntKind?: 'energy_battle' | 'legacy_week' | null;
}

export interface ClanDirectoryProps {
  clans: ClanDirectoryRow[];
  loading?: boolean;
}

export function ClanDirectory({ clans, loading = false }: ClanDirectoryProps) {
  return (
    <section className="animate-fade-up" data-testid="clan-directory">
      <h2 className="heading-display text-2xl text-bone-white mb-1">Clans in the hunt</h2>
      <p className="text-beige/60 text-sm font-body mb-4">
        Clans with a current or recent Serpent battle. A clan appears after its first
        banked contribution and is joined by invite rather than from this list.
      </p>

      {loading ? (
        <div className="text-center py-8" data-testid="clan-directory-loading">
          <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-beige font-body">Reading recent battles…</p>
        </div>
      ) : clans.length === 0 ? (
        <div className="panel p-8 text-center" data-testid="clan-directory-empty">
          <p className="text-beige font-body">
            No clan has banked a battle contribution yet. Found yours and be the first name here.
          </p>
          <p className="text-beige/60 font-body text-sm mt-2">
            A clan of one can enter every battle and hold its own records, so there is nothing
            here you are waiting on other people for.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clans.map((clan) => (
            <div
              key={clan.id}
              className="panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="directory-row"
            >
              <div>
                <div className="flex items-center gap-2">
                  <IconShield size={16} className="text-beige/70" />
                  <span className="font-display uppercase text-lg text-bone-white">
                    {clan.name}
                  </span>
                  {clan.tag && (
                    <span className="px-2 py-0.5 bg-void/60 border border-scale-blue-light/60 rounded-arcade text-xs font-display">
                      [{clan.tag}]
                    </span>
                  )}
                </div>
                <p className="text-xs text-beige/60 font-body mt-1">
                  {clan.memberCount} {clan.memberCount === 1 ? 'member' : 'members'} ·
                  deepest battle {segments(clan.bestWeekDepth)}
                </p>
              </div>

              {/* The most recent battle remains a linkable artifact. */}
              {clan.lastHuntedWeek && (
                <Link
                  href={
                    clan.lastHuntKind === 'energy_battle'
                      ? '/serpent'
                      : `/serpent?week=${clan.lastHuntedWeek}`
                  }
                  data-testid="directory-week-link"
                  className="text-cosmic-glow hover:text-bone-white font-body text-sm transition-colors"
                >
                  {clan.lastHuntKind === 'energy_battle' ? 'Current battle' : 'Archived week'}{' '}
                  · {formatWeekStart(clan.lastHuntedWeek)} →
                </Link>
              )}

              {/* No Join button, by design: see the header comment. */}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default ClanDirectory;
