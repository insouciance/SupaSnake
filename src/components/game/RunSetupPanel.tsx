'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { formatAscendanceYieldMultiplier } from '@/shared/game/ascendance';
import type { StrainId } from '@/shared/game/strains';
import { IconPlay, IconSnake } from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { HOME_WORDMARK } from '@/components/home/HomeIdentityHud';
import { useDynastySnakePortraits } from '@/components/game/DynastySnakePortrait';
import { getDynastyScreenTokens } from '@/components/game/screen/gameScreenTokens';
import type { CosmeticLoadout } from '@/components/home/SnakeCosmetics';
import { EMPTY_SNAKE_LOADOUT } from '@/lib/cosmetics/snakeCosmetics';
import {
  SETUP_DYNASTIES,
  type SetupDynasty,
} from '@/components/game/SnakePickerSheet';

export interface RunSetupSnake {
  id?: string;
  name: string;
  generation: number;
  dynasty: string;
}

export interface RunSetupPanelProps {
  snake: RunSetupSnake | null;
  noSnakeAvailable: boolean;
  /** One line of what this dynasty's ruleset does — part of the pick, not a
   *  fourth element. */
  rulesetExplainer: string;
  startLabel: string;
  challengeNote?: string | null;
  startTestId: string;
  isStarting: boolean;
  onStart: () => void;
  onChooseSnake?: () => void;
  startError: string | null;
  /** The Energy Reactor. */
  energySelector?: ReactNode;
  /**
   * What THIS snake brings to the run — inherited traits and heirlooms.
   *
   * It is not a fourth element and it is not a setting: it is a property of
   * the snake in element (a), which is why it renders inside that section
   * rather than beside it. WP-2.07a's reasoning is the reason it survived the
   * cut at all — "a trait that removes every mutation food is something the
   * player has to know BEFORE pressing START" — and a surface that hides it
   * would be asking for a stake against unseen rules.
   */
  heirloom?: ReactNode;
  /** Exactly one setup dock per dynasty; null renders a deliberate pick slot. */
  favorites?: Partial<Record<SetupDynasty, RunSetupSnake | null>>;
  onFavoriteDock?: (
    dynasty: SetupDynasty,
    favorite: RunSetupSnake | null
  ) => void;
  favoriteBusyId?: string | null;
  /**
   * What the player's snake is WEARING, for the dock portraits only.
   *
   * This is the server's answer from `GET /api/player/cosmetics`, read on the
   * setup side as a pre-run PREVIEW. It must never reach `runCosmetics` or the
   * run itself: the look a run is played in comes from the session-start
   * manifest and nowhere else, so that a collection refresh landing mid-run
   * cannot undress the snake and a recovered run replays the look it actually
   * had (see the ruling at `src/app/game/page.tsx`'s `applyStartedRun`).
   * Setup is before the manifest exists, which is exactly why a preview is the
   * honest thing to show here and the only thing this prop may feed.
   */
  loadout?: CosmeticLoadout;
  /** Safe Lab doorway carrying only this unsent setup draft. */
  labHref?: string;
}

const DYNASTY_STRAIN: Record<SetupDynasty, StrainId> = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
};

/**
 * The dynasty's authored fill. These are the dynasty accents that already mean
 * something everywhere else in the product (`gameScreenTokens.ts`), spent as a
 * FILL rather than as a keyline — the same move the portal cards make. Each
 * carries the ink contour, so the hue never has to be legible as a line.
 */
const DYNASTY_FILL: Record<SetupDynasty, string> = {
  CYBER: '#0f5f74',
  PRIMAL: '#2f6b23',
  COSMIC: '#4b2f80',
};

/**
 * ONE STEP UP THE SAME HUE — the raised card (owner item 7, 2026-08-08).
 *
 * The fill ladder is how this product says "nearer": paper has four steps, the
 * deck has its own, and a surface rises by taking the next one, never by
 * gaining a glow or a keyline. The dynasty fills had exactly one step, so a
 * selected card had nowhere to rise TO — which is why selection used to be
 * expressed by swapping the hue out for ink entirely.
 *
 * These are the second rung of the same three hues: the identical colour,
 * lifted about a third in value. So a selected card is still unmistakably its
 * house — the accent stays spent as FILL — and the thing that changed is
 * ELEVATION, which is what "selected" means here.
 */
