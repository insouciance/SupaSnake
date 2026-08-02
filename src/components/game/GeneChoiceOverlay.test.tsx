import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { GeneChoiceOverlay } from './GeneChoiceOverlay';
import { CHOICE_INPUT_LOCK_MS } from './MutationChoiceOverlay';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
} from './genome/tacticalLoomPresentation';

function slots(label = 'Gold Trail') {
  return Array.from({ length: 6 }, (_, index) => ({
    index,
    kind: index === 0 ? 'gene' as const : index === 5 ? 'ash' as const : 'empty' as const,
    label: index === 0 ? label : index === 5 ? 'Ash' : 'Open locus',
    strains: index === 0 ? ['AURUM' as const] : [],
  }));
}

function consequence(name: string): TacticalLoomConsequence {
  return {
    category: 'Execution & route mastery',
    effect: `${name} creates a topology-scaled ×3 route test.`,
    cost: 'A miss burns the transformed target to zero Yield.',
    genomeAfter: slots(name),
    strains: [{
      id: 'VOLT',
      name: 'Volt',
      color: '#42e0f5',
      before: 2,
      after: 3,
      thresholds: [
        { points: 3, name: 'Telemetry', rule: 'Route budgets reveal their exact margin.', state: 'active', progressLabel: 'active' },
        { points: 4, name: 'Relay', rule: 'A clean route arms a compatible challenge.', state: 'next', progressLabel: '1 away', lockedReason: 'Bank 2 runs to activate Expressions' },
        { points: 5, name: 'Overclock', rule: 'Trigger a rewarded bounded burst.', state: 'locked', progressLabel: '2 away', lockedReason: 'Bank 10 runs or reach M3' },
      ],
    }],
    splices: [{
      id: 'perfect-circuit',
      name: 'Perfect Circuit',
      stage: 'immediate',
      rule: 'Successful Live routes arm a linked return leg.',
      cost: 'Either failed leg burns the circuit.',
      recipeKnown: true,
      recipeLabel: 'Live Wire + Circuit Run',
    }],
    ledgers: [
      { id: 'bonds', label: 'Bonds', before: '1', after: '1', detail: 'Bonds remain prospective and BANK-only.' },
      { id: 'stake', label: 'Stake', before: '40 DNA', after: '40 DNA' },
    ],
    targets: [{ id: 'queue', label: 'Next transform', before: 'Ordinary', after: name }],
    body: [{ id: 'growth', label: 'Permanent growth', before: '+0', after: '+0' }],
    outcomes: [
      { id: 'bank', label: 'BANK projection', before: '×1.56', after: '×1.56' },
      { id: 'crash', label: 'Crash projection', before: '×0.74', after: '×0.74' },
    ],
    dynastyFacts: ['CYBER reaches this route budget at its own speed profile.'],
  };
}

function model(): TacticalLoomDecisionModel {
  return {
    rulesVersion: 2,
    title: 'Tactical Loom',
    sourceLabel: 'Cadence offer · 18 foods',
    dynasty: 'CYBER',
    currentGenome: slots(),
    candidates: [
      {
        action: 'THREAD',
        geneId: 'live_wire',
        name: 'Live Wire',
        category: 'Execution',
        strains: ['VOLT'],
        consequence: consequence('Live Wire'),
      },
      {
        action: 'FORK',
        geneId: 'phase_gate',
        name: 'Phase Gate',
        category: 'Terrain',
        strains: ['FLUX'],
        consequence: { ...consequence('Phase Gate'), splices: [] },
      },
    ],
    decline: {
      action: 'DECLINE',
      name: 'Keep this Genome',
      consequence: {
        ...consequence('Decline'),
        category: 'Opportunity cost',
        effect: 'Spend this offer and mint Bond 2 of 3.',
        cost: 'Neither build-defining gene can return in this offer.',
        strains: [],
        splices: [],
      },
    },
  };
}

const baseProps = {
  options: ['live_wire', 'phase_gate'] as never,
  held: [],
  strainCounts: {},
  showStrains: true,
  splicesUnlocked: true,
};

