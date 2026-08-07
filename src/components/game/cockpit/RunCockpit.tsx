'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  ARENA_BLEED_STYLE,
  getDynastyScreenTokens,
} from '@/components/game/screen/gameScreenTokens';
import {
  AbandonGlyph,
  DnaGlyph,
  EnergyGlyph,
  GeneGlyph,
  ModeGlyph,
  OverclockGlyph,
  PauseGlyph,
  PortalGlyph,
  RiskGlyph,
  ScoreGlyph,
  ShieldGlyph,
  StrainGlyph,
  TrainingObjectiveGlyph,
  TrainingTickGlyph,
} from './CockpitGlyphs';
import type { RunCockpitModel } from './types';
import type { GenomeV2OverclockSource } from '@/components/game/genome/genomeV2RuntimeAdapter';
import { formatNonNegativeAmount } from '@/shared/format/amount';
import { NINETIES_COMPOSITION_ENABLED } from '@/lib/features/ninetiesComposition';
import styles from './CockpitPrototype.module.css';

interface RunCockpitProps {
  model: RunCockpitModel;
  children: ReactNode;
  onPause: () => void;
  onAbandon?: () => void;
  onOverclock?: (source: GenomeV2OverclockSource) => void;
  pauseDisabled?: boolean;
  showPause?: boolean;
  showAbandon?: boolean;
  pauseLabel?: string;
  decisionDock?: ReactNode;
  eventCallout?: ReactNode;
  /** Transient rate feedback in the fixed rail between HUD and arena. */
  rateCallout?: ReactNode;
}

type TokenStyle = CSSProperties & Record<`--${string}`, string>;

const EMPTY_GENE_SLOTS = Array.from({ length: 6 }, (_, index) => index);

/** Live instrument amounts are whole numbers; the trays are sized for them. */
const formatTelemetry = formatNonNegativeAmount;

