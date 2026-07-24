import { fireEvent, render, screen } from '@testing-library/react';
import type { TrainingAttemptResult } from '@/shared/game/training';
import { TrainingRecap } from './TrainingRecap';

const RESULT: TrainingAttemptResult = {
  scenario: { version: 1, exercise: 'trace', difficulty: 'foundation', seed: 'recap' },
  exercise: 'trace',
  difficulty: 'foundation',
  kind: 'drill',
  metrics: {
    completed: true, rating: 91, medal: 'gold', accuracy: 96, efficiency: 88,
    consistency: 85, ticks: 30, durationMs: 3000, progress: 5, progressTotal: 5,
    rejectedInputs: 1, unnecessaryInputs: 0, meanTimingError: 0.5,
    splits: [{ checkpoint: 5, expectedTick: 5, actualTick: 6, deltaTicks: 1 }],
    diagnosis: 'Move the second corner one tick earlier.',
  },
  inputs: [{ tick: 0, direction: 'RIGHT' }],
  trace: [{ tick: 0, x: 10, z: 10 }],
};

describe('TrainingRecap', () => {
  it('prioritizes interpretable feedback and one-action retry', () => {
    const onRetry = jest.fn();
    render(
      <TrainingRecap
        result={RESULT}
        best={null}
        verification="verified"
        onRetry={onRetry}
        onExit={jest.fn()}
      />
    );
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText(/second corner one tick earlier/i)).toBeInTheDocument();
    expect(screen.getByText('+1 ticks')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('retry-training'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the four-axis transfer summary after the final Circuit drill', () => {
    const other = (exercise: TrainingAttemptResult['exercise'], rating: number): TrainingAttemptResult => ({
      ...RESULT,
      exercise,
      scenario: { ...RESULT.scenario!, exercise },
      metrics: { ...RESULT.metrics, rating },
    });
    render(
      <TrainingRecap
        result={other('escape', 80)}
        best={null}
        verification="offline"
        circuitResults={[other('trace', 90), other('route', 70), other('tempo', 60)]}
        circuitRemaining={0}
        onRetry={jest.fn()}
        onExit={jest.fn()}
      />
    );
    expect(screen.getByTestId('circuit-summary')).toHaveTextContent('Transfer rating 75');
    expect(screen.queryByTestId('retry-training')).toBeNull();
  });
});
