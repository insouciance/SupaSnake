import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SANDBOX_PATH } from './PathComposer';
import { TrainingHub } from './TrainingHub';

const SANDBOX = {
  dynasty: 'PRIMAL' as const,
  tickMs: 175,
  startLength: 3,
  path: DEFAULT_SANDBOX_PATH,
};

describe('TrainingHub', () => {
  it('shows mastery-oriented drills, profile evidence and rewardless framing', () => {
    render(
      <TrainingHub
        profile={{
          live: true,
          bests: [{
            exercise: 'trace', difficulty: 'foundation', version: 1, completed: true, rating: 88, medal: 'gold',
            accuracy: 96, efficiency: 82, consistency: 80, ticks: 40,
            seed: 'best', trace: [], updatedAt: '2026-07-24T00:00:00.000Z',
          }],
          recent: [{
            exercise: 'trace', difficulty: 'foundation', rating: 80,
            completed: true, createdAt: '2026-07-24T00:00:00.000Z',
          }],
        }}
        profileLoading={false}
        difficulty="foundation"
        guidance="full"
        sandbox={SANDBOX}
        presets={[]}
        presetsLive={false}
        onDifficulty={jest.fn()}
        onGuidance={jest.fn()}
        onSandbox={jest.fn()}
        onStartExercise={jest.fn()}
        onStartCircuit={jest.fn()}
        onStartSandbox={jest.fn()}
        onSavePreset={jest.fn()}
        onLoadPreset={jest.fn()}
        onDeletePreset={jest.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Training Lab' })).toBeInTheDocument();
    expect(screen.getByText(/never spend Energy or grant DNA/i)).toBeInTheDocument();
    expect(screen.getByTestId('training-card-trace')).toHaveTextContent('88 · gold');
    expect(screen.getByRole('img', { name: /custom training path/i })).toBeInTheDocument();
  });

  it('keeps drill, Circuit and Sandbox starts player-controlled', () => {
    const onStartExercise = jest.fn();
    const onStartCircuit = jest.fn();
    const onStartSandbox = jest.fn();
    render(
      <TrainingHub
        profile={{ live: false, bests: [], recent: [] }}
        profileLoading={false}
        difficulty="advanced"
        guidance="next"
        sandbox={SANDBOX}
        presets={[]}
        presetsLive={false}
        onDifficulty={jest.fn()}
        onGuidance={jest.fn()}
        onSandbox={jest.fn()}
        onStartExercise={onStartExercise}
        onStartCircuit={onStartCircuit}
        onStartSandbox={onStartSandbox}
        onSavePreset={jest.fn()}
        onLoadPreset={jest.fn()}
        onDeletePreset={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('start-tempo'));
    fireEvent.click(screen.getByTestId('start-circuit'));
    fireEvent.click(screen.getByTestId('start-sandbox'));
    expect(onStartExercise).toHaveBeenCalledWith('tempo');
    expect(onStartCircuit).toHaveBeenCalledTimes(1);
    expect(onStartSandbox).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('training-profile-offline')).toHaveTextContent(/migration/i);
  });

  it('explains how PB guidance degrades before a matching best exists', () => {
    render(
      <TrainingHub
        profile={{ live: false, bests: [], recent: [] }}
        profileLoading={false}
        difficulty="foundation"
        guidance="ghost"
        sandbox={SANDBOX}
        presets={[]}
        presetsLive={false}
        onDifficulty={jest.fn()}
        onGuidance={jest.fn()}
        onSandbox={jest.fn()}
        onStartExercise={jest.fn()}
        onStartCircuit={jest.fn()}
        onStartSandbox={jest.fn()}
        onSavePreset={jest.fn()}
        onLoadPreset={jest.fn()}
        onDeletePreset={jest.fn()}
      />
    );
    expect(screen.getByText(/new drills show the next six cells/i)).toBeInTheDocument();
  });
});
