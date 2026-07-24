import { fireEvent, render, screen } from '@testing-library/react';
import { VirtualDPad } from './VirtualDPad';

jest.mock('@/lib/effects/Haptics', () => ({
  haptics: { light: jest.fn() },
}));

describe('VirtualDPad', () => {
  it('sends a deliberate direction on pointer-compatible mouse input', () => {
    const onDirectionChange = jest.fn();
    render(<VirtualDPad onDirectionChange={onDirectionChange} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: /move up/i }));

    expect(onDirectionChange).toHaveBeenCalledWith('UP');
    expect(onDirectionChange).toHaveBeenCalledTimes(1);
  });

  it('sends touch input and suppresses every direction while disabled', () => {
    const onDirectionChange = jest.fn();
    const { rerender } = render(
      <VirtualDPad onDirectionChange={onDirectionChange} />
    );

    fireEvent.touchStart(screen.getByRole('button', { name: /move left/i }));
    expect(onDirectionChange).toHaveBeenLastCalledWith('LEFT');

    onDirectionChange.mockClear();
    rerender(
      <VirtualDPad onDirectionChange={onDirectionChange} disabled />
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: /move right/i }));
    expect(onDirectionChange).not.toHaveBeenCalled();
  });
});
