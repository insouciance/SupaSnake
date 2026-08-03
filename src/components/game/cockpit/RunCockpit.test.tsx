import { fireEvent, render, screen } from '@testing-library/react';
import type { RunCockpitModel } from './types';
import { RunCockpit } from './RunCockpit';

const MODEL: RunCockpitModel = {
  dynasty: 'PRIMAL',
  state: 'ready',
  mode: 'standard',
  modeLabel: 'PRIMAL',
  modeDetail: 'Board held',
  statusText: 'Swipe or press an arrow to move',
  isFirstMovementPrompt: true,
  score: 12840,
  dna: 186,
  charge: {
    remaining: 4,
    perDay: 6,
    usedToday: 2,
    day: '2026-07-25',
    refillsAt: '2026-07-26T00:00:00.000Z',
  },
  energyCommitment: { committed: 4, multiplierBps: 52_000, state: 'charged' },
  bankDna: 168,
  crashDna: 52,
  constellation: { stars: 3, fraction: 0.55 },
  genes: [{ id: 'gold_trail', name: 'Gold Trail', strains: ['AURUM'] }],
  strains: [
    { id: 'AURUM', name: 'Aurum', color: '#f5c542', points: 3, tier: 2, suppressed: false },
    { id: 'VOLT', name: 'Volt', color: '#42e0f5', points: 2, tier: 1, suppressed: false },
    { id: 'FERAL', name: 'Feral', color: '#5ff542', points: 4, tier: 3, suppressed: false },
    { id: 'FLUX', name: 'Flux', color: '#a642f5', points: 1, tier: 0, suppressed: false },
    { id: 'UMBRA', name: 'Umbra', color: '#f54263', points: 2, tier: 1, suppressed: true },
  ],
  holds: { remaining: 2, total: 4 },
  showGenome: true,
  portalLive: true,
  portalTicksRemaining: 14,
};

