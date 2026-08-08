import { fireEvent, render, screen } from '@testing-library/react';
import { HomeCommandRail } from './HomeCommandRail';
import { NOTIFICATION_TARGETS, useNotificationStore } from '@/lib/stores/notificationStore';
import { SNAKE_STYLE_PROFILE } from '@/components/game/screen/snake90s';

describe('HomeCommandRail', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: {}, hasHydrated: true });
  });

  it('renders the row as the creature: a head, three body cubes, all touch-sized', () => {
    render(
      <HomeCommandRail
        onPlay={jest.fn()}
        playDisabled={false}
        playLabel="Play"
        playPhase="idle"
      />
    );

    // THE CONTRACT MOVED, AND THIS RECORDS WHAT IT MOVED TO. It used to be
    // "every command is the same size", which was right while the four were
    // interchangeable chips. They are now segments of the snake, and the
    // creature separates its head from its body BY SIZE — so the premise is
    // that the three destinations are equal to each other, that PLAY leads them
    // by exactly the profile's own head-to-body ratio, and that nothing falls
    // under the 44px touch floor.
    const bodies = ['Lab', 'Compete', 'You'].map((name) =>
      screen.getByRole('link', { name })
    );
    for (const [i, target] of bodies.entries()) {
      expect(target).toHaveClass('snake-cube', 'min-h-[44px]', 'min-w-[44px]');
      expect(target).toHaveClass('h-[62px]', 'w-[62px]');
      expect(target.querySelector('.sr-only')).toHaveTextContent(
        ['Lab', 'Compete', 'You'][i]
      );
    }

    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveClass('snake-cube', 'min-h-[44px]', 'min-w-[44px]');
    const headPx = Math.round(
      62 * (SNAKE_STYLE_PROFILE.headSize / SNAKE_STYLE_PROFILE.bodySize)
    );
    expect(play).toHaveStyle({ width: `${headPx}px`, height: `${headPx}px` });
    expect(headPx).toBeGreaterThan(62);
    expect(play.querySelector('.sr-only')).toHaveTextContent('Play');

    // ONE GUTTER, EVERYWHERE. The rail was four equal grid tracks, and a
    // fixed-width cube centred in a wider track put its leftover slack into the
    // gutter — 17px between the body cubes against 12px beside the larger head.
    // A flex row of intrinsically-sized cubes has no slack to distribute, so
    // `gap` IS the gutter at every position. `shrink-0` is load-bearing: a
    // shrunk cube would put slack back.
    const rail = screen.getByTestId('home-command-rail');
    expect(rail).toHaveClass('flex', 'justify-center');
    expect(rail).not.toHaveClass('grid-cols-4');
    // 12px is the gutter the owner ruled good; below 336px the head plus three
    // bodies (264px under the shipped guide) plus three 12px gutters will not
    // fit inside the dock, so the row takes an equal 8px there instead.
    expect(rail).toHaveClass('gap-2', 'min-[336px]:gap-3');
    for (const target of [...bodies, play]) {
      expect(target).toHaveClass('shrink-0');
      expect(target).not.toHaveClass('mx-auto');
    }
  });

  it('paints the glyph into the face plane and leaves the badge square to the screen', () => {
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

    const lab = screen.getByRole('link', { name: 'Lab' });
    const glyph = lab.querySelector('.snake-cube__glyph') as HTMLElement;
    // The mark is paint ON the leaning face, not a sticker in front of it. The
    // matrix is the projection of the face's own axes — `snakeCubeArt` derives
    // it and `snakeCubeArt.test.ts` proves it maps the face corners.
    expect(glyph.style.transform).toMatch(/^matrix\(/);
    expect(glyph.querySelector('svg')).not.toBeNull();
    // A status dot that leans looks broken, so the badge is a sibling of the
    // drawing on the pressable rather than a child of the projected slot.
    const badge = screen.getByRole('status', { name: 'New Lab activity' });
    expect(glyph.contains(badge)).toBe(false);
    expect(lab.contains(badge)).toBe(true);
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
