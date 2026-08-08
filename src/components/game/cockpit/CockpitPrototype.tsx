'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { DynastyId } from '@/shared/types/game';
import type { GeneId } from '@/shared/game/genes';
import {
  ARENA_BLEED_STYLE,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';
import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { ArenaPrototypeCanvas } from '@/components/game/arena/ArenaPrototypeCanvas';
import type { ArrivalMode } from '@/lib/game/arrivalEasing';
import type { RenderTier } from '@/components/game/screen/renderQuality';
import type {
  BoardPurpleMode,
  BoardThemeSelection,
} from '@/components/game/screen/boardThemes';
import { GeneGlyph as CatalogGeneGlyph } from './CockpitGlyphs';
import styles from './CockpitPrototype.module.css';

export type CockpitPrototypeState = 'ready' | 'active' | 'portal' | 'apex';
export type CockpitPrototypeMode = 'standard' | 'free' | 'anomaly';

interface CockpitPrototypeProps {
  dynasty: DynastyId;
  state: CockpitPrototypeState;
  mode: CockpitPrototypeMode;
  geneCount: number;
  highContrast?: boolean;
  reducedMotion?: boolean;
  arenaRenderer?: 'static' | 'webgl';
  arenaVariant?: 'released' | 'cockpit';
  arenaEffects?: boolean;
  arenaDensity?: 'standard' | 'extreme';
  /** Dev-fixture-only tier pin; see ArenaPrototypeCanvas.forceRenderTier. */
  arenaRenderTier?: RenderTier;
  /** Dev-fixture-only pitch escape; see ArenaPrototypeCanvas.pitchDeg. */
  arenaPitchDeg?: number;
  /** NEON DYNASTY THEMES; see ArenaPrototypeCanvas.boardThemeSelection. */
  arenaBoardTheme?: BoardThemeSelection;
  /** THE COMPARE TOGGLE; see ArenaPrototypeCanvas.boardSeamLines. */
  arenaBoardSeamLines?: boolean;
  /** THE BRAND PURPLE EXPERIMENT; see ArenaPrototypeCanvas.boardPurple. */
  arenaBoardPurple?: BoardPurpleMode | null;
  /** ET-1 arrival A/B; see ArenaPrototypeCanvas.arrivalMode. */
  arenaArrivalMode?: ArrivalMode | null;
}

type TokenStyle = CSSProperties & Record<`--${string}`, string>;

const GENE_NAMES = [
  { id: 'gold_trail', name: 'Gold Trail' },
  { id: 'magnet_pulse', name: 'Magnet Pulse' },
  { id: 'phoenix', name: 'Phoenix' },
  { id: 'pocket_rift', name: 'Pocket Rift' },
  { id: 'overgrowth', name: 'Overgrowth' },
  { id: 'static_charge', name: 'Static Charge' },
] as const satisfies readonly { id: GeneId; name: string }[];

const STRAINS = [
  { id: 'AURUM', name: 'Aurum', color: '#f5c542', points: 3 },
  { id: 'VOLT', name: 'Volt', color: '#42e0f5', points: 2 },
  { id: 'FERAL', name: 'Feral', color: '#6fe65d', points: 4 },
  { id: 'FLUX', name: 'Flux', color: '#ae62f2', points: 1 },
  { id: 'UMBRA', name: 'Umbra', color: '#f15472', points: 2 },
] as const;

const SNAKE_CELLS = [
  [10, 13],
  [10, 14],
  [9, 14],
  [8, 14],
  [7, 14],
  [7, 15],
  [7, 16],
  [6, 16],
  [5, 16],
] as const;

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ScoreGlyph() {
  return (
    <Svg>
      <path d="M5 5h14v5c0 4.2-2.7 7.1-7 8.5C7.7 17.1 5 14.2 5 10V5Z" />
      <path d="M8 5V3h8v2M9 21h6M12 18.5V21" />
      <path d="m12 8 1.1 2.2 2.4.3-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.7 2.4-.3L12 8Z" />
    </Svg>
  );
}

function DnaGlyph() {
  return (
    <Svg>
      <path d="M7 3c0 4.3 10 5.6 10 10s-10 5.7-10 8" />
      <path d="M17 3c0 4.3-10 5.6-10 10s10 5.7 10 8" />
      <path d="M8.2 7h7.6M8.2 17h7.6M9.5 12h5" />
    </Svg>
  );
}

function ShieldGlyph() {
  return (
    <Svg>
      <path d="m12 3 7 3v5c0 4.7-2.6 8-7 10-4.4-2-7-5.3-7-10V6l7-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </Svg>
  );
}

function RiskGlyph() {
  return (
    <Svg>
      <path d="M18.4 17.5A8 8 0 1 1 19.7 8" />
      <path d="m18.8 4-.9 5.1-5-.9M12 7v5l3 2" />
    </Svg>
  );
}

function PortalGlyph() {
  return (
    <Svg>
      <ellipse cx="12" cy="12" rx="6.5" ry="9" />
      <ellipse cx="12" cy="12" rx="3" ry="5.5" />
      <path d="M12 3v3M12 18v3" />
    </Svg>
  );
}

function ModeGlyph({ mode }: { mode: CockpitPrototypeMode }) {
  if (mode === 'free') {
    return (
      <Svg>
        <path d="M8.2 8.4c-3.8 0-5.3 7.2-1.6 7.2 3 0 6.1-7.2 9.2-7.2 3.8 0 5.3 7.2 1.6 7.2-3 0-6.1-7.2-9.2-7.2Z" />
      </Svg>
    );
  }
  if (mode === 'anomaly') {
    return (
      <Svg>
        <path d="M4 12c2.2-6.5 5.3-8.7 8-8.7s5.8 2.2 8 8.7c-2.2 6.5-5.3 8.7-8 8.7S6.2 18.5 4 12Z" />
        <path d="M8 12h8M12 8v8M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
      </Svg>
    );
  }
  return (
    <Svg>
      <path d="M5 18V6l7-3 7 3v12l-7 3-7-3Z" />
      <path d="m8 8 4 2 4-2M12 10v7" />
    </Svg>
  );
}

function PauseGlyph() {
  return (
    <Svg>
      <path d="M8 5v14M16 5v14" strokeWidth="3" />
    </Svg>
  );
}

function StrainGlyph({ id }: { id: (typeof STRAINS)[number]['id'] }) {
  if (id === 'AURUM') {
    return <Svg><path d="m12 3 7 5-2.5 10h-9L5 8l7-5Z" /><path d="m5 8 7 4 7-4M12 12v6" /></Svg>;
  }
  if (id === 'VOLT') {
    return <Svg><path d="m13 2-8 11h6l-1 9 9-12h-6V2Z" /></Svg>;
  }
  if (id === 'FERAL') {
    return <Svg><path d="M5 19c2-7 4.4-11 7-14 2.6 3 5 7 7 14M8 15l4-3 4 3M12 12v8" /></Svg>;
  }
  if (id === 'FLUX') {
    return <Svg><ellipse cx="12" cy="12" rx="6.5" ry="9" /><path d="M3 12h5M16 12h5M12 3v5M12 16v5" /></Svg>;
  }
  return <Svg><path d="M17.5 17.5A8 8 0 1 1 17.5 6 6.2 6.2 0 0 0 17.5 17.5Z" /><path d="m8 12 2 2 4-5" /></Svg>;
}

function Instrument({
  className,
  children,
  label,
}: {
  className: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <section className={`${styles.instrument} ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

function ArenaPreview({
  state,
  dynasty,
  renderer,
  arenaVariant,
  arenaEffects,
  arenaDensity,
  arenaRenderTier,
  arenaPitchDeg,
  arenaBoardTheme,
  arenaBoardSeamLines,
  arenaBoardPurple,
  arenaArrivalMode,
}: {
  state: CockpitPrototypeState;
  dynasty: DynastyId;
  renderer: 'static' | 'webgl';
  arenaVariant: 'released' | 'cockpit';
  arenaEffects: boolean;
  arenaDensity: 'standard' | 'extreme';
  arenaRenderTier?: RenderTier;
  arenaPitchDeg?: number;
  arenaBoardTheme?: BoardThemeSelection;
  arenaBoardSeamLines?: boolean;
  arenaBoardPurple?: BoardPurpleMode | null;
  arenaArrivalMode?: ArrivalMode | null;
}) {
  const portalLive = state === 'portal' || state === 'apex';
  return (
    <>
      {/* THE CAMERA'S GRAB SURFACE - a SIBLING of the bay, not a child, so it
          keeps the board's OLD input level while the bay paints at 20. See
          `.arenaInputIsland`. */}
      <div
        className={styles.arenaInputIsland}
        data-arena-input-island=""
        aria-hidden="true"
      />
    <div className={styles.arenaBay} data-testid="cockpit-arena-bay">
      <div className={styles.arenaQuietZone} aria-hidden="true" />
      <div className={styles.arenaFrame} data-testid="cockpit-arena-frame">
        {renderer === 'webgl' ? (
          <>
            <div className={styles.webglViewport} data-testid="cockpit-board">
              <div
                className={styles.arenaCanvasBleed}
                style={ARENA_BLEED_STYLE}
              >
                <ArenaPrototypeCanvas
                  dynasty={dynasty}
                  state={state}
                  arenaVariant={arenaVariant}
                  effectsEnabled={arenaEffects}
                  density={arenaDensity}
                  forceRenderTier={arenaRenderTier}
                  pitchDeg={arenaPitchDeg}
                  boardThemeSelection={arenaBoardTheme}
                  boardSeamLines={arenaBoardSeamLines}
                  boardPurple={arenaBoardPurple}
                  arrivalMode={arenaArrivalMode}
                />
              </div>
            </div>
          </>
        ) : (
        <div className={styles.apron}>
          <span className={`${styles.cornerNode} ${styles.cornerNorthWest}`} />
          <span className={`${styles.cornerNode} ${styles.cornerNorthEast}`} />
          <span className={`${styles.cornerNode} ${styles.cornerSouthWest}`} />
          <span className={`${styles.cornerNode} ${styles.cornerSouthEast}`} />
          <div className={styles.board} data-testid="cockpit-board">
            <span className={styles.aimLane} aria-hidden="true" />
            {SNAKE_CELLS.map(([x, z], index) => (
              <span
                key={`${x}-${z}`}
                className={`${styles.snakeCell} ${index === 0 ? styles.snakeHead : ''}`}
                style={{ gridColumn: x + 1, gridRow: z + 1 }}
              >
                {index === 0 && <i className={styles.snakeEye} />}
              </span>
            ))}
            <span
              className={styles.foodBeacon}
              style={{ gridColumn: 15, gridRow: 7 }}
              aria-label="Food"
            />
            <span
              className={styles.mutationBeacon}
              style={{ gridColumn: 17, gridRow: 14 }}
              aria-label="Mutation"
            >
              <DnaGlyph />
            </span>
            {portalLive && (
              <span
                className={styles.portalBeacon}
                style={{ gridColumn: 5, gridRow: 4 }}
                aria-label="Extraction portal"
              >
                <PortalGlyph />
              </span>
            )}
            {state === 'apex' && (
              <span className={styles.apexTrace} aria-hidden="true" />
            )}
          </div>
          <span className={styles.orientationMark} aria-hidden="true" />
        </div>
        )}
      </div>
    </div>
    </>
  );
}

export function CockpitPrototype({
  dynasty,
  state,
  mode,
  geneCount,
  highContrast = false,
  reducedMotion = false,
  arenaRenderer = 'static',
  arenaVariant = 'cockpit',
  arenaEffects = true,
  arenaDensity = 'standard',
  arenaRenderTier,
  arenaPitchDeg,
  arenaBoardTheme,
  arenaBoardSeamLines,
  arenaBoardPurple,
  arenaArrivalMode,
}: CockpitPrototypeProps) {
  const theme = getDynastyScreenTokens(dynasty);
  const normalizedGeneCount = Math.max(0, Math.min(6, Math.floor(geneCount)));
  const portalLive = state === 'portal' || state === 'apex';
  const style = {
    '--dynasty-primary': theme.primary,
    '--dynasty-secondary': theme.secondary,
    '--dynasty-ambient': theme.ambientCss,
    '--snake-color': theme.snake,
  } as TokenStyle;

  const statusText =
    state === 'ready'
      ? 'Swipe or press an arrow to move'
      : state === 'apex'
        ? 'Apex expression online'
        : portalLive
          ? 'Extraction window open'
          : 'Run stable';

  return (
    <main
      className={styles.root}
      style={style}
      data-dynasty={dynasty}
      data-state={state}
      data-contrast={highContrast ? 'high' : 'default'}
      data-motion={reducedMotion ? 'reduced' : 'default'}
      data-testid="cockpit-prototype"
    >
      <GameEnvironment dynasty={dynasty} highContrast={highContrast} />

      <div className={styles.cockpitShell}>
        <div className={styles.composition}>
          <Instrument className={styles.scoreInstrument} label="Score 12,840, combo 1.8">
            <span className={styles.primaryIcon}><ScoreGlyph /></span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>Score</span>
              <strong className={styles.primaryValue}>12,840</strong>
            </span>
            <span className={styles.comboValue}>×1.8</span>
          </Instrument>

          <Instrument className={styles.dnaInstrument} label="Run DNA 186">
            <span className={`${styles.primaryIcon} ${styles.dnaIcon}`}><DnaGlyph /></span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>Run DNA</span>
              <strong className={styles.primaryValue}>186</strong>
            </span>
          </Instrument>

          <Instrument className={styles.geneRack} label={`${normalizedGeneCount} of 6 genes held`}>
            <div className={styles.geneSockets}>
              {GENE_NAMES.map(({ id, name }, index) => {
                const filled = index < normalizedGeneCount;
                return (
                  <span
                    key={id}
                    className={`${styles.geneSocket} ${filled ? styles.geneSocketFilled : ''}`}
                    aria-label={filled ? name : `Empty gene slot ${index + 1}`}
                    title={filled ? name : `Empty slot ${index + 1}`}
                  >
                    {filled ? <CatalogGeneGlyph id={id} /> : <i />}
                  </span>
                );
              })}
            </div>
          </Instrument>

          <Instrument className={styles.systemsRack} label="Run risk, portal, and strain state">
            <div className={`${styles.portalDial} ${portalLive ? styles.portalDialLive : ''}`}>
              <PortalGlyph />
              <span className={styles.portalProgress} aria-hidden="true" />
            </div>
            <div className={styles.outcomes}>
              <span className={styles.secureOutcome} aria-label="Bank 168 DNA">
                <ShieldGlyph />
                <strong>168</strong>
              </span>
              <span className={styles.riskOutcome} aria-label="Crash salvage 52 DNA">
                <RiskGlyph />
                <strong>52</strong>
              </span>
            </div>
            <div className={styles.strainArray} aria-label="Strain progress">
              {STRAINS.map((strain) => (
                <span
                  key={strain.id}
                  className={styles.strainGauge}
                  style={{ '--strain': strain.color } as TokenStyle}
                  aria-label={`${strain.name} ${strain.points} of 4`}
                  title={`${strain.name} ${strain.points}/4`}
                >
                  <span className={styles.strainIcon}><StrainGlyph id={strain.id} /></span>
                  <span className={styles.strainSegments} aria-hidden="true">
                    {[0, 1, 2, 3].map((point) => (
                      <i key={point} data-active={point < strain.points ? 'true' : 'false'} />
                    ))}
                  </span>
                </span>
              ))}
            </div>
          </Instrument>

          <Instrument className={styles.modeInstrument} label={`${mode} mode, ${dynasty} dynasty`}>
            <span className={styles.modeIcon}><ModeGlyph mode={mode} /></span>
            <span className={styles.modeCopy}>
              <strong>{state === 'ready' ? 'Move to start' : mode === 'anomaly' ? 'Anomaly' : mode === 'free' ? 'Free play' : dynasty}</strong>
              <span>{state === 'ready' ? 'Board held' : 'Genome run'}</span>
            </span>
          </Instrument>

          <div className={styles.statusRail} role="status" aria-live="polite">
            <span className={styles.statusMarker} aria-hidden="true" />
            <span>{statusText}</span>
          </div>

          {/* ET-5 removed the reset-view control with the camera it reset. */}
          <div className={styles.controls} aria-label="Cockpit controls">
            <button type="button" aria-label="Pause run" title="Pause">
              <PauseGlyph />
            </button>
          </div>

          <ArenaPreview
            state={state}
            dynasty={dynasty}
            renderer={arenaRenderer}
            arenaVariant={arenaVariant}
            arenaEffects={arenaEffects}
            arenaDensity={arenaDensity}
            arenaRenderTier={arenaRenderTier}
            arenaPitchDeg={arenaPitchDeg}
            arenaBoardTheme={arenaBoardTheme}
            arenaBoardSeamLines={arenaBoardSeamLines}
            arenaBoardPurple={arenaBoardPurple}
            arenaArrivalMode={arenaArrivalMode}
          />
        </div>
      </div>
    </main>
  );
}

export default CockpitPrototype;