const DYNASTY_FILL_RAISED: Record<SetupDynasty, string> = {
  CYBER: '#157f9c',
  PRIMAL: '#3f902f',
  COSMIC: '#653fad',
};

function setupDynasty(value: string): SetupDynasty {
  const normalized = value.toUpperCase();
  return SETUP_DYNASTIES.find((dynasty) => dynasty === normalized) ?? 'PRIMAL';
}

/**
 * ELEMENT (a) — DYNASTY FAVORITES.
 *
 * One dock per dynasty, each holding the snake you last flew for that house.
 * Picking IS the whole snake choice: the dock is the control, not a preview of
 * a control that lives somewhere else. The released panel put a launch
 * portrait, a dynasty chip, a generation chip, a payout line and a "Change
 * snake" button ABOVE the favorites, so the same decision was offered twice in
 * two different shapes — the favorites are the survivor.
 *
 * ── TWO CONTROLS, TWO SIZES (owner item 7, 2026-08-08) ───────────────────
 *
 * The card used to carry two meanings on one target: tapping a house you were
 * NOT flying equipped it, and tapping the house you WERE flying opened the
 * picker. Same gesture, same pixels, two outcomes — a hidden second meaning,
 * and the kind a player only discovers by being surprised by it. So the two
 * are now two controls, sized by how often they are used:
 *
 *   THE CARD  — select this dynasty to play. The primary action, and it gets
 *               the whole card. Tapping the card you are already flying
 *               re-affirms it: the press physics fire and nothing else
 *               happens, because "no change" is the honest answer.
 *   CHANGE    — swap which snake this house carries. A small block chip, one
 *               tap, never hidden behind a hover or a long press. Rare for a
 *               player who has found their snake, frequent for one chasing
 *               heirlooms, so it is small AND always visible rather than
 *               either large or tucked away.
 *
 * They are SIBLINGS, not nested. A button inside a button is invalid HTML and
 * a screen reader will not expose the inner one at all, so the card cannot
 * wrap the chip however convenient that would be for layout.
 *
 * ── HOW "SELECTED" IS SAID ───────────────────────────────────────────────
 *
 * Three signals at once, all of them in the pattern language, none of them a
 * glow or a pale line:
 *
 *   CONTOUR    the card steps from the button weight to the tray weight
 *              (--ink-w-2 -> --ink-w-3). Only one card can carry it.
 *   BLOCK      a bigger displaced block (--ink-drop-2 -> -3): further off the
 *              tray, which is what elevation is here.
 *   FILL       one rung up the same hue's ladder. The house is still the
 *              house; it is nearer.
 *
 * HOVER DELIBERATELY MOVES NONE OF THEM. If hover grew the block it would
 * make an unselected card wear the selected card's signal for as long as a
 * pointer rested on it, which is exactly the ambiguity this is built to
 * refuse. Hover is a one-pixel lift and nothing more.
 */
