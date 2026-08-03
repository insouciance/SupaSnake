'use client';

import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { ArenaPrototypeCanvas } from '@/components/game/arena/ArenaPrototypeCanvas';
import { AbandonRunDialog } from '@/components/game/AbandonRunDialog';
import { GeneChoiceOverlay } from '@/components/game/GeneChoiceOverlay';
import { MutationChoiceOverlay } from '@/components/game/MutationChoiceOverlay';
import {
  PortalChoiceOverlay,
  StrainSurgeOverlay,
} from '@/components/game/PortalChoiceOverlay';
import { ExpressionFlourish } from '@/components/game/ExpressionFlourish';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
  TacticalLoomGenomeSlot,
} from '@/components/game/genome/tacticalLoomPresentation';
import { RunCockpit } from './RunCockpit';
import type { RunCockpitModel } from './types';
import styles from './CockpitPrototype.module.css';

export type CockpitDecisionFixtureKind =
  | 'hold'
  | 'abandon'
  | 'gene'
  | 'gene-recode'
  | 'mutation'
  | 'portal'
  | 'surge'
  | 'expression';

const MODEL: RunCockpitModel = {
  dynasty: 'PRIMAL',
  state: 'portal',
  mode: 'anomaly',
  modeLabel: 'Fractured Time',
  modeDetail: 'Genome run',
  statusText: 'Run held for your decision',
  isFirstMovementPrompt: false,
  holds: { remaining: 2, total: 4 },
  score: 12840,
  dna: 186,
  charge: {
    available: 4,
    capacity: 6,
    recoveryIntervalSeconds: 3600,
    recoveryStartedAt: '2026-07-25T11:30:00.000Z',
    nextRecoveryAt: '2026-07-25T12:30:00.000Z',
    recoveryProgress: 0.5,
    serverNow: '2026-07-25T12:00:00.000Z',
    remaining: 4,
    perDay: 6,
    usedToday: 2,
    day: '2026-07-25',
    refillsAt: '2026-07-25T12:30:00.000Z',
  },
  bankDna: 168,
  crashDna: 52,
  constellation: { stars: 3, fraction: 0.55 },
  genes: [
    { id: 'gold_trail', name: 'Gold Trail', strains: ['AURUM'] },
    { id: 'magnet_pulse', name: 'Magnet Pulse', strains: ['FLUX'] },
    { id: 'phoenix', name: 'Phoenix', strains: ['UMBRA'] },
    { id: 'pocket_rift', name: 'Pocket Rift', strains: ['FLUX'] },
  ],
  strains: [
    { id: 'AURUM', name: 'Aurum', color: '#f5c542', points: 3, tier: 2, suppressed: false },
    { id: 'VOLT', name: 'Volt', color: '#42e0f5', points: 2, tier: 1, suppressed: false },
    { id: 'FERAL', name: 'Feral', color: '#5ff542', points: 4, tier: 3, suppressed: false },
    { id: 'FLUX', name: 'Flux', color: '#a642f5', points: 1, tier: 0, suppressed: false },
    { id: 'UMBRA', name: 'Umbra', color: '#f54263', points: 2, tier: 1, suppressed: false },
  ],
  showGenome: true,
  portalLive: true,
  portalTicksRemaining: 14,
};

const PHOENIX_LADDER = [
  { points: 2 as const, name: 'Stake', rule: 'At-risk Yield is separated and always visible.', state: 'active' as const, progressLabel: 'active' },
  { points: 3 as const, name: 'Covenant', rule: 'Deferred contracts may protect or amplify one another.', state: 'active' as const, progressLabel: 'active' },
  { points: 4 as const, name: 'Afterlife', rule: 'One explicit second-life economy may be assembled.', state: 'next' as const, progressLabel: '1 away' },
];

const FERAL_LADDER = [
  { points: 2 as const, name: 'Mass', rule: 'Body pressure visibly raises FERAL execution value.', state: 'active' as const, progressLabel: 'active' },
  { points: 3 as const, name: 'Territory', rule: 'Clean coils can claim strategically useful space.', state: 'active' as const, progressLabel: 'active' },
  { points: 4 as const, name: 'Worldbody', rule: 'Perfect body control converts pressure into a major payout.', state: 'next' as const, progressLabel: '1 away' },
];

function loomSlots(
  entries: readonly Partial<TacticalLoomGenomeSlot>[]
): TacticalLoomGenomeSlot[] {
  return Array.from({ length: 6 }, (_, index) => {
    const entry = entries[index];
    return {
      index,
      kind: entry?.kind ?? 'empty',
      label: entry?.label ?? 'Open locus',
      strains: entry?.strains ?? [],
      detail: entry?.detail,
    };
  });
}

