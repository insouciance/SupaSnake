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

/**
 * The portrait hook runs FOR REAL in every test in this file.
 *
 * That is the point: jsdom has no WebGL, so the real hook must mount no
 * canvas, throw nothing, and simply report no portraits — and if it ever stops
 * being safe there, every assertion below turns red at once, which is a
 * louder alarm than a dedicated test would be.
 *
 * The override exists only so the OPPOSITE case can also be seen. A browser
 * that has taken the pictures is not reachable from jsdom at all, so the
 * captured URLs are injected over the real hook's answer rather than faked in
 * place of it.
 */
let mockPortraitOverride: Record<string, string> | null = null;
jest.mock('./DynastySnakePortrait', () => {
  const actual = jest.requireActual('./DynastySnakePortrait');
  return {
    ...actual,
    useDynastySnakePortraits: (...args: unknown[]) => {
      const real = actual.useDynastySnakePortraits(...args);
      return mockPortraitOverride
        ? { ...real, portraits: mockPortraitOverride }
        : real;
    },
  };
});

afterEach(() => {
  mockPortraitOverride = null;
});

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

  /**
   * ONE GESTURE, ONE MEANING (owner item 7, 2026-08-08) — RE-EXPRESSED.
   *
   * The assertion this replaces read: "CYBER is the flying dynasty here. Its
   * dock is NOT dead ... so it asks for a pick instead of re-equipping what is
   * already equipped", and pinned `('CYBER', null)` on that tap. The reasoning
   * was sound and the outcome was not: the same gesture on the same pixels
   * meant "equip that house" on two cards and "open the picker" on the third,
   * and a player only ever finds a hidden second meaning by being surprised by
   * it.
   *
   * What survives verbatim is the part that was actually load-bearing: the
   * flying card is still LIVE, not a dead target. What changed is what it does
   * — it re-affirms, spending no request to equip the snake already equipped —
   * and the picker branch moved out to a control of its own, tested below.
   */
  it('selects a house from the card, and the card you are already flying re-affirms rather than meaning something else', () => {
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

    // CYBER is the flying dynasty. The card is enabled — it presses, it takes
    // focus, it is not a dead target — and it asks the page for nothing.
    const flying = screen.getByTestId('run-setup-favorite-cyber');
    expect(flying).toBeEnabled();
    fireEvent.click(flying);
    expect(onFavoriteDock).toHaveBeenCalledTimes(2);
  });

  /**
   * THE SECOND MEANING GETS ITS OWN CONTROL, AND ITS OWN SIZE.
   *
   * Changing which snake a house carries is rare for a player who has found
   * theirs and frequent for one chasing heirlooms, so it is small AND always
   * visible — never behind a hover, a long press or a menu.
   */
  it('changes a house\'s snake from a chip of its own, on every card', () => {
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

    for (const dynasty of ['cyber', 'primal', 'cosmic']) {
      fireEvent.click(screen.getByTestId(`run-setup-favorite-change-${dynasty}`));
    }
    expect(onFavoriteDock).toHaveBeenNthCalledWith(1, 'CYBER', null);
    expect(onFavoriteDock).toHaveBeenNthCalledWith(2, 'PRIMAL', null);
    expect(onFavoriteDock).toHaveBeenNthCalledWith(3, 'COSMIC', null);
  });

  /**
   * A BUTTON INSIDE A BUTTON IS NOT A LAYOUT DETAIL.
   *
   * It is invalid HTML, and a screen reader will not expose the inner control
   * at all — so the "change" affordance would exist for a sighted mouse user
   * and for nobody else. The card and the chip are siblings, and this is the
   * assertion that keeps them that way when the layout is next tidied.
   */
  it('never nests the change chip inside the card button', () => {
    render(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);
    for (const dynasty of ['cyber', 'primal', 'cosmic']) {
      const card = screen.getByTestId(`run-setup-favorite-${dynasty}`);
      const chip = screen.getByTestId(`run-setup-favorite-change-${dynasty}`);
      expect(card.tagName).toBe('BUTTON');
      expect(chip.tagName).toBe('BUTTON');
      expect(card).not.toContainElement(chip);
      expect(chip.closest('button')).toBe(chip);
    }
  });

  /**
   * THE INK STAYS SMALL, THE TARGET DOES NOT.
   *
   * The visible chip is about twenty pixels tall — the share of the tray the
   * owner asked for. The floor is met by a transparent 44x44 pseudo-element
   * anchored to the chip's own bottom edge, growing the target UPWARD into the
   * card instead of inflating the drawn object. jsdom has no layout, so what
   * is pinned is the mechanism: remove the pad and this fails.
   */
  it('gives the change chip a 44px target without inflating its ink', () => {
    render(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);
    const chip = screen.getByTestId('run-setup-favorite-change-cyber');
    expect(chip.className).toContain('after:h-11');
    expect(chip.className).toContain('after:w-11');
    // The block itself: chip radius, ink contour, hard displaced drop, press
    // collapse — all of it carried by `.ink-chip`, not re-authored here.
    expect(chip).toHaveClass('ink-chip');
  });

  /**
   * THERE IS NO STATE IN WHICH TWO CARDS READ AS SELECTED.
   *
   * Selection is said three ways at once and every one of them is exclusive:
   * the tray-weight contour, the bigger displaced block, and the raised rung
   * of the house's own fill. Hover moves none of them — a hover that grew the
   * block would put an unselected card in the selected card's clothes for as
   * long as a pointer rested on it.
   */
  it('marks exactly one card selected, in the pattern language and never with a glow', () => {
    render(
      <RunSetupPanel
        {...props({
          favorites: { PRIMAL: null, COSMIC: null },
          onFavoriteDock: jest.fn(),
        })}
      />
    );

    const cards = ['cyber', 'primal', 'cosmic'].map((dynasty) =>
      screen.getByTestId(`run-setup-favorite-${dynasty}`)
    );
    const pressed = cards.filter(
      (card) => card.getAttribute('aria-pressed') === 'true'
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toBe(cards[0]);

    expect(pressed[0].className).toContain('var(--ink-w-3)');
    expect(pressed[0].className).toContain('var(--ink-drop-3)');
    for (const card of cards.slice(1)) {
      expect(card.className).toContain('var(--ink-w-2)');
      expect(card.className).toContain('var(--ink-drop-2)');
      // The unselected cards may lift on hover; they may not grow their block,
      // which is the selected card's own signal.
      expect(card.className).not.toContain('hover:shadow');
    }
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

  /**
   * THE TILE CARRIES THE CREATURE (owner item 6, 2026-08-08).
   *
   *   "should display the actual snake ... just the face almost from the
   *    front ... almost like a passport picture but at a small angle."
   */
  it('shows the real snake head on every card once the pictures have been taken', () => {
    mockPortraitOverride = {
      CYBER: 'data:image/png;base64,CYBER',
      PRIMAL: 'data:image/png;base64,PRIMAL',
      COSMIC: 'data:image/png;base64,COSMIC',
    };
    render(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);

    for (const dynasty of ['cyber', 'primal', 'cosmic']) {
      const portrait = screen.getByTestId(`run-setup-portrait-${dynasty}`);
      expect(portrait.tagName).toBe('IMG');
      expect(portrait).toHaveAttribute(
        'src',
        `data:image/png;base64,${dynasty.toUpperCase()}`
      );
    }
  });

  /**
   * FAILURE IS INVISIBLE (doctrine principle 1).
   *
   * No WebGL, a 404 on the model, a readback the browser refuses, or simply
   * the frames before the picture exists — all of them are the same thing to
   * the player: the card it has always drawn. jsdom IS one of those cases, so
   * this test needs no arrangement at all, which is exactly why it is worth
   * writing: the fallback is the default and not a branch someone remembered.
   */
  it('falls back to the strain glyph, silently, when a portrait is not in hand', () => {
    render(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);
    expect(screen.queryByTestId('run-setup-portrait-cyber')).toBeNull();
    // The card is unchanged and fully labelled: nothing about the decision is
    // carried by the picture.
    expect(screen.getByTestId('run-setup-favorite-cyber')).toBeEnabled();
    expect(screen.getByText('Ouro')).toBeInTheDocument();
    // And no canvas was ever mounted, because there is no WebGL to mount into.
    expect(screen.queryByTestId('setup-portrait-rig')).toBeNull();
  });

  /**
   * A PORTRAIT IS DECORATION BESIDE AN ALREADY-LABELLED BUTTON.
   *
   * It carries an empty alt AND `aria-hidden`, and the card's accessible name
   * is the same string with the picture as without it. A decorative image that
   * announced itself would make a screen reader read the snake's identity
   * twice — once as a label and once as an image — for a picture that adds
   * nothing a label cannot say.
   */
  it('keeps the portrait out of the accessible name entirely', () => {
    const { rerender } = render(
      <RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />
    );
    const bare = screen
      .getByTestId('run-setup-favorite-cyber')
      .getAttribute('aria-label');

    mockPortraitOverride = { CYBER: 'data:image/png;base64,CYBER' };
    rerender(<RunSetupPanel {...props({ onFavoriteDock: jest.fn() })} />);

    const portrait = screen.getByTestId('run-setup-portrait-cyber');
    expect(portrait).toHaveAttribute('alt', '');
    expect(portrait).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByTestId('run-setup-favorite-cyber').getAttribute('aria-label')
    ).toBe(bare);
  });

  /**
   * COMPACT, NOT CUT (owner item 5, 2026-08-08).
   *
   * "ruleset line and heirloom block can remain, but COMPACT." Both facts stay
   * — the house's rule is still stated in full, and the heirloom block is
   * still mounted inside element (a). What shrank is leading and type size,
   * and only where the pressure is: at `sm` the line returns to 11px, because
   * what is being bought is vertical room on a 568px-tall phone and a desktop
   * has none of that pressure.
   */
  it('states the ruleset in full, at the tightened phone metrics', () => {
    render(<RunSetupPanel {...props()} />);
    const explainer = screen.getByTestId('ruleset-explainer');
    expect(explainer).toHaveTextContent('CYBER accelerates as you eat.');
    expect(explainer).toHaveClass('text-[10px]');
    expect(explainer).toHaveClass('leading-tight');
    expect(explainer).toHaveClass('sm:text-[11px]');
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
