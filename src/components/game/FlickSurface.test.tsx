import { fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { FlickSurface } from './FlickSurface';
import type {
  SetDirectionResult,
  SnakeGameLogic,
} from '@/lib/game/SnakeGameLogic';

jest.mock('@/lib/effects/Haptics', () => ({
  haptics: { light: jest.fn() },
}));

jest.mock('@/lib/audio/AudioManager', () => ({
  audioManager: { play: jest.fn() },
}));

function flickRight(surface: HTMLElement, pointerId = 1): void {
  // jsdom has no native PointerEvent. A pointer-typed MouseEvent preserves
  // the coordinates React forwards to its pointer handlers; pointerId is
  // attached explicitly so the component's single-touch guard is exercised.
  const pointerEvent = (type: string, clientX: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX,
      clientY: 120,
    });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    return event;
  };
  fireEvent(surface, pointerEvent('pointerdown', 40));
  fireEvent(surface, pointerEvent('pointermove', 80));
  fireEvent(surface, pointerEvent('pointerup', 80));
}

function renderReadySurface(result: SetDirectionResult) {
  const onReadyDirection = jest.fn(() => result);
  const onAim = jest.fn();
  const gameRef = {
    current: {} as SnakeGameLogic,
  } as RefObject<SnakeGameLogic>;

  render(
    <FlickSurface
      gameRef={gameRef}
      getAzimuth={() => 0}
      isReady
      onReadyDirection={onReadyDirection}
      onAim={onAim}
    />
  );

  return { onReadyDirection, onAim };
}

describe('FlickSurface ready/resume gate', () => {
  it('delegates the threshold-crossing direction atomically to the gate owner', () => {
    const { onReadyDirection, onAim } = renderReadySurface('accepted');

    flickRight(screen.getByTestId('flick-surface'));

    expect(onReadyDirection).toHaveBeenCalledWith('RIGHT');
    expect(onReadyDirection).toHaveBeenCalledTimes(1);
    expect(onAim).toHaveBeenCalledTimes(1);
  });

  it('does not sync aim when the gate rejects an unsafe reversal', () => {
    const { onReadyDirection, onAim } = renderReadySurface('reversal');

    flickRight(screen.getByTestId('flick-surface'));

    expect(onReadyDirection).toHaveBeenCalledWith('RIGHT');
    expect(onAim).not.toHaveBeenCalled();
  });
});