function quietConsequence(
  currentGenome: readonly TacticalLoomGenomeSlot[],
  name: string
): TacticalLoomConsequence {
  return {
    category: 'Opportunity cost',
    salienceChip: 'Genome unchanged',
    trigger: { label: 'Resolves when DECLINE is confirmed', cadence: 1, unit: 'offer' },
    effect: `Keep the active Genome instead of threading ${name}.`,
    cost: 'Both offered build paths leave this offer.',
    genomeAfter: currentGenome,
    strains: [],
    splices: [],
    ledgers: [],
    targets: [],
    body: [],
    outcomes: [],
    dynastyFacts: [],
  };
}

function hardCaseLoomModel(): TacticalLoomDecisionModel {
  const currentGenome = loomSlots([
    { kind: 'gene', label: 'Mirror Wager', strains: ['UMBRA'] },
    { kind: 'gene', label: 'Gold Trail', strains: ['AURUM'] },
    { kind: 'gene', label: 'Circuit Run', strains: ['VOLT', 'FLUX'] },
    { kind: 'gene', label: 'Coilkeeper', strains: ['FERAL', 'FLUX'] },
  ]);
  const phoenixGenome = loomSlots([
    { kind: 'splice', label: 'Styx Contract', strains: ['UMBRA', 'FERAL'], detail: 'Mirror Wager + Phoenix' },
    { kind: 'gene', label: 'Gold Trail', strains: ['AURUM'] },
    { kind: 'gene', label: 'Circuit Run', strains: ['VOLT', 'FLUX'] },
    { kind: 'gene', label: 'Coilkeeper', strains: ['FERAL', 'FLUX'] },
  ]);
  const phoenix: TacticalLoomConsequence = {
    category: 'Survival & insurance',
    salienceChip: 'Forms Styx Contract',
    trigger: { label: 'One fatal collision, then Ash', cadence: 1 },
    effect: 'Survive one death with a three-cell rewind and twelve phase ticks.',
    cost: 'Phoenix adds ten segments when it fires; Ash then occupies its locus.',
    genomeAfter: phoenixGenome,
    strains: [
      { id: 'UMBRA', name: 'Umbra', color: '#f54263', before: 2, after: 3, thresholds: PHOENIX_LADDER },
      { id: 'FERAL', name: 'Feral', color: '#6fe65d', before: 2, after: 3, thresholds: FERAL_LADDER },
    ],
    splices: [
      {
        id: 'splice_styx_contract:immediate',
        name: 'Styx Contract',
        stage: 'immediate',
        projectionState: 'forms-now',
        rule: 'The visible Stake can fund Phoenix; unused Ash-bound Stake doubles on BANK.',
        cost: 'Using Phoenix consumes the Stake and permanently Ashes its socket.',
        recipeKnown: true,
        recipeLabel: 'Mirror Wager + Phoenix',
        partnerLabel: 'Mirror Wager',
        partnerState: 'held',
        activation: 'available',
      },
      {
        id: 'splice_ashen_stake:future',
        name: 'Ashen Stake',
        stage: 'one-step',
        projectionState: 'future',
        rule: 'A completed Loan can fund Phoenix and preserve the run instead of paying its Escrow.',
        cost: 'The conversion pays no contract Yield and leaves Ash in the Phoenix socket.',
        recipeKnown: true,
        recipeLabel: 'Loan Shark + Phoenix',
        partnerLabel: 'Loan Shark',
        partnerState: 'needed',
        activation: 'available',
      },
    ],
    ledgers: [{ id: 'second-life', label: 'Second life', before: 'None ready', after: 'Phoenix ready', tone: 'positive' }],
    targets: [],
    body: [{ id: 'trigger-growth', label: 'Phoenix body', before: 'None', after: '+10 when triggered', tone: 'warning' }],
    outcomes: [],
    dynastyFacts: ['Phoenix deliberately favors builds that can recover after its spatial shock.'],
  };
  const phaseGate = {
    ...quietConsequence(currentGenome, 'Phase Gate'),
    category: 'Movement & terrain',
    salienceChip: 'Future Riftline route',
    trigger: { label: 'Every fifth food can charge a Gate', cadence: 5 as const, unit: 'food' as const },
    effect: 'Create an optional gate shortcut toward an empowered target.',
    cost: 'Used Gate cells become permanent Scars.',
    strains: [{
      id: 'FLUX' as const,
      name: 'Flux',
      color: '#a642f5',
      before: 2,
      after: 3,
      thresholds: [
        { points: 2 as const, name: 'Vector', rule: 'Planned terrain interactions preview a legal exit.', state: 'active' as const, progressLabel: 'active' },
        { points: 3 as const, name: 'Riftcraft', rule: 'Trade permanent space for route power.', state: 'active' as const, progressLabel: 'active' },
        { points: 4 as const, name: 'Topology', rule: 'Linked spatial actions can reshape one target route.', state: 'next' as const, progressLabel: '1 away' },
      ],
    }],
  };
  return {
    decisionId: 'fixture-hard-case-offer',
    rulesVersion: 2,
    title: 'Tactical Loom',
    sourceLabel: 'Dev truth case · dual Strain + two recipes',
    dynasty: 'PRIMAL',
    currentGenome,
    candidates: [
      { action: 'THREAD', geneId: 'phoenix', name: 'Phoenix', category: 'Survival', strains: ['UMBRA', 'FERAL'], consequence: phoenix },
      { action: 'THREAD', geneId: 'phase_gate', name: 'Phase Gate', category: 'Terrain', strains: ['FLUX'], consequence: phaseGate },
    ],
    decline: { action: 'DECLINE', name: 'Keep this Genome', consequence: quietConsequence(currentGenome, 'both candidates') },
  };
}