function FavoriteDock({
  dynasty,
  favorite,
  selected,
  busy,
  portrait,
  onSelect,
  onChange,
}: {
  dynasty: SetupDynasty;
  favorite: RunSetupSnake | null;
  selected: boolean;
  busy: boolean;
  /** A PNG data URL of this dynasty's actual head, when one has been taken. */
  portrait?: string;
  /** Fly this dynasty. A no-op on the card already flying. */
  onSelect?: () => void;
  /** Open the picker for this dynasty's slot. */
  onChange?: () => void;
}) {
  return (
    <div className="relative flex min-w-0 flex-col">
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect || busy}
      aria-pressed={selected}
      aria-label={
        selected
          ? `Flying ${favorite?.name ?? dynasty}`
          : favorite
            ? `Fly ${dynasty} with ${favorite.name}, generation ${favorite.generation}`
            : `Choose a ${dynasty} favorite`
      }
      data-testid={`run-setup-favorite-${dynasty.toLowerCase()}`}
      /* `flex-1` is load-bearing, not tidying: the grid stretches all three
         wrappers to the tallest card, and a flex-column child does NOT grow on
         the main axis by default — so a card with one line of text sat short
         inside a full-height wrapper and its CHANGE chip, anchored to the
         wrapper's bottom, hung off the card entirely. */
      className={`relative flex min-h-[92px] w-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-card)] border-ink px-1.5 pb-[26px] pt-1.5 text-center text-bone-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-wait sm:min-h-[116px] sm:gap-1 sm:pb-[30px] sm:pt-2 ${
        selected
          ? 'border-[length:var(--ink-w-3)] shadow-[var(--ink-drop-3)]'
          : 'border-[length:var(--ink-w-2)] shadow-[var(--ink-drop-2)] hover:-translate-y-px'
      }`}
      style={{
        backgroundColor: selected
          ? DYNASTY_FILL_RAISED[dynasty]
          : DYNASTY_FILL[dynasty],
      }}
    >
      {/*
       * THE TILE CARRIES THE CREATURE (owner ruling, 2026-08-08).
       *
       * "should display the actual snake ... just the face almost from the
       *  front ... almost like a passport picture but at a small angle."
       *
       * So this is a photograph of the REAL head — the same GLB, the same
       * per-dynasty material, the same cosmetics the board and the chamber
       * draw — taken once on a hidden canvas and cached. The dynasty
       * difference is the snake's own colour, which is the owner's clause
       * verbatim; nothing here paints a swatch.
       *
       * The glyph is not a placeholder that failed. It is what the tile has
       * always shown, and it is what the tile shows again whenever a portrait
       * is not in hand — no WebGL, a missing model, a readback the browser
       * refuses, or simply the two frames before the picture exists. The
       * button is already fully labelled, so nothing is lost with it: a
       * player never sees an empty frame, and never waits on one.
       */}
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink text-ink ${
          portrait ? 'h-11 w-11 sm:h-14 sm:w-14' : 'h-7 w-7 p-1'
        }`}
        style={
          portrait
            ? {
                // The room the head stands in, as a token: the portrait is a
                // transparent PNG, so the ground is CSS and follows the page
                // rather than being baked into three captured images.
                backgroundColor: 'var(--fill-room-0)',
                /*
                 * THE HOUSE IS IN THE LAMP, NOT IN THE CREATURE.
                 *
                 * The owner's item 6 asked for "the snake color for the
                 * dynasties", and the shipped character law refuses it by
                 * name: `snake90s.ts` resolves EVERY dynasty's head through
                 * `forcedHeadBaseColor` (the ninetiesGuide profile), because
                 * "a snake that changes hue with its dynasty is a snake whose
                 * local colour is contaminated by its surroundings". So the
                 * three heads really are one amber creature — on the board
                 * too — and a portrait that tinted them would be the tile
                 * lying about the snake that is about to launch.
                 *
                 * The chamber already solved this: it spends the house colour
                 * on a RIM LIGHT, not on the fill. A rim would do nothing here
                 * — the face-keyed shader zeroes every light term — so the
                 * same idea is spent one step further out, as the pool the
                 * head is standing in. Same creature, three differently lit
                 * rooms. It costs no render, survives both flag legs, and is
                 * the chamber's own `keyColor` rather than a new swatch.
                 */
                /*
                 * Aimed at the RING, not at the middle. The head covers about
                 * seventy per cent of this square, so a pool that is brightest
                 * at the centre is a pool nobody ever sees — the colour has to
                 * peak where the silhouette ends. It reads as a lamp behind
                 * the creature, and it falls back to the room at the corners
                 * so the tile still has a dark frame.
                 */
                backgroundImage: `radial-gradient(circle at 50% 40%, transparent 44%, ${getDynastyScreenTokens(dynasty).primary}b3 74%, ${getDynastyScreenTokens(dynasty).primary}40 96%, transparent 100%)`,
              }
            : {
                backgroundColor: selected ? '#fffdf8' : 'rgba(255,253,248,0.85)',
              }
        }
      >
        {portrait ? (
          /* eslint-disable-next-line @next/next/no-img-element -- a data URL
             the client just produced; there is nothing for the image loader
             to optimise and a remote round trip would be a regression. */
          <img
            src={portrait}
            alt=""
            aria-hidden="true"
            decoding="async"
            data-testid={`run-setup-portrait-${dynasty.toLowerCase()}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
        )}
      </span>
      <span className="label-arcade block truncate text-[9px] text-bone-white/80">
        {dynasty}
      </span>
      {favorite ? (
        <span className="min-w-0">
          <span className="heading-display block truncate text-[11px] text-bone-white">
            {busy ? 'Equipping…' : favorite.name}
          </span>
          <span className="block truncate font-body text-[9px] text-bone-white/70">
            Gen {favorite.generation} · ×{formatAscendanceYieldMultiplier(favorite.generation)}
          </span>
        </span>
      ) : (
        <span className="block truncate font-body text-[10px] text-bone-white/80">
          Pick a favorite
        </span>
      )}
    </button>

      {/*
       * CHANGE — the secondary control, and a SIBLING of the card rather than
       * a child of it (a nested button is invalid HTML and invisible to a
       * screen reader). The positioning wrapper exists so the chip can be
       * centred without a `translate`: `.ink-chip` sets `transform` on hover
       * and on press, and a centring translate written on the same element
       * would be thrown away the moment a finger touched it.
       *
       * THE INK STAYS SMALL AND THE TARGET GETS BIG. The visible block is
       * about twenty pixels tall, which is the share of the tray the owner
       * asked for; the `after` pseudo-element is a transparent 44x44 square
       * anchored to the chip's own bottom edge, so the touch target meets the
       * floor by growing UPWARD into the card rather than by inflating the
       * drawn object or spilling onto the line below.
       */}
      <div className="pointer-events-none absolute inset-x-1 bottom-1 z-10 flex justify-center">
        <button
          type="button"
          onClick={onChange}
          disabled={!onChange || busy}
          aria-label={`Change the ${dynasty} snake`}
          data-testid={`run-setup-favorite-change-${dynasty.toLowerCase()}`}
          className="ink-chip pointer-events-auto relative inline-flex max-w-full items-center justify-center px-1.5 py-[3px] font-display text-[9px] uppercase leading-none tracking-[0.08em] text-ink after:absolute after:bottom-0 after:left-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-wait"
        >
          Change
        </button>
      </div>
    </div>
  );
}

