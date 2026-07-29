import { act, render, screen } from '@testing-library/react';
import { RunRateCallout, speedMultiplierBand } from './RunRateCallout';

describe('RunRateCallout', () => {
  afterEach(() => jest.useRealTimers());

  it('announces growth and CYBER speed as one transparent board event', () => {
    render(
      <RunRateCallout
        growthRate={1}
        speedMultiplier={1.4}
        onDone={jest.fn()}
      />
    );
    const callout = screen.getByTestId('run-rate-callout');
    expect(callout).toHaveAccessibleName(
      'Growth rate plus 1. Speed times 1.4'
    );
    expect(callout).toHaveTextContent('Growth rate +1');
    expect(callout).toHaveTextContent('Speed ×1.4');
  });

  it('dismisses itself without rendering a control', () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    render(<RunRateCallout growthRate={4} onDone={onDone} />);
    expect(screen.queryByRole('button')).toBeNull();
    act(() => jest.advanceTimersByTime(1500));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('quantizes speed to calm 0.2x bands', () => {
    expect(speedMultiplierBand(200, 200)).toBe(1);
    expect(speedMultiplierBand(174, 200)).toBe(1.2);
    expect(speedMultiplierBand(139, 200)).toBe(1.4);
    expect(speedMultiplierBand(100, 200)).toBe(2);
    expect(speedMultiplierBand(0, 200)).toBe(1);
  });
});
