'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { formatAscendanceYieldMultiplier } from '@/shared/game/ascendance';
import type { StrainId } from '@/shared/game/strains';
import { IconPlay, IconSnake } from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { HOME_WORDMARK } from '@/components/home/HomeIdentityHud';
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
  /** Exactly one setup dock per dynasty; null renders a deliberate pick slot. */
  favorites?: Partial<Record<SetupDynasty, RunSetupSnake | null>>;
  onFavoriteDock?: (
    dynasty: SetupDynasty,
    favorite: RunSetupSnake | null
  ) => void;
  favoriteBusyId?: string | null;
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
 * Selected is INK FILL, paper glyph. The dynasty hue says which house; the ink
 * says which one you are flying. That separation matters because a player who
 * reads "selected" off a hue has to know three hues first.
 */
function FavoriteDock({
  dynasty,
  favorite,
  selected,
  busy,
  onSelect,
}: {
  dynasty: SetupDynasty;
  favorite: RunSetupSnake | null;
  selected: boolean;
  busy: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect || busy}
      aria-pressed={favorite ? selected : undefined}
      aria-label={
        selected
          ? `Flying ${favorite?.name ?? dynasty}${favorite ? `, generation ${favorite.generation}` : ''}`
          : favorite
            ? `Switch to your ${dynasty} favorite, ${favorite.name}, generation ${favorite.generation}`
            : `Choose a ${dynasty} favorite`
      }
      data-testid={`run-setup-favorite-${dynasty.toLowerCase()}`}
      className={`relative flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border-[length:var(--ink-w-3)] border-ink px-1.5 py-2 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-wait ${
        selected
          ? 'bg-ink text-bone-white shadow-[var(--ink-drop-3)]'
          : 'text-bone-white shadow-[var(--ink-drop-2)]'
      }`}
      style={selected ? undefined : { backgroundColor: DYNASTY_FILL[dynasty] }}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-chip)] border-[length:var(--ink-w-2)] border-ink p-1 text-ink`}
        style={{ backgroundColor: selected ? '#fffdf8' : 'rgba(255,253,248,0.85)' }}
      >
        <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
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
  favorites = {},
  onFavoriteDock,
  favoriteBusyId = null,
  labHref = '/lab?returnTo=%2Fgame',
}: RunSetupPanelProps) {
  const selectedDynasty = snake ? setupDynasty(snake.dynasty) : null;

  const playButton = (
    <button
      type="button"
      onClick={onStart}
      disabled={isStarting || !snake}
      data-testid={startTestId}
      className="btn-go inline-flex min-h-[68px] w-full items-center justify-center gap-3 px-4 py-3 text-xl sm:min-h-[76px] sm:text-2xl"
    >
      <IconPlay size={26} className="shrink-0" />
      <span className="truncate">{isStarting ? 'Starting…' : startLabel}</span>
    </button>
  );

  return (
    <section
      className="relative mx-auto w-full min-w-0 p-1 text-center sm:p-2"
      data-testid="run-setup"
    >
      {/* The Mark, small, at the head of the tray. Setup is the one surface
          between the chamber and the board, and a printed panel is exactly
          where a logo belongs — it is what makes the tray read as a made
          object rather than a dialog. Sized off the same measured constant
          Home uses, so the two can never drift. */}
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
          className="mx-auto -mt-1 mb-1 w-[132px] max-w-full -rotate-[2deg] select-none sm:w-[168px]"
          data-testid="run-setup-mark"
        />
      </picture>

      {snake ? (
        <>
          {/* ---------- (a) DYNASTY FAVORITES ---------- */}
          <section aria-labelledby="run-favorites-title" className="mt-2">
            <p
              id="run-favorites-title"
              className="label-arcade text-[10px] text-ink/55"
            >
              Who is flying
            </p>
            <div
              className="mt-1.5 grid grid-cols-3 gap-2"
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
                    onSelect={
                      onFavoriteDock && !flying
                        ? () => onFavoriteDock(dynasty, favorite)
                        : undefined
                    }
                  />
                );
              })}
            </div>

            {/* The selected house states its rule in one line. This is part of
                the pick — it is what the dynasty IS — and not a fourth
                element; there is no explainer for the two you did not pick. */}
            <p
              className="mt-1.5 px-1 font-body text-[11px] leading-snug text-ink/70"
              data-testid="ruleset-explainer"
            >
              {selectedDynasty ? `${selectedDynasty} · ` : ''}
              {rulesetExplainer}
            </p>

            <div className="mt-1 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onChooseSnake}
                disabled={!onChooseSnake}
                data-testid="run-setup-snake-picker-trigger"
                className="min-h-[44px] px-2 font-body text-[11px] text-ink/60 underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                <IconSnake size={13} className="mr-1 inline shrink-0" />
                All snakes
              </button>
              <Link
                href={labHref}
                className="min-h-[44px] px-2 py-3 font-body text-[11px] text-ink/60 underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                Snake Lab
              </Link>
            </div>
          </section>

          {/* ---------- (b) ENERGY REACTOR ---------- */}
          {energySelector ? <div className="mt-3">{energySelector}</div> : null}

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
          <div className="mt-3">{playButton}</div>
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
