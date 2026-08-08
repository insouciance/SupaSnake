'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { formatAscendanceYieldMultiplier } from '@/shared/game/ascendance';
import type { StrainId } from '@/shared/game/strains';
import { IconPlay, IconSnake } from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { HOME_WORDMARK } from '@/components/home/HomeIdentityHud';
import { useDynastySnakePortraits } from '@/components/game/DynastySnakePortrait';
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
 * ── THE PORTRAIT IS THE TRAY FACE (owner ruling, 2026-08-08) ─────────────
 *
 *   "the dynasty portrait can fill the 'main' tray of the dynasty selector"
 *   — and of the nesting it replaces: "ridiculous".
 *
 * It was ridiculous. The shipped card was a PORTRAIT inside a TILE inside a
 * CARD inside the tray: three concentric frames, each with its own contour and
 * its own radius, wrapped around a 44px picture that was the only thing in
 * there anyone wanted to look at. Every one of those frames was individually
 * defensible and collectively they buried the subject.
 *
 * So the middle frames are gone and the card has exactly two parts:
 *
 *   THE FACE     a square of the tray, edge to edge, and the portrait fills
 *                it. No tile, no inner contour, no inner radius — the card's
 *                own contour is the only line, which is the single-frame
 *                grammar applied where it had been quietly broken three deep.
 *                The capture is square and the face is square, so the picture
 *                is not cropped to fit; it simply IS the face.
 *   THE PLATE    one caption strip beneath it, in the house's fill, carrying
 *                the house, the snake's name and its generation.
 *
 * The house colour moved with the frames. It used to be the card's whole
 * ground with the creature drawn amber on top of it; the creature now carries
 * its house itself (see `DynastySnakePortrait`), so the fill retreats to the
 * plate, where it labels rather than competes. Three tinted snakes on three
 * dark faces above three coloured plates — the same three facts, said once
 * each instead of twice.
 *
 * ── HOW "SELECTED" IS SAID: JUST A BADGE ─────────────────────────────────
 *
 * Owner ruling, same session: selection is "just a badge".
 *
 * What that replaces is a THREE-SIGNAL frame treatment — the contour stepped
 * to the tray weight, the block grew a rung, and the fill rose a rung of its
 * own hue. Every one of those was in the pattern language and the three of
 * them together still failed the thing they were for: a card that changes its
 * frame changes its SIZE and its WEIGHT, so the row of three stopped being a
 * row of three comparable things and the eye had to re-read the whole field to
 * find out which one had grown. Selection is a fact about ONE card; it should
 * cost the other two nothing.
 *
 * A badge costs them nothing. Every card wears the identical contour, block
 * and fill; the flying one carries a small bone-white chip in its corner,
 * which is the strongest value available on a dark card and the fastest thing
 * in the composition to find. `aria-pressed` still carries the state for
 * anyone who is not looking at it.
 *
 * ── AND THE CHANGE CHIP IS GONE ──────────────────────────────────────────
 *
 *   "favorites can only be selected in lab, not directly there in the game
 *    setup modal."
 *
 * The chip that used to hang off each card's bottom edge is deleted, not
 * hidden. Setup's job is to say who is flying and to launch; deciding which
 * snake a HOUSE carries is a collection decision, it is made against the
 * collection, and the Lab is where the collection is. The doorway out of this
 * section names that in as many words.
 *
 * ONE EXCEPTION, and it is the owner's: "when no snake has been selected yet,
 * we can provide that menu we already have, where you can select one snake
 * from the dynasty as favorite". A house with no favorite has nothing to fly,
 * so its card cannot mean "fly this" — it means "fill this", and tapping it
 * opens the dynasty-filtered picker that already exists. One card, one
 * meaning, decided by whether the socket is full.
 */
