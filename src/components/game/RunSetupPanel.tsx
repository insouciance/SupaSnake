'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { formatAscendanceYieldMultiplier } from '@/shared/game/ascendance';
import type { StrainId } from '@/shared/game/strains';
import {
  IconBolt,
  IconCrown,
  IconDna,
  IconFlask,
  IconPlay,
  IconSnake,
} from '@/components/ui/icons';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
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
  rulesetExplainer: string;
  masteryLevel: number | null;
  modeLabel: string;
  aimLabel: string;
  startLabel: string;
  challengeNote?: string | null;
  startTestId: string;
  ladderNote?: ReactNode;
  ladderSelector?: ReactNode;
  isStarting: boolean;
  onStart: () => void;
  onChooseSnake?: () => void;
  startError: string | null;
  heirloom?: ReactNode;
  energySelector?: ReactNode;
  modeToggle?: ReactNode;
  anomalyPanel?: ReactNode;
  aimSelector?: ReactNode;
  buildSeed?: ReactNode;
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

const DYNASTY_VISUALS: Record<
  SetupDynasty,
  {
    accent: string;
    secondary: string;
    text: string;
    border: string;
    wash: string;
    shadow: string;
  }
> = {
  CYBER: {
    accent: '#22d3ee',
    secondary: '#8b5cf6',
    text: 'text-cyber',
    border: 'border-cyber/60',
    wash: 'bg-cyber/10',
    shadow: 'shadow-cyber/25',
  },
  PRIMAL: {
    accent: '#86efac',
    secondary: '#22d3ee',
    text: 'text-primal-glow',
    border: 'border-primal-glow/55',
    wash: 'bg-primal/15',
    shadow: 'shadow-primal-glow/20',
  },
  COSMIC: {
    accent: '#a855f7',
    secondary: '#fbbf24',
    text: 'text-cosmic-glow',
    border: 'border-cosmic/65',
    wash: 'bg-cosmic/15',
    shadow: 'shadow-cosmic/25',
  },
};

function setupDynasty(value: string): SetupDynasty {
  const normalized = value.toUpperCase();
  return SETUP_DYNASTIES.find((dynasty) => dynasty === normalized) ?? 'PRIMAL';
}

/** A calm, continuous-body portrait: character art, not a technical diagram. */
function LaunchSnake({ snake }: { snake: RunSetupSnake }) {
  const rawId = useId().replaceAll(':', '');
  const gradientId = `run-snake-gradient-${rawId}`;
  const glowId = `run-snake-glow-${rawId}`;
  const dynasty = setupDynasty(snake.dynasty);
  const visual = DYNASTY_VISUALS[dynasty];

  return (
    <svg
      viewBox="0 0 520 210"
      className="h-full w-full overflow-visible"
      role="img"
      aria-label={`${snake.name}, Generation ${snake.generation}, ready to launch`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={visual.accent} />
          <stop offset="62%" stopColor={visual.secondary} />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <filter id={glowId} x="-25%" y="-50%" width="150%" height="200%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        className="motion-safe:animate-breathe motion-reduce:animate-none"
        filter={`url(#${glowId})`}
      >
        <path
          d="M62 147 C119 55 203 188 284 116 S411 57 459 105"
          fill="none"
          stroke={visual.accent}
          strokeWidth="48"
          strokeLinecap="round"
          opacity="0.14"
        />
        <path
          d="M62 147 C119 55 203 188 284 116 S411 57 459 105"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="29"
          strokeLinecap="round"
        />
        <path
          d="M69 141 C124 70 202 176 281 108 S403 62 451 101"
          fill="none"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g transform="translate(455 104) rotate(-12)">
          <rect x="-8" y="-16" width="46" height="32" rx="13" fill={`url(#${gradientId})`} />
          <circle cx="25" cy="-6" r="3.5" fill="#06090d" />
          <circle cx="26" cy="-7" r="1.1" fill="#e6edf3" />
        </g>
      </g>
    </svg>
  );
}

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
  const visual = DYNASTY_VISUALS[dynasty];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect || busy}
      aria-pressed={favorite ? selected : undefined}
      aria-label={
        favorite
          ? `Equip favorite ${dynasty} snake ${favorite.name}, generation ${favorite.generation}`
          : `Choose ${dynasty} favorite snake`
      }
      className={`group relative min-h-[78px] min-w-0 overflow-hidden rounded-[18px] border px-1.5 py-2 text-center transition-[border-color,background-color,transform] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyber disabled:cursor-wait ${
        selected
          ? `${visual.border} ${visual.wash} shadow-glow ${visual.shadow}`
          : favorite
            ? 'border-scale-blue-light/45 bg-void-deep/70 hover:border-cosmic/45'
            : 'border-scale-blue-light/35 bg-scale-blue/20 hover:border-cyber/45 hover:bg-cyber/5'
      }`}
      data-testid={`run-setup-favorite-${dynasty.toLowerCase()}`}
    >
      <span className={`label-arcade block truncate text-[8px] ${selected ? visual.text : 'text-beige/50'}`}>
        {dynasty}
      </span>
      {favorite ? (
        <>
          <span className="mt-1 flex items-center justify-center gap-1">
            <span className={`h-4 w-4 shrink-0 ${selected ? visual.text : 'text-beige/55'}`}>
              <StrainGlyph id={DYNASTY_STRAIN[dynasty]} />
            </span>
            <span className="truncate font-display text-[11px] text-bone-white">
              Gen {favorite.generation}
            </span>
          </span>
          <span className="mt-1 block truncate font-body text-[9px] text-beige/60">
            {busy ? 'Equipping…' : favorite.name}
          </span>
          <span
            aria-hidden="true"
            className={`absolute right-2 top-2 h-1.5 w-1.5 rotate-45 ${
              selected ? 'bg-rarity-legendary shadow-glow-sm shadow-rarity-legendary/70' : 'bg-scale-blue-light'
            }`}
          />
        </>
      ) : (
        <>
          <span className={`mt-1 block font-display text-xl leading-none ${visual.text}`}>+</span>
          <span className="mt-1 block truncate font-body text-[9px] text-beige/65">
            Pick favorite
          </span>
        </>
      )}
    </button>
  );
}

