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

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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
  type GenomeV2ResearchLocus,
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
import { useSlotAnchor } from './useSlotAnchor';
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

/**
 * WHAT TAPPING A SLOT DOES.
 *
 * `take`  the one open slot: it is the slot the reducer will fill next
 * `swap`  a held slot, once all six are full — the Recode grammar
 * `read`  a held slot with room still on the bench, and Ash, which is forever
 * `null`  an empty slot that is not next in line, so tapping it would promise
 *         a placement the engine will not honour
 *
 * The `take` slot is DERIVED, not chosen. `genomeV2Workbench.firstOpenSlot`
 * fills the lowest empty index and its action carries no slot of its own, so a
 * picker offered at any other empty cell would drop the power somewhere the
 * player did not point at. One open cell keeps the surface honest without
 * touching read-only rules code.
 */
type SlotMode = 'take' | 'swap' | 'read';

function slotModeFor(
  locus: GenomeV2ResearchLocus,
  openSlot: GenomeV2SlotIndex | null
): SlotMode | null {
  if (locus.kind === 'empty') return locus.slot === openSlot ? 'take' : null;
  if (locus.kind === 'ash') return 'read';
  return openSlot === null ? 'swap' : 'read';
}

function slotLabel(locus: GenomeV2ResearchLocus, mode: SlotMode | null): string {
  if (locus.kind !== 'empty') return locus.label;
  return mode === 'take' ? 'OPEN' : 'EMPTY';
}

