import { fireEvent, render, screen } from '@testing-library/react';
import { RunResults, type RunResultsProps } from './RunResults';
import type { DailyTakeSlot } from '@/lib/game/dailyTake';
import type { RunImpactEnvelope } from '@/lib/game/runImpactClient';

jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: true,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const impact: RunImpactEnvelope = {
  version: 1,
  sessionId: 'session-1',
  settledAt: '2026-07-30T10:00:00.000Z',
  outcome: 'extracted',
  dynasty: 'CYBER',
  receipt: {
    validated: true,
    score: 440,
    yieldDna: 260,
    dnaCredited: 572,
    energyCommitted: 2,
    commitmentMultiplierBps: 22_000,
    generation: 11,
    personalBest: { eligible: true, before: 400, after: 440, improved: true },
  },
  impacts: [
    {
      key: 'mastery',
      pillar: 'mastery',
      kind: 'mastery_level',
      significance: 'milestone',
      headline: 'CYBER Mastery M6',
      detail: 'A new gene entered your pool.',
      before: 5,
      after: 6,
      metadata: { target: 10 },
      destination: 'mastery',
    },
    {
      key: 'codex',
      pillar: 'discovery',
      kind: 'codex_discovery',
      significance: 'historic',
      headline: 'World-first splice documented',
      destination: 'codex',
    },
    {
      key: 'clan',
      pillar: 'clan',
      kind: 'clan_top_five',
      significance: 'notable',
      headline: 'Entered your clan five',
      destination: 'clan',
    },
  ],
  featuredImpactKeys: ['mastery', 'codex', 'clan'],
  recommendedAction: {
    headline: 'Review CYBER Mastery M6',
    destination: 'mastery',
  },
};

function props(overrides: Partial<RunResultsProps> = {}): RunResultsProps {
  return {
    outcome: 'extracted',
    practice: false,
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
    energyCommitted: 1,
    commitmentMultiplierBps: 10_000,
    clanBattle: null,
    take: null,
    takeState: 'idle',
    onCollectTake: jest.fn(),
    impact,
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
    replayEnergy: 1,
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

describe('RunResults constitutional hierarchy', () => {
  it('renders exactly three layers and one next action', () => {
    const { container } = render(<RunResults {...props()} />);
    expect(container.querySelectorAll('[data-testid^="results-layer-"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="results-next-action"]')).toHaveLength(1);
    expect(screen.getByTestId('results-layer-3')).toContainElement(
      screen.getByTestId('results-next-action')
    );
  });

  it('keeps Replay and Setup outside every layer and immediately operable', () => {
    const onReplay = jest.fn();
    const onSetup = jest.fn();
    render(<RunResults {...props({ onReplay, onSetup })} />);
    for (const layer of [1, 2, 3]) {
      expect(screen.getByTestId(`results-layer-${layer}`)).not.toContainElement(
        screen.getByTestId('results-replay')
      );
    }
    fireEvent.click(screen.getByTestId('results-replay'));
    fireEvent.click(screen.getByTestId('results-setup'));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('has no commercial copy or destination', () => {
    const { container } = render(<RunResults {...props()} />);
    expect(container.textContent ?? '').not.toMatch(/buy|purchase|subscribe|keeper|season pass|€/i);
    for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
      expect(anchor.getAttribute('href')).not.toMatch(/shop|checkout|billing/i);
    }
  });
});

describe('Layer 1', () => {
  it('names extracted, crash, and practice outcomes', () => {
    const { rerender } = render(<RunResults {...props()} />);
    expect(screen.getByTestId('gameover-extracted')).toBeInTheDocument();
    rerender(<RunResults {...props({ outcome: 'crashed' })} />);
    expect(screen.getByTestId('gameover-crashed')).toBeInTheDocument();
    rerender(<RunResults {...props({ practice: true })} />);
    expect(screen.getByTestId('gameover-practice')).toBeInTheDocument();
  });

  it('keeps share and the one literal Daily Take collect in Layer 1', () => {
    const onCollectTake = jest.fn();
    render(<RunResults {...props({
      take,
      onCollectTake,
      shareArtifact: <div data-testid="share-artifact">share</div>,
    })} />);
    const layer = screen.getByTestId('results-layer-1');
    expect(layer).toContainElement(screen.getByTestId('share-artifact'));
    expect(layer).toContainElement(screen.getByTestId('results-take'));
    fireEvent.click(screen.getByTestId('results-take-collect'));
    expect(onCollectTake).toHaveBeenCalledTimes(1);
  });

  it('shows personal-best recognition only from the immutable receipt', () => {
    const { rerender } = render(<RunResults {...props()} />);
    expect(screen.getByTestId('results-personal-best')).toBeInTheDocument();
    rerender(<RunResults {...props({
      impact: {
        ...impact,
        receipt: {
          ...impact.receipt,
          personalBest: { eligible: true, before: 440, after: 440, improved: false },
        },
      },
    })} />);
    expect(screen.queryByTestId('results-personal-best')).toBeNull();
    rerender(<RunResults {...props({ impact: null })} />);
    expect(screen.queryByTestId('results-personal-best')).toBeNull();
  });
});

describe('Layer 2', () => {
  it('uses the immutable receipt for Score, Yield, credited DNA, and commitment', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByTestId('results-score')).toHaveTextContent('440');
    expect(screen.getByTestId('results-yield')).toHaveTextContent('260');
    expect(screen.getByTestId('results-energy')).toHaveTextContent('2 Energy committed');
    expect(screen.getByTestId('results-energy')).toHaveTextContent('572 DNA credited');
  });

  it('keeps detailed reward math collapsed', () => {
    render(<RunResults {...props()} />);
    const details = screen.getByTestId('results-receipt-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByTestId('results-yield-breakdown')).toHaveTextContent('Gen 11 Yield ×1.1273');
  });

  it('shows only the clan delta and never repeats the full five', () => {
    render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: true,
        scoreDelta: 12_400,
        replacedSessionId: 'old',
        topFive: [{ sessionId: 'secret-row', score: 999_999, rank: 1, energyCommitted: 6, generation: 11 }],
      },
    })} />);
    expect(screen.getByTestId('results-clan-battle')).toHaveTextContent('+12,400 Clan Depth');
    expect(screen.getByTestId('results-clan-battle')).toHaveTextContent('Replaced a weaker result');
    expect(screen.queryByText('999,999 Yield')).toBeNull();
  });
});

