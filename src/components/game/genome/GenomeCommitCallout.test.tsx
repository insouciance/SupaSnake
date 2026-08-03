import { act, render, screen } from '@testing-library/react';
import { GenomeCommitCallout } from './GenomeCommitCallout';

const MODEL = {
  id: 'genome-commit:8',
  title: 'Perfect Circuit',
  rule: 'Successful Live routes arm a linked return leg.',
  geneId: 'circuit_run' as const,
  strains: ['VOLT', 'FLUX'] as const,
  moments: [{
    id: 'rung:VOLT:2',
    label: 'Volt 2 · Telemetry',
    detail: 'Route budgets reveal their exact execution margin.',
    strain: 'VOLT' as const,
    tone: 'positive' as const,
  }],
};

describe('GenomeCommitCallout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cannot intercept steering and waits until the decision hold is released', () => {
    const onDone = jest.fn();
    const { rerender } = render(
      <GenomeCommitCallout model={MODEL} held onDone={onDone} />
    );
    expect(screen.getByTestId('genome-commit-callout')).toHaveClass('pointer-events-none');
    expect(screen.getByRole('status')).toHaveTextContent('Perfect Circuit');
    expect(screen.getByRole('status')).toHaveTextContent('VOLT');
    expect(screen.getByRole('status')).toHaveTextContent('FLUX');
    expect(screen.getByRole('status')).toHaveTextContent('Volt 2 · Telemetry');
    expect(screen.getByTestId('tactical-hold')).toHaveTextContent(
      'Move to resume'
    );
    act(() => jest.advanceTimersByTime(5000));
    expect(onDone).not.toHaveBeenCalled();

    rerender(<GenomeCommitCallout model={MODEL} held={false} onDone={onDone} />);
    expect(screen.queryByTestId('tactical-hold')).not.toBeInTheDocument();
    expect(screen.getByTestId('genome-commit-outcome')).toHaveTextContent(
      'Volt 2 · Telemetry'
    );
    act(() => jest.advanceTimersByTime(3000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
