'use client';

/**
 * THE WORKBENCH — slow Research for the fast Drop.
 *
 * A run asks for intuition. This surface lets the player touch the same six
 * power slots without a timer, rewind the transcript, and inspect one reaction
 * through Payout, Risk, or Space. It never solves, ranks, or recommends a
 * build. The experiment is folded by `genomeV2Workbench`, which in turn uses
 * the canonical v2 reducer and settlement functions.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { WORKBENCH_V1_ENABLED } from '@/lib/features/workbench';
import { GENOME_V2_ENABLED } from '@/lib/features/genomeV2';
import { LegacyWorkbenchView } from '@/components/workbench/LegacyWorkbenchView';
import { GeneGlyph, StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import {
  GENOME_V2_GENES,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_SPLICE_IDS,
  projectGenomeV2,
  type GenomeV2SlotIndex,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import {
  GenomeV2ExperimentError,
  readGenomeV2Experiment,
  readGenomeV2RunResearch,
  type GenomeV2ExperimentAction,
  type GenomeV2ExperimentPlan,
  type GenomeV2ResearchReading,
  type GenomeV2ResearchFact,
  type GenomeV2ResearchLens,
} from '@/shared/game/genomeV2Workbench';
import { normalizeDynastyName, type DynastyName } from '@/shared/game/rulesets';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import { parseGenomeV2RunRecord } from '@/components/game/genome/genomeV2ResultsAdapter';
import { genomeV2PresentationFormat } from '@/components/game/genome/genomeV2PresentationAdapter';
import { CurriculumTrials } from './CurriculumTrials';
import { useCurriculum, type CurriculumHandle } from './useCurriculum';
import styles from './WorkbenchView.module.css';

interface PanelSnake {
  id: string;
  name: string;
  dynasty: DynastyName;
  generation: number;
  equipped: boolean;
}

interface PanelPayload {
  snakes: PanelSnake[];
}

interface OwnedPanelResource {
  ownerId: string;
  panel: PanelPayload | null;
  isLoading: boolean;
  error: string | null;
}

interface OwnedExperiment {
  ownerId: string;
  snakeId: string | null;
  plan: GenomeV2ExperimentPlan;
}

interface OwnedStudyResource {
  ownerId: string;
  reading: GenomeV2ResearchReading | null;
  terminal: 'bank' | 'crash' | null;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_V2_EXPERIMENT: GenomeV2ExperimentPlan = {
  v: 2,
  dynasty: 'CYBER',
  actions: [],
};

/**
 * Research is a free rules instrument, not an authenticated reward. These
 * neutral specimens keep every Dynasty pool explorable before an account owns
 * a snake; authenticated players still see their strongest real specimen in
 * each Dynasty instead.
 */
const PUBLIC_RESEARCH_SPECIMENS: readonly PanelSnake[] = [
  { id: 'research-cyber', name: 'CYBER', dynasty: 'CYBER', generation: 1, equipped: true },
  { id: 'research-primal', name: 'PRIMAL', dynasty: 'PRIMAL', generation: 1, equipped: false },
  { id: 'research-cosmic', name: 'COSMIC', dynasty: 'COSMIC', generation: 1, equipped: false },
];

const LENSES: Array<{
  id: GenomeV2ResearchLens;
  label: string;
  mark: string;
}> = [
  { id: 'yield', label: 'Payout', mark: '◇' },
  { id: 'risk', label: 'Risk', mark: '△' },
  { id: 'space', label: 'Space', mark: '○' },
];

function readPanel(raw: unknown): PanelPayload {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const snakes = (Array.isArray(body.snakes) ? body.snakes : []).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const generation = Number(row.generation ?? 1);
    return [{
      id: String(row.id ?? ''),
      name: String(row.name ?? 'Snake'),
      dynasty: normalizeDynastyName(row.dynasty),
      generation: Number.isFinite(generation) && generation > 0
        ? Math.floor(generation)
        : 1,
      equipped: row.equipped === true,
    }];
  });
  return { snakes };
}

function compactRoster(snakes: readonly PanelSnake[]): PanelSnake[] {
  const byDynasty = new Map<DynastyName, PanelSnake>();
  for (const snake of snakes) {
    const current = byDynasty.get(snake.dynasty);
    if (
      !current
      || snake.equipped
      || (!current.equipped && snake.generation > current.generation)
    ) {
      byDynasty.set(snake.dynasty, snake);
    }
  }
  return ['CYBER', 'PRIMAL', 'COSMIC'].flatMap((dynasty) => {
    const snake = byDynasty.get(dynasty as DynastyName);
    return snake ? [snake] : [];
  });
}