function recodeLoomModel(): TacticalLoomDecisionModel {
  const currentGenome = loomSlots([
    { kind: 'splice', label: 'Worldcoil', strains: ['FERAL', 'FLUX'], detail: 'Coilkeeper + Overgrowth' },
    { kind: 'gene', label: 'Wall Rush', strains: ['FLUX', 'VOLT'] },
    { kind: 'gene', label: 'Live Wire', strains: ['VOLT'] },
    { kind: 'gene', label: 'Mirror Wager', strains: ['UMBRA'] },
    { kind: 'gene', label: 'Gold Trail', strains: ['AURUM'] },
    { kind: 'gene', label: 'Compound Interest', strains: ['AURUM'] },
  ]);
  const recodedGenome = loomSlots([
    { kind: 'splice', label: 'Riftline', strains: ['FLUX', 'VOLT'], detail: 'Wall Rush + Phase Gate' },
    { kind: 'empty', label: 'Open locus', strains: [] },
    ...currentGenome.slice(2),
  ]);
  const base = quietConsequence(currentGenome, 'Phase Gate');
  const replacement: TacticalLoomConsequence = {
    ...base,
    category: 'Movement & terrain',
    salienceChip: 'Breaks Worldcoil · forms Riftline',
    trigger: { label: 'Every fifth food can charge a Gate', cadence: 5, unit: 'food' },
    effect: 'Riftline links a deliberate redirect to an empowered target.',
    cost: 'Worldcoil ends, +8 body is committed, and used Gate cells become permanent Scars.',
    genomeAfter: recodedGenome,
    strains: [{
      id: 'FLUX', name: 'Flux', color: '#a642f5', before: 4, after: 4,
      thresholds: [
        { points: 2, name: 'Vector', rule: 'Planned terrain interactions preview a legal exit.', state: 'active', progressLabel: 'active' },
        { points: 3, name: 'Riftcraft', rule: 'Trade permanent space for route power.', state: 'active', progressLabel: 'active' },
        { points: 4, name: 'Topology', rule: 'Linked spatial actions can reshape one target route.', state: 'active', progressLabel: 'active' },
      ],
    }],
    splices: [
      {
        id: 'splice_worldcoil:break', name: 'Worldcoil', stage: 'immediate', projectionState: 'breaks',
        rule: 'This Recode breaks the active Splice and stops its future rule.', cost: 'Worldcoil pressure conversion ends.',
        recipeKnown: true, recipeLabel: 'Broken by outgoing locus 1', activation: 'available',
      },
      {
        id: 'splice_riftline:create', name: 'Riftline', stage: 'immediate', projectionState: 'forms-now',
        rule: 'A deliberate redirect can open a one-use riftline to the empowered target.', cost: 'Traversed Gate cells become permanent Scars.',
        recipeKnown: true, recipeLabel: 'Wall Rush + Phase Gate', partnerLabel: 'Wall Rush', partnerState: 'held', activation: 'available',
      },
    ],
    body: [{ id: 'body-length', label: 'Current body', before: '34 segments', after: '+8 on commit', tone: 'warning' }],
    retainedFacts: ['earned Yield', 'Bonds', 'Escrow', 'Stake', 'Ash', 'prior growth', 'Scars and seals'],
  };
  const candidateBase: TacticalLoomConsequence = {
    ...base,
    category: 'Movement & terrain',
    salienceChip: 'Choose an outgoing locus',
    trigger: { label: 'Every fifth food can charge a Gate', cadence: 5, unit: 'food' },
    effect: 'Phase Gate can connect to a held Wall Rush through the correct Recode.',
    cost: 'The outgoing locus decides what breaks, what forms, and commits +8 body.',
    splices: [{
      id: 'splice_riftline:recode', name: 'Riftline', stage: 'one-step', projectionState: 'recode',
      rule: 'A deliberate redirect can open a one-use riftline to the empowered target.', cost: 'Exact outcome depends on the outgoing locus.',
      recipeKnown: true, recipeLabel: 'Choose the outgoing locus', partnerLabel: 'Wall Rush', partnerState: 'held', activation: 'available',
    }],
  };
  return {
    decisionId: 'fixture-recode-case-offer',
    rulesVersion: 2,
    title: 'Tactical Loom',
    sourceLabel: 'Dev truth case · Recode break/form',
    dynasty: 'PRIMAL',
    currentGenome,
    candidates: [
      {
        action: 'FORK', geneId: 'phase_gate', name: 'Phase Gate', category: 'Terrain', strains: ['FLUX'], consequence: candidateBase,
        replacementChoices: [{ slotIndex: 0, label: 'Worldcoil', kind: 'splice', strains: ['FERAL', 'FLUX'], growthCost: 8, consequence: replacement }],
      },
      { action: 'FORK', geneId: 'phoenix', name: 'Phoenix', category: 'Survival', strains: ['UMBRA', 'FERAL'], consequence: quietConsequence(currentGenome, 'Phoenix'), disabledReason: 'Dev fixture keeps focus on the exact break/form path' },
    ],
    decline: { action: 'DECLINE', name: 'Keep this Genome', consequence: quietConsequence(currentGenome, 'both candidates') },
  };
}

