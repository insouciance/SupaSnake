/**
 * Run Setup — THREE ELEMENTS (owner ruling, 2026-08-07).
 *
 *   "Dynasty Favorites, Energy Reactor (zero is free play), and the Play
 *    button. Everything else is noise."
 *
 * These assertions hold that shape from both sides: the three elements are
 * present and in order, and the surfaces the ruling removed stay removed. The
 * second half matters more than it looks — every one of those surfaces was
 * added by a work package that had a good reason at the time, so the pressure
 * to put one back is real and recurring, and a test is the only thing that
 * makes the ruling survive it.
 *
 * §5's older line still governs and is unchanged by the cut: "START is the
 * only emphasized action, zero required configuration."
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { RunSetupPanel, type RunSetupPanelProps } from './RunSetupPanel';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function props(overrides: Partial<RunSetupPanelProps> = {}): RunSetupPanelProps {
  return {
    snake: { id: 'cyber-active', name: 'Ouro', generation: 1, dynasty: 'CYBER' },
    noSnakeAvailable: false,
    rulesetExplainer: 'CYBER accelerates as you eat.',
    startLabel: 'Play',
    startTestId: 'earn-start',
    isStarting: false,
    onStart: jest.fn(),
    onChooseSnake: jest.fn(),
    startError: null,
    energySelector: <div data-testid="energy-reactor" />,
    ...overrides,
  };
}

describe('RunSetupPanel — the three elements', () => {
  it('renders exactly the three elements, in order', () => {
    render(<RunSetupPanel {...props()} />);

    const favorites = screen.getByTestId('run-setup-favorites');
    const reactor = screen.getByTestId('energy-reactor');
    const play = screen.getByTestId('earn-start');

    expect(favorites).toBeInTheDocument();
    expect(reactor).toBeInTheDocument();
    expect(play).toBeInTheDocument();

    // (a) who is flying → (b) how much it costs → (c) go.
    expect(
      favorites.compareDocumentPosition(reactor) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      reactor.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('is one consolidated surface with one primary action', () => {
    const { container } = render(<RunSetupPanel {...props()} />);
    expect(screen.getByTestId('run-setup')).toBeInTheDocument();
    // Emphasis in this design system is the `btn-go` treatment. Exactly one.
    expect(container.querySelectorAll('.btn-go')).toHaveLength(1);
    expect(screen.getByTestId('earn-start')).toHaveClass('btn-go');
  });

  /**
   * THE REMOVED SURFACES STAY REMOVED.
   *
   * Each of these was a real element with a real work package behind it. The
   * ruling moved the aim picker to the Lab and the anomaly entry to Home, and
   * deleted the difficulty ladder, the mode toggle (free play is the reactor
   * at zero), the mission readouts, the mastery chip, the portal rail, the
   * run summary and the "Tune run" disclosure that hid four of them.
   */
  it('carries none of the surfaces the ruling removed', () => {
    render(<RunSetupPanel {...props()} />);
    for (const testId of [
      'run-setup-adjust',
      'run-setup-mode-control',
      'run-setup-summary',
      'setup-portal-rail',
      'ladder-selector',
      'ladder-readout',
      'mastery-chip',
    ]) {
      expect(screen.queryByTestId(testId)).toBeNull();
    }
  });

  it('presets the whole run: nothing is required before PLAY', () => {
    render(<RunSetupPanel {...props()} />);
    expect(screen.getByTestId('earn-start')).toBeEnabled();
    expect(screen.getByTestId('earn-start')).toHaveTextContent('Play');
  });

  it('starts through its callback', () => {
    const onStart = jest.fn();
    render(<RunSetupPanel {...props({ onStart })} />);
    fireEvent.click(screen.getByTestId('earn-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('RunSetupPanel — element (a), Dynasty Favorites', () => {
  it('exposes exactly one dock per dynasty', () => {
    render(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);
    expect(screen.getByTestId('run-setup-favorites').children).toHaveLength(3);
    for (const dynasty of ['cyber', 'primal', 'cosmic']) {
      expect(screen.getByTestId(`run-setup-favorite-${dynasty}`)).toBeInTheDocument();
    }
  });

  /**
   * THE DOCK ALWAYS ANSWERS "WHO IS FLYING".
   *
   * Selection used to be `favorite.id === snake.id`, which is false in two
   * ordinary situations — a player with no saved favorite, and a player flying
   * a snake of that house that is not the saved one. In both, every dock
   * rendered unselected and the panel silently stopped naming the snake about
   * to launch. The flying DYNASTY is the equipped snake's, always.
   */
  it('marks the equipped snake\'s dynasty as flying even with no saved favorite', () => {
    render(
      <RunSetupPanel
        {...props({
          snake: { id: 'primal-active', name: 'Moss', generation: 7, dynasty: 'PRIMAL' },
          favorites: { CYBER: null, PRIMAL: null, COSMIC: null },
          onFavoriteDock: jest.fn(),
        })}
      />
    );
    expect(screen.getByTestId('run-setup-favorite-primal')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Moss')).toBeInTheDocument();
  });

  it('shows the equipped snake, not the bookmark, in the flying dock', () => {
    render(
      <RunSetupPanel
        {...props({
          snake: { id: 'primal-active', name: 'Moss', generation: 7, dynasty: 'PRIMAL' },
          favorites: {
            PRIMAL: { id: 'primal-other', name: 'Fern', generation: 2, dynasty: 'PRIMAL' },
          },
          onFavoriteDock: jest.fn(),
        })}
      />
    );
    expect(screen.getByText('Moss')).toBeInTheDocument();
    expect(screen.queryByText('Fern')).toBeNull();
  });

  /**
   * GENERATION IS PLAYER-MEANINGFUL IDENTITY, AND `game.spec.ts` PINS IT.
   * That e2e leg needs auth and an isolated database, so this pins the same
   * fact where a styling change is actually made.
   */
  it('always names the equipped snake\'s generation', () => {
    render(
      <RunSetupPanel
        {...props({
          snake: { id: 'primal-active', name: 'Moss', generation: 7, dynasty: 'PRIMAL' },
        })}
      />
    );
    expect(screen.getByText(/gen 7/i)).toBeInTheDocument();
  });

  it('switches house through the dock callback, and opens the picker on your own', () => {
    const onFavoriteDock = jest.fn();
    const primal = { id: 'primal-favorite', name: 'Moss', generation: 4, dynasty: 'PRIMAL' };
    render(
      <RunSetupPanel
        {...props({
          favorites: { PRIMAL: primal, COSMIC: null },
          onFavoriteDock,
        })}
      />
    );

    fireEvent.click(screen.getByTestId('run-setup-favorite-primal'));
    fireEvent.click(screen.getByTestId('run-setup-favorite-cosmic'));
    expect(onFavoriteDock).toHaveBeenNthCalledWith(1, 'PRIMAL', primal);
    expect(onFavoriteDock).toHaveBeenNthCalledWith(2, 'COSMIC', null);

    // CYBER is the flying dynasty here. Its dock is NOT dead — a dead 92px
    // target on the surface whose job is choosing a snake would strand a
    // player who wants a different snake of the house they already fly — so
    // it asks for a pick instead of re-equipping what is already equipped.
    fireEvent.click(screen.getByTestId('run-setup-favorite-cyber'));
    expect(onFavoriteDock).toHaveBeenNthCalledWith(3, 'CYBER', null);
  });

  it('names the selected house and its ruleset, and nobody else\'s', () => {
    render(<RunSetupPanel {...props()} />);
    const explainer = screen.getByTestId('ruleset-explainer');
    expect(explainer).toHaveTextContent('CYBER accelerates as you eat.');
    expect(explainer).toHaveTextContent('CYBER');
  });

  /**
   * WP-2.07a survives the cut, inside element (a). What the snake BRINGS is
   * not a setting — it is a property of the snake you are flying — so it sits
   * in the same section, and it must be visible before PLAY: a stake against
   * unseen rules is the thing this rule exists to prevent.
   */
  it('shows what the flying snake brings, without a second emphasis', () => {
    const { container } = render(
      <RunSetupPanel
        {...props({ heirloom: <div data-testid="heirloom-summary" /> })}
      />
    );
    const heirloom = screen.getByTestId('heirloom-summary');
    expect(screen.getByTestId('run-setup-favorites').parentElement).toContainElement(
      heirloom
    );
    expect(container.querySelectorAll('.btn-go')).toHaveLength(1);
  });

  it('drops what the snake brings when no snake resolved', () => {
    render(
      <RunSetupPanel
        {...props({
          snake: null,
          noSnakeAvailable: true,
          heirloom: <div data-testid="heirloom-summary" />,
        })}
      />
    );
    expect(screen.queryByTestId('heirloom-summary')).toBeNull();
  });

  it('keeps the full roster and the Lab one tap away without emphasising either', () => {
    const onChooseSnake = jest.fn();
    const labHref =
      '/lab?returnTo=%2Fgame%3FsetupMode%3Dearn%26setupEnergy%3D4';
    const { container } = render(
      <RunSetupPanel {...props({ onChooseSnake, labHref })} />
    );

    fireEvent.click(screen.getByTestId('run-setup-snake-picker-trigger'));
    expect(onChooseSnake).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Snake Lab/i })).toHaveAttribute(
      'href',
      labHref
    );
    expect(container.querySelectorAll('.btn-go')).toHaveLength(1);
  });
});

describe('RunSetupPanel — failure and recovery', () => {
  it('offers a recovery path instead of PLAY when no snake resolved', () => {
    render(<RunSetupPanel {...props({ snake: null, noSnakeAvailable: true })} />);
    expect(screen.queryByTestId('earn-start')).toBeNull();
    expect(screen.getByText(/Return Home to Retry/i)).toBeInTheDocument();
  });

  it('surfaces a start error without hiding PLAY', () => {
    render(<RunSetupPanel {...props({ startError: 'Rate limited. Wait 5s' })} />);
    expect(screen.getByText('Rate limited. Wait 5s')).toBeInTheDocument();
    expect(screen.getByTestId('earn-start')).toBeInTheDocument();
  });

  it('carries no commercial surface (Rule 7)', () => {
    const { container } = render(<RunSetupPanel {...props()} />);
    for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
      expect(anchor.getAttribute('href')).not.toMatch(/shop|premium|checkout/i);
    }
  });
});