function formatBps(value: number): string {
  const factor = value / 10_000;
  return `×${factor.toFixed(Number.isInteger(factor) ? 1 : factor < 1 ? 2 : 2)}`;
}

function uniqueStrains(ids: readonly StrainId[]): StrainId[] {
  return Array.from(new Set(ids));
}

function GeneStrainBadges({
  strains,
  compact = false,
  testIdPrefix,
}: {
  strains: readonly StrainId[];
  compact?: boolean;
  testIdPrefix?: string;
}) {
  const unique = uniqueStrains(strains);
  if (unique.length === 0) return null;
  return (
    <span
      className={styles.geneStrainBadges}
      data-compact={compact || undefined}
      aria-label={`Paths ${unique.map((id) => STRAINS[id].name).join(', ')}`}
    >
      {unique.map((id) => (
        <span
          key={id}
          className={styles.geneStrainBadge}
          style={{ '--strain': STRAINS[id].color } as CSSProperties}
          data-testid={testIdPrefix ? `${testIdPrefix}-strain-${id}` : undefined}
        >
          <i aria-hidden="true"><StrainGlyph id={id} /></i>
          <b>{STRAINS[id].name.toUpperCase()}</b>
        </span>
      ))}
    </span>
  );
}

function activeGene(
  plan: ReturnType<typeof readGenomeV2Experiment>,
  geneId: GenomeV2ActiveGeneId
): boolean {
  return Object.values(plan.state.instances).some(
    (instance) => instance.geneId === geneId && instance.status === 'active'
  );
}

function LocusStone({
  locus,
  recodeTarget,
  onSelect,
}: {
  locus: ReturnType<typeof readGenomeV2Experiment>['loci'][number];
  recodeTarget: boolean;
  onSelect: (slot: GenomeV2SlotIndex) => void;
}) {
  const interactive = recodeTarget && locus.kind !== 'empty' && locus.kind !== 'ash';
  const geneId = locus.geneIds[0];
  return (
    <button
      type="button"
      className={styles.locus}
      data-kind={locus.kind}
      data-recode-target={interactive || undefined}
      data-testid={`workbench-locus-${locus.slot}`}
      aria-label={`Slot ${locus.slot + 1}: ${locus.label}${locus.strains.length > 0 ? `, Paths ${locus.strains.map((id) => STRAINS[id].name).join(', ')}` : ''}${interactive ? ', replace this slot' : ''}`}
      disabled={!interactive}
      onClick={() => onSelect(locus.slot)}
    >
      <span className={styles.locusRune} aria-hidden="true">
        {locus.kind === 'empty' ? <i /> : locus.kind === 'ash' ? <b>✦</b> : <GeneGlyph id={geneId} />}
      </span>
      <strong>{locus.label}</strong>
      <GeneStrainBadges
        strains={locus.strains}
        compact
        testIdPrefix={`workbench-locus-${locus.slot}`}
      />
      {locus.kind === 'splice' ? <small>COMBO</small> : <small>{locus.slot + 1}</small>}
    </button>
  );
}

