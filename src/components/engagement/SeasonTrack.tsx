'use client';

/**
 * Season Track (Constitution v1.6 §7.2) - a read-only view of the legacy
 * seasonal chapter. Milestones grant cosmetics and titles, and reached
 * entitlements are secured automatically by server authority. Seasons add
 * and never wipe.
 *
 * SupaSnake Premium (migration 028): premium tiers (cosmetics only)
 * render in the same list - entitled while subscribed (or when this season
 * was locked in while subscribed), locked with a shop hint otherwise.
 *
 * Rendered as a modal in the shared overlay pattern (previously shared with
 * the contracts board, retired by WP-1.03 §12.2); data comes from the
 * read-only GET /api/season endpoint. Daily Take is the only literal Collect
 * action; this surface never creates a second reward inbox.
 */

import Link from 'next/link';
import { IconCrown, IconTrophy, IconX } from '@/components/ui/icons';

export interface SeasonView {
  seq: number;
  name: string;
  theme: string;
  week: number;
  weeks: number;
  playoff_phase: 'none' | 'quarterfinal' | 'championship';
  /** Genome alias supplied by /api/season; absent on older deployments. */
  genes?: Array<{ id: string; name: string }>;
}

export interface SeasonTierView {
  level: number;
  /** Absent pre-migration-028 (free tiers only). */
  is_premium?: boolean;
  reward_type: string;
  reward_id: string | null;
  reward_amount: number | null;
  claimed: boolean;
}

export interface SeasonTrackView {
  xp: number;
  level: number;
  max_level: number;
  xp_per_level: number;
  /** Absent pre-migration-028. */
  premium?: { is_premium: boolean; season_locked_in: boolean } | null;
  tiers: SeasonTierView[];
}

/** Human label for a tier reward. */
export function tierRewardLabel(tier: SeasonTierView): string {
  if (tier.reward_type === 'title') return 'Title';
  if (tier.reward_type === 'cosmetic') {
    // solstice_trail_1 -> "Solstice Trail 1"
    return (tier.reward_id ?? 'Cosmetic')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return tier.reward_type.toUpperCase();
}

interface SeasonTrackProps {
  isVisible: boolean;
  season: SeasonView;
  track: SeasonTrackView;
  onDismiss: () => void;
}

export function SeasonTrack({
  isVisible,
  season,
  track,
  onDismiss,
}: SeasonTrackProps) {
  if (!isVisible) return null;

  const intoLevel = track.level > 0 ? track.xp % track.xp_per_level : track.xp;
  const levelDone = track.level >= track.max_level;
  const progressPct = levelDone
    ? 100
    : Math.min(100, Math.round((intoLevel / track.xp_per_level) * 100));

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-testid="season-track"
        className="panel-glow modal-frame modal-tray-narrow animate-pop-in p-6 max-h-[90vh] overflow-y-auto"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
        {/* X-CLOSE DISCIPLINE (owner ruling): this is an INFO/BROWSE surface -
            nothing is pending, nothing is spent - so it gets the X. Decision
            modals deliberately have none, because there the decline IS the
            close and an X would be a fourth, unlabelled answer. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close season track"
            className="-m-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-beige/60 transition-colors hover:bg-bone-white/10 hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
          >
            <IconX size={20} />
          </button>
        </div>
        <div className="text-center mb-4">
          <IconTrophy size={44} className="mx-auto mb-3 text-venom-orange" />
          <h2 className="heading-display text-2xl text-bone-white mb-1">
            {season.name}
          </h2>
          <p className="text-beige/70 text-sm font-body" data-testid="season-week-line">
            Week {season.week} of {season.weeks}
            {season.playoff_phase !== 'none' && (
              <>
                {' '}
                &middot;{' '}
                <span className="text-venom-orange">
                  {season.playoff_phase === 'quarterfinal'
                    ? 'Playoffs: quarterfinals'
                    : 'Playoffs: championship week'}
                </span>
              </>
            )}
          </p>
        </div>

        {season.genes && season.genes.length > 0 && (
          <div className="mb-4 text-center" data-testid="season-genes">
            <p className="label-arcade mb-2">Season Genes</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {season.genes.map((gene) => (
                <span
                  key={gene.id}
                  className="rounded-arcade border border-cosmic/50 bg-cosmic/10 px-2 py-1 text-xs font-body text-cosmic"
                >
                  {gene.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Track progress: server-owned level + XP history. */}
        <div className="mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-sm font-body">
            <span className="text-bone-white font-bold" data-testid="season-level">
              Level {track.level}
              <span className="text-beige/50 font-normal"> / {track.max_level}</span>
            </span>
            <span className="text-beige/60 text-xs">
              {levelDone ? 'Track complete' : `${intoLevel} / ${track.xp_per_level} XP`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-void border border-scale-blue-light/40 overflow-hidden">
            <div
              className="h-full bg-cyber transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-beige/50 text-xs font-body">
            Reached milestones are secured automatically
          </p>
        </div>

        {/* Milestones (free + premium tiers in one list) */}
        <div className="space-y-2 mb-5">
          {track.tiers.map((tier) => {
            const isPremiumTier = tier.is_premium === true;
            const entitled =
              !isPremiumTier ||
              track.premium?.is_premium === true ||
              track.premium?.season_locked_in === true;
            const reached = track.level >= tier.level;
            // A reached, entitled but not-yet-reflected row can appear briefly
            // while the server migration/settlement catches up. It is never a
            // client claim opportunity.
            const settling = reached && !tier.claimed && entitled;
            const testId = isPremiumTier
              ? `season-tier-${tier.level}-premium`
              : `season-tier-${tier.level}`;
            return (
              <div
                key={`${tier.level}-${isPremiumTier ? 'p' : 'f'}`}
                data-testid={testId}
                data-state={tier.claimed ? 'secured' : settling ? 'settling' : 'locked'}
                className={`flex items-center justify-between gap-3 rounded-arcade border px-3 py-2 ${
                  settling
                    ? isPremiumTier
                      ? 'border-amber-300 bg-amber-300/10'
                      : 'border-venom-orange bg-venom-orange/10'
                    : tier.claimed
                      ? 'border-rarity-uncommon/40 bg-void/40'
                      : 'border-scale-blue-light/30 bg-void/40 opacity-70'
                }`}
              >
                <div className="text-left">
                  <p className="text-xs font-body text-beige/50 flex items-center gap-1.5">
                    Level {tier.level}
                    {isPremiumTier && (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <IconCrown size={11} />
                        Premium
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-body text-bone-white">
                    {tierRewardLabel(tier)}
                  </p>
                </div>
                {tier.claimed ? (
                  <span className="text-rarity-uncommon text-xs font-body uppercase tracking-wide">
                    Secured
                  </span>
                ) : settling ? (
                  <span className="text-venom-orange text-xs font-body uppercase tracking-wide">
                    Securing…
                  </span>
                ) : isPremiumTier && !entitled ? (
                  <Link
                    href="/shop"
                    data-testid={`season-premium-upsell-${tier.level}`}
                    className="text-amber-300/80 hover:text-amber-300 text-xs font-body uppercase tracking-wide inline-flex items-center gap-1"
                  >
                    <IconCrown size={11} />
                    Premium
                  </Link>
                ) : (
                  <span className="text-beige/40 text-xs font-body uppercase tracking-wide">
                    Locked
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default SeasonTrack;
