'use client';

import Link from 'next/link';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { IconBolt, IconDna, IconGear, IconShield } from '@/components/ui/icons';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import { formatAmount } from '@/shared/format/amount';

/**
 * The mobile header is a symmetric three-column grid: an empty rail, the
 * centered identity stack, and the Settings hit target. Keeping these values
 * in the same module as the rendered grid lets the narrow-viewport regression
 * prove the real geometry rather than approximate text widths in jsdom.
 */
export const HOME_HEADER_GRID = Object.freeze({
  outerPaddingPx: 12,
  sideRailPx: 44,
  columnGapPx: 8,
});

export function homeHeaderGridGeometry(viewportWidth: number) {
  const width = Number.isFinite(viewportWidth)
    ? Math.max(0, Math.floor(viewportWidth))
    : 0;
  const { outerPaddingPx, sideRailPx, columnGapPx } = HOME_HEADER_GRID;
  const identityLeft = outerPaddingPx + sideRailPx + columnGapPx;
  const settingsLeft = Math.max(0, width - outerPaddingPx - sideRailPx);
  const identityRight = Math.max(identityLeft, settingsLeft - columnGapPx);
  return {
    identityLeft,
    identityRight,
    identityWidth: Math.max(0, identityRight - identityLeft),
    settingsLeft,
    settingsRight: Math.max(settingsLeft, width - outerPaddingPx),
  };
}

const HOME_HEADER_GRID_STYLE = {
  paddingLeft: HOME_HEADER_GRID.outerPaddingPx,
  paddingRight: HOME_HEADER_GRID.outerPaddingPx,
  columnGap: HOME_HEADER_GRID.columnGapPx,
  gridTemplateColumns:
    `${HOME_HEADER_GRID.sideRailPx}px minmax(0, 1fr) ${HOME_HEADER_GRID.sideRailPx}px`,
};

/**
 * THE WORDMARK (owner: bigger, moved down off the top edge, and drawn - but
 * SHARP).
 *
 * The first pass chased "sketchy" with an SVG turbulence displacement on the
 * glyph contour and was rejected as "unprofessional and cheap". That was the
 * right call and it is worth stating the principle it establishes, because the
 * temptation recurs: a hand-lettered logo does not read as hand-lettered
 * because its edges are degraded. It reads that way because its letters have
 * CHARACTER - they vary in weight, in size, and in how they sit on the line -
 * while every edge stays perfectly crisp. Roughness is a reproduction fault
 * pretending to be craft. There is no filter here, and there must not be one.
 *
 * So the variation below is deliberately small and structural: a fraction of a
 * degree of tilt, a hair of baseline bounce, and a few percent of size. Enough
 * that no two letters sit identically, never enough to look unsteady.
 *
 * The table is fixed rather than `Math.random()`, and that is a decision, not a
 * shortcut. A random wordmark re-letters itself on every render and every
 * hydration, which reads as a rendering fault. A hand-lettered logo is drawn
 * ONCE and then it is the logo. These values are the drawing.
 *
 * Rotations are degrees, `shift` is `em` so the bounce scales with the type - a
 * fixed pixel shift would be a wobble at 72px and a collapse at 36px - and
 * `size` is a transform scale, which does not disturb layout, so the letters
 * vary while the spacing stays even.
 */
const WORDMARK = 'SUPASNAKE';

const WORDMARK_CHARACTER: readonly {
  rotate: number;
  shift: number;
  size: number;
}[] = [
  { rotate: 1.0, shift: -0.014, size: 1.03 },
  { rotate: -1.2, shift: 0.012, size: 0.98 },
  { rotate: 0.6, shift: -0.006, size: 1.01 },
  { rotate: -0.8, shift: 0.016, size: 0.97 },
  { rotate: 1.2, shift: -0.01, size: 1.04 },
  { rotate: -0.5, shift: 0.008, size: 0.99 },
  { rotate: 0.9, shift: -0.015, size: 1.02 },
  { rotate: -1.1, shift: 0.006, size: 0.98 },
  { rotate: 0.5, shift: -0.012, size: 1.03 },
];

export interface HomeSpecimenIdentity {
  variantName: string;
  generation: number;
  lineageStrain: StrainId | null;
}

export interface HomeClanIdentity {
  name: string;
  tag: string | null;
}

export interface HomeWalletEnergy {
  available: number;
  capacity: number;
  visible: boolean;
}

interface HomeIdentityHudProps {
  specimen: HomeSpecimenIdentity | null;
  clan: HomeClanIdentity | null;
  authenticated: boolean;
  dna: number | null;
  energy: HomeWalletEnergy | null;
}

/**
 * Server-fed identity hierarchy over the Specimen Chamber. Missing data stays
 * absent or uses a loading dash; this surface never invents a snake, clan, or
 * economy value while the authoritative request is pending.
 */
