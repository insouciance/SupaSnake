'use client';

import type { CSSProperties, ReactNode } from 'react';
import { getDynastyScreenTokens } from '@/components/game/screen/gameScreenTokens';
import {
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
} from './CockpitGlyphs';
import type { RunCockpitModel } from './types';
import styles from './CockpitPrototype.module.css';

interface RunCockpitProps {
  model: RunCockpitModel;
  children: ReactNode;
  onPause: () => void;
  onResetView: () => void;
  pauseDisabled?: boolean;
  showPause?: boolean;
  pauseLabel?: string;
  inputDock?: ReactNode;
  decisionDock?: ReactNode;
  eventCallout?: ReactNode;
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
  onResetView,
  pauseDisabled = false,
  showPause = true,
  pauseLabel = 'Pause run',
  inputDock,
  decisionDock,
  eventCallout,
}: RunCockpitProps) {
  const theme = getDynastyScreenTokens(model.dynasty);
  const style = {
    '--dynasty-primary': theme.primary,
    '--dynasty-secondary': theme.secondary,
    '--dynasty-ambient': theme.ambientCss,
    '--snake-color': theme.snake,
  } as TokenStyle;
  const comboLive = model.chainLength >= 2;
  const readyStatus = model.state === 'ready' || model.state === 'held';

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
            label={`Score ${formatTelemetry(model.score)}${comboLive ? `, combo ${model.comboMultiplier.toFixed(1)}` : ''}`}
          >
            <span className={styles.primaryIcon}><ScoreGlyph /></span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>Score</span>
              <strong className={styles.primaryValue}>{formatTelemetry(model.score)}</strong>
            </span>
            <span className={`${styles.comboValue} ${comboLive ? '' : styles.telemetryDormant}`}>
              {comboLive ? `×${model.comboMultiplier.toFixed(1)}` : '×1.0'}
            </span>
          </Instrument>

          <Instrument className={styles.dnaInstrument} label={`Run DNA ${formatTelemetry(model.dna)}`}>
            <span className={`${styles.primaryIcon} ${styles.dnaIcon}`}><DnaGlyph /></span>
            <span className={styles.primaryCopy}>
              <span className={styles.instrumentLabel}>Run DNA</span>
              <strong className={styles.primaryValue}>{formatTelemetry(model.dna)}</strong>
            </span>
          </Instrument>

          <Instrument
            className={`${styles.geneRack} ${model.showGenome ? '' : styles.systemDormant}`}
            label={model.showGenome ? `${model.genes.length} of 6 genes held` : 'Genome telemetry not yet discovered'}
          >
            <div className={styles.geneSockets}>
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
            </div>
          </Instrument>

          <Instrument className={styles.systemsRack} label="Extraction risk and strain state">
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
          </Instrument>

          <Instrument
            className={styles.modeInstrument}
            label={`${model.modeLabel}, ${model.dynasty} dynasty`}
            testId={model.mode === 'free' ? 'free-play-watermark' : undefined}
          >
            <span className={styles.modeIcon}><ModeGlyph mode={model.mode} /></span>
            <span className={styles.modeCopy}>
              <strong>{model.modeLabel}</strong>
              <span>{model.modeDetail}</span>
            </span>
            <span
              className={styles.energyReadout}
              aria-label={`Energy ${model.energy} of ${model.maxEnergy}`}
              title={`Energy ${model.energy} of ${model.maxEnergy}`}
            >
              <span aria-hidden="true"><EnergyGlyph /></span>
              <strong>{model.energy}/{model.maxEnergy}</strong>
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
            <button
              type="button"
              onClick={onPause}
              disabled={pauseDisabled || !showPause}
              aria-label={pauseLabel}
              title={pauseDisabled ? 'Pause rearming' : pauseLabel}
              className={!showPause ? styles.controlHidden : undefined}
            >
              <PauseGlyph />
            </button>
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
