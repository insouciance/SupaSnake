'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GeneGlyph, StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import type {
  TacticalLoomConsequence,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
  TacticalLoomSplicePath,
  TacticalLoomStrainProjection,
  TacticalLoomThreshold,
} from './tacticalLoomPresentation';
import styles from './TacticalLoomLite.module.css';

const LIVE_LEDGER_IDS = new Set([
  'bonds',
  'anchor',
  'loom-bond',
  'escrow',
  'stake',
  'second-life',
]);

type LoomStyle = CSSProperties & Record<`--${string}`, string>;

function sameLocus(
  before: TacticalLoomGenomeSlot | undefined,
  after: TacticalLoomGenomeSlot | undefined
): boolean {
  return Boolean(
    before
    && after
    && before.kind === after.kind
    && before.label === after.label
    && before.detail === after.detail
  );
}

function changedLoci(
  before: readonly TacticalLoomGenomeSlot[],
  after: readonly TacticalLoomGenomeSlot[]
): Array<{ before: TacticalLoomGenomeSlot; after: TacticalLoomGenomeSlot }> {
  return before.flatMap((slot) => {
    const result = after.find((candidate) => candidate.index === slot.index);
    return result && !sameLocus(slot, result) ? [{ before: slot, after: result }] : [];
  });
}

function factChanged(fact: TacticalLoomFact): boolean {
  return fact.before !== fact.after;
}

function cadenceBeads(cadence: number | undefined): number[] {
  const count = Math.max(0, Math.min(8, Math.floor(cadence ?? 0)));
  return Array.from({ length: count }, (_, index) => index);
}

function defaultThreshold(strain: TacticalLoomStrainProjection): TacticalLoomThreshold | null {
  return strain.thresholds.find(
    (tier) => strain.before < tier.points && strain.after >= tier.points
  ) ?? strain.thresholds.find((tier) => tier.state === 'next') ?? null;
}

function thresholdStateLabel(
  strain: TacticalLoomStrainProjection,
  threshold: TacticalLoomThreshold
): string {
  if (
    threshold.state === 'locked'
    && strain.before < threshold.points
    && strain.after >= threshold.points
  ) return 'REACHED · LOCKED';
  if (strain.before < threshold.points && strain.after >= threshold.points) return 'NOW';
  if (threshold.state === 'next') return 'NEXT';
  if (threshold.state === 'active') return 'ACTIVE';
  if (threshold.state === 'locked') return 'LOCKED';
  return 'FUTURE';
}

function projectionLabel(splice: TacticalLoomSplicePath): string {
  if (splice.projectionState === 'breaks' || splice.id.endsWith(':break')) return 'BREAKS';
  if (splice.projectionState === 'closed') return 'CLOSED';
  if (splice.projectionState === 'recode') return 'RECODE';
  if (splice.projectionState === 'unavailable' || splice.activation === 'locked') return 'LOCKED';
  if (splice.projectionState === 'forms-now' || splice.stage === 'immediate') return 'FORMS';
  return 'FUTURE';
}

function projectionTone(splice: TacticalLoomSplicePath): 'live' | 'future' | 'danger' {
  if (splice.projectionState === 'breaks' || splice.id.endsWith(':break')) return 'danger';
  return splice.projectionState === 'forms-now' || splice.stage === 'immediate'
    ? 'live'
    : 'future';
}

function TriggerRhythm({ consequence }: { consequence: TacticalLoomConsequence }) {
  if (!consequence.trigger) return null;
  const beads = cadenceBeads(consequence.trigger.cadence);
  return (
    <div className={styles.triggerRhythm} data-testid="loom-lite-trigger">
      {beads.length > 0 ? (
        <span className={styles.triggerBeads} aria-hidden="true">
          {beads.map((index) => (
            <i key={index} data-lit={index === beads.length - 1 ? 'true' : 'false'} />
          ))}
        </span>
      ) : (
        <i className={styles.eventRune} aria-hidden="true" />
      )}
      <span>{consequence.trigger.label}</span>
    </div>
  );
}