describe('GeneChoiceOverlay tactical Loom', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps one shared consequence pane and exposes every affected 3/4/5 threshold', () => {
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={model()}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Tactical Loom' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getAllByTestId('loom-consequence-pane')).toHaveLength(1);
    expect(screen.getByTestId('loom-genome-before')).toHaveAccessibleName('Current Genome');
    expect(screen.getByTestId('loom-genome-after')).toHaveAccessibleName('Resulting Genome');
    expect(screen.getByTestId('loom-tier-VOLT-3')).toHaveTextContent('Telemetry');
    expect(screen.getByTestId('loom-tier-VOLT-4')).toHaveTextContent('Bank 2 runs');
    expect(screen.getByTestId('loom-tier-VOLT-5')).toHaveTextContent('Bank 10 runs or reach M3');
    expect(screen.getByTestId('loom-splice-paths')).toHaveTextContent('Perfect Circuit');
    expect(screen.getByTestId('loom-fact-stake')).toHaveTextContent('40 DNA');
    expect(screen.getByTestId('loom-dynasty-facts')).not.toHaveTextContent(/best|recommended/i);
  });

  it('previews THREAD, FORK, and DECLINE before an explicit confirmation', () => {
    const onChoose = jest.fn();
    const onDecline = jest.fn();
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={model()}
        onChoose={onChoose}
        onDecline={onDecline}
      />
    );
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));

    fireEvent.click(screen.getByTestId('gene-option-1'));
    expect(screen.getByTestId('loom-consequence-pane')).toHaveTextContent('Phase Gate creates');
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onChoose).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('gene-decline'));
    expect(screen.getByTestId('loom-consequence-pane')).toHaveTextContent('mint Bond 2 of 3');
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('routes keyboard confirmation through the same input lock', () => {
    const onChoose = jest.fn();
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={model()}
        onChoose={onChoose}
        onDecline={jest.fn()}
      />
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('gene-option-0')).toHaveFocus();
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('gene-option-1')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('uses an explicit incoming-gene then outgoing-locus Recode with the exact growth cost', () => {
    const onRecode = jest.fn();
    const baseModel = model();
    const replacementConsequence = {
      ...consequence('Live Wire replacing Gold Trail'),
      retainedFacts: ['Bonds', 'Escrow', 'Stake', 'Scars', 'Ash', 'prior growth'],
    };
    const recodeModel: TacticalLoomDecisionModel = {
      ...baseModel,
      candidates: [{
        ...baseModel.candidates[0],
        replacementChoices: [{
          slotIndex: 0,
          label: 'Gold Trail',
          kind: 'gene',
          growthCost: 8,
          consequence: replacementConsequence,
        }],
      }, baseModel.candidates[1]],
    };
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={recodeModel}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
        onRecode={onRecode}
      />
    );
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(screen.getByTestId('loom-recode-step')).toHaveTextContent('Step 2 of 2');
    expect(screen.getByTestId('loom-replace-0')).toHaveTextContent('+8 growth');
    expect(screen.getByTestId('loom-retained-facts')).toHaveTextContent('Bonds · Escrow · Stake · Scars · Ash · prior growth');
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onRecode).toHaveBeenCalledWith(0, 0);
  });

  it('preserves board visibility with a portrait-bottom / landscape-side, internally scrolling instrument', () => {
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={model()}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    const rail = screen.getByTestId('loom-choice-rail');
    expect(rail).toHaveAttribute('data-responsive-composition', 'portrait-bottom landscape-side');
    expect(screen.getByTestId('loom-scroll-region')).toHaveClass('[touch-action:pan-y]');
    const thread = screen.getByTestId('gene-option-0');
    expect(within(thread).getByText('Live Wire')).toHaveAttribute('title', 'Live Wire');
    expect(within(thread).getByText('Live Wire')).toHaveClass('truncate');
  });

  it('keeps already-started v1 sessions honest through the legacy adapter', () => {
    render(
      <GeneChoiceOverlay
        options={['compound_interest', 'tithe']}
        held={[{ id: 'gold_trail', atFood: 20 }]}
        strainCounts={{ AURUM: 2 }}
        showStrains
        splicesUnlocked
        discoveredSplices={[]}
        pityStrain="FERAL"
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByTestId('gene-choice-overlay')).toHaveAttribute('data-rules-version', '1');
    expect(screen.getByTestId('loom-splice-paths')).toHaveTextContent('Uncatalogued Splice');
    fireEvent.focus(screen.getByTestId('gene-decline'));
    expect(screen.getByTestId('loom-consequence-pane')).toHaveTextContent('forced to FERAL');
  });
});
