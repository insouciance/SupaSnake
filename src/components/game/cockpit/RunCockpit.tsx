'use client';

import type { CSSProperties, ReactNode } from 'react';
import { getDynastyScreenTokens } from '@/components/game/screen/gameScreenTokens';
import { GrowthReadout } from '@/components/game/GrowthReadout';
import {
  AbandonGlyph,
  DnaGlyph,
  EnergyGlyph,
  GeneGlyph,
  ModeGlyph,
  PauseGlyph,
  PortalGlyph,
  ResetGlyph,
  RiskGlyph,
  ScoreGlyph,
  ShieldGlyph,
  StrainGlyph,
  TrainingObjectiveGlyph,
  TrainingTickGlyph,
} from './CockpitGlyphs';
import type { RunCockpitModel } from './types';
import styles from './CockpitPrototype.module.css';

interface RunCockpitProps {
  model: RunCockpitModel;
  children: ReactNode;
  onPause: () => void;
  onAbandon?: () => void;
  onResetView: () => void;
  pauseDisabled?: boolean;
  showPause?: boolean;
  showAbandon?: boolean;
  pauseLabel?: string;
  inputDock?: ReactNode;
  decisionDock?: ReactNode;
  eventCallout?: ReactNode;
  /**
   * The growth step notice (WP-3.09), rendered INSIDE the mode instrument
   * beside the growth readout it explains.
   *
   * Deliberately not routed through `eventCallout`: that zone REPLACES the
   * status rail (both are `grid-area: status`) and suppresses the
   * `first-movement-prompt` testid an e2e spec depends on. A growth step is a
   * passive fact about the run, so it layers next to its own number instead of
   * evicting whatever the rail was saying.
   */
  growthNotice?: ReactNode;
}

type TokenStyle = CSSProperties & Record<`--${string}`, string>;

const EMPTY_GENE_SLOTS = Array.from({ length: 6 }, (_, index) => index);

function formatTelemetry(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

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
  onResetView,
  pauseDisabled = false,
  showPause = true,
  showAbandon = false,
  pauseLabel = 'Pause run',
  inputDock,
  decisionDock,
  eventCallout,
  growthNotice,
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
      data-input={inputDock ? 'dpad' : 'flick'}
      data-decision={decisionDock ? 'true' : 'false'}
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
              <span className={styles.secureOutcome} aria-label={`Bank value ${formatTelemetry(model.bankDna)} DNA`}>
                <ShieldGlyph />
                <strong>{formatTelemetry(model.bankDna)}</strong>
              </span>
              <span className={styles.riskOutcome} aria-label={`Crash salvage ${formatTelemetry(model.crashDna)} DNA`}>
                <RiskGlyph />
                <strong>{formatTelemetry(model.crashDna)}</strong>
              </span>
            </div>

            <div
              className={`${styles.strainArray} ${model.showGenome ? '' : styles.systemDormant}`}
              aria-label={model.showGenome ? 'Strain progress' : 'Strain telemetry not yet discovered'}
              data-testid="strain-meter"
            >
              {model.strains.map((strain) => {
                const activePoints = Math.max(0, Math.min(4, Math.floor(strain.points)));
                return (
                  <span
                    key={strain.id}
                    className={`${styles.strainGauge} ${strain.suppressed ? styles.strainSuppressed : ''}`}
                    style={{ '--strain': strain.color } as TokenStyle}
                    aria-label={`${strain.name} ${activePoints} of 4, tier ${strain.tier}${strain.suppressed ? ', suppressed' : ''}`}
                    title={`${strain.name} ${activePoints}/4${strain.suppressed ? ' · suppressed' : ''}`}
                    data-testid={`strain-meter-${strain.id}`}
                  >
                    <span className={styles.strainIcon}><StrainGlyph id={strain.id} /></span>
                    <span className={styles.strainSegments} aria-hidden="true">
                      {[0, 1, 2, 3].map((point) => (
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
              {/* The live growth rate, and its step notice beside it (WP-3.09).
                  Training omits `growth` entirely - a driven run eats no
                  profile food, so there is no honest rate to print. */}
              {model.growth ? (
                <GrowthReadout
                  profileId={model.growth.profileId}
                  label={model.growth.label}
                  perFood={model.growth.perFood}
                  foodsOnBoard={model.growth.foodsOnBoard}
                  presentation="cockpit"
                />
              ) : null}
              {growthNotice}
              {training ? (
                <span className={styles.energyReadout} aria-label={training.comparison} title={training.comparison}>
                  <strong>{training.comparison}</strong>
                </span>
              ) : model.charge ? (
                <span
                  className={styles.energyReadout}
                  aria-label={`Charges ${model.charge.remaining} of ${model.charge.perDay}`}
                  title={`Charges ${model.charge.remaining} of ${model.charge.perDay}`}
                >
                  <span aria-hidden="true"><EnergyGlyph /></span>
                  <strong>{model.charge.remaining}/{model.charge.perDay}</strong>
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
          ) : (
            <div
              className={styles.statusRail}
              role="status"
              aria-live="polite"
              data-testid={readyStatus ? 'resume-gate' : undefined}
              data-cockpit-zone="status"
            >
              <span className={styles.statusMarker} aria-hidden="true" />
              <span data-testid={model.isFirstMovementPrompt ? 'first-movement-prompt' : undefined}>
                {model.statusText}
              </span>
            </div>
          )}

          <div
            className={styles.controls}
            aria-label="Cockpit controls"
            data-cockpit-zone="controls"
          >
            <button type="button" onClick={onResetView} aria-label="Reset arena view" title="Reset view">
              <ResetGlyph />
            </button>
            {showPause ? (
              <button
                type="button"
                onClick={onPause}
                disabled={pauseDisabled}
                aria-label={pauseLabel}
                title={pauseDisabled ? 'Pause rearming' : pauseLabel}
              >
                <PauseGlyph />
              </button>
            ) : showAbandon && onAbandon ? (
              <button
                type="button"
                onClick={onAbandon}
                aria-label="Abandon run"
                title="Abandon run"
                className={styles.abandonControl}
              >
                <AbandonGlyph />
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

          {inputDock && (
            <div
              className={styles.inputDock}
              aria-label="Directional controls"
              data-cockpit-zone="input"
            >
              {inputDock}
            </div>
          )}

          {decisionDock && (
            <div
              className={styles.decisionDock}
              data-testid="cockpit-decision-dock"
              data-cockpit-zone="decision"
            >
              {decisionDock}
            </div>
          )}

          <div className={styles.arenaBay} data-testid="cockpit-arena-bay">
            <div className={styles.arenaQuietZone} aria-hidden="true" />
            {model.state === 'held' && (
              <div
                className={styles.tacticalHoldRail}
                role="status"
                aria-live="polite"
                data-testid="tactical-hold"
              >
                <strong>Tactical hold</strong>
                <span>Move to resume</span>
              </div>
            )}
            <div className={styles.arenaFrame} data-testid="cockpit-arena-frame">
              <div className={styles.webglViewport} data-testid="game-board-viewport">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default RunCockpit;