function StrainRail({
  reading,
  focusedStrains,
}: {
  reading: ReturnType<typeof readGenomeV2Experiment>;
  focusedStrains: readonly StrainId[];
}) {
  const [openTier, setOpenTier] = useState<{
    strain: StrainId;
    points: number;
  } | null>(null);
  const openStrain = openTier
    ? reading.strains.find((strain) => strain.id === openTier.strain) ?? null
    : null;
  const openDefinition = openStrain && openTier
    ? openStrain.tiers.find((tier) => tier.points === openTier.points) ?? null
    : null;
  return (
    <div className={styles.strainRailGroup}>
      <div className={styles.strainRail} aria-label="Path ladder" data-testid="workbench-strains">
        {reading.strains.map((strain) => {
          const focused = focusedStrains.includes(strain.id);
          return (
            <div
              key={strain.id}
              className={styles.strain}
              data-focused={focused || undefined}
              style={{ '--strain': STRAINS[strain.id].color } as CSSProperties}
              data-testid={`workbench-strain-${strain.id}`}
            >
              <span className={styles.strainName}>
                <i aria-hidden="true"><StrainGlyph id={strain.id} /></i>
                <b>{STRAINS[strain.id].name}</b>
                <em>{strain.points}</em>
              </span>
              <span className={styles.rungs}>
                {strain.tiers.map((tier) => {
                  const selected = openTier?.strain === strain.id
                    && openTier.points === tier.points;
                  return (
                    <button
                      key={tier.points}
                      type="button"
                      className="min-h-11 min-w-11"
                      data-active={tier.active || undefined}
                      data-locked={tier.reached && !tier.active || undefined}
                      aria-pressed={selected}
                      aria-label={`${STRAINS[strain.id].name} ${tier.points}, ${tier.name}: ${tier.rule}`}
                      title={`${tier.points} · ${tier.name}: ${tier.rule}${tier.lockedReason ? ` · ${tier.lockedReason}` : ''}`}
                      onClick={() => setOpenTier(selected ? null : {
                        strain: strain.id,
                        points: tier.points,
                      })}
                      data-testid={`workbench-tier-${strain.id}-${tier.points}`}
                    >
                      {tier.points}
                    </button>
                  );
                })}
              </span>
              <small>
                {strain.suppressed
                  ? 'Dampened · Level I still works; higher levels are capped'
                  : strain.tiers.find((tier) => tier.reached && !tier.active)?.lockedReason
                    ?? (strain.nextTier === null
                  ? strain.tiers[2].name
                  : `${strain.pointsToNext} to ${strain.tiers.find((tier) => tier.points === strain.nextTier)?.name}`)}
              </small>
            </div>
          );
        })}
      </div>
      {openTier && openDefinition ? (
        <p
          className={styles.strainDisclosure}
          role="status"
          data-testid="workbench-strain-disclosure"
          style={{ '--strain': STRAINS[openTier.strain].color } as CSSProperties}
        >
          <i aria-hidden="true"><StrainGlyph id={openTier.strain} /></i>
          <span>
            <strong>{STRAINS[openTier.strain].name} {openDefinition.points} · {openDefinition.name}</strong>
            <small>{openDefinition.rule}</small>
            {openDefinition.lockedReason ? <em>{openDefinition.lockedReason}</em> : null}
          </span>
        </p>
      ) : (
        <p className={styles.strainHint}>Tap any 2 / 3 / 4 to see exactly what it turns on.</p>
      )}
    </div>
  );
}

function ReactionFact({ fact }: { fact: GenomeV2ResearchFact }) {
  return (
    <article className={styles.reactionFact} data-source={fact.source}>
      <span className={styles.factNode} aria-hidden="true" />
      <div>
        <strong>{fact.title}</strong>
        <p>{fact.rule}</p>
        {fact.cost ? <small>{fact.cost}</small> : null}
      </div>
    </article>
  );
}

function AuthoritativeRunStudy({
  reading,
  terminal,
}: {
  reading: GenomeV2ResearchReading;
  terminal: 'bank' | 'crash';
}) {
  const [lens, setLens] = useState<GenomeV2ResearchLens>('yield');
  const focus = Object.values(reading.state.instances)
    .sort((left, right) => left.acquisitionOrdinal - right.acquisitionOrdinal)
    .find((instance) => instance.status === 'active');
  const settlement = terminal === 'bank' ? reading.bank : reading.crash;

  return (
    <section className={styles.study} data-testid="workbench-run-study">
      <header className={styles.studyHeader}>
        <div>
          <p>Authoritative run specimen</p>
          <h3>{terminal === 'bank' ? 'BANK secured' : 'Crash resolved'} · {reading.dynasty}</h3>
          <span>The powers this run ended with, opened for inspection without rewriting its history.</span>
        </div>
        <strong>{genomeV2PresentationFormat.scaledYield(settlement.genomeYield)}</strong>
      </header>

      <div className={styles.studyBody}>
        <div className={styles.studyGenome}>
          <div className={styles.locusArc} data-testid="workbench-study-loci">
            {reading.loci.map((locus) => (
              <LocusStone key={locus.slot} locus={locus} recodeTarget={false} onSelect={() => undefined} />
            ))}
          </div>
          <div className={styles.studyCore}>
            <i aria-hidden="true"><GeneGlyph id={focus?.geneId ?? 'genome-research'} /></i>
            <strong>{reading.activeSplices.length} combo{reading.activeSplices.length === 1 ? '' : 's'}</strong>
            <small>{reading.seenGenes.length} powers seen</small>
          </div>
        </div>

        <div className={styles.mathRibbon}>
          <span><b>BANK</b> {genomeV2PresentationFormat.scaledYield(reading.bank.genomeYield)}</span>
          <span><b>CRASH</b> {genomeV2PresentationFormat.scaledYield(reading.crash.genomeYield)}</span>
          <span><b>BODY</b> {reading.growthCommitted === null ? 'COMPACTED' : `+${reading.growthCommitted}`}</span>
          <span><b>BURNED</b> {reading.loci.filter((locus) => locus.kind === 'ash').length}</span>
        </div>
        <StrainRail reading={reading} focusedStrains={[]} />

        <div className={styles.lenses} role="tablist" aria-label="Settled run lens">
          {LENSES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={lens === entry.id}
              onClick={() => setLens(entry.id)}
              data-testid={`workbench-study-lens-${entry.id}`}
            >
              <i aria-hidden="true">{entry.mark}</i>{entry.label}
            </button>
          ))}
        </div>
        <div className={styles.studyFacts} data-testid={`workbench-study-${lens}`}>
          {reading.lenses[lens].length > 0
            ? reading.lenses[lens].map((fact) => (
                <ReactionFact key={`${fact.source}:${fact.id}`} fact={fact} />
              ))
            : <p className={styles.quietReaction}>These powers left no active rule in this lens.</p>}
        </div>
      </div>
    </section>
  );
}