/**
 * RUN SETUP — THREE ELEMENTS (owner structural ruling).
 *
 *   "Dynasty Favorites, Energy Reactor (zero is free play), and the Play
 *    button. Everything else is noise."
 *
 * What left, and where it went: the AIM system picker (to the Lab), the
 * ANOMALY entry (to Home, where a thing that is true for one week belongs),
 * the DIFFICULTY LADDER (gone). With them went the `<details>` "Tune run"
 * disclosure that hid them, the Earn/Free/Anomaly mode toggle — free play is
 * now the reactor at zero — the mission readouts, the mastery chip, the portal
 * rail, the heirloom summary and the duplicate launch portrait.
 *
 * ONE TRAY, ONE FRAME, re-expressed. The overlay's panel is the tray and
 * carries `.paper-tray`; this is a REGION inside it and draws no frame of its
 * own. The tray is PAPER, and that is the coherence claim of the whole path:
 * Home is a paper room, Setup is a panel printed on the same stock, and the
 * board is the dark place you go when you press Play. The player never crosses
 * a change of material except the one that means "the run has started".
 *
 * THE TAP LAW holds: Home's Play chip, then PLAY here. Setup adds exactly one
 * tap and a player who changes nothing never touches a third control.
 */
export function RunSetupPanel({
  snake,
  noSnakeAvailable,
  rulesetExplainer,
  startLabel,
  challengeNote,
  startTestId,
  isStarting,
  onStart,
  onChooseSnake,
  startError,
  energySelector,
  heirloom,
  favorites = {},
  onFavoriteDock,
  favoriteBusyId = null,
  loadout = EMPTY_SNAKE_LOADOUT,
  labHref = '/lab?returnTo=%2Fgame',
}: RunSetupPanelProps) {
  const selectedDynasty = snake ? setupDynasty(snake.dynasty) : null;
  /*
   * ONE canvas, THREE frames, then nothing — see `DynastySnakePortrait.tsx`
   * for why three live mini-canvases were ruled out before they were written.
   * The rig is mounted only while a portrait is still missing, and it lives
   * with the panel, so pressing PLAY releases its context before the board
   * asks for one.
   */
  const { portraits, captureCanvas } = useDynastySnakePortraits(loadout);

  const playButton = (
    <button
      type="button"
      onClick={onStart}
      disabled={isStarting || !snake}
      data-testid={startTestId}
      className="btn-go inline-flex min-h-[56px] w-full items-center justify-center gap-3 whitespace-nowrap px-4 py-2 text-lg sm:min-h-[76px] sm:py-3 sm:text-2xl"
    >
      <IconPlay size={26} className="shrink-0" />
      <span className="truncate">{isStarting ? 'Starting…' : startLabel}</span>
    </button>
  );

  return (
    <section
      className="relative mx-auto w-full min-w-0 p-0.5 text-center sm:p-2"
      data-testid="run-setup"
    >
      {captureCanvas}
      {/* The Mark, small, at the head of the tray. Setup is the one surface
          between the chamber and the board, and a printed panel is exactly
          where a logo belongs — it is what makes the tray read as a made
          object rather than a dialog. Sized off the same measured constant
          Home uses, so the two can never drift. */}
      {/* THE MARK, WHERE IT FITS — and the test is HEIGHT, not width.

          The owner's rule is "use it elsewhere if it fits". What it competes
          with is vertical room, so gating it on a width breakpoint would have
          dropped it from an ordinary 390x844 phone that has plenty of space
          while keeping it on a 900x400 landscape one that has none.

          Below 700px of viewport height the reactor is the element that must
          survive, and the wordmark is the only thing on this tray carrying no
          decision — and the player saw the Mark in the chamber two seconds
          ago, so hiding it there costs the brand nothing. */}
      <picture>
        <source
          type="image/webp"
          srcSet="/brand/mark.webp 1x, /brand/mark@2x.webp 2x, /brand/mark@3x.webp 3x"
        />
        <img
          src="/brand/mark.png"
          width={HOME_WORDMARK.intrinsicWidth}
          height={HOME_WORDMARK.intrinsicHeight}
          alt="SUPASNAKE"
          decoding="async"
          className="mx-auto mb-1 hidden w-[132px] max-w-full -rotate-[2deg] select-none [@media(min-height:700px)]:block sm:w-[168px]"
          data-testid="run-setup-mark"
        />
      </picture>

      {snake ? (
        <>
          {/* ---------- (a) DYNASTY FAVORITES ---------- */}
          <section aria-labelledby="run-favorites-title" className="mt-1 sm:mt-2">
            <p
              id="run-favorites-title"
              className="label-arcade text-[10px] text-ink/55"
            >
              Who is flying
            </p>
            <div
              className="mt-1 grid grid-cols-3 gap-1.5 sm:mt-1.5 sm:gap-2"
              data-testid="run-setup-favorites"
            >
              {SETUP_DYNASTIES.map((dynasty) => {
                const favorite = favorites[dynasty] ?? null;
                /*
                 * THE DOCK ALWAYS ANSWERS "WHO IS FLYING".
                 *
                 * Selection used to be `favorite.id === snake.id`, which is
                 * false in two ordinary situations - a player with no saved
                 * favorite yet, and a player flying a snake of that house that
                 * is not the saved one. In both, every dock rendered
                 * unselected and the panel silently stopped naming the snake
                 * about to launch. The flying DYNASTY is the equipped snake's,
                 * always, so that is what selects a dock; and the selected
                 * dock shows the equipped snake rather than the stored
                 * favorite, because the question this element answers is who
                 * is flying and not who is bookmarked.
                 */
                const flying = dynasty === selectedDynasty;
                const shown = flying ? snake : favorite;
                return (
                  <FavoriteDock
                    key={dynasty}
                    dynasty={dynasty}
                    favorite={shown}
                    selected={flying}
                    busy={favoriteBusyId !== null && favoriteBusyId === shown?.id}
                    portrait={portraits[dynasty]}
                    /*
                     * ONE GESTURE, ONE MEANING (owner item 7). The card selects
                     * the house; nothing else. It stays LIVE on the house you
                     * are already flying — a dead target on the surface whose
                     * entire job is choosing a snake is the defect the previous
                     * pass fixed, and it stays fixed — but what it does there
                     * is re-affirm rather than quietly become a second control.
                     * The press physics still fire, and no request is spent
                     * equipping the snake that is already equipped.
                     */
                    onSelect={
                      onFavoriteDock
                        ? () => {
                            if (flying) return;
                            onFavoriteDock(dynasty, favorite);
                          }
                        : undefined
                    }
                    /*
                     * And the branch that used to hide inside the card gets its
                     * own control: null is exactly "choose one for this
                     * dynasty", which is the same call the picker needs whether
                     * the slot is empty or full.
                     */
                    onChange={
                      onFavoriteDock
                        ? () => onFavoriteDock(dynasty, null)
                        : undefined
                    }
                  />
                );
              })}
            </div>

            {/* The selected house states its rule in one line. This is part of
                the pick — it is what the dynasty IS — and not a fourth
                element; there is no explainer for the two you did not pick.

                COMPACT, NOT CUT (owner ruling, 2026-08-08): "ruleset line and
                heirloom block can remain, but COMPACT." Every word of the rule
                survives; what shrinks is the leading and the type size, and
                only on the phone — at `sm` the line goes back to 11px, because
                the constraint being paid for is VERTICAL room on a 568px-tall
                viewport and a desktop has none of that pressure. */}
            <p
              className="mt-0.5 px-0.5 font-body text-[10px] leading-tight text-ink/70 sm:mt-1 sm:text-[11px] sm:leading-snug"
              data-testid="ruleset-explainer"
            >
              {selectedDynasty ? `${selectedDynasty} · ` : ''}
              {rulesetExplainer}
            </p>

            {heirloom ? <div className="mt-0.5 sm:mt-1">{heirloom}</div> : null}

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onChooseSnake}
                disabled={!onChooseSnake}
                data-testid="run-setup-snake-picker-trigger"
                className="min-h-[44px] whitespace-nowrap px-2 font-body text-[11px] text-ink/60 underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                <IconSnake size={13} className="mr-1 inline shrink-0" />
                All snakes
              </button>
              <Link
                href={labHref}
                className="min-h-[44px] whitespace-nowrap px-2 py-3 font-body text-[11px] text-ink/60 underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                Snake Lab
              </Link>
            </div>
          </section>

          {/* ---------- (b) ENERGY REACTOR ---------- */}
          {energySelector ? <div className="mt-1.5 sm:mt-3">{energySelector}</div> : null}

          {challengeNote && (
            <p
              className="mt-2 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-cosmic px-3 py-1.5 font-body text-xs text-bone-white"
              data-testid="challenge-note"
            >
              {challengeNote}
            </p>
          )}

          {startError && (
            <div
              className="mt-2 animate-fade-up rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-strike-red px-4 py-2"
              role="alert"
            >
              <p className="font-body text-bone-white">{startError}</p>
            </div>
          )}

          {/* ---------- (c) PLAY ---------- */}
          <div className="mt-2 sm:mt-3">{playButton}</div>
        </>
      ) : noSnakeAvailable ? (
        <div className="mt-5 rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink bg-strike-red p-5">
          <p className="font-body text-bone-white">
            We couldn&apos;t prepare your snake. Return Home and retry.
          </p>
          <Link
            href="/"
            className="btn-go mt-4 inline-flex min-h-[52px] w-full items-center justify-center px-4 py-3 text-base"
          >
            Return Home to Retry
          </Link>
        </div>
      ) : (
        <div className="paper-recess mt-5 p-5">
          <p className="font-body text-ink/60">Preparing your snake…</p>
        </div>
      )}
    </section>
  );
}

export default RunSetupPanel;
