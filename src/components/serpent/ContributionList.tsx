'use client';

/**
 * Additive contribution display (Constitution §9.2, Rule 8).
 *
 * "Member contributions are visible — visibility *is* the witness mechanism —
 * but never with cut lines, never with required minimums, and rewards never
 * depend on intra-clan position. The display is additive ('Sans_Souci fed
 * 2,315 segments'), not evaluative."
 *
 * WHAT THIS COMPONENT DELIBERATELY DOES NOT RENDER
 *
 *   No position, ordinal, medal or place. The rows arrive sorted deepest-first
 *   because a list has to arrive in some order; nothing is numbered, nothing is
 *   highlighted for being first, and nothing is dimmed for being last.
 *   No bar, no percentage, no share-of-total. A proportion of the clan's Depth
 *   is a comparison between members wearing an arithmetic costume, and Rule 8
 *   forbids the comparison in either dress.
 *   No zero-state shaming. A member at 0 segments is a member who is here; the
 *   row reads "has not hunted yet this week", which is a fact about a week and
 *   not about a person.
 *
 * THE HIDDEN-MEMBER HONESTY PROBLEM
 *
 *   `hiddenMembers` counts roster members withheld from public listing by the
 *   cohort filter (§13 — dev and QA accounts stay out of public surfaces).
 *   Their segments are still inside the clan's Depth, because the Depth is the
 *   true sum over the full roster. So the visible rows can legitimately add up
 *   to less than the clan total, and a surface that stayed quiet about it would
 *   be showing arithmetic that looks broken.
 *
 *   The fix is to say so. When `hiddenMembers > 0` the list states how many
 *   names it is showing out of how many, and that the withheld segments are
 *   already inside the total above. The total is never adjusted down to match
 *   the visible rows — that would under-report a clan's real hunt, and Rule 6
 *   does not let a number a clan earned be quietly reduced for tidiness.
 */

import { segments } from '@/lib/serpent/briefing';
import { IconUser } from '@/components/ui/icons';

export interface ContributionMember {
  playerId: string;
  handle: string | null;
  depth: number;
  attempts: number;
}

export interface ContributionListProps {
  members: ContributionMember[];
  /** Members withheld from listing by the cohort filter (§13). */
  hiddenMembers: number;
  /** The full roster size, hidden members included. */
  memberCount: number;
  /** The player's own `players.id`, so their row can be named as theirs. */
  youPlayerId?: string | null;
}

function memberName(member: ContributionMember, isYou: boolean): string {
  if (isYou) return member.handle ? `${member.handle} (you)` : 'You';
  return member.handle ?? 'A handler';
}

export function ContributionList({
  members,
  hiddenMembers,
  memberCount,
  youPlayerId,
}: ContributionListProps) {
  const visible = members.length;

  return (
    <div data-testid="contribution-list">
      <p className="label-arcade mb-2">Who fed the hunt</p>

      {visible === 0 && hiddenMembers === 0 ? (
        <p className="text-beige/80 text-sm font-body" data-testid="contribution-empty">
          No runs are in this week yet. The first one to bank starts the hunt.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => {
            const isYou = Boolean(youPlayerId) && member.playerId === youPlayerId;
            return (
              <li
                key={member.playerId}
                data-testid="contribution-row"
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 bg-void/50 border border-scale-blue-light/40 rounded-arcade px-3 py-2"
              >
                <span className="flex items-center gap-2 font-body text-bone-white">
                  <IconUser size={12} className="text-beige/70" />
                  {memberName(member, isYou)}
                </span>
                <span className="font-display text-beige">
                  {member.depth > 0 ? (
                    <>
                      fed {segments(member.depth)}
                      {member.attempts > 0 && (
                        <span className="text-beige/60">
                          {' '}
                          over {member.attempts} {member.attempts === 1 ? 'run' : 'runs'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-beige/60">has not hunted yet this week</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenMembers > 0 && (
        <p
          className="text-beige/70 text-xs font-body mt-2"
          data-testid="hidden-members-note"
        >
          Showing {visible} of {memberCount} {memberCount === 1 ? 'member' : 'members'}.{' '}
          {hiddenMembers === 1 ? 'One member keeps' : `${hiddenMembers} members keep`} their
          name off public lists; their segments are already inside the clan&rsquo;s Depth
          above, so the rows here add up to less than the total on purpose.
        </p>
      )}
    </div>
  );
}

export default ContributionList;