export function HomeIdentityHud({
  specimen,
  clan,
  authenticated,
  dna,
  energy,
}: HomeIdentityHudProps) {
  const specimenLabel = specimen
    ? `${specimen.variantName} · Gen ${specimen.generation}`
    : null;
  const clanLabel = clan
    ? `Clan ${clan.name}${clan.tag ? `, ${clan.tag}` : ''}`
    : null;

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-10 grid pt-[max(1rem,env(safe-area-inset-top,0px))] text-center sm:pt-5"
      style={HOME_HEADER_GRID_STYLE}
      data-home-identity-hud
    >
      <div className="col-start-2 row-start-1 mx-auto flex w-full min-w-0 flex-col items-center">
        {/* Bigger, and pushed clear of the top edge into the chamber's open
            paper. The accent glow is gone with the dark room that justified
            it - on a near-white sweep a warm glow is invisible, and the ink
            stroke is what separates the wordmark from the page now. The tilt
            stays at the established -2 degrees; the per-letter character
            turns against it so the line reads as lettered, not as rotated. */}
        <h1 className="heading-display heading-lettered mt-10 -rotate-[2deg] text-4xl text-venom-orange sm:mt-14 sm:text-6xl lg:text-7xl">
          {/* The accessible wordmark. The visible letters are per-glyph spans
              and therefore have no single text node to announce, so the name
              is carried here - and it is the ONE place the wordmark exists as
              a string, which is also what keeps it findable by name. */}
          <span className="sr-only">SUPASNAKE</span>
          <span aria-hidden="true">
            {WORDMARK.split('').map((glyph, index) => {
              const { rotate, shift, size } = WORDMARK_CHARACTER[index];
              return (
                <span
                  key={`${glyph}-${index}`}
                  className="inline-block"
                  style={{
                    // Scaled from the baseline, so a larger letter grows
                    // upward instead of sinking through the line.
                    transformOrigin: '50% 100%',
                    transform: `rotate(${rotate}deg) translateY(${shift}em) scale(${size})`,
                  }}
                >
                  {glyph}
                </span>
              );
            })}
          </span>
        </h1>

        {specimen ? (
          <p
            className="mt-2 flex w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap font-display text-xs uppercase text-bone-white text-glow sm:text-base"
            aria-label={specimenLabel ?? undefined}
            title={specimenLabel ?? undefined}
            data-testid="home-specimen-identity"
          >
            {specimen.lineageStrain ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 [&_svg]:h-full [&_svg]:w-full"
                style={{ color: STRAINS[specimen.lineageStrain].color }}
                title={`${STRAINS[specimen.lineageStrain].name} Genome lineage`}
                aria-hidden="true"
                data-testid="home-lineage-rune"
              >
                <StrainGlyph id={specimen.lineageStrain} />
              </span>
            ) : null}
            <span className="min-w-0 truncate" data-testid="home-specimen-name">
              {specimen.variantName}
            </span>
            <span className="shrink-0" data-testid="home-specimen-generation">
              {' '}· Gen {specimen.generation}
            </span>
          </p>
        ) : null}

        {clan ? (
          <Link
            href="/clan"
            className="pointer-events-auto mt-1 inline-flex min-h-5 min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-rarity-legendary transition-colors hover:text-rarity-legendary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rarity-legendary"
            aria-label={clanLabel ?? undefined}
            title={clanLabel ?? undefined}
            data-testid="home-clan-identity"
          >
            <IconShield size={13} className="shrink-0" />
            <span
              className="min-w-0 truncate whitespace-nowrap font-body text-[10px] font-bold uppercase tracking-[0.1em]"
              data-testid="home-clan-name"
            >
              {clan.name}
            </span>
          </Link>
        ) : null}

        {authenticated ? (
        <div
          className="pointer-events-auto mx-auto mt-2 inline-flex min-h-9 items-center overflow-hidden rounded-full border border-scale-blue-light/40 bg-void-deep/55 px-3 shadow-panel backdrop-blur-sm"
          aria-label={`Wallet: ${dna === null ? 'DNA loading' : `${formatAmount(dna)} DNA`}${energy?.visible ? ` and ${energy.available} of ${energy.capacity} Energy` : ''}`}
          data-testid="home-wallet"
        >
          <span className="inline-flex items-center gap-1.5" title="DNA">
            <IconDna size={14} className="text-rarity-uncommon" />
            <span className="font-mono text-[10px] font-bold text-bone-white">
              {dna === null ? '—' : formatAmount(dna)}
            </span>
          </span>
          {energy?.visible ? (
            <>
              <span className="mx-2 h-4 w-px bg-scale-blue-light/55" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5" title="Recovered Energy">
                <IconBolt size={14} className="text-venom-orange" />
                <span className="font-mono text-[10px] font-bold text-bone-white">
                  {energy.available}/{energy.capacity}
                </span>
              </span>
            </>
          ) : null}
        </div>
        ) : null}
      </div>

      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="pointer-events-auto col-start-3 row-start-1 inline-flex h-11 w-11 items-center justify-center justify-self-end self-start rounded-full text-beige/55 transition-[color,background-color] hover:bg-scale-blue/25 hover:text-venom-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
        data-testid="home-settings"
      >
        <IconGear size={18} />
      </Link>
    </header>
  );
}

export default HomeIdentityHud;