function StrainRoute({
  strain,
  focusedPoint,
  onFocusPoint,
}: {
  strain: TacticalLoomStrainProjection;
  focusedPoint: number | null;
  onFocusPoint: (point: number) => void;
}) {
  const defaultDetail = defaultThreshold(strain);
  const detail = strain.thresholds.find((tier) => tier.points === focusedPoint) ?? defaultDetail;
  const colorStyle = { '--strain': strain.color } as LoomStyle;

  return (
    <article
      className={styles.strainRoute}
      style={colorStyle}
      data-testid={`loom-strain-${strain.id}`}
    >
      <div className={styles.strainIdentity}>
        <span className={styles.strainRune} aria-hidden="true"><StrainGlyph id={strain.id} /></span>
        <span>
          <strong>{STRAINS[strain.id].name.toUpperCase()}</strong>
          <small>{strain.before} → {strain.after}</small>
        </span>
      </div>
      <span className={styles.strainThread} aria-hidden="true" />
      <div className={styles.thresholdPath} role="group" aria-label={`${strain.name} Strain ladder`}>
        {strain.thresholds.map((threshold) => {
          const crossed = strain.before < threshold.points && strain.after >= threshold.points;
          const selected = detail?.points === threshold.points;
          return (
            <button
              key={threshold.points}
              type="button"
              className={styles.thresholdNode}
              data-state={threshold.state}
              data-crossed={crossed ? 'true' : 'false'}
              data-selected={selected ? 'true' : 'false'}
              aria-pressed={selected}
              aria-label={`${strain.name} ${threshold.points}, ${threshold.name}: ${threshold.rule}`}
              onClick={() => onFocusPoint(threshold.points)}
              onFocus={() => onFocusPoint(threshold.points)}
              data-testid={`loom-strain-${strain.id}-tier-${threshold.points}`}
            >
              <span>{threshold.points}</span>
              <strong>{threshold.name}</strong>
            </button>
          );
        })}
      </div>
      {detail ? (
        <p className={styles.thresholdRule} data-testid={`loom-strain-${strain.id}-rule`}>
          <b>{thresholdStateLabel(strain, detail)}</b>
          <span>{detail.rule}</span>
          {detail.lockedReason ? <em>{detail.lockedReason}</em> : null}
        </p>
      ) : null}
    </article>
  );
}