function MissionReadout({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[50px] min-w-0 items-center gap-2.5 rounded-[16px] border border-scale-blue-light/40 bg-void-deep/65 px-2.5 text-left">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyber/30 bg-cyber/10 text-cyber">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="label-arcade block truncate text-[8px] text-beige/50">{label}</span>
        <span className="block truncate font-display text-[11px] text-bone-white">{value}</span>
      </span>
    </div>
  );
}

export function RunSetupPanel({
  snake,
  noSnakeAvailable,
  rulesetExplainer,
  masteryLevel,
  modeLabel,
  aimLabel,
  startLabel,
  challengeNote,
  startTestId,
  ladderNote = null,
  ladderSelector = null,
  isStarting,
  onStart,
  onChooseSnake,
  startError,
  heirloom,
  energySelector,
  modeToggle,
  anomalyPanel,
  aimSelector,
  buildSeed,
  favorites = {},
  onFavoriteDock,
  favoriteBusyId = null,
  labHref = '/lab?returnTo=%2Fgame',
}: RunSetupPanelProps) {
  const hasAdjustables =
    Boolean(ladderSelector) ||
    Boolean(anomalyPanel) ||
    Boolean(aimSelector) ||
    Boolean(buildSeed);
  const selectedDynasty = snake ? setupDynasty(snake.dynasty) : null;
  const visual = selectedDynasty ? DYNASTY_VISUALS[selectedDynasty] : DYNASTY_VISUALS.CYBER;

  return (
    <section
      className="relative isolate mx-auto w-full max-w-[46rem] overflow-hidden rounded-[30px] border border-cyber/35 bg-[radial-gradient(circle_at_50%_7%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_8%_48%,rgba(139,92,246,0.14),transparent_25%),radial-gradient(circle_at_92%_84%,rgba(251,191,36,0.09),transparent_24%),linear-gradient(180deg,rgba(22,32,43,0.96),rgba(6,9,13,0.99))] p-2.5 text-center shadow-glow-lg shadow-cyber/15 sm:p-5"
      data-testid="run-setup"
    >
      <header className="relative mx-auto max-w-xl">
        <p className="label-arcade text-pulse">Run cockpit</p>
        <h2 className="heading-display text-xl text-bone-white sm:mt-1 sm:text-3xl">
          Ready to launch
        </h2>
        <p className="hidden font-body text-xs text-beige/60 sm:mt-1 sm:block">
          Choose your snake. Set the stakes. Play.
        </p>
      </header>

      {snake ? (
        <>
          <section
            className={`relative mx-auto mt-2 max-w-2xl overflow-hidden rounded-[20px] border ${visual.border} bg-[radial-gradient(circle_at_50%_35%,rgba(230,237,243,0.05),transparent_42%),linear-gradient(180deg,rgba(22,32,43,0.55),rgba(6,9,13,0.9))] shadow-glow-lg sm:mt-4 sm:rounded-[24px] ${visual.shadow}`}
            aria-label="Selected snake launch chamber"
          >
            <div className="absolute left-3 top-3 z-10 hidden max-w-[calc(100%-1.5rem)] items-center gap-1.5 sm:flex">
              <span className={`rounded-full border ${visual.border} ${visual.wash} px-2 py-1 font-mono text-[8px] ${visual.text} whitespace-nowrap`}>
                {selectedDynasty}
              </span>
              <span className="rounded-full border border-rarity-legendary/35 bg-rarity-legendary/10 px-2 py-1 font-mono text-[8px] text-rarity-legendary whitespace-nowrap">
                Gen {snake.generation}
              </span>
            </div>

            <div className="hidden h-[205px] px-4 pt-5 sm:block">
              <LaunchSnake snake={snake} />
            </div>

            <div className="relative grid min-h-[78px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 bg-void-deep/75 px-2.5 py-2.5 text-left sm:block sm:border-t sm:border-scale-blue-light/30 sm:px-5 sm:py-3 sm:text-center">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${visual.border} ${visual.wash} p-2 ${visual.text} shadow-glow sm:hidden`} aria-hidden="true">
                <StrainGlyph id={DYNASTY_STRAIN[selectedDynasty!]} />
              </span>
              <div className="min-w-0">
                <p className={`label-arcade text-[8px] sm:text-[9px] ${visual.text}`}>
                  <span className="sm:hidden">{selectedDynasty} · Gen {snake.generation}</span>
                  <span className="hidden sm:inline">Selected lineage</span>
                </p>
                <h3 className="truncate heading-display text-lg text-bone-white sm:mt-0.5 sm:text-2xl">
                  {snake.name}
                </h3>
                <p className="truncate font-body text-[10px] text-beige/65 sm:mt-0.5 sm:text-xs">
                  <span className="hidden sm:inline">Generation {snake.generation} · </span>
                  <span data-testid="run-setup-yield-multiplier">
                    Payout ×{formatAscendanceYieldMultiplier(snake.generation)}
                  </span>
                </p>
              </div>
              <div className="flex gap-1.5 sm:mt-3 sm:grid sm:grid-cols-2 sm:gap-2">
                <button
                  type="button"
                  onClick={onChooseSnake}
                  disabled={!onChooseSnake}
                  data-testid="run-setup-snake-picker-trigger"
                  className="btn-neutral inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-full p-0 text-[10px] whitespace-nowrap sm:h-auto sm:min-h-[44px] sm:w-auto sm:px-2 sm:py-2"
                  aria-label={`Choose snake. Current: ${snake.name}, generation ${snake.generation}`}
                >
                  <IconSnake size={15} className="shrink-0 text-cyber" />
                  <span className="sr-only sm:not-sr-only">Change snake</span>
                </button>
                <Link
                  href={labHref}
                  aria-label="Snake Lab"
                  className="btn-neutral inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-full p-0 text-[10px] text-cosmic-glow whitespace-nowrap sm:h-auto sm:min-h-[44px] sm:w-auto sm:px-2 sm:py-2"
                >
                  <IconFlask size={15} className="shrink-0" />
                  <span className="sr-only sm:not-sr-only">Snake Lab</span>
                </Link>
              </div>
            </div>
          </section>

          {modeToggle ? (
            <section
              className="mx-auto mt-2 max-w-2xl rounded-[18px] border border-cosmic/25 bg-cosmic/5 px-2 py-1 [&_.label-arcade]:text-[8px] [&_button]:rounded-full [&_button]:whitespace-nowrap sm:py-1.5"
              aria-label="Choose run mode"
              data-testid="run-setup-mode-control"
            >
              {modeToggle}
            </section>
          ) : null}

          {energySelector ? <div className="mt-2 sm:mt-3">{energySelector}</div> : null}

          {challengeNote && (
            <p
              className="mx-auto mt-2 max-w-xl rounded-[16px] border border-cosmic/40 bg-cosmic/10 px-3 py-1.5 font-body text-xs text-cosmic-glow sm:mt-3 sm:px-4 sm:py-2 sm:text-sm"
              data-testid="challenge-note"
            >
              {challengeNote}
            </p>
          )}

          {startError && (
            <div className="mx-auto mt-2 max-w-xl animate-fade-up rounded-[16px] border border-strike-red/70 bg-strike-red/15 px-4 py-2" role="alert">
              <p className="font-body text-strike-red">{startError}</p>
            </div>
          )}

          <div className="mx-auto mt-2 max-w-2xl rounded-[18px] border border-cyber/30 bg-void-deep/60 p-1.5 sm:mt-3 sm:p-2.5">
            <button
              type="button"
              onClick={onStart}
              disabled={isStarting}
              data-testid={startTestId}
              className={`btn-go inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-base whitespace-nowrap sm:min-h-[56px] sm:py-3 sm:text-lg ${
                isStarting ? 'cursor-wait' : 'animate-glow-pulse shadow-cyber/45'
              }`}
            >
              <IconPlay size={21} className="shrink-0" />
              <span className="truncate">{isStarting ? 'Starting…' : startLabel}</span>
            </button>
          </div>

          <section className="mx-auto mt-3 max-w-2xl" aria-labelledby="run-favorites-title">
            <div className="mb-2 flex items-center justify-center gap-2">
              <IconCrown size={14} className="text-rarity-legendary" />
              <p id="run-favorites-title" className="label-arcade text-[9px] text-beige/55">
                Dynasty favorites
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 min-[380px]:gap-2" data-testid="run-setup-favorites">
              {SETUP_DYNASTIES.map((dynasty) => {
                const favorite = favorites[dynasty] ?? null;
                return (
                  <FavoriteDock
                    key={dynasty}
                    dynasty={dynasty}
                    favorite={favorite}
                    selected={Boolean(favorite?.id && favorite.id === snake.id)}
                    busy={favoriteBusyId !== null && favoriteBusyId === favorite?.id}
                    onSelect={
                      onFavoriteDock
                        ? () => onFavoriteDock(dynasty, favorite)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>

          <section className="mx-auto mt-3 grid max-w-2xl grid-cols-2 gap-2" aria-label="Run configuration">
            <MissionReadout icon={<IconDna size={17} />} label="Run mode" value={modeLabel} />
            <MissionReadout icon={<IconBolt size={17} />} label="Aim system" value={aimLabel} />
          </section>

          <section className="mx-auto mt-2 max-w-2xl rounded-[16px] border border-scale-blue-light/35 bg-void-deep/55 px-3 py-2.5">
            <p className="font-body text-xs leading-snug text-beige/75" data-testid="ruleset-explainer">
              {rulesetExplainer}
            </p>
            <p className="mt-1 font-body text-[11px] text-beige/50" data-testid="run-setup-summary">
              {modeLabel} · {aimLabel}
              {masteryLevel !== null && (
                <span data-testid="mastery-chip"> · Mastery M{masteryLevel}</span>
              )}
            </p>
            {ladderNote ? <div className="mt-1 [&>*]:text-xs">{ladderNote}</div> : null}
            <p className="mt-1 font-body text-[10px] text-beige/45">
              BANK at a portal pays +25% · crash and you keep 60%
            </p>
          </section>

          {heirloom ? <div className="mt-3">{heirloom}</div> : null}
        </>
      ) : noSnakeAvailable ? (
        <div className="mx-auto mt-5 max-w-md rounded-[20px] border border-strike-red/45 bg-strike-red/10 p-5">
          <p className="font-body text-beige">
            We couldn&apos;t prepare your snake. Return Home and retry.
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-5 max-w-md rounded-[20px] border border-cyber/30 bg-cyber/5 p-5">
          <p className="font-body text-beige/70">Preparing your snake…</p>
        </div>
      )}

      {!snake && challengeNote && (
        <p
          className="mx-auto mt-3 max-w-xl rounded-[16px] border border-cosmic/40 bg-cosmic/10 px-4 py-2 font-body text-sm text-cosmic-glow"
          data-testid="challenge-note"
        >
          {challengeNote}
        </p>
      )}

      {!snake && startError && (
        <div className="mx-auto mt-3 max-w-xl animate-fade-up rounded-[16px] border border-strike-red/70 bg-strike-red/15 px-4 py-2" role="alert">
          <p className="font-body text-strike-red">{startError}</p>
        </div>
      )}

      {!snake && <div className="mx-auto mt-3 max-w-2xl rounded-[18px] border border-cyber/30 bg-void-deep/60 p-2.5">
        {noSnakeAvailable ? (
          <Link
            href="/"
            className="btn-go inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-base whitespace-nowrap"
          >
            Return Home to Retry
          </Link>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={isStarting || !snake}
            data-testid={startTestId}
            className={`btn-go inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-base whitespace-nowrap sm:text-lg ${
              isStarting || !snake
                ? 'cursor-wait'
                : 'animate-glow-pulse shadow-cyber/45'
            }`}
          >
            <IconPlay size={21} className="shrink-0" />
            <span className="truncate">{isStarting ? 'Starting…' : startLabel}</span>
          </button>
        )}
      </div>}

      {!noSnakeAvailable && hasAdjustables && (
        <details
          className="mx-auto mt-3 max-w-2xl rounded-[18px] border border-scale-blue-light/35 bg-void-deep/55 p-3 text-left"
          data-testid="run-setup-adjust"
        >
          <summary className="cursor-pointer text-center font-display text-xs uppercase text-cosmic-glow whitespace-nowrap">
            Tune run
          </summary>
          <div className="space-y-4 overflow-x-auto pt-4 text-center [&_button]:whitespace-nowrap">
            {ladderSelector}
            {anomalyPanel}
            {aimSelector}
            {buildSeed}
          </div>
        </details>
      )}
    </section>
  );
}

export default RunSetupPanel;
