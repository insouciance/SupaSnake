'use client';

/**
 * Season Track (Design v2 §7.2) - the seasonal reward track carried by
 * the battle pass structure: contract completions feed ~150 XP each
 * (§7.3), milestones grant cosmetics and titles, the capstone
 * is a title. Seasons add and never wipe.
 *
 * SupaSnake Premium (migration 028): premium tiers (cosmetics only)
 * render in the same list - claimable while subscribed (or when this
 * season was locked in while subscribed), locked with a shop hint
 * otherwise. Entitlement is enforced server-side by claim_season_tier.
 *
 * Rendered as a modal in the shared overlay pattern (previously shared with
 * the contracts board, retired by WP-1.03 §12.2); data comes
 * from GET /api/season (fetched by the host page), claims go back through
 * the onClaim callback (POST /api/season { action: 'claim', level }).
 */

import { useState } from 'react';
import Link from 'next/link';
import { IconCrown, IconTrophy } from '@/components/ui/icons';

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
  onClaim: (level: number) => Promise<boolean>;
  onDismiss: () => void;
}

export function SeasonTrack({
  isVisible,
  season,
  track,
  onClaim,
  onDismiss,
}: SeasonTrackProps) {
  const [claimingLevel, setClaimingLevel] = useState<number | null>(null);

  if (!isVisible) return null;

  const intoLevel = track.level > 0 ? track.xp % track.xp_per_level : track.xp;
  const levelDone = track.level >= track.max_level;
  const progressPct = levelDone
    ? 100
    : Math.min(100, Math.round((intoLevel / track.xp_per_level) * 100));

  const handleClaim = async (level: number) => {
    if (claimingLevel !== null) return;
    setClaimingLevel(level);
    try {
      await onClaim(level);
    } finally {
      setClaimingLevel(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm">
      <div
        data-testid="season-track"
        className="panel-glow animate-pop-in p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
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

        {/* Track progress: level + XP bar (contracts feed it, §7.3) */}
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
            Contracts pay the track — 150 XP each
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
            const claimable = reached && !tier.claimed && entitled;
            const testId = isPremiumTier
              ? `season-tier-${tier.level}-premium`
              : `season-tier-${tier.level}`;
            return (
              <div
                key={`${tier.level}-${isPremiumTier ? 'p' : 'f'}`}
                data-testid={testId}
                data-state={tier.claimed ? 'claimed' : claimable ? 'claimable' : 'locked'}
                className={`flex items-center justify-between gap-3 rounded-arcade border px-3 py-2 ${
                  claimable
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
                    Claimed
                  </span>
                ) : claimable ? (
                  <button
                    onClick={() => handleClaim(tier.level)}
                    disabled={claimingLevel !== null}
                    data-testid={`season-claim-${tier.level}${isPremiumTier ? '-premium' : ''}`}
                    className="btn-go px-4 py-1.5 text-sm"
                  >
                    {claimingLevel === tier.level ? 'Claiming…' : 'Claim'}
                  </button>
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