function FavoriteDock({
  dynasty,
  favorite,
  selected,
  busy,
  portrait,
  onSelect,
}: {
  dynasty: SetupDynasty;
  favorite: RunSetupSnake | null;
  selected: boolean;
  busy: boolean;
  /** A PNG data URL of this dynasty's actual head, when one has been taken. */
  portrait?: string;
  /**
   * The card's ONE gesture. On a full socket it flies this house (and is a
   * deliberate no-op on the house already flying); on an empty one it opens
   * the dynasty-filtered picker.
   */
  onSelect?: () => void;
}) {
  /*
   * AN EMPTY SOCKET IS NOT A DIM FULL ONE.
   *
   * A house with no favorite has no snake to photograph, so it does not get a
   * photograph: drawing the player's head there would be the card naming a
   * creature that has not been chosen. It gets the strain glyph on an empty
   * socket instead — the fill ladder's own bottom rung, which is literally
   * what `--fill-deck-0` is for — and its plate asks to be filled.
   */
  const empty = favorite === null;
  return (
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
      /* EVERY CARD WEARS THE SAME FRAME. The contour, the block and the radius
         are identical on all three and do not move when one is selected — see
         the badge below, and the ruling above it. The drop is the VOID tier
         because the tray is dark now: an ink block on a dark ground displaces
         nothing the eye can find. */
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border-[length:var(--ink-w-2)] border-ink text-left text-bone-white shadow-[var(--ink-drop-void-2)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--fill-deck-1)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-wait"
    >
      {/*
       * THE FACE — the whole point of the card.
       *
       * "should display the actual snake ... just the face almost from the
       *  front ... almost like a passport picture but at a small angle."
       *
       * A photograph of the REAL head: the same GLB, the same cosmetics the
       * board and the chamber draw, taken once on a hidden canvas and cached.
       * It is SQUARE because the capture is square, so `object-cover` crops
       * nothing — the picture is the face rather than something fitted into
       * one. There is no tile around it and no inner line: the card's own
       * contour is the only frame in the composition.
       *
       * The ROOM behind it is house-neutral now. It used to carry a
       * house-coloured lamp because the creature could not carry its house;
       * the creature carries it, so the room went back to being the room —
       * `--fill-room-0` in the middle, closing to `--fill-room-edge` at the
       * corners, which is exactly what that ladder's own comment describes as
       * "where the room turns away".
       *
       * The glyph is not a placeholder that failed. It is what the card shows
       * whenever a portrait is not in hand — no WebGL, a missing model, a
       * readback the browser refuses, or simply the frames before the picture
       * exists — and, deliberately, on an empty socket. The button is fully
       * labelled either way, so nothing about the decision rides on the
       * picture.
       */}
      <span
        aria-hidden="true"
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden"
        style={
          empty
            ? { backgroundColor: 'var(--fill-deck-0)' }
            : {
                backgroundColor: 'var(--fill-room-0)',
                backgroundImage:
                  'radial-gradient(circle at 50% 42%, var(--fill-room-lamp) 0%, var(--fill-room-0) 52%, var(--fill-room-edge) 100%)',
              }
        }
      >
        {portrait && !empty ? (
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
          <span
            className={`block h-1/3 w-1/3 ${
              empty ? 'text-bone-white/30' : 'text-bone-white/70'
            }`}
          >
            <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
          </span>
        )}
      </span>

      {/* THE PLATE — the house, and who it is carrying. The house's fill
          labels the card from down here instead of flooding it, which is the
          room the creature's own tint needed. An empty socket takes the deck's
          bottom rung rather than the house colour: a socket with nothing in it
          should not look furnished. */}
      {/* `flex-1` is load-bearing, not tidying: the grid stretches all three
          cards to the tallest, the face is a fixed square, and without this the
          plate would sit at its own content height and leave a strip of the
          card's ground under the shortest one. */}
      <span
        className="flex min-w-0 flex-1 flex-col justify-center px-1.5 py-1 sm:px-2 sm:py-1.5"
        style={{
          backgroundColor: empty
            ? 'var(--fill-deck-0)'
            : DYNASTY_FILL[dynasty],
        }}
      >
        <span className="label-arcade block truncate text-[9px] leading-none text-bone-white/70">
          {dynasty}
        </span>
        {favorite ? (
          <>
            <span className="heading-display block truncate text-[11px] leading-tight text-bone-white sm:text-[13px]">
              {busy ? 'Equipping…' : favorite.name}
            </span>
            <span className="block truncate font-body text-[9px] leading-none text-bone-white/70">
              Gen {favorite.generation} · ×
              {formatAscendanceYieldMultiplier(favorite.generation)}
            </span>
          </>
        ) : (
          <span className="block truncate font-body text-[10px] leading-tight text-bone-white/75">
            Pick a favorite
          </span>
        )}
      </span>

      {/* THE BADGE — and the entire selected treatment (owner ruling: "just a
          badge"). Bone white on a dark card is the biggest value step this
          palette has, so the eye finds it before it has read a word; ink
          contour and the small block because it is an object lying on the
          card, not a label printed into it. It rides the FACE's corner, which
          is the one place on the card that is never text. */}
      {selected && (
        <span
          aria-hidden="true"
          data-testid={`run-setup-flying-badge-${dynasty.toLowerCase()}`}
          className="label-arcade absolute right-1 top-1 rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink bg-bone-white px-1.5 py-[3px] text-[8px] leading-none text-ink shadow-[var(--ink-drop-1)]"
        >
          Flying
        </span>
      )}
    </button>
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
 * carries the deck frame; this is a REGION inside it and draws no frame of its
 * own.
 *
 * THE TRAY IS DARK (owner ruling, 2026-08-08: "SETUP GOES DARK"). What stood
 * here claimed the opposite and gave a reason: "Home is a paper room, Setup is
 * a panel printed on the same stock, and the board is the dark place you go
 * when you press Play". The first clause stopped being true when Home went
 * dark, which made this the only cream surface left on the path — so the
 * change of material a player crossed was no longer "the run has started", it
 * was "you opened a dialog". Home, Setup and the board are now one descent,
 * and what still marks the run beginning is the scrim lifting off the arena.
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
              className="label-arcade text-[10px] text-bone-white/55"
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
                     * ONE GESTURE, AND WHAT IT MEANS IS DECIDED BY THE SOCKET.
                     *
                     * A full socket flies its house. It stays LIVE on the house
                     * already flying — a dead target on the surface whose whole
                     * job is choosing a snake was a defect once and stays
                     * fixed — but what it does there is RE-AFFIRM: the press
                     * physics fire and no request is spent equipping the snake
                     * that is already equipped.
                     *
                     * An EMPTY socket has no house to fly, so the same tap
                     * carries the owner's exception: `onFavoriteDock(dynasty,
                     * null)` is exactly "choose one for this dynasty", and the
                     * page answers it with the dynasty-filtered picker that
                     * already exists. This is not the old hidden second meaning
                     * coming back — that one lived on a card that also had a
                     * first meaning. A card with nothing in it has only ever
                     * had one thing it could possibly do.
                     */
                    onSelect={
                      onFavoriteDock
                        ? () => {
                            if (flying) return;
                            onFavoriteDock(dynasty, favorite);
                          }
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
              className="mt-0.5 px-0.5 font-body text-[10px] leading-tight text-bone-white/70 sm:mt-1 sm:text-[11px] sm:leading-snug"
              data-testid="ruleset-explainer"
            >
              {selectedDynasty ? `${selectedDynasty} · ` : ''}
              {rulesetExplainer}
            </p>

            {heirloom ? <div className="mt-0.5 sm:mt-1">{heirloom}</div> : null}

            {/* THE DOORWAY NAMES WHAT LEFT. The CHANGE chip is gone from every
                card, so the one thing a player might now go looking for is
                where a favorite is set — and the answer is written on the link
                that takes them there rather than left to be discovered. "All
                snakes" is a different question (fly something else once, this
                run) and keeps its own wording. */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onChooseSnake}
                disabled={!onChooseSnake}
                data-testid="run-setup-snake-picker-trigger"
                className="min-h-[44px] whitespace-nowrap px-2 font-body text-[11px] text-bone-white/60 underline decoration-dotted underline-offset-4 hover:text-bone-white"
              >
                <IconSnake size={13} className="mr-1 inline shrink-0" />
                All snakes
              </button>
              <Link
                href={labHref}
                data-testid="run-setup-lab-link"
                className="min-h-[44px] whitespace-nowrap px-2 py-3 font-body text-[11px] text-bone-white/60 underline decoration-dotted underline-offset-4 hover:text-bone-white"
              >
                Change favorites in the Lab
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
        <div className="deck-recess mt-5 p-5">
          <p className="font-body text-bone-white/60">Preparing your snake…</p>
        </div>
      )}
    </section>
  );
}

export default RunSetupPanel;