function SpliceBranches({ splices }: { splices: readonly TacticalLoomSplicePath[] }) {
  const ordered = useMemo(
    () => [...splices].sort((left, right) => {
      const leftLive = projectionTone(left) === 'live';
      const rightLive = projectionTone(right) === 'live';
      if (leftLive !== rightLive) return leftLive ? -1 : 1;
      return left.name.localeCompare(right.name);
    }),
    [splices]
  );
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    setFocused(ordered[0]?.id ?? null);
  }, [ordered]);

  if (ordered.length === 0) return null;
  const selected = ordered.find((splice) => splice.id === focused) ?? ordered[0];

  return (
    <section className={styles.spliceMap} data-testid="loom-lite-splices" aria-label="Splice branches">
      <div className={styles.spliceHeading}>
        <span className={styles.braidRune} aria-hidden="true"><i /><i /><i /></span>
        <strong>SPLICE PATHS</strong>
        <small>{ordered.length} visible</small>
      </div>
      <div className={styles.spliceBranches}>
        {ordered.map((splice) => {
          const tone = projectionTone(splice);
          const active = selected.id === splice.id;
          return (
            <button
              key={splice.id}
              type="button"
              className={styles.spliceBranch}
              data-tone={tone}
              data-selected={active ? 'true' : 'false'}
              onClick={() => setFocused(splice.id)}
              onFocus={() => setFocused(splice.id)}
              aria-pressed={active}
              data-testid={`loom-lite-splice-${splice.id}`}
            >
              <span className={styles.spliceNode} aria-hidden="true"><i /><i /></span>
              <span className={styles.spliceCopy}>
                <strong>{splice.name}</strong>
                <small>
                  {projectionLabel(splice)}
                  {splice.partnerLabel ? ` · ${splice.partnerState === 'held' ? 'HELD' : 'NEEDS'} ${splice.partnerLabel}` : ''}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.spliceRule} data-testid="loom-splice-detail">
        <b>{selected.name}</b>
        <span>{selected.rule}</span>
        <em>{selected.recipeLabel}</em>
        {selected.lockedReason ? <em>{selected.lockedReason}</em> : null}
      </p>
    </section>
  );
}

function DeltaCharm({ fact }: { fact: TacticalLoomFact }) {
  return (
    <li
      className={styles.deltaCharm}
      data-tone={fact.tone ?? 'neutral'}
      data-testid={`loom-lite-fact-${fact.id}`}
      title={fact.detail}
    >
      <span>{fact.label}</span>
      <strong>{fact.before} <i aria-hidden="true">→</i> {fact.after}</strong>
    </li>
  );
}

function InlineStrains({ strains }: { strains: readonly StrainId[] }) {
  if (strains.length === 0) return null;
  return (
    <span
      className={styles.inlineStrains}
      aria-label={`Strains ${strains.map((id) => STRAINS[id].name).join(', ')}`}
    >
      {strains.map((id) => (
        <em key={id} style={{ '--strain': STRAINS[id].color } as LoomStyle}>
          <i aria-hidden="true"><StrainGlyph id={id} /></i>
          {STRAINS[id].name.toUpperCase()}
        </em>
      ))}
    </span>
  );
}

export function TacticalLoomLite({
  consequence,
  action,
  currentGenome,
  geneId = null,
  geneName = null,
  strains = [],
  showStrains = false,
}: {
  consequence: TacticalLoomConsequence;
  action: string;
  currentGenome: readonly TacticalLoomGenomeSlot[];
  geneId?: string | null;
  geneName?: string | null;
  strains?: readonly StrainId[];
  showStrains?: boolean;
}) {
  const [focusedThresholds, setFocusedThresholds] = useState<Record<string, number>>({});
  const loci = changedLoci(currentGenome, consequence.genomeAfter);
  const ledgers = consequence.ledgers.filter(
    (fact) => LIVE_LEDGER_IDS.has(fact.id) && factChanged(fact)
  );
  const bodyAndTerrain = consequence.body.filter(
    (fact) => factChanged(fact)
      && ['body-length', 'future-growth', 'trigger-growth', 'terrain-rule', 'permanent-terrain'].includes(fact.id)
  );
  const changedOutcomes = consequence.outcomes.filter(factChanged);
  const phoenixConflict = consequence.retainedFacts?.find((fact) => fact.includes('Phoenix'));
  const coreStrains = strains.length > 0 ? strains : consequence.strains.map((strain) => strain.id);

  useEffect(() => {
    setFocusedThresholds({});
  }, [action, geneId]);

  return (
    <section
      className={styles.loom}
      data-testid="loom-lite"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.loomConstellation} aria-hidden="true" />
      <header className={styles.loomHeader}>
        <span>{action}</span>
        <strong>{consequence.salienceChip ?? consequence.category}</strong>
      </header>

      <h3 className={styles.focusedGeneName} data-testid="loom-focused-gene-name">
        {geneName ?? 'Keep current Genome'}
      </h3>

      <div className={styles.coreStage}>
        <p className={styles.integratedCopy} data-tone="gain">
          <b>GAIN</b><span>{consequence.effect}</span>
        </p>
        <div className={styles.geneCore} data-testid="loom-gene-core">
          <i className={styles.coreOrbit} aria-hidden="true" />
          <span className={styles.geneRune} aria-hidden="true"><GeneGlyph id={geneId ?? 'loom-decline'} /></span>
          <strong aria-hidden="true">{geneName ?? 'DECLINE'}</strong>
          {coreStrains.length > 0 ? (
            <span className={styles.coreStrains} aria-label={`Strains ${coreStrains.map((id) => STRAINS[id].name).join(', ')}`}>
              {coreStrains.map((id) => (
                <i key={id} style={{ '--strain': STRAINS[id].color } as LoomStyle}>
                  <span aria-hidden="true"><StrainGlyph id={id} /></span>
                  <b>{STRAINS[id].name.toUpperCase()}</b>
                </i>
              ))}
            </span>
          ) : null}
        </div>
        <p className={styles.integratedCopy} data-tone="risk">
          <b>RISK</b><span>{consequence.cost}</span>
        </p>
      </div>

      <TriggerRhythm consequence={consequence} />

      {consequence.strains.length > 0 ? (
        <section className={styles.reactionMap} data-testid="loom-lite-activations" aria-label="Strain reaction map">
          <span className={styles.reactionStem} aria-hidden="true" />
          {consequence.strains.map((strain) => (
            <StrainRoute
              key={strain.id}
              strain={strain}
              focusedPoint={focusedThresholds[strain.id] ?? null}
              onFocusPoint={(point) => setFocusedThresholds((current) => ({
                ...current,
                [strain.id]: point,
              }))}
            />
          ))}
        </section>
      ) : null}

      <SpliceBranches splices={consequence.splices} />

      {loci.length > 0 ? (
        <ol className={styles.locusCharms} aria-label="Changed Genome loci" data-testid="loom-lite-loci">
          {loci.map(({ before, after }) => (
            <li key={before.index}>
              <span>L{before.index + 1}</span>
              <b>{before.kind === 'empty' ? 'OPEN' : before.label}</b>
              {showStrains ? <InlineStrains strains={before.strains} /> : null}
              <i aria-hidden="true">→</i>
              <strong>{after.kind === 'empty' ? 'OPEN' : after.label}</strong>
              {showStrains ? <InlineStrains strains={after.strains} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {ledgers.length > 0 || bodyAndTerrain.length > 0 || changedOutcomes.length > 0 || phoenixConflict ? (
        <ul className={styles.deltaCharms} aria-label="Immediate decision changes">
          {ledgers.map((fact) => <DeltaCharm key={fact.id} fact={fact} />)}
          {bodyAndTerrain.map((fact) => <DeltaCharm key={fact.id} fact={fact} />)}
          {changedOutcomes.map((fact) => <DeltaCharm key={fact.id} fact={fact} />)}
          {phoenixConflict ? <li className={styles.phoenixWarning}>{phoenixConflict}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
