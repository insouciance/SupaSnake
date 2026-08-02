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
    trigger: { label: 'Every third eligible target', cadence: 3, unit: 'target' },
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
        { points: 2, name: 'Telemetry', rule: 'Route budgets reveal their exact margin.', state: 'active', progressLabel: 'active' },
        { points: 3, name: 'Relay', rule: 'A clean route arms a compatible challenge.', state: 'locked', progressLabel: '3 / 3', lockedReason: 'Bank 2 runs to activate Expressions' },
        { points: 4, name: 'Overclock', rule: 'Trigger a rewarded bounded burst.', state: 'locked', progressLabel: '1 away', lockedReason: 'Bank 10 runs or reach M3' },
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
      activation: 'available',
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
        action: 'THREAD',
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

  it('keeps the live decision intuitive while exposing the whole tappable 2/3/4 path', () => {
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={model()}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Tactical Loom' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByTestId('loom-consequence-pane')).toBeNull();
    expect(screen.queryByTestId('loom-details-toggle')).toBeNull();
    expect(screen.getByTestId('gene-option-0')).toHaveTextContent('VOLT');
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('Live Wire creates');
    expect(screen.getByTestId('loom-lite-trigger')).toHaveTextContent('Every third eligible target');
    expect(screen.getByTestId('loom-lite-loci')).toHaveTextContent('Gold Trail');
    expect(screen.getByTestId('loom-lite-loci')).toHaveTextContent('Live Wire');
    expect(screen.getByTestId('loom-lite-activations')).toHaveTextContent('Telemetry');
    expect(screen.getByTestId('loom-lite-activations')).toHaveTextContent('Relay');
    expect(screen.getByTestId('loom-lite-activations')).toHaveTextContent('Overclock');
    expect(screen.getByTestId('loom-strain-VOLT-rule')).toHaveTextContent('REACHED · LOCKED');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('Perfect Circuit');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('FORMS');
    expect(screen.getByText('Bank 2 runs to activate Expressions')).toBeInTheDocument();
    expect(screen.queryByText('Bank 10 runs or reach M3')).toBeNull();
    fireEvent.click(screen.getByTestId('loom-strain-VOLT-tier-4'));
    expect(screen.getByTestId('loom-strain-VOLT-rule')).toHaveTextContent('Trigger a rewarded bounded burst.');
    expect(screen.getByTestId('loom-strain-VOLT-rule')).toHaveTextContent('LOCKED');
    expect(screen.getByTestId('loom-strain-VOLT-rule')).toHaveTextContent('Bank 10 runs or reach M3');
    expect(screen.queryByText(/best|recommended/i)).toBeNull();
  });

  it('spells out dual Strains and preserves every immediate and future Splice branch', () => {
    const baseModel = model();
    const voltage = baseModel.candidates[0].consequence.strains[0];
    const dualModel: TacticalLoomDecisionModel = {
      ...baseModel,
      candidates: [{
        ...baseModel.candidates[0],
        geneId: 'phoenix',
        name: 'Phoenix',
        strains: ['UMBRA', 'FERAL'],
        consequence: {
          ...baseModel.candidates[0].consequence,
          strains: [
            { ...voltage, id: 'UMBRA', name: 'Umbra', color: '#f54263' },
            { ...voltage, id: 'FERAL', name: 'Feral', color: '#6fe65d' },
          ],
          splices: [
            {
              id: 'splice_styx_contract:immediate',
              name: 'Styx Contract',
              stage: 'immediate',
              projectionState: 'forms-now',
              rule: 'The visible Stake can fund Phoenix.',
              cost: 'Using Phoenix consumes the Stake.',
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
              projectionState: 'closed',
              rule: 'A completed Loan can fund Phoenix.',
              cost: 'The contract pays no ordinary Yield.',
              recipeKnown: true,
              recipeLabel: 'Loan Shark + Phoenix',
              partnerLabel: 'Loan Shark',
              partnerState: 'needed',
              activation: 'available',
            },
          ],
        },
      }, baseModel.candidates[1]],
    };

    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={dualModel}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    expect(screen.getByTestId('gene-option-0')).toHaveTextContent('UMBRA');
    expect(screen.getByTestId('gene-option-0')).toHaveTextContent('FERAL');
    expect(screen.getByTestId('gene-option-0-strain-UMBRA')).toBeVisible();
    expect(screen.getByTestId('gene-option-0-strain-FERAL')).toBeVisible();
    expect(screen.getByTestId('loom-gene-core')).toHaveTextContent('UMBRA');
    expect(screen.getByTestId('loom-gene-core')).toHaveTextContent('FERAL');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('Styx Contract');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('HELD Mirror Wager');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('Ashen Stake');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('CLOSED');
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('NEEDS Loan Shark');
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
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('Phase Gate creates');
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onChoose).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('gene-decline'));
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('mint Bond 2 of 3');
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

  it('shows an authoritative illegal candidate but cannot commit it', () => {
    const onChoose = jest.fn();
    const baseModel = model();
    const constrained: TacticalLoomDecisionModel = {
      ...baseModel,
      candidates: [{
        ...baseModel.candidates[0],
        disabledReason: 'Another second life is already active',
      }, baseModel.candidates[1]],
    };
    render(
      <GeneChoiceOverlay
        presentation={constrained}
        onChoose={onChoose}
        onDecline={jest.fn()}
      />
    );
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('gene-option-0')).toBeDisabled();
    expect(screen.getByTestId('gene-option-0')).toHaveTextContent('Another second life is already active');
    expect(screen.getByTestId('gene-option-1')).toHaveFocus();
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('makes a charged Loom Anchor pin a deliberate final DECLINE choice', () => {
    const onDecline = jest.fn();
    const baseModel = model();
    const anchoredModel: TacticalLoomDecisionModel = {
      ...baseModel,
      decline: {
        ...baseModel.decline,
        options: [
          {
            id: 'no-pin',
            label: 'Do not pin',
            detail: 'Spend this offer without preserving either candidate.',
            consequence: baseModel.decline.consequence,
          },
          {
            id: 'pin-a',
            label: 'Pin Live Wire',
            detail: 'Spend the charged Anchor; Live Wire enters the next offer.',
            pinCandidateIndex: 0,
            consequence: {
              ...baseModel.decline.consequence,
              effect: 'Spend the charged Anchor and pin Live Wire. This anchored DECLINE mints no Bond.',
            },
          },
        ],
      },
    };
    render(
      <GeneChoiceOverlay
        presentation={anchoredModel}
        onChoose={jest.fn()}
        onDecline={onDecline}
      />
    );
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    fireEvent.click(screen.getByTestId('gene-decline'));
    expect(screen.getByTestId('loom-anchor-decline-step')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('loom-decline-option-pin-a'));
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('mints no Bond');
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onDecline).toHaveBeenCalledWith(0);
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
          strains: ['AURUM'],
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
    expect(screen.getByTestId('loom-replace-0-strain-AURUM')).toBeVisible();
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('THREAD Live Wire · replace Gold Trail');
    expect(screen.getByTestId('loom-lite-loci')).toHaveTextContent('Gold Trail');
    expect(screen.getByTestId('loom-lite-loci')).toHaveTextContent('Live Wire');
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onRecode).toHaveBeenCalledWith(0, 0);
  });

  it('preserves board visibility with a portrait-bottom / landscape-side, internally scrolling instrument', () => {
    const longNameModel = model();
    longNameModel.candidates[0] = {
      ...longNameModel.candidates[0],
      name: 'Compound Interest',
    };
    render(
      <GeneChoiceOverlay
        {...baseProps}
        presentation={longNameModel}
        onChoose={jest.fn()}
        onDecline={jest.fn()}
      />
    );
    const rail = screen.getByTestId('loom-choice-rail');
    expect(rail).toHaveAttribute('data-responsive-composition', 'portrait-bottom landscape-side');
    expect(screen.getByTestId('loom-scroll-region')).toHaveClass('[touch-action:pan-y]');
    const thread = screen.getByTestId('gene-option-0');
    expect(thread).toHaveAccessibleName(/Compound Interest/i);
    expect(within(thread).getByText('Compound Interest')).not.toHaveClass('truncate');
    expect(screen.getByTestId('loom-focused-gene-name')).toHaveTextContent('Compound Interest');
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
    expect(screen.getByTestId('loom-lite-splices')).toHaveTextContent('Uncatalogued Splice');
    fireEvent.focus(screen.getByTestId('gene-decline'));
    expect(screen.getByTestId('loom-lite')).toHaveTextContent('forced to FERAL');
  });
});
