'use client';

/**
 * PlayerCard - THE identity render (Player Identity v1 section 4).
 * One component, one read path (player_identity_view shapes), every
 * competitive surface. Three variants:
 *
 * - row:  one line - avatar chip, handle, title (dimmed), clan tag, top
 *         badge. Dense lists: leaderboards, contributor tables.
 * - card: banner backdrop, framed avatar, handle + title, 3 badges,
 *         clan tag, mastery pips. Moments of judgment (game-over,
 *         scouting).
 * - full: the profile header - card plus founder/tenure detail.
 *
 * Avatar = snake portrait (SnakeArt) in a dynasty-colored frame whose
 * treatment upgrades with THAT dynasty's mastery: M0-2 plain, M3-6
 * inlaid, M7-9 gilt, M10 animated. Founders get a ring on the frame.
 * Generated names render muted with a "claim" affordance for self
 * (section 3.3) - the name is a want, not a wall.
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import { IconCrown, IconEdit, IconEgg, IconMedal, IconSnake } from '@/components/ui/icons';
import type { BannerRender, IdentityBadge, PlayerIdentity } from '@/lib/identity/types';
import type { Rarity } from '@/shared/types/snake-data-model';

export type PlayerCardVariant = 'row' | 'card' | 'full';

export interface PlayerCardProps {
  identity: PlayerIdentity;
  variant?: PlayerCardVariant;
  /** Rendering the viewer's own card: enables the claim affordance. */
  isSelf?: boolean;
  /** Claim affordance handler (generated-name state, self only). */
  onClaim?: () => void;
  className?: string;
}

/** Rarity text tokens (tailwind rarity-* palette). */
const BADGE_RARITY_TEXT: Record<string, string> = {
  common: 'text-beige/80',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
};

/** Mastery-tiered avatar frame treatment (section 4.1). */
export function frameTierForLevel(level: number): 'plain' | 'inlaid' | 'gilt' | 'animated' {
  if (level >= 10) return 'animated';
  if (level >= 7) return 'gilt';
  if (level >= 3) return 'inlaid';
  return 'plain';
}

const FRAME_STYLE: Record<
  ReturnType<typeof frameTierForLevel>,
  { borderWidth: number; extraClass: string; gilt: boolean }
> = {
  plain: { borderWidth: 1, extraClass: '', gilt: false },
  inlaid: { borderWidth: 2, extraClass: '', gilt: false },
  gilt: { borderWidth: 2, extraClass: '', gilt: true },
  animated: { borderWidth: 2, extraClass: 'animate-glow-pulse', gilt: true },
};