export function ResearchTable({
  plan,
  onPlan,
  curriculum,
}: {
  plan: GenomeV2ExperimentPlan;
  onPlan: (next: GenomeV2ExperimentPlan) => void;
  /** Optional eligibility annotation (WP-D). Absent renders today's palette. */
  curriculum?: CurriculumHandle;
}) {
  const [lens, setLens] = useState<GenomeV2ResearchLens>('yield');
  const [focusId, setFocusId] = useState<GenomeV2ActiveGeneId | null>(null);
  const [pendingRecode, setPendingRecode] = useState<GenomeV2ActiveGeneId | null>(null);
  const [openSpliceId, setOpenSpliceId] = useState<GenomeV2SpliceId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reading = useMemo(() => readGenomeV2Experiment(plan), [plan]);
  const focusedGeneId = focusId && reading.availableGenes.includes(focusId)
    ? focusId
    : reading.availableGenes[0] ?? null;
  const focusedGene = focusedGeneId ? GENOME_V2_GENES[focusedGeneId] : null;
  const candidate = useMemo(() => {
    if (!focusedGeneId) return null;
    return projectGenomeV2(reading.state, [focusedGeneId]).candidates[0] ?? null;
  }, [focusedGeneId, reading.state]);
  const openLocus = reading.loci.some((locus) => locus.kind === 'empty');
  const portalGrowth = candidate?.projectedPortalActionGrowth.infuse ?? null;
  const recodeGrowth = candidate?.projectedPortalActionGrowth.recode ?? null;
  const focusedPaths = useMemo(() => {
    if (!focusedGeneId) return [];
    return GENOME_V2_SPLICE_IDS.filter((id) =>
      GENOME_V2_SPLICES[id].parents.includes(focusedGeneId)
    ).map((id) => ({
      ...GENOME_V2_SPLICES[id],
      forms: candidate?.completesSplice === id,
      partner: GENOME_V2_SPLICES[id].parents.find((parent) => parent !== focusedGeneId)!,
    }));
  }, [candidate?.completesSplice, focusedGeneId]);
  const openSplice = focusedPaths.find((path) => path.id === openSpliceId) ?? null;

  const commit = useCallback((action: GenomeV2ExperimentAction) => {
    const next: GenomeV2ExperimentPlan = {
      ...plan,
      actions: [...plan.actions, action],
    };
    try {
      readGenomeV2Experiment(next);
      onPlan(next);
      setPendingRecode(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof GenomeV2ExperimentError
          ? caught.message
          : 'That experiment cannot resolve under the current rules.'
      );
    }
  }, [onPlan, plan]);

  const chooseLocus = useCallback((slot: GenomeV2SlotIndex) => {
    if (!pendingRecode) return;
    commit({ kind: 'recode', geneId: pendingRecode, slot });
  }, [commit, pendingRecode]);

  const activeFacts = reading.lenses[lens];
  const focusedStrains = focusedGene?.strains ?? [];
  const annotations = useMemo(
    () =>
      new Map(
        (curriculum?.state?.genes ?? []).map((entry) => [entry.geneId, entry])
      ),
    [curriculum?.state?.genes]
  );

  return (
    <div className={styles.table} data-testid="workbench-research-table">
      <div className={styles.constellation} aria-hidden="true" />

      <header className={styles.tableHeader}>
        <div>
          <p>Power Research</p>
          <h3>Touch the reaction. Rewind the thought.</h3>
        </div>
        <div className={styles.historyControls}>
          <span>{plan.actions.length} move{plan.actions.length === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={() => onPlan({ ...plan, actions: plan.actions.slice(0, -1) })}
            disabled={plan.actions.length === 0}
            data-testid="workbench-undo"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => onPlan({ ...plan, actions: [] })}
            disabled={plan.actions.length === 0}
          >
            Clear
          </button>
        </div>
      </header>

      <section className={styles.genomeStage} aria-label="Six power slots">
        <div className={styles.locusArc} data-testid="workbench-loci">
          {reading.loci.map((locus) => (
            <LocusStone
              key={locus.slot}
              locus={locus}
              recodeTarget={pendingRecode !== null}
              onSelect={chooseLocus}
            />
          ))}
        </div>

        <div className={styles.reactionCore} data-testid="workbench-focus">
          <span className={styles.coreOrbit} aria-hidden="true" />
          <i aria-hidden="true">
            <GeneGlyph id={focusedGeneId ?? 'genome-research'} />
          </i>
          <strong data-testid="workbench-focused-gene-name">
            {focusedGene?.name ?? 'All powers seen'}
          </strong>
          <small>{focusedGene?.category ?? 'No powers left to try'}</small>
          {focusedGene ? (
            <GeneStrainBadges
              strains={focusedGene.strains}
              compact
              testIdPrefix="workbench-focused-gene"
            />
          ) : null}
        </div>
      </section>

      <div className={styles.mathRibbon} data-testid="workbench-math-ribbon">
        <span><b>BANK</b> {formatBps(reading.projection.liabilities.bankMultiplierBps)}</span>
        <span><b>CRASH</b> {formatBps(reading.projection.liabilities.salvageMultiplierBps)}</span>
        <span><b>BODY</b> {reading.growthCommitted ? `+${reading.growthCommitted}` : 'UNCHANGED'}</span>
        <span><b>BURNED</b> {reading.loci.filter((locus) => locus.kind === 'ash').length}</span>
      </div>

      <StrainRail reading={reading} focusedStrains={focusedStrains} />

      <section className={styles.palette} aria-label="Gene palette">
        <div className={styles.paletteHeader}>
          <div>
            <p>Powers not yet taken · {plan.dynasty}</p>
            <small>Order is the experiment. No choice is ranked.</small>
          </div>
          <div className={styles.lenses} role="tablist" aria-label="Research lens">
            {LENSES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={lens === entry.id}
                onClick={() => setLens(entry.id)}
                data-testid={`workbench-lens-${entry.id}`}
              >
                <i aria-hidden="true">{entry.mark}</i>{entry.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.geneRail} data-testid="workbench-gene-palette">
          {reading.availableGenes.map((geneId) => {
            const gene = GENOME_V2_GENES[geneId];
            const annotation = annotations.get(geneId) ?? null;
            return (
              <button
                key={geneId}
                type="button"
                aria-pressed={focusedGeneId === geneId}
                onClick={() => {
                  setFocusId(geneId);
                  setPendingRecode(null);
                  setOpenSpliceId(null);
                }}
                data-testid={`workbench-gene-${geneId}`}
                data-eligibility={annotation?.state}
                style={{ '--gene-strain': STRAINS[gene.strains[0]].color } as CSSProperties}
              >
                <i aria-hidden="true"><GeneGlyph id={geneId} /></i>
                <span className={styles.geneRailCopy}>
                  <strong>{gene.name}</strong>
                  <small>{gene.category}</small>
                  <GeneStrainBadges
                    strains={gene.strains}
                    testIdPrefix={`workbench-gene-${geneId}`}
                  />
                  {/*
                    ANNOTATION, NOT A GATE. Every Gene on this rail stays
                    focusable, threadable and simulatable whatever this says;
                    the label reports where it may appear in a REAL run's Pods
                    and the one action that changes that (PEO §4.2, boundary 2).
                  */}
                  {annotation ? (
                    <em
                      className={styles.geneEligibility}
                      data-testid={`workbench-gene-${geneId}-eligibility`}
                    >
                      {annotation.nextStep}
                    </em>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {curriculum ? <CurriculumTrials curriculum={curriculum} /> : null}
      </section>

      {focusedGene ? (
        <section className={styles.focusReaction} data-testid="workbench-focused-reaction">
          <div className={styles.focusRule}>
            <p><b>Changes</b>{focusedGene.effect}</p>
            <p><b>In full</b>{focusedGene.detail}</p>
            <p><b>Commits</b>{focusedGene.cost}</p>
          </div>
          <div className={styles.spliceBranches}>
            {focusedPaths.length > 0 ? focusedPaths.map((path) => (
              <button
                key={path.id}
                type="button"
                data-forms={path.forms || undefined}
                aria-expanded={openSpliceId === path.id}
                aria-label={`Reveal ${path.name} rule and cost`}
                onClick={() => setOpenSpliceId(
                  openSpliceId === path.id ? null : path.id
                )}
                data-testid={`workbench-splice-path-${path.id}`}
              >
                <span aria-hidden="true" />
                <span className={styles.spliceLabel}><strong>{path.forms ? 'FORMS ' : 'WITH '}{path.name}</strong><small>{GENOME_V2_GENES[path.partner].name}</small></span>
              </button>
            )) : <p className={styles.noBranch}>No direct Combo.</p>}
            {openSplice ? (
              <div className={styles.spliceDisclosure} data-testid="workbench-splice-disclosure">
                <p><b>Rule</b>{openSplice.rule}</p>
                <p><b>Cost</b>{openSplice.strategicCost}</p>
              </div>
            ) : null}
          </div>
          <div className={styles.commitControls}>
            {openLocus ? (
              <>
                <button
                  type="button"
                  className={styles.primaryCommit}
                  onClick={() => commit({ kind: 'thread', geneId: focusedGene.id })}
                  data-testid="workbench-thread"
                >
                  TAKE
                </button>
                <button
                  type="button"
                  disabled={portalGrowth === null}
                  onClick={() => commit({ kind: 'infuse', geneId: focusedGene.id })}
                  data-testid="workbench-infuse"
                >
                  TRADE UP {portalGrowth === null ? 'CLOSED' : `+${portalGrowth} BODY`}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryCommit}
                disabled={recodeGrowth === null}
                onClick={() => setPendingRecode(focusedGene.id)}
                data-testid="workbench-recode"
              >
                {pendingRecode === focusedGene.id
                  ? 'CHOOSE A SLOT'
                  : `SWAP ${recodeGrowth === null ? 'CLOSED' : `+${recodeGrowth} BODY`}`}
              </button>
            )}
          </div>
        </section>
      ) : null}

      <section className={styles.reactionField} data-testid={`workbench-reaction-${lens}`}>
        <header><span>{LENSES.find((entry) => entry.id === lens)?.mark}</span><strong>{lens === 'yield' ? 'payout' : lens}</strong><small>powers you hold only</small></header>
        {activeFacts.length > 0 ? (
          <div>{activeFacts.map((fact) => <ReactionFact key={`${fact.source}:${fact.id}`} fact={fact} />)}</div>
        ) : (
          <p className={styles.quietReaction}>Nothing you hold changes this lens yet.</p>
        )}
      </section>

      <section className={styles.stateVerbs} aria-label="Run-state experiments">
        <button type="button" onClick={() => commit({ kind: 'decline' })}>SKIP</button>
        <button type="button" onClick={() => commit({ kind: 'continue' })}>RIDE ON</button>
        {activeGene(reading, 'mirror_wager') ? (
          <button type="button" onClick={() => commit({ kind: 'continue', activateMirror: true })}>RIDE ON + BET</button>
        ) : null}
        {reading.projection.liabilities.phoenixAvailable ? (
          <button type="button" onClick={() => commit({ kind: 'phoenix' })}>TRIGGER PHOENIX</button>
        ) : null}
      </section>

      {pendingRecode ? (
        <p className={styles.recodeNotice} role="status">Choose one glowing slot that is not burned out. The power leaving, and any Combo it made, go for good.</p>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}

export interface WorkbenchViewProps {
  /** Opaque session UUID. The Genome itself is always re-read from the server. */
  studyRef?: string | null;
}

export function GenomeV2WorkbenchView({ studyRef = null }: WorkbenchViewProps = {}) {
  const { session, isAuthenticated } = useAuth();
  const [panelResource, setPanelResource] = useState<OwnedPanelResource | null>(null);
  const [experiment, setExperiment] = useState<OwnedExperiment | null>(null);
  const [publicPlan, setPublicPlan] = useState<GenomeV2ExperimentPlan>(EMPTY_V2_EXPERIMENT);
  const [studyResource, setStudyResource] = useState<OwnedStudyResource | null>(null);
  const token = session?.access_token;
  const ownerId = typeof session?.user?.id === 'string' && session.user.id.length > 0
    ? session.user.id
    : null;
  const hasAuthenticatedOwner = Boolean(isAuthenticated && ownerId && token);

  // Account-derived state is renderable only under the identity that loaded or
  // created it. This render-time gate closes the gap before effects run during
  // sign-out/account switching; routine token refreshes retain the same owner.
  const ownedPanelResource = ownerId && panelResource?.ownerId === ownerId
    ? panelResource
    : null;
  const panel = ownedPanelResource?.panel ?? null;
  const isLoading = ownedPanelResource?.isLoading ?? Boolean(ownerId && token);
  const error = ownedPanelResource?.error ?? null;
  const panelFailed = ownedPanelResource !== null && ownedPanelResource.error !== null;
  const usesPublicResearch = !hasAuthenticatedOwner || panelFailed;
  const ownedExperiment = ownerId && experiment?.ownerId === ownerId
    ? experiment
    : null;
  const snakeId = ownedExperiment?.snakeId ?? null;
  const plan = usesPublicResearch
    ? publicPlan
    : ownedExperiment?.plan ?? EMPTY_V2_EXPERIMENT;
  const ownedStudyResource = ownerId && studyResource?.ownerId === ownerId
    ? studyResource
    : null;
  const study = ownedStudyResource?.reading && ownedStudyResource.terminal
    ? {
        reading: ownedStudyResource.reading,
        terminal: ownedStudyResource.terminal,
      }
    : null;
  const studyLoading = ownedStudyResource?.isLoading ?? Boolean(ownerId && token && studyRef);
  const studyError = ownedStudyResource?.error ?? null;

  const setPlan = useCallback((next: GenomeV2ExperimentPlan) => {
    if (usesPublicResearch || !ownerId) {
      setPublicPlan(next);
      return;
    }
    setExperiment((current) => ({
      ownerId,
      snakeId: current?.ownerId === ownerId ? current.snakeId : null,
      plan: next,
    }));
  }, [ownerId, usesPublicResearch]);

  const setSnakeId = useCallback((next: string | null) => {
    if (usesPublicResearch || !ownerId) return;
    setExperiment((current) => ({
      ownerId,
      snakeId: next,
      plan: current?.ownerId === ownerId ? current.plan : EMPTY_V2_EXPERIMENT,
    }));
  }, [ownerId, usesPublicResearch]);

  useEffect(() => {
    if (!isAuthenticated || !token || !ownerId) {
      setPanelResource(null);
      setExperiment(null);
      return;
    }
    let cancelled = false;
    setPanelResource((current) => ({
      ownerId,
      panel: current?.ownerId === ownerId ? current.panel : null,
      isLoading: true,
      error: null,
    }));
    setExperiment((current) => current?.ownerId === ownerId
      ? current
      : { ownerId, snakeId: null, plan: EMPTY_V2_EXPERIMENT });
    fetch('/api/workbench/panel', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setPanelResource({
            ownerId,
            panel: null,
            isLoading: false,
            error: typeof body?.error === 'string'
              ? body.error
              : 'The Workbench could not read your collection.',
          });
          return;
        }
        setPanelResource({
          ownerId,
          panel: readPanel(body),
          isLoading: false,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPanelResource({
            ownerId,
            panel: null,
            isLoading: false,
            error: 'The Workbench could not reach the server.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ownerId, token]);

  useEffect(() => {
    if (!isAuthenticated || !token || !ownerId || !studyRef) {
      setStudyResource(null);
      return;
    }
    let cancelled = false;
    setStudyResource((current) => ({
      ownerId,
      reading: current?.ownerId === ownerId ? current.reading : null,
      terminal: current?.ownerId === ownerId ? current.terminal : null,
      isLoading: true,
      error: null,
    }));
    fetch(`/api/workbench/result/${encodeURIComponent(studyRef)}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setStudyResource({
            ownerId,
            reading: null,
            terminal: null,
            isLoading: false,
            error: typeof body?.error === 'string'
              ? body.error
              : 'That run could not be opened for Research.',
          });
          return;
        }
        const record = parseGenomeV2RunRecord(body?.genome);
        if (!record?.settlement) {
          setStudyResource({
            ownerId,
            reading: null,
            terminal: null,
            isLoading: false,
            error: 'That run has no complete Genome v2 record.',
          });
          return;
        }
        try {
          setStudyResource({
            ownerId,
            reading: readGenomeV2RunResearch(record),
            terminal: record.settlement.terminal,
            isLoading: false,
            error: null,
          });
        } catch {
          setStudyResource({
            ownerId,
            reading: null,
            terminal: null,
            isLoading: false,
            error: 'That settled Genome could not be read safely.',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStudyResource({
            ownerId,
            reading: null,
            terminal: null,
            isLoading: false,
            error: 'Genome Research could not reach the server.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ownerId, studyRef, token]);

  // Eligibility annotation for the Dynasty currently on the table. Null under
  // flag-off, signed out, or a failed read — the instrument stays free either
  // way, and nothing below is gated on it.
  const curriculum = useCurriculum(plan.dynasty, token);

  const ownedRoster = useMemo(() => compactRoster(panel?.snakes ?? []), [panel?.snakes]);
  const roster = usesPublicResearch || ownedRoster.length === 0
    ? PUBLIC_RESEARCH_SPECIMENS
    : ownedRoster;
  const selectedSnakeId = usesPublicResearch
    ? `research-${plan.dynasty.toLowerCase()}`
    : snakeId;
  const snake = roster.find((entry) => entry.id === selectedSnakeId)
    ?? roster.find((entry) => entry.dynasty === plan.dynasty)
    ?? roster.find((entry) => entry.equipped)
    ?? roster[0]
    ?? null;

  useEffect(() => {
    if (!snake || plan.dynasty === snake.dynasty) return;
    setPlan({ v: 2, dynasty: snake.dynasty, actions: [] });
  }, [plan.dynasty, setPlan, snake]);

  if (!WORKBENCH_V1_ENABLED) return null;

  if (isLoading && !panel && !study) {
    return <div className={styles.loading} data-testid="workbench-loading">Lighting the runes…</div>;
  }

  return (
    <div className={styles.workbench} data-testid="workbench-view">
      <header className={styles.intro}>
        <div>
          <p>Intuition in the run · Research here</p>
          <h2>The Workbench</h2>
          <span>Compose possible histories, not a prescribed final build.</span>
        </div>
        <nav className={styles.snakeMarks} aria-label="Research specimen">
          {roster.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === snake?.id}
              onClick={() => {
                setSnakeId(entry.id);
                setPlan({ v: 2, dynasty: entry.dynasty, actions: [] });
              }}
              data-testid={`workbench-snake-${entry.dynasty.toLowerCase()}`}
            >
              <i aria-hidden="true"><GeneGlyph id={entry.dynasty === 'CYBER' ? 'zenith_protocol' : entry.dynasty === 'PRIMAL' ? 'heartwood' : 'constellation_crown'} /></i>
              <span><strong>{entry.dynasty}</strong><small>Gen {entry.generation}</small></span>
            </button>
          ))}
        </nav>
      </header>

      {panelFailed ? (
        <p
          className={`${styles.error} ${styles.panelFallback}`}
          role="alert"
          data-testid="workbench-error"
        >
          <strong>Personal specimens are closed.</strong>
          <span>{error || 'The Workbench could not read your collection.'} Public research specimens remain available below.</span>
        </p>
      ) : !hasAuthenticatedOwner ? (
        <p className={styles.researchInvitation} data-testid="workbench-public-research">
          Every rule is open. <Link href="/login">Sign in</Link> to place your own specimens and settled runs on the table.
        </p>
      ) : null}

      {studyLoading ? (
        <div className={styles.loading} data-testid="workbench-study-loading">Recovering the runes from settlement…</div>
      ) : studyError ? (
        <div className={styles.error} data-testid="workbench-study-error">{studyError}</div>
      ) : study ? (
        <AuthoritativeRunStudy reading={study.reading} terminal={study.terminal} />
      ) : null}

      {snake ? (
        <div id="new-experiment">
          <ResearchTable plan={plan} onPlan={setPlan} curriculum={curriculum} />
        </div>
      ) : (
        <div className={styles.loading}>The Workbench could not form a Dynasty specimen.</div>
      )}

      <p className={styles.honesty}>
        The Workbench resolves legal reactions and exact rule arithmetic. Route execution remains yours; no build is labelled best.
      </p>
    </div>
  );
}

/**
 * Genome v2 is a true rollout boundary. A missing or non-exact flag renders
 * the shipped v1 Workbench through its preserved component.
 */
export function WorkbenchView(props: WorkbenchViewProps = {}) {
  return GENOME_V2_ENABLED
    ? <GenomeV2WorkbenchView {...props} />
    : <LegacyWorkbenchView />;
}
