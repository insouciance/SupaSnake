'use client';

import { GameEnvironment } from '@/components/game/screen/GameEnvironment';
import { ArenaPrototypeCanvas } from '@/components/game/arena/ArenaPrototypeCanvas';
import { PauseMenu } from '@/components/game/PauseMenu';
import { GeneChoiceOverlay } from '@/components/game/GeneChoiceOverlay';
import { MutationChoiceOverlay } from '@/components/game/MutationChoiceOverlay';
import {
  PortalChoiceOverlay,
  StrainSurgeOverlay,
} from '@/components/game/PortalChoiceOverlay';
import { ExpressionFlourish } from '@/components/game/ExpressionFlourish';
import { RunCockpit } from './RunCockpit';
import type { RunCockpitModel } from './types';
import styles from './CockpitPrototype.module.css';

export type CockpitDecisionFixtureKind =
  | 'pause'
  | 'gene'
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
  score: 12840,
  dna: 186,
  energy: 4,
  maxEnergy: 5,
  bankDna: 168,
  crashDna: 52,
  comboMultiplier: 1.8,
  chainLength: 4,
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

function Decision({ kind }: { kind: CockpitDecisionFixtureKind }) {
  if (kind === 'pause') {
    return (
      <PauseMenu
        dynasty="PRIMAL"
        score={12840}
        dnaCollected={186}
        bankDna={168}
        crashDna={52}
        onResume={() => undefined}
        onQuit={() => undefined}
      />
    );
  }
  if (kind === 'gene') {
    return (
      <GeneChoiceOverlay
        options={['static_charge', 'heartwood']}
        held={[{ id: 'gold_trail', atFood: 4 }]}
        strainCounts={{ AURUM: 3, VOLT: 1, FERAL: 2 }}
        showStrains
        splicesUnlocked
        discoveredSplices={[]}
        onChoose={() => undefined}
        onDecline={() => undefined}
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
  return (
    <main
      className={`${styles.decisionFixtureRoot} consent-safe-viewport cockpit-game-viewport`}
      data-testid="cockpit-decision-fixture"
    >
      <GameEnvironment dynasty="PRIMAL" />
      <RunCockpit
        model={kind === 'expression' ? { ...MODEL, state: 'apex' } : MODEL}
        onPause={() => undefined}
        onResetView={() => undefined}
        showPause={false}
        decisionDock={kind === 'expression' ? undefined : <Decision kind={kind} />}
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
