'use client';

import Link from 'next/link';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { IconBolt, IconDna, IconGear, IconShield } from '@/components/ui/icons';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import { formatAmount } from '@/shared/format/amount';
import {
  HEADER_GLYPH_INK_15,
  HEADER_GLYPH_INK_18,
  HOME_RUNE_INK,
} from './homeGlyphInk';
import { SnakeCubeChrome, snakeCubeVars } from './SnakeCubeButton';
import type { DynastyId } from '@/shared/types/game';

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
 * `WIDTH_EM` WAS measured off the type this replaced - 220.32/36, 367.25/60 and
 * 440.66/72, a single 6.120 at every step because the type scaled linearly - and
 * that number is now SUPERSEDED. It reproduced the old wordmark's footprint
 * exactly, which was the right goal while the question was "does the drawing
 * fit where the type sat"; it is the wrong goal now that the owner has ruled on
 * the composition instead:
 *
 *     "The Mark should be at least as wide as the snake. i don't really like
 *      the proportions right now, so we have to improve that!"
 *
 * THE NEW NUMBER IS ALSO MEASURED, against the thing the rule names. The
 * creature's silhouette was measured off rendered frames at four viewports by
 * the same warm-pixel mask the axis work uses (`scripts/shoot-home-axis.mjs`) -
 * the Mark's own box excluded, so the two are never measuring each other:
 *
 *     viewport      mark 6.12em   creature   ratio
 *     1440            446px        468px     0.95
 *      768            372px        392px     0.95
 *      390            223px        232px     0.96
 *      320            194px        179px     1.09
 *
 * The Mark was NARROWER than the snake at every step except the one where it
 * had already run out of screen - which is exactly the complaint, arrived at
 * from the measurement rather than from the eye. 7.2em clears the rule with
 * room at every breakpoint (1.11, 1.10, 1.12, and 1.45 at 320 where the
 * creature is small because the camera has pulled back), and it is a SCALE of
 * the mount box: the drawing's aspect, its internal geometry and the family
 * derived from it are untouched, which is the half of the original lock that
 * still stands.
 *
 * `mark.png` is regenerated at the new 1x width for the same reason it was 441:
 * 1x must be the widest box the mark ever occupies, or the desktop hero is
 * served upscaled.
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
  /** Set from the snake-width rule; see above. */
  widthEm: 7.2,
  /** Intrinsic size of the 1x delivery, for aspect-ratio and CLS. */
  intrinsicWidth: 518,
  intrinsicHeight: 186,
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
  /** The creature in the chamber, so its cubes and the header's agree. */
  dynasty?: DynastyId;
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
  dynasty,
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
      {/* THE COLUMN TAKES ITS RAILS BACK ON A PHONE.

          The header is a symmetric three-column grid and the identity column is
          the middle one, so at 320 it is 192px wide against a 296px screen -
          which is why the Mark alone among the four breakpoints could not reach
          the width the snake rule asks for. Below `sm` the column spills back
          over both rails.

          It is safe because it is only HORIZONTAL room, and the two things
          living in those rails are pinned to the TOP: the wallet ends at 34px
          and the Settings cube at 60px, while the Mark starts at 72px
          (`mt-[4.5rem]`). The grid template is untouched, so the geometry
          contract the narrow-viewport regression measures still describes
          exactly what it did. */}
      <div className="col-start-2 row-start-1 mx-auto flex w-full min-w-0 flex-col items-center max-sm:-mx-[52px] max-sm:w-[calc(100%+104px)]">
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
        <h1 className="heading-display heading-lettered mt-[4.5rem] -rotate-[2deg] text-4xl sm:mt-14 sm:text-6xl lg:text-7xl">
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

        {/* ONE LINE, WITH ROOM BETWEEN THEM. (Owner ruling, 2026-08-08.)

              "keep the selected snake and the clan there, but in one line, not
               beneath each other, just make sure there's 'sensible' space
               between them."

            The two of them stacked was three rows of small type under the Mark
            and it read as a list of properties. Side by side they read as what
            they are: who this snake is, and who it runs with. The gap is a real
            gutter rather than a word space, and it grows with the viewport,
            because "sensible space" at 320 and at 1440 are not the same number.

            They wrap rather than crush at the narrowest widths — the pair is
            `flex-wrap`, so a long name and a long clan on a 320px phone become
            two lines instead of two ellipses. One line is the composition; two
            legible lines beat one unreadable one. */}
        {specimen || clan ? (
          <div
            className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-center gap-x-6 gap-y-1.5 sm:gap-x-10"
            data-testid="home-identity-row"
          >
            {specimen ? (
              <p
                /* Sits on the room, not on a cube — it is a readout, and the
                   cube is reserved for things you can press. */
                className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap font-display text-xs uppercase text-bone-white sm:text-base"
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
                    <StrainGlyph
                      id={specimen.lineageStrain}
                      weight={HOME_RUNE_INK}
                    />
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
              /* A CONTROL, so it is a segment of the snake — and only the cube
                 is. The clan's NAME stands beside it on the room, set exactly
                 like the specimen's name opposite, because the two halves of
                 this line are the same KIND of information and dressing one of
                 them in a chip would say they were not. What you press is the
                 cube; what you read is type. */
              <Link
                href="/clan"
                className="pointer-events-auto flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-bone-white"
                aria-label={clanLabel ?? undefined}
                title={clanLabel ?? undefined}
                data-testid="home-clan-identity"
              >
                <span
                  className="snake-cube h-9 w-9 shrink-0 sm:h-10 sm:w-10"
                  style={snakeCubeVars({ dynasty })}
                >
                  <SnakeCubeChrome
                    dynasty={dynasty}
                    glyphClassName="text-[color:var(--snake-ink)]"
                  >
                    <IconShield size={15} strokeWidth={HEADER_GLYPH_INK_15} />
                  </SnakeCubeChrome>
                </span>
                <span
                  className="min-w-0 truncate whitespace-nowrap font-display text-xs uppercase tracking-[0.06em] sm:text-base"
                  data-testid="home-clan-name"
                >
                  {clan.name}
                </span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* THE WALLET LEAVES THE CENTRE STACK. (Owner ruling, 2026-08-08: "try to
          place the wallet (DNA, Energy) somewhere else".)

          It sits at the top LEFT, opposite Settings, and the pairing is the
          argument for the position: the two corners of the header now carry one
          readout and one control, which is the same split the identity line
          below makes. It is off the Mark's axis, so the composition the round is
          rebalancing does not have to carry it, and it is where a currency
          readout is looked for.

          IT WEARS NOTHING. No cube, no chip, no fill, no contour — type and two
          glyphs, directly on the room, exactly like the mission line. That is
          not restraint, it is the rule: the cube means "this can be pressed",
          and the strongest way to keep that promise honest is that the one
          element on Home which cannot be pressed refuses every part of it.

          It overflows the 44px rail on purpose. The header's three-column
          geometry is a contract the narrow-viewport regression measures, and it
          is about where the IDENTITY column starts and ends; a display item
          allowed to spill leftward into its own margin does not move either
          edge, so the contract is untouched. */}
      {authenticated ? (
        <div
          className="col-start-1 row-start-1 flex w-max items-center gap-2 self-start justify-self-start pt-0.5"
          aria-label={`Wallet: ${dna === null ? 'DNA loading' : `${formatAmount(dna)} DNA`}${energy?.visible ? ` and ${energy.available} of ${energy.capacity} Energy` : ''}`}
          data-testid="home-wallet"
        >
          <span className="inline-flex items-center gap-1.5" title="DNA">
            <IconDna size={15} className="text-[#69d38d]" />
            <span className="font-mono text-[11px] font-bold text-bone-white">
              {dna === null ? '—' : formatAmount(dna)}
            </span>
          </span>
          {energy?.visible ? (
            <>
              <span
                className="h-3.5 w-[length:var(--ink-w-1)] bg-bone-white/40"
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1.5" title="Recovered Energy">
                <IconBolt size={15} className="text-venom-orange" />
                <span className="font-mono text-[11px] font-bold text-bone-white">
                  {energy.available}/{energy.capacity}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        /* A control, so it is a segment of the snake like everything else on
           Home that can be pressed. */
        className="snake-cube pointer-events-auto col-start-3 row-start-1 h-11 w-11 justify-self-end self-start"
        style={snakeCubeVars({ dynasty })}
        data-testid="home-settings"
      >
        <SnakeCubeChrome
          dynasty={dynasty}
          glyphClassName="text-[color:var(--snake-ink)]"
        >
          <IconGear size={18} strokeWidth={HEADER_GLYPH_INK_18} />
        </SnakeCubeChrome>
      </Link>
    </header>
  );
}

export default HomeIdentityHud;