function Decision({ kind }: { kind: CockpitDecisionFixtureKind }) {
  if (kind === 'abandon') {
    return (
      <AbandonRunDialog
        score={12840}
        dnaCollected={186}
        costsCharge
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );
  }
  if (kind === 'gene') {
    return (
      <GeneChoiceOverlay
        presentation={hardCaseLoomModel()}
        onChoose={() => undefined}
        onDecline={() => undefined}
      />
    );
  }
  if (kind === 'gene-recode') {
    return (
      <GeneChoiceOverlay
        presentation={recodeLoomModel()}
        onChoose={() => undefined}
        onDecline={() => undefined}
        onRecode={() => undefined}
      />
    );
  }
  if (kind === 'mutation') {
    return (
      <MutationChoiceOverlay
        options={['magnet_pulse', 'phoenix']}
        onChoose={() => undefined}
        onDecline={() => undefined}
      />
    );
  }
  if (kind === 'portal') {
    return (
      <PortalChoiceOverlay
        canInfuse
        infusesUsed={1}
        snakeLength={18}
        bankDna={168}
        crashDna={52}
        doorsPassed={2}
        cadence={{ firstExitAtFood: 15, intervalBase: 12, intervalJitter: 4 }}
        onBank={() => undefined}
        onPass={() => undefined}
        onInfuse={() => undefined}
      />
    );
  }
  return (
    <StrainSurgeOverlay
      strains={['AURUM', 'VOLT', 'FERAL', 'FLUX', 'UMBRA']}
      onChoose={() => undefined}
    />
  );
}

export function CockpitDecisionFixture({ kind }: { kind: CockpitDecisionFixtureKind }) {
  const eventCallout = kind === 'expression'
    ? <ExpressionFlourish strain="FERAL" tier={3} presentation="cockpit" />
    : undefined;
  const held = kind === 'hold' || kind === 'abandon';
  const decisionVisible = kind !== 'expression' && kind !== 'hold';
  return (
    <main
      className={`${styles.decisionFixtureRoot} consent-safe-viewport cockpit-game-viewport`}
      data-testid="cockpit-decision-fixture"
    >
      <GameEnvironment dynasty="PRIMAL" />
      <RunCockpit
        model={kind === 'expression'
          ? { ...MODEL, state: 'apex' }
          : held
            ? {
                ...MODEL,
                state: 'held',
                modeDetail: 'Tactical hold',
                statusText: 'Tactical hold · press a safe direction to resume',
              }
            : MODEL}
        onPause={() => undefined}
        onAbandon={() => undefined}
        onResetView={() => undefined}
        showPause={false}
        showAbandon={kind === 'hold'}
        decisionDock={decisionVisible ? <Decision kind={kind} /> : undefined}
        eventCallout={eventCallout}
      >
        <ArenaPrototypeCanvas
          dynasty="PRIMAL"
          state={kind === 'expression' ? 'apex' : 'portal'}
          arenaVariant="cockpit"
          effectsEnabled={false}
        />
      </RunCockpit>
    </main>
  );
}
