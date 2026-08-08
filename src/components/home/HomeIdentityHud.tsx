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
 * THE WORDMARK, NOW AN ASSET.
 *
 * What used to live here was nine `<span>`s of Russo One and a frozen table of
 * per-letter rotation, baseline shift and scale. That table has not been
 * ported, and deleting it is the point rather than a side effect: it existed
 * only to give TYPE the character a drawn logo carries natively, and the mark
 * now carries it. The reasoning it was built on is intact and has simply moved
 * to where the drawing is - see `scripts/brand/markGeometry.mjs`, which keeps
 * the same refusals: the letters vary in size, weight and how they sit on the
 * line, every edge stays exact, there is no filter, and the variation is a
 * fixed table rather than `Math.random()` because a logo is drawn ONCE and then
 * it is the logo.
 *
 * THE LOCKED GEOMETRY SURVIVES, AND THIS IS THE PROOF.
 *
 * The ruling this replaces locked the wordmark's tilt, its top margin and its
 * three size steps. Those are still on the `<h1>` below, verbatim and
 * unedited - `mt-10 -rotate-[2deg] text-4xl sm:mt-14 sm:text-6xl lg:text-7xl`.
 * The mark is then sized in `em`, so the SAME font-size that used to set the
 * type now sets the image, and the box cannot drift from the ruling without the
 * ruling itself being edited.
 *
 * `WIDTH_EM` is measured, not chosen. The old wordmark was rendered in Chromium
 * at all three breakpoints and its width divided by its font-size:
 *
 *     mobile   220.32px / 36px = 6.120
 *     tablet   367.25px / 60px = 6.120
 *     desktop  440.66px / 72px = 6.120
 *
 * A single ratio at every step, because the type scaled linearly. Setting the
 * mark to 6.12em therefore reproduces the old footprint exactly: 220px, 367px
 * and 441px. `mark.png` is 441px wide for that reason - 1x is the widest box
 * the mark ever occupies, so the desktop hero is served at native resolution.
 *
 * The mark is TALLER than the type it replaces (159px against 102px at the
 * desktop step) and that is correct: the extra height is the purple shape, and
 * the LETTERING inside it lands at roughly the cap height the type had.
 * Matching the outer heights instead would have shrunk the letters by a third.
 * The height is READ OFF the emitted file rather than chosen - the mark's
 * aspect is a property of the drawing, so `build-brand-assets.mjs` decides it
 * and this constant follows. It moved from 158 when the mark's frame was made
 * to measure the torn shape's REAL reach rather than the untorn shape it was
 * traced from; the drawing did not change, its margin did.
 */
export const HOME_WORDMARK = Object.freeze({
  /** Measured from the ruling's own geometry; see above. */
  widthEm: 6.12,
  /** Intrinsic size of the 1x delivery, for aspect-ratio and CLS. */
  intrinsicWidth: 441,
  intrinsicHeight: 159,
});

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
            room. The tilt stays at the established -2 degrees; the per-letter
            character turns against it so the line reads as lettered, not as
            rotated.

            NOTHING HERE MOVED WITH THE GROUND, and that is the point. The
            note this replaces argued that the accent glow could go because a
            warm glow is invisible on a near-white sweep — true then, and no
            longer the reason. The mark is a drawn IMAGE now, with its own
            purple field and its own ink edge baked into the artwork, so it
            carries its separation with it and owes the room nothing. It was
            designed on dark; on dark is where it sings. */}
        <h1 className="heading-display heading-lettered mt-10 -rotate-[2deg] text-4xl sm:mt-14 sm:text-6xl lg:text-7xl">
          {/* The accessible wordmark. The mark is an image with an empty alt,
              so the name has to be carried here - and with the lettering now
              drawn rather than typed, this is the ONLY place the wordmark
              exists as a string, which is what keeps the page findable by
              name. */}
          <span className="sr-only">SUPASNAKE</span>
          {/* A <picture> with a pre-derived ladder rather than next/image: the
              1x/2x/3x PNG and WebP files are generated from the vector by
              `scripts/build-brand-assets.mjs` and committed, so the most
              requested image on the site costs no runtime transformation and
              renders identically everywhere. `max-w-full` is the only guard on
              the em box - it lets the mark scale down on a phone narrower than
              the 360px the 6.12em step assumes, instead of overflowing. */}
          <picture>
            <source
              type="image/webp"
              srcSet="/brand/mark.webp 1x, /brand/mark@2x.webp 2x, /brand/mark@3x.webp 3x"
            />
            <img
              src="/brand/mark.png"
              srcSet="/brand/mark.png 1x, /brand/mark@2x.png 2x, /brand/mark@3x.png 3x"
              alt=""
              aria-hidden="true"
              width={HOME_WORDMARK.intrinsicWidth}
              height={HOME_WORDMARK.intrinsicHeight}
              fetchPriority="high"
              decoding="async"
              className="block h-auto max-w-full"
              style={{ width: `${HOME_WORDMARK.widthEm}em` }}
            />
          </picture>
        </h1>

        {specimen ? (
          <p
            /* Sits on the room, not on a chip — so it follows the ground.
               See the mission line in `page.tsx` for the same move. */
            className="mt-2 flex w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap font-display text-xs uppercase text-bone-white sm:text-base"
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
            className="ink-chip brand-keyline pointer-events-auto mt-2 inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 overflow-hidden px-2.5 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
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
          className="ink-chip pointer-events-auto mx-auto mt-2 inline-flex min-h-9 items-center overflow-hidden px-3"
          aria-label={`Wallet: ${dna === null ? 'DNA loading' : `${formatAmount(dna)} DNA`}${energy?.visible ? ` and ${energy.available} of ${energy.capacity} Energy` : ''}`}
          data-testid="home-wallet"
        >
          <span className="inline-flex items-center gap-1.5" title="DNA">
            <IconDna size={14} className="text-[#1d6b3f]" />
            <span className="font-mono text-[10px] font-bold text-ink">
              {dna === null ? '—' : formatAmount(dna)}
            </span>
          </span>
          {energy?.visible ? (
            <>
              <span className="mx-2 h-4 w-[length:var(--ink-w-1)] bg-ink" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5" title="Recovered Energy">
                <IconBolt size={14} className="text-venom-orange-dark" />
                <span className="font-mono text-[10px] font-bold text-ink">
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
        /* A control, so it wears the Mark's keyline like the rail does. The
           wallet readout above deliberately does not: it is a <div>, it cannot
           be pressed, and the loudest edge on the page must not promise an
           action that does not exist. */
        className="ink-chip brand-keyline pointer-events-auto col-start-3 row-start-1 inline-flex h-11 w-11 items-center justify-center justify-self-end self-start text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
        data-testid="home-settings"
      >
        <IconGear size={18} />
      </Link>
    </header>
  );
}

export default HomeIdentityHud;
