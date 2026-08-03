import { act, fireEvent, render, screen } from '@testing-library/react';
import { PortalChoiceOverlay, StrainSurgeOverlay } from './PortalChoiceOverlay';
import { CHOICE_INPUT_LOCK_MS } from './MutationChoiceOverlay';
import type { TacticalLoomDecisionModel } from './genome/tacticalLoomPresentation';

const CADENCE = { firstExitAtFood: 15, intervalBase: 12, intervalJitter: 4 };

function mutationLoomModel(): TacticalLoomDecisionModel {
  const emptyGenome = Array.from({ length: 6 }, (_, index) => ({
    index,
    kind: 'empty' as const,
    label: 'Open locus',
    strains: [],
  }));
  const consequence = (name: string) => ({
    category: 'Execution',
    effect: `${name} creates a deliberate route test.`,
    cost: 'The portal mutation adds permanent body growth.',
    genomeAfter: emptyGenome,
    strains: [],
    splices: [],
    ledgers: [],
    targets: [],
    body: [{ id: 'growth', label: 'Permanent growth', before: '+0', after: '+3' }],
    outcomes: [],
    dynastyFacts: ['PRIMAL gains more room pressure from the same growth.'],
  });
  return {
    rulesVersion: 2,
    title: 'Mutation Loom',
    sourceLabel: 'Portal mutation · +3 growth',
    dynasty: 'PRIMAL',
    currentGenome: emptyGenome,
    candidates: [
      {
        action: 'THREAD',
        geneId: 'coilkeeper',
        name: 'Coilkeeper',
        category: 'Spatial mastery',
        strains: ['FERAL'],
        consequence: consequence('Coilkeeper'),
      },
      {
        action: 'THREAD',
        geneId: 'wall_rush',
        name: 'Wall Rush',
        category: 'Movement',
        strains: ['FLUX'],
        consequence: consequence('Wall Rush'),
      },
    ],
    decline: {
      action: 'DECLINE',
      name: 'Back to Portal',
      consequence: {
        ...consequence('Decline'),
        category: 'Portal return',
        effect: 'Return without spending the portal mutation.',
      },
    },
  };
}