describe('RunCockpit', () => {
  it('adapts canonical telemetry without placing text inside the board', () => {
    render(
      <RunCockpit model={MODEL} onPause={jest.fn()} onResetView={jest.fn()}>
        <canvas data-testid="real-board" />
      </RunCockpit>
    );

    expect(
      screen.getByLabelText(/score 12,840, 3 stars left this constellation/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/run dna 186/i)).toBeInTheDocument();
    expect(screen.getByTestId('energy-stake')).toHaveTextContent('4E ×5.2');
    expect(screen.getByLabelText(/4 energy committed, harvest multiplier 5.2/i)).toBeInTheDocument();
    // The hold budget is stated from tick zero, not discovered by running out.
    expect(screen.getByTestId('hold-budget')).toHaveTextContent('2/4');
    expect(screen.getByTestId('hold-budget')).toHaveAttribute('data-spent', 'false');
    expect(screen.getByLabelText('Gold Trail')).toBeInTheDocument();
    expect(screen.getByLabelText(
      /Umbra 2 of 4, tier 1, Dampened: Minor remains available; Expression and Apex capped/i
    )).toBeInTheDocument();
    expect(screen.getByTestId('first-movement-prompt')).toHaveTextContent(
      'Swipe or press an arrow to move'
    );

    const board = screen.getByTestId('game-board-viewport');
    expect(board).toContainElement(screen.getByTestId('real-board'));
    expect(board).not.toHaveTextContent(/score|dna|gold trail|swipe/i);
  });

  it('keeps free-play identity machine-readable and visible', () => {
    render(
      <RunCockpit
        model={{ ...MODEL, mode: 'free', modeLabel: 'Free play' }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );

    expect(screen.getByTestId('free-play-watermark')).toHaveAccessibleName(
      /free play, primal dynasty/i
    );
  });

  it('renders the complete 2/3/4 Genome v2 ladder without changing legacy width', () => {
    const { rerender } = render(
      <RunCockpit
        model={{
          ...MODEL,
          strainPointCap: 4,
          strains: MODEL.strains.map((strain) =>
            strain.id === 'AURUM' ? { ...strain, points: 4 } : strain
          ),
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText(/Aurum 4 of 4, tier 2/i)).toBeInTheDocument();
    expect(screen.getByTestId('strain-meter-AURUM').querySelectorAll('i')).toHaveLength(4);

    rerender(
      <RunCockpit model={MODEL} onPause={jest.fn()} onResetView={jest.fn()}>
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText(/Aurum 3 of 4, tier 2/i)).toBeInTheDocument();
    expect(screen.getByTestId('strain-meter-AURUM').querySelectorAll('i')).toHaveLength(4);
  });

  it('renders each run-frozen shifted Apex target without clamping its truth', () => {
    const { rerender } = render(
      <RunCockpit
        model={{
          ...MODEL,
          strains: MODEL.strains.map((strain) =>
            strain.id === 'AURUM'
              ? { ...strain, points: 3, tier: 3, apexTarget: 3 }
              : strain
          ),
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText(/Aurum 3 of 3, tier 3/i)).toBeInTheDocument();
    expect(screen.getByTestId('strain-meter-AURUM').querySelectorAll('i')).toHaveLength(3);

    rerender(
      <RunCockpit
        model={{
          ...MODEL,
          strains: MODEL.strains.map((strain) =>
            strain.id === 'AURUM'
              ? { ...strain, points: 4, tier: 2, apexTarget: 5 }
              : strain
          ),
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText(/Aurum 4 of 5, tier 2/i)).toBeInTheDocument();
    expect(screen.getByTestId('strain-meter-AURUM').querySelectorAll('i')).toHaveLength(5);

    rerender(
      <RunCockpit
        model={{
          ...MODEL,
          strains: MODEL.strains.map((strain) =>
            strain.id === 'AURUM'
              ? { ...strain, points: 5, tier: 3, apexTarget: 5 }
              : strain
          ),
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText(/Aurum 5 of 5, tier 3/i)).toBeInTheDocument();
  });

  it('shows exact Genome v2 Yield labels without pretending they are final DNA', () => {
    render(
      <RunCockpit
        model={{
          ...MODEL,
          bankOutcomeLabel: '42.75Y',
          crashOutcomeLabel: '8.5Y',
          outcomeUnitLabel: 'Genome Yield before stamped outer multipliers',
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByLabelText('Bank value 42.75Y')).toHaveAttribute(
      'title',
      'Genome Yield before stamped outer multipliers'
    );
    expect(screen.getByLabelText('Crash salvage 8.5Y')).toBeInTheDocument();
  });

  it('adapts training progress without exposing economy instruments', () => {
    render(
      <RunCockpit
        model={{
          ...MODEL,
          mode: 'training',
          modeLabel: 'Training · Trace',
          showGenome: true,
          energyCommitment: null,
          training: {
            primaryLabel: 'Gates',
            primaryValue: '3/6',
            secondaryLabel: 'Tick',
            secondaryValue: '18/40',
            progressLabel: 'Path accuracy',
            progress: 3,
            progressTotal: 6,
            metrics: [
              { label: 'Pace', value: '90ms' },
              { label: 'Guide', value: 'next' },
              { label: 'Level', value: 'elite' },
            ],
            comparison: 'PB 88',
          },
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
      >
        <canvas data-testid="training-board" />
      </RunCockpit>
    );
    expect(screen.getByTestId('training-watermark')).toHaveAccessibleName(/training.*trace/i);
    expect(screen.getByLabelText('Gates 3/6')).toBeInTheDocument();
    expect(screen.getByLabelText('Tick 18/40')).toBeInTheDocument();
    expect(screen.getByLabelText('PB 88')).toBeInTheDocument();
    expect(screen.queryByLabelText(/run dna 186/i)).toBeNull();
    expect(screen.getByTestId('game-board-viewport')).toContainElement(
      screen.getByTestId('training-board')
    );
  });

  it('keeps controls actionable above flick input and reserves decisions', () => {
    const onPause = jest.fn();
    const onResetView = jest.fn();
    render(
      <RunCockpit
        model={{ ...MODEL, state: 'active', isFirstMovementPrompt: false }}
        onPause={onPause}
        onResetView={onResetView}
        decisionDock={<div role="dialog" aria-label="Decision">Choose</div>}
      >
        <canvas />
      </RunCockpit>
    );

    const root = screen.getByTestId('game-hud');
    expect(root).toHaveAttribute('data-input', 'flick');
    expect(root).toHaveAttribute('data-decision', 'true');
    expect(screen.getByTestId('cockpit-decision-dock')).toContainElement(
      screen.getByRole('dialog', { name: 'Decision' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset arena view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause run' }));
    expect(onResetView).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('makes REDLINE an explicit player action and shows its bounded active window', () => {
    const onOverclock = jest.fn();
    const { rerender } = render(
      <RunCockpit
        model={{
          ...MODEL,
          state: 'active',
          overclock: {
            active: null,
            available: [{
              source: 'zenith_protocol',
              label: 'REDLINE',
              multiplierBps: 17_500,
              moveBudget: 14,
            }],
          },
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
        onOverclock={onOverclock}
      >
        <canvas />
      </RunCockpit>
    );
    fireEvent.click(screen.getByRole('button', {
      name: 'Activate REDLINE, speed 1.75 times for 14 moves',
    }));
    expect(onOverclock).toHaveBeenCalledWith('zenith_protocol');

    rerender(
      <RunCockpit
        model={{
          ...MODEL,
          state: 'active',
          overclock: {
            active: {
              source: 'zenith_protocol',
              label: 'REDLINE',
              multiplierBps: 17_500,
              remainingMoves: 9,
            },
            available: [],
          },
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
        onOverclock={onOverclock}
      >
        <canvas />
      </RunCockpit>
    );
    expect(screen.getByRole('status', { name: /redline active at 1.75 times speed for 9 more moves/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate redline/i })).toBeNull();
  });

  it('removes dual overclock controls from the shared rail while a run is held', () => {
    render(
      <RunCockpit
        model={{
          ...MODEL,
          state: 'held',
          statusText: 'Tactical hold · move to resume',
          overclock: {
            active: null,
            available: [
              {
                source: 'zenith_protocol',
                label: 'REDLINE',
                multiplierBps: 17_500,
                moveBudget: 14,
              },
              {
                source: 'volt_apex',
                label: 'OVERCLOCK',
                multiplierBps: 18_000,
                moveBudget: 12,
              },
            ],
          },
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
        onOverclock={jest.fn()}
        eventCallout={<span data-testid="held-event-callout">Move to resume</span>}
      >
        <canvas />
      </RunCockpit>
    );

    expect(screen.getByTestId('held-event-callout')).toBeVisible();
    expect(screen.queryByRole('button', { name: /activate redline/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /activate overclock/i })).toBeNull();
  });

  it('keeps tactical-hold guidance off-board and exposes an abandon action', () => {
    const onAbandon = jest.fn();
    render(
      <RunCockpit
        model={{
          ...MODEL,
          state: 'held',
          statusText: 'Tactical hold · press a safe direction to resume',
          isFirstMovementPrompt: false,
        }}
        onPause={jest.fn()}
        onAbandon={onAbandon}
        onResetView={jest.fn()}
        showPause={false}
        showAbandon
      >
        <canvas data-testid="held-board" />
      </RunCockpit>
    );

    const resumeGate = screen.getByTestId('resume-gate');
    expect(resumeGate).toHaveTextContent(
      'Tactical hold · press a safe direction to resume'
    );
    expect(screen.queryByRole('button', { name: 'Pause run' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abandon run' }));
    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('game-board-viewport')).toContainElement(
      screen.getByTestId('held-board')
    );
    expect(screen.getByTestId('game-board-viewport')).not.toContainElement(
      resumeGate
    );
  });

  it('puts transient rate feedback in the fixed rail outside the arena', () => {
    render(
      <RunCockpit
        model={{
          ...MODEL,
          state: 'active',
          statusText: 'Run stable',
          isFirstMovementPrompt: false,
        }}
        onPause={jest.fn()}
        onResetView={jest.fn()}
        rateCallout={<span data-testid="run-rate-callout">Growth rate +3</span>}
      >
        <canvas data-testid="rate-board" />
      </RunCockpit>
    );

    const board = screen.getByTestId('game-board-viewport');
    expect(board).toContainElement(screen.getByTestId('rate-board'));
    expect(board).not.toContainElement(screen.getByTestId('run-rate-callout'));
    expect(screen.getByTestId('run-rate-rail')).toContainElement(
      screen.getByTestId('run-rate-callout')
    );
  });

  it('keeps growth out of the persistent HUD', () => {
    render(
      <RunCockpit model={MODEL} onPause={jest.fn()} onResetView={jest.fn()}>
        <canvas />
      </RunCockpit>
    );
    expect(screen.queryByTestId('growth-readout')).toBeNull();
    expect(screen.getByTestId('energy-stake')).toHaveTextContent('4E ×5.2');
    expect(screen.getByTestId('hold-budget')).toBeInTheDocument();
  });
});
