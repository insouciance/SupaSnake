import { fireEvent, render, screen } from '@testing-library/react';
import { HomeCommandRail } from './HomeCommandRail';
import { NOTIFICATION_TARGETS, useNotificationStore } from '@/lib/stores/notificationStore';

describe('HomeCommandRail', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  });

  it('renders four equal icon-only actions with accessible names', () => {
    render(
      <HomeCommandRail
        onPlay={jest.fn()}
        playDisabled={false}
        playLabel="Play"
        playPhase="idle"
      />
    );

    const commands = ['Play', 'Lab', 'Compete', 'You'];
    const sizes = new Set<string>();
    for (const name of commands) {
      const target = screen.getByRole(name === 'Play' ? 'button' : 'link', { name });
      // The premise is EQUAL and TOUCH-SIZED, not one particular size class.
      // INK & AMBER took the chip 56px -> 64px so four 2.5px keylines read as
      // four chips rather than one bar; pinning `h-14` pinned the old room's
      // number, not the contract. The contract is restated here: every command
      // is the same size, and none is under the 44px touch floor.
      expect(target).toHaveClass('min-h-[44px]', 'min-w-[44px]');
      const size = Array.from(target.classList)
        .filter((name) => /^[hw]-\d+$/.test(name))
        .sort()
        .join(' ');
      expect(size).not.toBe('');
      sizes.add(size);
      expect(target.querySelector('.sr-only')).toHaveTextContent(name);
    }
    expect(sizes.size).toBe(1);
    expect(screen.getByTestId('home-command-rail')).toHaveClass('grid-cols-4');
  });

  it('keeps Play on the existing launch callback and routes the other pillars', () => {
    const onPlay = jest.fn();
    render(
      <HomeCommandRail
        onPlay={onPlay}
        playDisabled={false}
        playLabel="Play"
        playPhase="idle"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab');
    expect(screen.getByRole('link', { name: 'Compete' })).toHaveAttribute(
      'href',
      '/leaderboard'
    );
    expect(screen.getByRole('link', { name: 'You' })).toHaveAttribute('href', '/profile');
  });

  it('reports hover, keyboard focus, and press reactions without persistence', () => {
    const onReactionChange = jest.fn();
    const storageSpy = jest.spyOn(Storage.prototype, 'setItem');
    render(
      <HomeCommandRail
        onPlay={jest.fn()}
        playDisabled={false}
        playLabel="Play"
        playPhase="idle"
        onReactionChange={onReactionChange}
      />
    );

    const compete = screen.getByRole('link', { name: 'Compete' });
    fireEvent.mouseEnter(compete);
    expect(onReactionChange).toHaveBeenLastCalledWith('compete');
    fireEvent.focus(compete);
    fireEvent.pointerDown(compete);
    expect(onReactionChange).toHaveBeenLastCalledWith('compete');
    fireEvent.pointerUp(compete);
    fireEvent.blur(compete);
    fireEvent.mouseLeave(compete);
    expect(onReactionChange).toHaveBeenLastCalledWith(null);
    expect(storageSpy).not.toHaveBeenCalled();
    storageSpy.mockRestore();
  });

  it('keeps exact recognition links and attention badges on the compact rail', () => {
    useNotificationStore.getState().replaceServerItems([{
      id: 'mastery-moment',
      kind: 'recognition',
      status: 'unseen',
      destination: 'mastery',
      headline: 'PRIMAL Mastery M4',
      momentId: 'moment-1',
      artifactRef: 'PRIMAL',
      source: { type: 'run', id: 'session-1' },
      createdAt: '2026-07-31T12:00:00.000Z',
    }]);
    useNotificationStore.getState().publish({
      id: 'lab-ready',
      title: 'Lab ready',
      description: 'Evolution available',
      ...NOTIFICATION_TARGETS.lab,
      badgeKind: 'exclamation',
      attentionReason: 'action-required',
    });

    render(
      <HomeCommandRail
        onPlay={jest.fn()}
        playDisabled={false}
        playLabel="Play"
        playPhase="idle"
      />
    );

    expect(screen.getByRole('link', { name: 'You' })).toHaveAttribute(
      'href',
      '/profile#mastery-PRIMAL'
    );
    expect(screen.getByRole('status', { name: 'New Lab activity' })).toBeInTheDocument();
  });
});