describe('PortalChoiceOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the payout tradeoff and disables an ineligible infuse', () => {
    render(<PortalChoiceOverlay canInfuse={false} infusesUsed={0} snakeLength={6} bankDna={400} crashDna={180} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Portal Decision' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('portal-bank')).toHaveTextContent('400 DNA');
    expect(screen.getByTestId('portal-infuse')).toBeDisabled();
    expect(screen.getByTestId('portal-infuse')).toHaveTextContent('Needs length 8');
  });

  it('quotes the carry on BOTH branches before the choice', () => {
    // WP-3.10: the decision is now "what is the stake", so the card has to
    // price passing as well as banking. At the first door the carry sits at
    // its origin: bank x1.25 (exactly the pre-carry flat value) and salvage
    // x1, because nothing has been declined yet.
    render(<PortalChoiceOverlay canInfuse infusesUsed={0} snakeLength={12} bankDna={400} crashDna={400} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-bank-carry')).toHaveTextContent('×1.25');
    const pass = screen.getByTestId('portal-pass-carry');
    // Passing raises the bank and lowers the salvage, and the card says so.
    expect(pass).toHaveTextContent('×1.25');
    expect(pass).toHaveTextContent('×1.5625');
    expect(pass).toHaveTextContent('×0.74');
    // The interval is interpolated from the dynasty's cadence, never a
    // literal - the "12±4" that used to be hardcoded here is exactly the
    // class of copy that goes stale silently.
    expect(screen.getByTestId('portal-pass')).toHaveTextContent('12±4 foods');
  });

  it('uses exact v2 outcome labels instead of presenting a client-derived DNA forecast', () => {
    render(
      <PortalChoiceOverlay
        canInfuse
        infusesUsed={0}
        snakeLength={12}
        bankDna={999}
        crashDna={888}
        bankOutcomeLabel="42.75 Yield"
        crashOutcomeLabel="8.5 Yield"
        outcomeUnitLabel="Genome Yield · before run-stamped Ascendance and Energy"
        doorsPassed={0}
        cadence={CADENCE}
        rulesVersion={2}
        onBank={jest.fn()}
        onPass={jest.fn()}
        onInfuse={jest.fn()}
      />
    );
    expect(screen.getByTestId('portal-current-stake')).toHaveTextContent('42.75 Yield');
    expect(screen.getByTestId('portal-current-stake')).toHaveTextContent('8.5 Yield');
    expect(screen.getByTestId('portal-current-stake')).not.toHaveTextContent('999 DNA');
    expect(screen.getByTestId('portal-outcome-unit')).toHaveTextContent('before run-stamped Ascendance and Energy');
  });

  it('names how many doors are already behind the player', () => {
    render(<PortalChoiceOverlay canInfuse infusesUsed={0} snakeLength={12} bankDna={400} crashDna={180} doorsPassed={3} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-bank-carry')).toHaveTextContent('3 continued');
  });

  it('preserves the input lock and resolves PASS explicitly', () => {
    const onPass = jest.fn();
    render(<PortalChoiceOverlay canInfuse infusesUsed={1} snakeLength={12} bankDna={400} crashDna={180} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={onPass} onInfuse={jest.fn()} />);
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('portal-bank')).toHaveFocus();
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it('renders a surge choice at the six-gene cap', () => {
    render(<StrainSurgeOverlay strains={['AURUM', 'UMBRA']} onChoose={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Strain Surge' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('surge-AURUM')).toBeInTheDocument();
    expect(screen.getByTestId('surge-AURUM')).toHaveFocus();
    expect(screen.getByTestId('surge-UMBRA')).toBeInTheDocument();
  });

  it('shows all future v2 choices from run one with server-authored unlock progress', () => {
    render(
      <PortalChoiceOverlay
        canInfuse={false}
        infusesUsed={0}
        snakeLength={12}
        bankDna={400}
        crashDna={180}
        doorsPassed={0}
        cadence={CADENCE}
        rulesVersion={2}
        continueState={{ unlocked: false, reason: 'Complete one validated BANK', progress: '0 / 1' }}
        mutateState={{ unlocked: false, reason: 'Bank 4 runs to unlock Genome mutation', progress: '1 / 4' }}
        mutationTerms={{ mode: 'mutate', growthCost: 3, actionOrdinal: 1, actionLimit: 3, detail: 'Thread one portal gene' }}
        carryProjection={{ bankCurrent: '×1.25', bankNext: '×1.5625', salvageCurrent: '×1', salvageNext: '×0.74' }}
        onBank={jest.fn()}
        onPass={jest.fn()}
        onInfuse={jest.fn()}
      />
    );
    expect(screen.getByTestId('portal-pass')).toHaveTextContent('CONTINUE');
    expect(screen.getByTestId('portal-continue-lock')).toHaveTextContent('Complete one validated BANK · 0 / 1');
    expect(screen.getByTestId('portal-infuse')).toHaveTextContent('MUTATE');
    expect(screen.getByTestId('portal-infuse')).toHaveTextContent('+3 permanent growth');
    expect(screen.getByTestId('portal-mutate-lock')).toHaveTextContent('Bank 4 runs to unlock Genome mutation · 1 / 4');
  });

  it('shows an authoritative Recode cost without claiming that body shrinks', () => {
    render(
      <PortalChoiceOverlay
        canInfuse
        infusesUsed={1}
        snakeLength={30}
        bankDna={900}
        crashDna={210}
        doorsPassed={2}
        cadence={CADENCE}
        rulesVersion={2}
        mutationTerms={{ mode: 'recode', growthCost: 10, actionOrdinal: 3, actionLimit: 3, detail: 'Retains ledgers, liabilities, terrain, Ash and prior growth' }}
        onBank={jest.fn()}
        onPass={jest.fn()}
        onInfuse={jest.fn()}
      />
    );
    const mutate = screen.getByTestId('portal-infuse');
    expect(mutate).toHaveTextContent('+10 permanent growth');
    expect(mutate).toHaveTextContent('Recode one locus');
    expect(mutate).toHaveTextContent('Retains ledgers');
    expect(mutate).not.toHaveTextContent(/remove|shorten|−\d+\s*(tail|segment)/i);
  });

  it('keeps Mirror Wager player-controlled at CONTINUE', () => {
    const onPass = jest.fn();
    render(
      <PortalChoiceOverlay
        canInfuse
        infusesUsed={0}
        snakeLength={20}
        bankDna={900}
        crashDna={210}
        doorsPassed={1}
        cadence={CADENCE}
        rulesVersion={2}
        mirrorChoice={{
          available: true,
          detail: 'Divert 40% of the next leg into visible Stake; BANK doubles it and crash forfeits it.',
        }}
        onBank={jest.fn()}
        onPass={onPass}
        onInfuse={jest.fn()}
      />
    );
    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    expect(screen.getByTestId('portal-mirror-toggle')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('portal-mirror-toggle'));
    expect(screen.getByTestId('portal-mirror-toggle')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('portal-pass'));
    expect(onPass).toHaveBeenCalledWith(true);
  });

  it('preserves frozen-board visibility in portrait and landscape compositions', () => {
    render(<PortalChoiceOverlay canInfuse infusesUsed={0} snakeLength={12} bankDna={400} crashDna={180} doorsPassed={0} cadence={CADENCE} onBank={jest.fn()} onPass={jest.fn()} onInfuse={jest.fn()} />);
    expect(screen.getByTestId('portal-choice-rail')).toHaveAttribute(
      'data-responsive-composition',
      'portrait-bottom landscape-side'
    );
    expect(screen.getByTestId('portal-scroll-region')).toHaveClass('[touch-action:pan-y]');
  });

  it('lets MUTATE inspect both candidates and return without consuming the portal', () => {
    const onBank = jest.fn();
    const onPass = jest.fn();
    const onInfuse = jest.fn();
    const onCommit = jest.fn();
    render(
      <PortalChoiceOverlay
        canInfuse
        infusesUsed={0}
        snakeLength={18}
        bankDna={700}
        crashDna={220}
        doorsPassed={1}
        cadence={CADENCE}
        rulesVersion={2}
        mutationTerms={{ mode: 'mutate', growthCost: 3, actionOrdinal: 1, actionLimit: 3, detail: 'Thread one portal gene' }}
        mutationLoom={{ model: mutationLoomModel(), onCommit }}
        onBank={onBank}
        onPass={onPass}
        onInfuse={onInfuse}
      />
    );
    expect(screen.getByTestId('portal-mutate-preview')).toHaveTextContent('Coilkeeper · Spatial mastery');
    expect(screen.getByTestId('portal-mutate-preview')).toHaveTextContent('Wall Rush · Movement');

    act(() => jest.advanceTimersByTime(CHOICE_INPUT_LOCK_MS));
    fireEvent.click(screen.getByTestId('portal-infuse'));
    expect(screen.getByRole('dialog', { name: 'Mutation Loom' })).toBeInTheDocument();
    expect(onInfuse).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();

    // Portal hotkeys are suspended while its nested Loom owns the decision.
    fireEvent.keyDown(window, { key: '1' });
    expect(onBank).not.toHaveBeenCalled();

    const backToPortal = screen.getByTestId('loom-back-to-portal');
    backToPortal.focus();
    fireEvent.keyDown(backToPortal, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(backToPortal);
    expect(screen.getByRole('dialog', { name: 'Portal Decision' })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('portal-infuse'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Portal Decision' })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('portal-infuse'));
    fireEvent.click(screen.getByTestId('gene-option-1'));
    fireEvent.click(screen.getByTestId('loom-confirm'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1, undefined);
    expect(onInfuse).not.toHaveBeenCalled();
  });
});