describe('Layer 3 recognition', () => {
  it('starts as one closed digest with a compact summary', () => {
    render(<RunResults {...props()} />);
    const digest = screen.getByTestId('results-digest') as HTMLDetailsElement;
    expect(digest.open).toBe(false);
    expect(screen.getByTestId('impact-summary')).toHaveTextContent('CYBER Mastery M6');
  });

  it('sequences no more than three grouped, skippable beats', () => {
    render(<RunResults {...props()} />);
    fireEvent.click(screen.getByText('What this run moved'));
    expect(screen.getByTestId('impact-beat-discovery')).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('impact-review-next'));
    expect(screen.getByTestId('impact-beat-growth')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('impact-review-skip'));
    expect(screen.getByText(/Recognition reviewed/i)).toBeInTheDocument();
  });

  it('announces visual progress without relying on animation', () => {
    render(<RunResults {...props()} />);
    fireEvent.click(screen.getByText('What this run moved'));
    fireEvent.click(screen.getByTestId('impact-review-next'));
    const progress = screen.getByRole('progressbar', { name: /CYBER Mastery M6 progress/i });
    expect(progress).toHaveAttribute('aria-valuenow', '6');
    expect(progress).toHaveAttribute('aria-valuemax', '10');
  });

  it('states pending recovery instead of constructing client progress', () => {
    render(<RunResults {...props({ impact: null })} />);
    expect(screen.getByTestId('impact-summary')).toHaveTextContent(/pending server recovery/i);
    expect(screen.getByText(/becomes earned progress when the server accepts/i)).toBeInTheDocument();
  });

  it('describes a receipt-free practice run without implying lost recovery', () => {
    render(<RunResults {...props({ practice: true, impact: null })} />);
    expect(screen.getByTestId('impact-summary')).toHaveTextContent(
      'Practice advances no persistent progress.'
    );
    expect(screen.queryByText(/pending server recovery/i)).toBeNull();
  });

  it('shows routine progress without manufacturing a ceremony', () => {
    const routine = {
      ...impact,
      impacts: [{
        key: 'xp', pillar: 'mastery' as const, kind: 'mastery_xp' as const, significance: 'routine' as const, headline: '+80 CYBER Mastery XP',
      }],
      featuredImpactKeys: [],
    };
    render(<RunResults {...props({ impact: routine })} />);
    fireEvent.click(screen.getByText('What this run moved'));
    expect(screen.getByTestId('impact-routine-list')).toHaveTextContent('+80 CYBER Mastery XP');
    expect(screen.queryByTestId('impact-review-next')).toBeNull();
  });
});
