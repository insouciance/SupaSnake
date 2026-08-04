import { render, screen } from '@testing-library/react';
import {
  AscendanceProgressionInstrument,
  projectAscendanceProgression,
} from './AscendanceProgressionInstrument';

const format = (value: number) => value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');

describe('AscendanceProgressionInstrument', () => {
  it('shows the exact current and next v2 multiplier, constant relative step, and five-generation prestige beat', () => {
    const model = projectAscendanceProgression({
      generation: 10,
      curveVersion: 2,
      multiplierForGeneration: (generation) => Math.pow(1.02, Math.max(0, generation - 3)),
      formatMultiplier: format,
    });
    render(<AscendanceProgressionInstrument model={model} />);
    expect(screen.getByTestId('ascendance-progression')).toHaveTextContent('Gen 10 · Yield ×1.1487');
    expect(screen.getByTestId('ascendance-v2-next')).toHaveTextContent('Gen 11 · ×1.1717');
    expect(screen.getByTestId('ascendance-v2-next')).toHaveTextContent('+2.00% relative · every generation');
    expect(screen.getByTestId('ascendance-v2-next')).toHaveTextContent('Gen 15 · ×1.2682');
    expect(screen.getByTestId('ascendance-milestone-track')).toHaveTextContent('no design cap');
  });

  it('labels a legacy in-flight result honestly and does not advertise the v2 future as its payout', () => {
    render(
      <AscendanceProgressionInstrument
        model={{
          generation: 20,
          curveVersion: 1,
          currentMultiplier: '1.2069',
          nextGeneration: 21,
          nextMultiplier: '1.2131',
          relativeStepPercent: '0.51',
          nextMilestoneGeneration: 25,
          milestoneMultiplier: '1.2380',
          generationsUntilMilestone: 5,
        }}
      />
    );
    expect(screen.getByTestId('ascendance-v1-legacy')).toHaveTextContent('retained its v1 Legacy stamp');
    expect(screen.queryByText(/every generation/)).toBeNull();
  });

  it('explains the neutral opening generations instead of presenting them as a broken upgrade', () => {
    render(
      <AscendanceProgressionInstrument
        model={{
          generation: 2,
          curveVersion: 2,
          currentMultiplier: '1.00',
          nextGeneration: 3,
          nextMultiplier: '1.00',
          relativeStepPercent: '0.00',
          nextMilestoneGeneration: 5,
          milestoneMultiplier: '1.0404',
          generationsUntilMilestone: 3,
        }}
      />
    );
    expect(screen.getByTestId('ascendance-begins')).toHaveTextContent('Legacy begins at Gen4');
    expect(screen.getByTestId('ascendance-progression')).not.toHaveTextContent('curve v2');
  });
});
