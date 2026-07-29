/**
 * Results — the constitutional shape (§5, cap §12.2).
 *
 * These assertions are the law, not the styling: exactly three layers,
 * exactly one recommended next action, zero commercial surfaces, and a Take
 * slot that appears only when the server said this was the day's first run.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { RunResults, type RunResultsProps } from './RunResults';
import type { DailyTakeSlot } from '@/lib/game/dailyTake';

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

function props(overrides: Partial<RunResultsProps> = {}): RunResultsProps {
  return {
    outcome: 'extracted',
    practice: false,
    personalBest: false,
    score: 420,
    dnaCredited: 180,
    yieldDna: 240,
    yieldBreakdown: {
      generation: 11,
      baseYield: 213,
      multiplier: 1.1273,
      bonusYield: 27,
      totalYield: 240,
    },
    serpent: null,
    take: null,
    takeState: 'idle',
    onCollectTake: jest.fn(),
    digest: { mastery: null, codex: [], streakDays: null, genes: [] },
    nextAction: {
      id: 'chronicle',
      label: 'Open your Chronicle',
      description: 'Everything this account has done.',
      href: '/profile',
    },
    onNextAction: jest.fn(),
    onReplay: jest.fn(),
    onSetup: jest.fn(),
    replayPending: false,
    replayDisabled: false,
    ...overrides,
  };
}

const take: DailyTakeSlot = {
  firstRunOfDay: true,
  amount: 150,
  streakDays: 3,
  multiplier: 1.25,
  collected: false,
};

describe('RunResults — the three layers', () => {
  it('renders exactly three layers', () => {
    const { container } = render(<RunResults {...props()} />);
    expect(
      container.querySelectorAll('[data-testid^="results-layer-"]')
    ).toHaveLength(3);
    expect(screen.getByTestId('results-layer-1')).toBeInTheDocument();
    expect(screen.getByTestId('results-layer-2')).toBeInTheDocument();
    expect(screen.getByTestId('results-layer-3')).toBeInTheDocument();
  });

  it('renders exactly one recommended next action', () => {
    const { container } = render(
      <RunResults
        {...props({
          digest: {
            mastery: {
              dynasty: 'CYBER',
              xpGained: 120,
              level: 4,
              leveledUp: true,
              unlocks: [{ level: 4, kind: 'mutation', label: 'Phoenix' }],
            },
            codex: [{ key: 'splice:x', label: 'Splice X' }],
            streakDays: 5,
            genes: ['Phoenix'],
          },
        })}
      />
    );
    expect(
      container.querySelectorAll('[data-testid="results-next-action"]')
    ).toHaveLength(1);
  });

  it('keeps the next action inside Layer 3', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByTestId('results-layer-3')).toContainElement(
      screen.getByTestId('results-next-action')
    );
  });

  it('collapses the progression digest into one closed disclosure', () => {
    const { container } = render(
      <RunResults
        {...props({
          digest: {
            mastery: null,
            codex: [{ key: 'a', label: 'A' }],
            streakDays: 2,
            genes: [],
          },
        })}
      />
    );
    const digests = container.querySelectorAll('[data-testid="results-digest"]');
    expect(digests).toHaveLength(1);
    expect((digests[0] as HTMLDetailsElement).open).toBe(false);
  });

  it('carries no commercial surface (Rule 7)', () => {
    const { container } = render(
      <RunResults
        {...props({
          digest: {
            mastery: {
              dynasty: 'PRIMAL',
              xpGained: 90,
              level: 2,
              leveledUp: false,
              unlocks: [],
            },
            codex: [{ key: 'a', label: 'A' }],
            streakDays: 9,
            genes: ['Phoenix'],
          },
          take,
        })}
      />
    );
    for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
      expect(anchor.getAttribute('href')).not.toMatch(
        /shop|premium|checkout|store|billing|stripe/i
      );
    }
    expect(container.textContent ?? '').not.toMatch(
      /\b(buy|purchase|upgrade to|subscribe|keeper|season pass|€|\$\d)/i
    );
  });
});

describe('RunResults — Layer 1', () => {
  it('names the outcome', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByTestId('gameover-extracted')).toBeInTheDocument();

    render(<RunResults {...props({ outcome: 'crashed' })} />);
    expect(screen.getByTestId('gameover-crashed')).toBeInTheDocument();

    render(<RunResults {...props({ practice: true })} />);
    expect(screen.getByTestId('gameover-practice')).toBeInTheDocument();
  });

  it('shows personal-best status only when the run set one', () => {
    render(<RunResults {...props()} />);
    expect(screen.queryByTestId('results-personal-best')).toBeNull();

    render(<RunResults {...props({ personalBest: true })} />);
    expect(screen.getByTestId('results-personal-best')).toBeInTheDocument();
  });

  it('places the share artifact on Layer 1 (§11.3)', () => {
    render(
      <RunResults
        {...props({ shareArtifact: <div data-testid="share-card">card</div> })}
      />
    );
    expect(screen.getByTestId('results-layer-1')).toContainElement(
      screen.getByTestId('share-card')
    );
  });

  it('renders no Take slot when the server did not report one', () => {
    render(<RunResults {...props()} />);
    expect(screen.queryByTestId('results-take')).toBeNull();
  });

  it('renders the Take slot on the day first run, inside Layer 1', () => {
    render(<RunResults {...props({ take })} />);
    const slot = screen.getByTestId('results-take');
    expect(screen.getByTestId('results-layer-1')).toContainElement(slot);
    expect(slot).toHaveTextContent('150 DNA');
    expect(slot).toHaveTextContent('day 3 streak');
  });

  it('collects the Take once and then disables the button', () => {
    const onCollectTake = jest.fn();
    const { rerender } = render(
      <RunResults {...props({ take, onCollectTake })} />
    );
    fireEvent.click(screen.getByTestId('results-take-collect'));
    expect(onCollectTake).toHaveBeenCalledTimes(1);

    rerender(
      <RunResults
        {...props({
          take: { ...take, collected: true },
          onCollectTake,
          takeState: 'collected',
        })}
      />
    );
    expect(screen.getByTestId('results-take-collect')).toBeDisabled();
  });

  it('treats a missing collect endpoint as a statement, not an error', () => {
    render(<RunResults {...props({ take, takeState: 'unavailable' })} />);
    expect(screen.getByTestId('results-take-status')).toHaveTextContent(
      /settles with the day/i
    );
    expect(screen.getByTestId('results-take-collect')).toBeDisabled();
  });
});

describe('RunResults — Layer 2', () => {
  it('shows the two numbers', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByTestId('results-score')).toHaveTextContent('420');
    expect(screen.getByTestId('results-yield')).toHaveTextContent('240');
  });

  it('shows the snake generation multiplier and its exact Yield contribution', () => {
    render(<RunResults {...props()} />);
    const breakdown = screen.getByTestId('results-yield-breakdown');
    expect(breakdown).toHaveTextContent('Base run Yield');
    expect(breakdown).toHaveTextContent('213');
    expect(breakdown).toHaveTextContent('Gen 11 Yield ×1.1273');
    expect(breakdown).toHaveTextContent('+27');
  });

  it('states the neutral multiplier for Gen 1-3 instead of implying a hidden bonus', () => {
    render(
      <RunResults
        {...props({
          yieldDna: 240,
          yieldBreakdown: {
            generation: 3,
            baseYield: 240,
            multiplier: 1,
            bonusYield: 0,
            totalYield: 240,
          },
        })}
      />
    );
    expect(screen.getByTestId('results-yield-breakdown')).toHaveTextContent(
      'Gen 3 Yield ×1.00'
    );
  });

  it('omits the breakdown when settlement did not answer', () => {
    render(<RunResults {...props({ yieldBreakdown: null })} />);
    expect(screen.queryByTestId('results-yield-breakdown')).toBeNull();
  });

  it('shows no Depth when no Serpent week is live', () => {
    render(<RunResults {...props()} />);
    expect(screen.queryByTestId('results-depth')).toBeNull();
  });

  it('adds the Depth contribution during a Serpent week', () => {
    render(
      <RunResults
        {...props({
          serpent: {
            live: true,
            weekDepth: 2315,
            deltaVsBestWeek: 120,
            runCounts: true,
          },
        })}
      />
    );
    const depth = screen.getByTestId('results-depth');
    expect(depth).toHaveTextContent('2,315');
    expect(depth).toHaveTextContent('+120');
    expect(depth).toHaveTextContent(/counts toward the week/i);
  });

  it('degrades to Score and Yield when the Serpent flag is off', () => {
    render(<RunResults {...props({ serpent: null })} />);
    expect(screen.getByTestId('results-score')).toBeInTheDocument();
    expect(screen.getByTestId('results-yield')).toBeInTheDocument();
    expect(screen.queryByTestId('results-depth')).toBeNull();
  });
});

describe('RunResults — the run loop controls', () => {
  it('offers REPLAY and SETUP outside the three layers', () => {
    render(<RunResults {...props()} />);
    const replay = screen.getByTestId('results-replay');
    const setup = screen.getByTestId('results-setup');
    for (const layer of [1, 2, 3]) {
      expect(screen.getByTestId(`results-layer-${layer}`)).not.toContainElement(
        replay
      );
      expect(screen.getByTestId(`results-layer-${layer}`)).not.toContainElement(
        setup
      );
    }
  });

  it('replays and reopens setup through their callbacks', () => {
    const onReplay = jest.fn();
    const onSetup = jest.fn();
    render(<RunResults {...props({ onReplay, onSetup })} />);
    fireEvent.click(screen.getByTestId('results-replay'));
    fireEvent.click(screen.getByTestId('results-setup'));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('invokes the next action when it opens a modal instead of navigating', () => {
    const onNextAction = jest.fn();
    render(
      <RunResults
        {...props({
          nextAction: {
            id: 'save-progress',
            label: 'Save this progress',
            description: 'Add an email.',
            href: null,
          },
          onNextAction,
        })}
      />
    );
    fireEvent.click(screen.getByTestId('results-next-action'));
    expect(onNextAction).toHaveBeenCalledTimes(1);
  });
});