function SlotCard({
  locus,
  mode,
  open,
  onOpen,
  cellRef,
  children,
}: {
  locus: GenomeV2ResearchLocus;
  mode: SlotMode | null;
  open: boolean;
  onOpen: (slot: GenomeV2SlotIndex) => void;
  cellRef?: MutableRefObject<HTMLElement | null>;
  /** The picker, rendered inside the very cell it belongs to. */
  children?: ReactNode;
}) {
  const geneId = locus.geneIds[0];
  const label = slotLabel(locus, mode);
  const action = mode === 'take'
    ? ', open to fill this slot'
    : mode === 'swap'
      ? ', open to swap this slot'
      : mode === 'read'
        ? ', open to read this slot'
        : ', fills after the open slot';
  return (
    <div
      className={styles.slotCell}
      ref={cellRef as MutableRefObject<HTMLDivElement | null> | undefined}
      data-open={open || undefined}
    >
      <button
        type="button"
        className={styles.slot}
        data-kind={locus.kind}
        data-mode={mode ?? undefined}
        data-open={open || undefined}
        data-testid={`workbench-locus-${locus.slot}`}
        aria-haspopup={mode ? 'dialog' : undefined}
        aria-expanded={mode ? open : undefined}
        aria-label={`Slot ${locus.slot + 1}: ${label}${locus.strains.length > 0 ? `, Paths ${locus.strains.map((id) => STRAINS[id].name).join(', ')}` : ''}${action}`}
        disabled={mode === null}
        onClick={() => onOpen(locus.slot)}
      >
        <span className={styles.slotRune} aria-hidden="true">
          {locus.kind === 'empty'
            ? <b>{mode === 'take' ? '+' : ''}</b>
            : locus.kind === 'ash'
              ? <b>✦</b>
              : <GeneGlyph id={geneId} />}
        </span>
        <strong>{label}</strong>
        <GeneStrainBadges
          strains={locus.strains}
          compact
          testIdPrefix={`workbench-locus-${locus.slot}`}
        />
        {locus.kind === 'splice' ? <small>COMBO</small> : <small>{locus.slot + 1}</small>}
      </button>
      {children}
    </div>
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
        <div className={styles.slotRow} data-testid="workbench-study-loci">
          {reading.loci.map((locus) => (
            <SlotCard
              key={locus.slot}
              locus={locus}
              mode={null}
              open={false}
              onOpen={() => undefined}
            />
          ))}
        </div>
        <div className={styles.studySummary}>
          <span><i aria-hidden="true"><GeneGlyph id={focus?.geneId ?? 'genome-research'} /></i></span>
          <span><b>COMBOS</b> {reading.activeSplices.length}</span>
          <span><b>POWERS SEEN</b> {reading.seenGenes.length}</span>
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

type LoomCandidate = ReturnType<typeof projectGenomeV2>['candidates'][number];

interface SlotMatch {
  /** The Combo this power completes the moment it lands. Authoritative. */
  formsSpliceId: GenomeV2SpliceId | null;
  /** A recipe it shares with a held power when landing cannot form it yet. */
  pairsSpliceId: GenomeV2SpliceId | null;
  partnerGeneId: GenomeV2ActiveGeneId | null;
  /** Paths this power and something already slotted both feed. */
  sharedStrains: StrainId[];
}

/**
 * PARTNER AND STRAIN-MATE HIGHLIGHTING.
 *
 * Every input is read-only rules data: `GENOME_V2_SPLICES` for the recipes,
 * `GENOME_V2_GENES[id].strains` for the paths, and — for the strong claim, the
 * one that says a Combo forms — the authoritative `completesSplice` the engine
 * itself projects. Nothing here is a second opinion about the rules.
 *
 * The two Combo claims are deliberately different sentences because they are
 * different facts. Landing in an OPEN slot either completes a recipe or does
 * not, and the reducer already knows which; replacing a held slot cannot be
 * promised, because the power you replace may be the very partner the recipe
 * needed. So a swap says only that the two belong to one recipe.
 *
 * This HIGHLIGHTS and never REORDERS. Options stay in catalog order, which is
 * the one order that expresses no opinion — sorting partners to the top would
 * be the ranking the instrument is forbidden to do.
 */
function matchForOption(
  geneId: GenomeV2ActiveGeneId,
  slottedGeneIds: readonly GenomeV2ActiveGeneId[],
  formsSpliceId: GenomeV2SpliceId | null
): SlotMatch {
  const recipeId = GENOME_V2_SPLICE_IDS.find((id) => {
    const parents = GENOME_V2_SPLICES[id].parents;
    return parents.includes(geneId)
      && parents.some((parent) => parent !== geneId && slottedGeneIds.includes(parent));
  }) ?? null;
  const partnerGeneId = recipeId
    ? GENOME_V2_SPLICES[recipeId].parents.find((parent) => parent !== geneId) ?? null
    : null;
  const held = new Set(
    slottedGeneIds.flatMap((id) => GENOME_V2_GENES[id].strains)
  );
  return {
    formsSpliceId,
    pairsSpliceId: formsSpliceId === null ? recipeId : null,
    partnerGeneId,
    sharedStrains: uniqueStrains(
      GENOME_V2_GENES[geneId].strains.filter((strain) => held.has(strain))
    ),
  };
}

/**
 * THE PICKER, AT THE SLOT (owner ruling, D1 · slot-first).
 *
 * It opens on the slot the player touched and stays anchored to it, so the
 * question it answers is never in doubt: not "which power do you like" but
 * "what goes in THIS slot". `useSlotAnchor` keeps it on screen; the CSS keeps
 * it a panel rather than a takeover, because the bench is one continuous place
 * and a full-screen sheet would make every choice a departure from it.
 *
 * It carries NO close cross. A cross beside a live choice reads as a decision,
 * and the only decisions on this panel are the ones that change the Genome.
 * Tapping the bench, tapping another slot, Escape, and the written NOT NOW all
 * dismiss it, and none of them spend anything.
 *
 * D1 holds: nothing here mutates an account. Every action appends one verb to
 * the local experiment plan, which the read-only reducer replays.
 */
function SlotPicker({
  locus,
  mode,
  options,
  candidateFor,
  slottedGeneIds,
  selectedGeneId,
  onSelect,
  onCommit,
  onClose,
  annotations,
  panelRef,
  anchor,
}: {
  locus: GenomeV2ResearchLocus;
  mode: SlotMode;
  options: readonly GenomeV2ActiveGeneId[];
  candidateFor: (geneId: GenomeV2ActiveGeneId) => LoomCandidate | null;
  slottedGeneIds: readonly GenomeV2ActiveGeneId[];
  selectedGeneId: GenomeV2ActiveGeneId | null;
  onSelect: (geneId: GenomeV2ActiveGeneId | null) => void;
  onCommit: (action: GenomeV2ExperimentAction) => void;
  onClose: () => void;
  annotations: Map<GenomeV2ActiveGeneId, { state?: string; nextStep: string }>;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  anchor: { dx: number; dy: number; flip: 'down' | 'up'; maxHeight: number };
}) {
  const [openSpliceId, setOpenSpliceId] = useState<GenomeV2SpliceId | null>(null);
  const selectedGene = selectedGeneId ? GENOME_V2_GENES[selectedGeneId] : null;
  const selectedCandidate = selectedGeneId ? candidateFor(selectedGeneId) : null;
  const heldGeneIds = locus.kind === 'empty' ? [] : locus.geneIds;
  const growth = mode === 'swap'
    ? selectedCandidate?.projectedPortalActionGrowth.recode ?? null
    : selectedCandidate?.projectedPortalActionGrowth.infuse ?? null;

  const paths = selectedGeneId
    ? GENOME_V2_SPLICE_IDS.filter((id) =>
        GENOME_V2_SPLICES[id].parents.includes(selectedGeneId)
      ).map((id) => ({
        ...GENOME_V2_SPLICES[id],
        forms: selectedCandidate?.completesSplice === id,
        partner: GENOME_V2_SPLICES[id].parents.find(
          (parent) => parent !== selectedGeneId
        )!,
      }))
    : [];
  const openSplice = paths.find((path) => path.id === openSpliceId) ?? null;

  const heading = mode === 'take'
    ? `Slot ${locus.slot + 1} · pick a power`
    : mode === 'swap'
      ? `Slot ${locus.slot + 1} · swap out ${locus.label}`
      : `Slot ${locus.slot + 1} · ${locus.label}`;

  return (
    <div
      className={styles.picker}
      ref={panelRef}
      role="dialog"
      aria-label={heading}
      data-flip={anchor.flip}
      data-mode={mode}
      data-has-selection={selectedGene ? 'true' : undefined}
      data-testid="workbench-picker"
      style={{
        '--picker-dx': `${anchor.dx}px`,
        '--picker-dy': `${anchor.dy}px`,
        '--picker-max-h': `${anchor.maxHeight}px`,
      } as CSSProperties}
    >
      <header className={styles.pickerHead}>
        <p>{heading}</p>
        <button
          type="button"
          className={styles.pickerDismiss}
          onClick={onClose}
          data-testid="workbench-picker-close"
        >
          NOT NOW
        </button>
      </header>

      {mode === 'read' ? (
        <div className={styles.pickerRead} data-testid="workbench-picker-held">
          {locus.kind === 'ash' ? (
            <p className={styles.pickerNote}>
              Burned out. Phoenix spent this slot for a second life and it stays
              spent for the rest of the run.
            </p>
          ) : null}
          {locus.spliceId ? (
            <div className={styles.pickerRule}>
              <p><b>Combo</b>{GENOME_V2_SPLICES[locus.spliceId].rule}</p>
              <p><b>Commits</b>{GENOME_V2_SPLICES[locus.spliceId].strategicCost}</p>
            </div>
          ) : null}
          {heldGeneIds.map((geneId) => (
            <div className={styles.pickerRule} key={geneId}>
              <p><b>{GENOME_V2_GENES[geneId].name}</b>{GENOME_V2_GENES[geneId].detail}</p>
              <p><b>Commits</b>{GENOME_V2_GENES[geneId].cost}</p>
            </div>
          ))}
          {locus.kind !== 'ash' ? (
            <p className={styles.pickerNote}>
              Swapping this slot opens once all six are full.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className={styles.pickerHint}>
            {slottedGeneIds.length > 0
              ? 'Marked powers combo or share a path with what you already hold.'
              : 'Catalog order · nothing here is ranked.'}
          </p>
          <div className={styles.pickerOptions} data-testid="workbench-gene-palette">
            {options.length === 0 ? (
              <p className={styles.pickerNote} data-testid="workbench-picker-empty">
                Every power in this Dynasty is already on the bench.
              </p>
            ) : options.map((geneId) => {
              const gene = GENOME_V2_GENES[geneId];
              const annotation = annotations.get(geneId) ?? null;
              const match = matchForOption(
                geneId,
                slottedGeneIds,
                candidateFor(geneId)?.completesSplice ?? null
              );
              const marked = match.formsSpliceId !== null
                || match.pairsSpliceId !== null
                || match.sharedStrains.length > 0;
              return (
                <button
                  key={geneId}
                  type="button"
                  className={styles.option}
                  aria-pressed={selectedGeneId === geneId}
                  onClick={() => {
                    onSelect(selectedGeneId === geneId ? null : geneId);
                    setOpenSpliceId(null);
                  }}
                  data-testid={`workbench-gene-${geneId}`}
                  data-eligibility={annotation?.state}
                  data-match={marked || undefined}
                >
                  <i aria-hidden="true"><GeneGlyph id={geneId} /></i>
                  <span className={styles.optionCopy}>
                    <strong>{gene.name}</strong>
                    <em className={styles.optionCategory}>{gene.category}</em>
                    <small>{gene.effect}</small>
                    <GeneStrainBadges
                      strains={gene.strains}
                      testIdPrefix={`workbench-gene-${geneId}`}
                    />
                    {marked ? (
                      <span
                        className={styles.optionMatches}
                        data-testid={`workbench-gene-${geneId}-match`}
                      >
                        {match.formsSpliceId ? (
                          <b data-kind="combo">
                            MAKES {GENOME_V2_SPLICES[match.formsSpliceId].name}
                          </b>
                        ) : null}
                        {match.pairsSpliceId && match.partnerGeneId ? (
                          <b data-kind="combo">
                            PAIRS WITH {GENOME_V2_GENES[match.partnerGeneId].name}
                          </b>
                        ) : null}
                        {match.sharedStrains.map((strain) => (
                          <b
                            key={strain}
                            data-kind="path"
                            style={{ '--strain': STRAINS[strain].color } as CSSProperties}
                          >
                            SHARES {STRAINS[strain].name.toUpperCase()}
                          </b>
                        ))}
                      </span>
                    ) : null}
                    {/*
                      ANNOTATION, NOT A GATE. Every Gene in this picker stays
                      selectable, threadable and simulatable whatever this says;
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

          {selectedGene ? (
            <section
              className={styles.pickerSelected}
              data-testid="workbench-focused-reaction"
            >
              <header>
                <strong data-testid="workbench-focused-gene-name">
                  {selectedGene.name}
                </strong>
                <GeneStrainBadges
                  strains={selectedGene.strains}
                  compact
                  testIdPrefix="workbench-focused-gene"
                />
                {/*
                  THE WAY BACK TO THE LIST. On a landscape phone the panel has
                  ~176px, and a list plus a read plus an action do not fit in
                  it — so at that height the list gives way to the read, and
                  this is what returns it. It deselects and spends nothing,
                  which is why it sits beside the name rather than among the
                  commit actions.
                */}
                <button
                  type="button"
                  className={styles.pickerChange}
                  onClick={() => {
                    onSelect(null);
                    setOpenSpliceId(null);
                  }}
                  data-testid="workbench-picker-change"
                >
                  CHANGE
                </button>
              </header>
              <div className={styles.pickerRule}>
                <p><b>Changes</b>{selectedGene.effect}</p>
                <p><b>In full</b>{selectedGene.detail}</p>
                <p><b>Commits</b>{selectedGene.cost}</p>
              </div>
              <div className={styles.spliceBranches}>
                {paths.length > 0 ? paths.map((path) => (
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
                    <span className={styles.spliceLabel}>
                      <strong>{path.forms ? 'MAKES ' : 'WITH '}{path.name}</strong>
                      <small>{GENOME_V2_GENES[path.partner].name}</small>
                    </span>
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
                {mode === 'take' ? (
                  <>
                    <button
                      type="button"
                      className={styles.primaryCommit}
                      onClick={() => onCommit({ kind: 'thread', geneId: selectedGene.id })}
                      data-testid="workbench-thread"
                    >
                      TAKE
                    </button>
                    <button
                      type="button"
                      disabled={growth === null}
                      onClick={() => onCommit({ kind: 'infuse', geneId: selectedGene.id })}
                      data-testid="workbench-infuse"
                    >
                      TRADE UP {growth === null ? 'CLOSED' : `+${growth} BODY`}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryCommit}
                    disabled={growth === null}
                    onClick={() => onCommit({
                      kind: 'recode',
                      geneId: selectedGene.id,
                      slot: locus.slot,
                    })}
                    data-testid="workbench-recode"
                  >
                    SWAP {growth === null ? 'CLOSED' : `+${growth} BODY`}
                  </button>
                )}
              </div>
              {mode === 'swap' ? (
                <p className={styles.pickerNote}>
                  {locus.label} leaves for good, and so does any Combo it made.
                </p>
              ) : null}
            </section>
          ) : (
            <p className={styles.pickerHint}>Tap a power to read it in full.</p>
          )}
        </>
      )}
    </div>
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
  const [openSlot, setOpenSlot] = useState<GenomeV2SlotIndex | null>(null);
  const [selectedId, setSelectedId] = useState<GenomeV2ActiveGeneId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reading = useMemo(() => readGenomeV2Experiment(plan), [plan]);

  /**
   * A selection is only ever a power this Dynasty can still be offered. Held
   * as raw state it would survive a specimen switch and point at a gene that
   * is not in the new pool — the picker would then read out a rule the run
   * cannot reach and TAKE would fail against the reducer instead of never
   * being offered. Validating on the way out costs nothing and cannot drift.
   */
  const selectedGeneId = selectedId && reading.availableGenes.includes(selectedId)
    ? selectedId
    : null;

  /** The slot the reducer fills next. Derived, never chosen — see `slotModeFor`. */
  const nextOpenSlot = reading.loci.find((locus) => locus.kind === 'empty')?.slot ?? null;
  const openLocus = openSlot === null
    ? null
    : reading.loci.find((locus) => locus.slot === openSlot) ?? null;
  const openMode = openLocus ? slotModeFor(openLocus, nextOpenSlot) : null;
  const pickerKey = openLocus && openMode ? `${openLocus.slot}:${openMode}` : null;
  const { anchorRef, panelRef, anchor } = useSlotAnchor(pickerKey);

  /**
   * One authoritative projection for the whole option list, taken only while
   * the picker is open. Every Combo claim on a row comes from this and not
   * from a second reading of the recipes.
   */
  const candidates = useMemo(() => {
    if (pickerKey === null) return new Map<GenomeV2ActiveGeneId, LoomCandidate>();
    return new Map(
      projectGenomeV2(reading.state, reading.availableGenes).candidates.map(
        (entry) => [entry.geneId, entry]
      )
    );
  }, [pickerKey, reading.availableGenes, reading.state]);
  const candidateFor = useCallback(
    (geneId: GenomeV2ActiveGeneId) => candidates.get(geneId) ?? null,
    [candidates]
  );

  const closePicker = useCallback(() => {
    setOpenSlot(null);
    setSelectedId(null);
  }, []);

  const openPicker = useCallback((slot: GenomeV2SlotIndex) => {
    setSelectedId(null);
    setOpenSlot((current) => (current === slot ? null : slot));
  }, []);

  // A specimen switch is a different Dynasty with a different pool. The panel
  // that was asking about the old one has nothing left to say, so it closes
  // rather than re-rendering itself into a surface about something else.
  useEffect(() => {
    closePicker();
  }, [closePicker, plan.dynasty]);

  const commit = useCallback((action: GenomeV2ExperimentAction) => {
    const next: GenomeV2ExperimentPlan = {
      ...plan,
      actions: [...plan.actions, action],
    };
    try {
      readGenomeV2Experiment(next);
      onPlan(next);
      setOpenSlot(null);
      setSelectedId(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof GenomeV2ExperimentError
          ? caught.message
          : 'That experiment cannot resolve under the current rules.'
      );
    }
  }, [onPlan, plan]);

  // Escape is the keyboard's "tap elsewhere". It dismisses and spends nothing.
  useEffect(() => {
    if (pickerKey === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePicker, pickerKey]);

  const activeFacts = reading.lenses[lens];
  const selectedGene = selectedGeneId ? GENOME_V2_GENES[selectedGeneId] : null;
  const annotations = useMemo(
    () =>
      new Map(
        (curriculum?.state?.genes ?? []).map((entry) => [entry.geneId, entry])
      ),
    [curriculum?.state?.genes]
  );

  /**
   * What the picker highlights against. A swap drops the power leaving the
   * slot, because a recipe it was the partner for is not a reason to take its
   * own replacement.
   */
  const slottedGeneIds = useMemo(() => {
    const excluded = openMode === 'swap' && openLocus ? openLocus.geneIds : [];
    return reading.loci
      .filter((locus) => locus.kind === 'gene' || locus.kind === 'splice')
      .flatMap((locus) => locus.geneIds)
      .filter((geneId) => !excluded.includes(geneId));
  }, [openLocus, openMode, reading.loci]);

  return (
    <div className={styles.table} data-testid="workbench-research-table">
      <header className={styles.tableHeader}>
        <div>
          <p>Power Research</p>
          <h3>Fill a slot. Rewind the thought.</h3>
        </div>
        <div className={styles.historyControls}>
          <span>{plan.actions.length} move{plan.actions.length === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={() => {
              closePicker();
              onPlan({ ...plan, actions: plan.actions.slice(0, -1) });
            }}
            disabled={plan.actions.length === 0}
            data-testid="workbench-undo"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => {
              closePicker();
              onPlan({ ...plan, actions: [] });
            }}
            disabled={plan.actions.length === 0}
          >
            Clear
          </button>
        </div>
      </header>

      {pickerKey !== null ? (
        <div
          className={styles.pickerCatcher}
          onClick={closePicker}
          data-testid="workbench-picker-catcher"
          aria-hidden="true"
        />
      ) : null}

      <section className={styles.genomeStage} aria-label="Six power slots">
        <div className={styles.slotRow} data-testid="workbench-loci">
          {reading.loci.map((locus) => {
            const mode = slotModeFor(locus, nextOpenSlot);
            const open = openLocus?.slot === locus.slot && openMode !== null;
            return (
              <SlotCard
                key={locus.slot}
                locus={locus}
                mode={mode}
                open={open}
                onOpen={openPicker}
                cellRef={open ? anchorRef : undefined}
              >
                {open && openMode ? (
                  <SlotPicker
                    locus={locus}
                    mode={openMode}
                    options={reading.availableGenes}
                    candidateFor={candidateFor}
                    slottedGeneIds={slottedGeneIds}
                    selectedGeneId={selectedGeneId}
                    onSelect={setSelectedId}
                    onCommit={commit}
                    onClose={closePicker}
                    annotations={annotations}
                    panelRef={panelRef}
                    anchor={anchor}
                  />
                ) : null}
              </SlotCard>
            );
          })}
        </div>
        <p className={styles.stageHint}>
          {nextOpenSlot === null
            ? 'All six slots are full. Tap one to swap it.'
            : 'Tap the open slot to fill it. Tap a filled slot to read it.'}
        </p>
      </section>

      <div className={styles.mathRibbon} data-testid="workbench-math-ribbon">
        <span><b>BANK</b> {formatBps(reading.projection.liabilities.bankMultiplierBps)}</span>
        <span><b>CRASH</b> {formatBps(reading.projection.liabilities.salvageMultiplierBps)}</span>
        <span><b>BODY</b> {reading.growthCommitted ? `+${reading.growthCommitted}` : 'UNCHANGED'}</span>
        <span><b>BURNED</b> {reading.loci.filter((locus) => locus.kind === 'ash').length}</span>
      </div>

      <StrainRail reading={reading} focusedStrains={selectedGene?.strains ?? []} />

      <section className={styles.reactionField} data-testid={`workbench-reaction-${lens}`}>
        <header>
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
          <small>powers you hold only</small>
        </header>
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

      {curriculum ? <CurriculumTrials curriculum={curriculum} /> : null}

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