function Instrument({
  className,
  children,
  label,
  testId,
}: {
  className: string;
  children: ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <section
      className={`${styles.instrument} ${className}`}
      aria-label={label}
      data-cockpit-zone="instrument"
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function RunCockpit({
  model,
  children,
  onPause,
  onAbandon,
  onOverclock,
  pauseDisabled = false,
  showPause = true,
  showAbandon = false,
  pauseLabel = 'Pause run',
  decisionDock,
  eventCallout,
  rateCallout,
}: RunCockpitProps) {
  const theme = getDynastyScreenTokens(model.dynasty);
  const style = {
    '--dynasty-primary': theme.primary,
    '--dynasty-secondary': theme.secondary,
    '--dynasty-ambient': theme.ambientCss,
    '--snake-color': theme.snake,
  } as TokenStyle;
  // COSMIC only: the stars left, and how much of their window is left.
  const constellation = model.constellation;
  const readyStatus = model.state === 'ready' || model.state === 'held';
  const training = model.training;
  const primaryLabel = training?.primaryLabel ?? 'Score';
  const primaryValue = training?.primaryValue ?? formatTelemetry(model.score);
  const secondaryLabel = training?.secondaryLabel ?? 'Run DNA';
  const secondaryValue = training?.secondaryValue ?? formatTelemetry(model.dna);

  return (
    <main
      className={styles.liveRoot}
      style={style}
      data-dynasty={model.dynasty}
      data-state={model.state}
      data-input="flick"
      data-decision={decisionDock ? 'true' : 'false'}
      /*
       * WHICH COMPOSITION THIS BUILD SHIPPED, published so it can be asserted
       * rather than assumed.
       *
       * `NEXT_PUBLIC_*` is inlined at build time, so nothing at runtime can
       * read the flag back out of the artifact - and a rollback CI cannot see
       * is a rollback nobody is testing. The chamber publishes the same fact
       * for the same reason (see `SpecimenChamber`); this one is here so a
       * screenshot or a bug report from the played board carries which
       * composition produced it.
       */
      data-composition={NINETIES_COMPOSITION_ENABLED ? 'nineties' : 'stone'}
      data-testid="game-hud"
    >
      <div className={styles.cockpitShell}>
        <div className={styles.composition}>
          <Instrument
            className={styles.scoreInstrument}
            label={`${primaryLabel} ${primaryValue}${
              !training && constellation
                ? `, ${constellation.stars} ${
                    constellation.stars === 1 ? 'star' : 'stars'
                  } left this constellation`
                : ''
            }`}
          >
            <span className={styles.primaryIcon}>
              {training ? <TrainingObjectiveGlyph /> : <ScoreGlyph />}
            </span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>{primaryLabel}</span>
              <strong className={styles.primaryValue}>{primaryValue}</strong>
            </span>
            {!training && constellation && (
              <span
                className={styles.comboValue}
                data-testid="constellation-window"
                // The bar IS the warning: it drains, and what is left on the
                // board when it empties turns solid where it sits.
                style={
                  {
                    '--constellation-window': `${Math.round(
                      Math.max(0, Math.min(1, constellation.fraction)) * 100
                    )}%`,
                  } as TokenStyle
                }
              >
                ★{constellation.stars}
              </span>
            )}
          </Instrument>

          <Instrument className={styles.dnaInstrument} label={`${secondaryLabel} ${secondaryValue}`}>
            <span className={`${styles.primaryIcon} ${training ? '' : styles.dnaIcon}`}>
              {training ? <TrainingTickGlyph /> : <DnaGlyph />}
            </span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>{secondaryLabel}</span>
              <strong className={styles.primaryValue}>{secondaryValue}</strong>
            </span>
          </Instrument>

          <Instrument
            className={`${styles.geneRack} ${model.showGenome ? '' : styles.systemDormant}`}
            label={training
              ? `${training.progressLabel} ${training.progress} of ${training.progressTotal}`
              : model.showGenome ? `${model.genes.length} of 6 genes held` : 'Genome telemetry not yet discovered'}
          >
            {training ? (
              <div className={styles.trainingProgress}>
                <span>
                  <strong>{training.progressLabel}</strong>
                  <em>{training.progress}/{training.progressTotal}</em>
                </span>
                <i aria-hidden="true">
                  <b style={{ width: `${training.progressTotal > 0 ? Math.min(100, training.progress / training.progressTotal * 100) : 0}%` }} />
                </i>
              </div>
            ) : <div className={styles.geneSockets}>
              {EMPTY_GENE_SLOTS.map((index) => {
                const gene = model.showGenome ? model.genes[index] : undefined;
                return (
                  <span
                    key={gene?.id ?? `empty-${index}`}
                    className={`${styles.geneSocket} ${gene ? styles.geneSocketFilled : ''} ${gene?.spent ? styles.geneSocketSpent : ''}`}
                    aria-label={gene ? `${gene.name}${gene.spent ? ', spent' : ''}` : `Empty gene slot ${index + 1}`}
                    title={gene ? gene.name : undefined}
                  >
                    {gene ? <GeneGlyph id={gene.id} /> : <i />}
                  </span>
                );
              })}
            </div>}
          </Instrument>

          <Instrument
            className={styles.systemsRack}
            label={training ? 'Training attempt metrics' : 'Extraction risk and strain state'}
          >
            {training ? (
              <div className={styles.trainingMetrics}>
                {training.metrics.slice(0, 3).map((metric) => (
                  <span key={metric.label}>
                    <small>{metric.label}</small>
                    <strong>{metric.value}</strong>
                  </span>
                ))}
              </div>
            ) : <>
            <div
              className={`${styles.portalDial} ${model.portalLive ? styles.portalDialLive : ''}`}
              aria-label={model.portalLive
                ? `Extraction portal live, ${model.portalTicksRemaining} ticks remaining`
                : 'Extraction portal offline'}
              title={model.portalLive ? `${model.portalTicksRemaining} ticks remaining` : 'Portal offline'}
            >
              <PortalGlyph />
              <span className={styles.portalProgress} aria-hidden="true" />
            </div>

            <div className={styles.outcomes}>
              <span className={styles.secureOutcome} aria-label={`Bank value ${model.bankOutcomeLabel ?? `${formatTelemetry(model.bankDna)} DNA`}`} title={model.outcomeUnitLabel}>
                <ShieldGlyph />
                <strong>{model.bankOutcomeLabel ?? formatTelemetry(model.bankDna)}</strong>
              </span>
              <span className={styles.riskOutcome} aria-label={`Crash salvage ${model.crashOutcomeLabel ?? `${formatTelemetry(model.crashDna)} DNA`}`} title={model.outcomeUnitLabel}>
                <RiskGlyph />
                <strong>{model.crashOutcomeLabel ?? formatTelemetry(model.crashDna)}</strong>
              </span>
            </div>

            <div
              className={`${styles.strainArray} ${model.showGenome ? '' : styles.systemDormant}`}
              aria-label={model.showGenome ? 'Strain progress' : 'Strain telemetry not yet discovered'}
              data-testid="strain-meter"
            >
              {model.strains.map((strain) => {
                const pointCap = Math.max(
                  1,
                  Math.min(
                    5,
                    Math.floor(strain.apexTarget ?? model.strainPointCap ?? 4)
                  )
                );
                const activePoints = Math.max(0, Math.min(pointCap, Math.floor(strain.points)));
                return (
                  <span
                    key={strain.id}
                    className={`${styles.strainGauge} ${strain.suppressed ? styles.strainSuppressed : ''}`}
                    style={{
                      '--strain': strain.color,
                      '--strain-points': String(pointCap),
                    } as TokenStyle}
                    aria-label={`${strain.name} ${activePoints} of ${pointCap}, tier ${strain.tier}${strain.suppressed ? ', Dampened: Minor remains available; Expression and Apex capped' : ''}`}
                    title={`${strain.name} ${activePoints}/${pointCap}${strain.suppressed ? ' · Dampened · Minor available · higher reactions capped' : ''}`}
                    data-testid={`strain-meter-${strain.id}`}
                  >
                    <span className={styles.strainIcon}><StrainGlyph id={strain.id} /></span>
                    <span className={styles.strainSegments} aria-hidden="true">
                      {Array.from({ length: pointCap }, (_, point) => (
                        <i key={point} data-active={point < activePoints ? 'true' : 'false'} />
                      ))}
                    </span>
                  </span>
                );
              })}
            </div>
            </>}
          </Instrument>

          <Instrument
            className={styles.modeInstrument}
            label={`${model.modeLabel}, ${model.dynasty} dynasty`}
            testId={model.mode === 'free'
              ? 'free-play-watermark'
              : model.mode === 'training' ? 'training-watermark' : undefined}
          >
            <span className={styles.modeIcon}><ModeGlyph mode={model.mode} /></span>
            <span className={styles.modeCopy}>
              <strong>{model.modeLabel}</strong>
              <span>{model.modeDetail}</span>
            </span>
            <span className={styles.modeReadouts}>
              {training ? (
                <span className={styles.energyReadout} aria-label={training.comparison} title={training.comparison}>
                  <strong>{training.comparison}</strong>
                </span>
              ) : model.energyCommitment ? (
                <span
                  className={styles.energyReadout}
                  data-testid="energy-stake"
                  aria-label={
                    model.energyCommitment.state === 'charged'
                      ? `${model.energyCommitment.committed} Energy committed, harvest multiplier ${model.energyCommitment.multiplierBps / 10_000}`
                      : model.energyCommitment.state === 'lean'
                        ? 'Lean run, harvest multiplier 0.25'
                        : 'Energy-exempt run, full harvest'
                  }
                  title={
                    model.energyCommitment.state === 'charged'
                      ? `${model.energyCommitment.committed} Energy · ×${(model.energyCommitment.multiplierBps / 10_000).toFixed(1)}`
                      : model.energyCommitment.state === 'lean'
                        ? 'Lean · ×0.25'
                        : 'Exempt · ×1.0'
                  }
                >
                  <span aria-hidden="true"><EnergyGlyph /></span>
                  <strong>
                    {model.energyCommitment.state === 'charged'
                      ? `${model.energyCommitment.committed}E ×${(model.energyCommitment.multiplierBps / 10_000).toFixed(1)}`
                      : model.energyCommitment.state === 'lean'
                        ? 'LEAN ×0.25'
                        : 'EXEMPT ×1.0'}
                  </strong>
                </span>
              ) : null}
              {model.holds ? (
                <span
                  className={`${styles.energyReadout} ${styles.holdReadout}`}
                  data-testid="hold-budget"
                  data-spent={model.holds.remaining === 0 ? 'true' : 'false'}
                  aria-label={`Tactical holds ${model.holds.remaining} of ${model.holds.total}`}
                  title={`Tactical holds ${model.holds.remaining} of ${model.holds.total}`}
                >
                  <span aria-hidden="true"><PauseGlyph /></span>
                  <strong>{model.holds.remaining}/{model.holds.total}</strong>
                </span>
              ) : null}
            </span>
          </Instrument>

          {eventCallout ? (
            <div className={styles.eventCallout} data-cockpit-zone="status">
              {eventCallout}
            </div>
          ) : rateCallout ? (
            <div
              className={styles.eventCallout}
              data-cockpit-zone="status"
              data-testid="run-rate-rail"
            >
              {rateCallout}
            </div>
          ) : (
            <div
              className={styles.statusRail}
              role="status"
              aria-live="polite"
              data-testid={readyStatus ? 'resume-gate' : undefined}
              data-cockpit-zone="status"
            >
              <span className={styles.statusMarker} aria-hidden="true" />
              <span
                data-testid={
                  model.state === 'held'
                    ? 'tactical-hold'
                    : model.isFirstMovementPrompt
                      ? 'first-movement-prompt'
                      : undefined
                }
              >
                {model.statusText}
              </span>
            </div>
          )}

          {model.overclock && model.state !== 'held' ? (
            <div
              className={styles.overclockRail}
              data-active={model.overclock.active ? 'true' : 'false'}
              data-testid="genome-overclock-control"
            >
              {model.overclock.active ? (
                <span
                  role="status"
                  aria-label={`${model.overclock.active.label} active at ${model.overclock.active.multiplierBps / 10_000} times speed for ${model.overclock.active.remainingMoves} more moves`}
                >
                  <OverclockGlyph />
                  <strong>{model.overclock.active.label}</strong>
                  <em>{model.overclock.active.remainingMoves}M</em>
                </span>
              ) : model.overclock.available.map((source, index) => (
                <button
                  key={source.source}
                  type="button"
                  disabled={!onOverclock || !['active', 'apex'].includes(model.state)}
                  onClick={() => onOverclock?.(source.source)}
                  aria-label={`Activate ${source.label}, speed ${source.multiplierBps / 10_000} times for ${source.moveBudget} moves`}
                  aria-keyshortcuts={index === 0 ? 'R' : 'Shift+R'}
                  title={`${source.label} · ×${source.multiplierBps / 10_000} speed · ${source.moveBudget} moves · ${index === 0 ? 'R' : 'Shift+R'}`}
                  data-overclock-source={source.source}
                >
                  <OverclockGlyph />
                  <strong>{source.label}</strong>
                  <kbd>{index === 0 ? 'R' : '⇧R'}</kbd>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={styles.controls}
            aria-label="Cockpit controls"
            data-cockpit-zone="controls"
          >
            {showPause ? (
              <button
                type="button"
                onClick={onPause}
                disabled={pauseDisabled}
                aria-label={pauseLabel}
                title={pauseDisabled ? 'Pause rearming' : pauseLabel}
                data-control="pause"
              >
                <PauseGlyph />
                <span className={styles.controlLabel}>Hold</span>
              </button>
            ) : showAbandon && onAbandon ? (
              <button
                type="button"
                onClick={onAbandon}
                aria-label="Abandon run"
                title="Abandon run"
                className={styles.abandonControl}
                data-control="abandon"
              >
                <AbandonGlyph />
                <span className={styles.controlLabel}>Abandon</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-hidden="true"
                tabIndex={-1}
                className={styles.controlHidden}
              >
                <PauseGlyph />
              </button>
            )}
          </div>

          {decisionDock && (
            <div
              className={styles.decisionDock}
              data-testid="cockpit-decision-dock"
              data-cockpit-zone="decision"
            >
              {decisionDock}
            </div>
          )}

                    {/* THE CAMERA'S GRAB SURFACE - a SIBLING of the bay, not a child.

              It occupies the same rectangle (`grid-area: arena`), but it must
              not inherit the bay's z-index: the bay paints at 20 so a twisted
              board can break out over the HUD, and a grab surface up there
              outranks the mobile flick layer at z-5 and swallows every
              steering gesture. Input belongs at the board's OLD level, below
              flick and below the HUD controls. See `.arenaInputIsland`. */}
          <div
            className={styles.arenaInputIsland}
            data-arena-input-island=""
            aria-hidden="true"
          />

          <div className={styles.arenaBay} data-testid="cockpit-arena-bay">
            <div className={styles.arenaQuietZone} aria-hidden="true" />
            <div className={styles.arenaFrame} data-testid="cockpit-arena-frame">
              <div className={styles.webglViewport} data-testid="game-board-viewport">
                {/* The oversized paint surface. The rectangle above stays the
                    bay; this is the margin the board may spill into when the
                    player twists the camera. */}
                <div
                  className={styles.arenaCanvasBleed}
                  style={ARENA_BLEED_STYLE}
                >
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default RunCockpit;