/** Banner render JSONB -> CSS background (gradient family only in v1). */
export function bannerBackground(render: BannerRender | null | undefined): string {
  const from = render?.from ?? '#131a2a';
  const to = render?.to ?? '#0b0b12';
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

function dynastyPipLabel(dynasty: string): string {
  return dynasty.charAt(0).toUpperCase();
}

/** Snake-portrait avatar in a dynasty-colored, mastery-tiered frame. */
function Avatar({
  identity,
  size,
}: {
  identity: PlayerIdentity;
  size: number;
}): React.ReactElement {
  const dynasty = identity.avatar?.dynasty ?? 'COSMIC';
  const theme = dynastyThemes[dynasty] ?? dynastyThemes.CYBER;
  const level = identity.mastery[dynasty] ?? 0;
  const tier = frameTierForLevel(level);
  const frame = FRAME_STYLE[tier];
  const borderColor = frame.gilt ? '#fbbf24' : theme.glow;

  return (
    <div
      data-testid="player-card-avatar"
      data-frame-tier={tier}
      className={`relative rounded-arcade overflow-hidden shrink-0 ${frame.extraClass}`}
      style={{
        width: size,
        height: size,
        border: `${frame.borderWidth}px solid ${borderColor}`,
        boxShadow: frame.gilt
          ? `0 0 10px -2px ${borderColor}`
          : `0 0 8px -4px ${theme.glow}`,
        // Founder ring (section 4.1): tenure is unbuyable - the ring is
        // a second, offset outline on the avatar frame.
        ...(identity.isFounder
          ? { outline: '1px solid #fbbf24', outlineOffset: 2 }
          : {}),
      }}
      title={
        identity.avatar
          ? `${identity.avatar.variantName} — Gen ${identity.avatar.generation}`
          : 'No snake collected yet'
      }
    >
      {identity.avatar ? (
        <SnakeArt
          seed={identity.avatar.variantId}
          name={identity.avatar.variantName}
          dynasty={dynasty}
          primaryColor={theme.primary}
          secondaryColor={theme.secondary}
          rarity={identity.avatar.rarity as Rarity}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-void/80 flex items-center justify-center text-beige/50">
          <IconSnake size={Math.round(size * 0.55)} />
        </div>
      )}
    </div>
  );
}

function Badge({ badge, size = 13 }: { badge: IdentityBadge; size?: number }) {
  const isFounder = badge.id === 'badge_founder';
  return (
    <span
      data-testid="player-card-badge"
      title={badge.name}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-arcade border text-xs font-body ${
        BADGE_RARITY_TEXT[badge.rarity] ?? 'text-beige/80'
      } ${
        badge.rarity === 'legendary'
          ? 'border-rarity-legendary/60 bg-rarity-legendary/10'
          : 'border-scale-blue-light/50 bg-void/60'
      }`}
    >
      {isFounder ? <IconEgg size={size} /> : <IconMedal size={size} />}
      <span className="truncate max-w-[9rem]">{badge.name}</span>
    </span>
  );
}

function ClanTag({ tag }: { tag: string }) {
  return (
    <span
      data-testid="player-card-clan"
      className="font-body text-xs text-[#7df9ff] tracking-wider"
    >
      [{tag}]
    </span>
  );
}

function HandleText({
  identity,
  isSelf,
  onClaim,
  sizeClass,
}: {
  identity: PlayerIdentity;
  isSelf: boolean;
  onClaim?: () => void;
  sizeClass: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span
        data-testid="player-card-handle"
        className={`font-display truncate ${sizeClass} ${
          identity.isGenerated ? 'text-beige/50' : 'text-bone-white'
        }`}
      >
        {identity.displayHandle}
      </span>
      {identity.isGenerated && isSelf && onClaim && (
        <button
          onClick={onClaim}
          data-testid="player-card-claim"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-arcade border border-venom-orange/60 text-venom-orange text-xs font-body hover:bg-venom-orange/10 transition-colors min-h-0"
          title="Claim your handle"
        >
          <IconEdit size={12} />
          claim
        </button>
      )}
    </span>
  );
}

export function PlayerCard({
  identity,
  variant = 'card',
  isSelf = false,
  onClaim,
  className = '',
}: PlayerCardProps): React.ReactElement {
  if (variant === 'row') {
    const topBadge = identity.badges[0];
    return (
      <div
        data-testid="player-card"
        data-variant="row"
        className={`flex items-center gap-2 min-w-0 ${className}`}
      >
        <Avatar identity={identity} size={28} />
        <HandleText
          identity={identity}
          isSelf={isSelf}
          onClaim={onClaim}
          sizeClass="text-sm"
        />
        {identity.title && (
          <span
            data-testid="player-card-title"
            className="font-body text-xs text-beige/50 truncate hidden sm:inline"
          >
            {identity.title}
          </span>
        )}
        {identity.clanTag && <ClanTag tag={identity.clanTag} />}
        {topBadge && (
          <span className="hidden sm:inline-flex">
            <Badge badge={topBadge} size={12} />
          </span>
        )}
      </div>
    );
  }

  // card + full share the banner-backed body
  const masteryEntries = ['PRIMAL', 'CYBER', 'COSMIC']
    .map((dynasty) => ({ dynasty, level: identity.mastery[dynasty] ?? 0 }))
    .filter((entry) => entry.level > 0);

  return (
    <div
      data-testid="player-card"
      data-variant={variant}
      className={`panel relative overflow-hidden ${className}`}
    >
      {/* Banner backdrop (equipped banner render -> gradient) */}
      <div
        data-testid="player-card-banner"
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{ background: bannerBackground(identity.bannerRender) }}
      />
      <div className="relative p-4 flex items-start gap-4">
        <Avatar identity={identity} size={variant === 'full' ? 88 : 64} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <HandleText
              identity={identity}
              isSelf={isSelf}
              onClaim={onClaim}
              sizeClass={variant === 'full' ? 'text-2xl' : 'text-lg'}
            />
            {identity.clanTag && <ClanTag tag={identity.clanTag} />}
          </div>
          {identity.title ? (
            <p
              data-testid="player-card-title"
              className="font-body text-sm text-beige/70 flex items-center gap-1.5"
            >
              <IconCrown size={13} className="text-beige/50" />
              {identity.title}
            </p>
          ) : (
            identity.isGenerated && (
              <p className="font-body text-xs text-beige/40">
                Unnamed handler
              </p>
            )
          )}
          {identity.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {identity.badges.slice(0, 3).map((badge) => (
                <Badge key={badge.id} badge={badge} />
              ))}
            </div>
          )}
          {masteryEntries.length > 0 && (
            <div
              data-testid="player-card-mastery"
              className="flex gap-2 pt-1 font-body text-xs"
            >
              {masteryEntries.map(({ dynasty, level }) => (
                <span
                  key={dynasty}
                  className="px-1.5 py-0.5 rounded-arcade border border-scale-blue-light/40 bg-void/50 text-beige/80"
                  title={`${dynasty} mastery M${level}`}
                >
                  {dynastyPipLabel(dynasty)}
                  <span className="text-[#7df9ff] font-bold">{level}</span>
                </span>
              ))}
            </div>
          )}
          {variant === 'full' && identity.isFounder && (
            <p
              data-testid="player-card-founder"
              className="font-body text-xs text-rarity-legendary flex items-center gap-1.5 pt-1"
            >
              <IconEgg size={13} />
              Founding Handler — here before Season 1
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerCard;
