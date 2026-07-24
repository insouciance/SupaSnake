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
  energy: 4,
  maxEnergy: 5,
  bankDna: 168,
  crashDna: 52,
  comboMultiplier: 1.8,
  chainLength: 4,
  genes: [{ id: 'gold_trail', name: 'Gold Trail', strains: ['AURUM'] }],
  strains: [
    { id: 'AURUM', name: 'Aurum', color: '#f5c542', points: 3, tier: 2, suppressed: false },
    { id: 'VOLT', name: 'Volt', color: '#42e0f5', points: 2, tier: 1, suppressed: false },
    { id: 'FERAL', name: 'Feral', color: '#5ff542', points: 4, tier: 3, suppressed: false },
    { id: 'FLUX', name: 'Flux', color: '#a642f5', points: 1, tier: 0, suppressed: false },
    { id: 'UMBRA', name: 'Umbra', color: '#f54263', points: 2, tier: 1, suppressed: true },
  ],
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

    expect(screen.getByLabelText(/score 12,840, combo 1.8/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/run dna 186/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/energy 4 of 5/i)).toHaveTextContent('4/5');
    expect(screen.getByLabelText('Gold Trail')).toBeInTheDocument();
    expect(screen.getByLabelText(/Umbra 2 of 4, tier 1, suppressed/i)).toBeInTheDocument();
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

  it('adapts training progress without exposing economy instruments', () => {
    render(
      <RunCockpit
        model={{
          ...MODEL,
          mode: 'training',
          modeLabel: 'Training · Trace',
          showGenome: true,
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
        inputDock={<button type="button">Move Up</button>}
        decisionDock={<div role="dialog" aria-label="Decision">Choose</div>}
      >
        <canvas />
      </RunCockpit>
    );

    const root = screen.getByTestId('game-hud');
    expect(root).toHaveAttribute('data-input', 'dpad');
    expect(root).toHaveAttribute('data-decision', 'true');
    expect(screen.getByTestId('cockpit-decision-dock')).toContainElement(
      screen.getByRole('dialog', { name: 'Decision' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset arena view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause run' }));
    expect(onResetView).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('turns a tactical hold into board-visible resume guidance plus an abandon action', () => {
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

    expect(screen.getByTestId('tactical-hold')).toHaveTextContent(
      'Tactical holdMove to resume'
    );
    expect(screen.getByTestId('tactical-hold')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Pause run' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abandon run' }));
    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('game-board-viewport')).toContainElement(
      screen.getByTestId('held-board')
    );
  });
});
