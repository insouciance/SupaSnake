import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    settlementPending: false,
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

  it('places the exact Genome and Ascendance explanations in the Yield layer', () => {
    render(
      <RunResults
        {...props({
          genomeRecap: {
            rulesVersion: 2,
            baseYield: 100,
            genomeYield: 240,
            genomeDelta: 140,
            factorLabel: '×2.40',
            activeGenes: [{ id: 'live_wire', name: 'Live Wire', strains: ['VOLT'] }],
            activeSplices: [],
            rows: [{ id: 'routes', label: 'Route contracts', amount: 140, detail: '2 of 3 completed', tone: 'gain' }],
            executionSummary: 'Two clean Live Wire routes produced the Genome gain.',
            bankCrashSummary: 'BANK secured the completed route value.',
          },
          studyGenomeHref: '/codex?view=workbench&result=session-1',
          ascendanceProgression: {
            generation: 11,
            curveVersion: 2,
            currentMultiplier: '1.1717',
            nextGeneration: 12,
            nextMultiplier: '1.1951',
            relativeStepPercent: '2.00',
            nextMilestoneGeneration: 15,
            milestoneMultiplier: '1.2682',
            generationsUntilMilestone: 4,
          },
        })}
      />
    );
    const yieldLayer = screen.getByTestId('results-layer-2');
    expect(yieldLayer).toContainElement(screen.getByTestId('results-genome-recap'));
    expect(yieldLayer).toContainElement(screen.getByTestId('ascendance-progression'));
    expect(screen.getByTestId('results-genome-recap')).toHaveTextContent('×2.40');
    expect(screen.getByTestId('results-study-genome')).toHaveAttribute(
      'href',
      '/codex?view=workbench&result=session-1'
    );
    expect(screen.getByTestId('ascendance-v2-next')).toHaveTextContent('+2.00% relative');
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

  it('places Replay and Setup in the normal results flow without a sticky backing tray', () => {
    render(<RunResults {...props()} />);
    const actions = screen.getByTestId('results-action-dock');
    expect(actions).toHaveAttribute('data-action-surface', 'integrated');
    expect(actions).toHaveClass('bg-transparent');
    expect(actions).not.toHaveClass('sticky');
    expect(actions).not.toHaveClass('fixed');
    expect(actions).not.toHaveClass('backdrop-blur-md');
    expect(actions).not.toHaveClass('rounded-full');
    expect(actions).not.toHaveClass('bg-void-deep/90');
    expect(actions.previousElementSibling?.tagName).toBe('P');
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

  it('shows an exact non-economic contact fact only for a crashed run', () => {
    const { rerender } = render(
      <RunResults
        {...props({
          outcome: 'crashed',
          collisionDetail: 'Recorded impact: Phase Gate Scar · cell 8,12',
        })}
      />
    );
    expect(screen.getByTestId('results-collision-diagnostic')).toHaveTextContent(
      'Phase Gate Scar · cell 8,12'
    );
    rerender(
      <RunResults
        {...props({
          outcome: 'extracted',
          collisionDetail: 'Recorded impact: Phase Gate Scar · cell 8,12',
        })}
      />
    );
    expect(screen.queryByTestId('results-collision-diagnostic')).toBeNull();
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

  it('distinguishes durable acceptance from a completed reward receipt', () => {
    render(<RunResults {...props({
      outcome: 'crashed',
      score: 999,
      impact: null,
      dnaCredited: null,
      yieldDna: null,
      settlementPending: true,
      collisionDetail: 'self at 3,4',
      shareArtifact: <div>Unverified share card</div>,
    })} />);
    expect(screen.getByTestId('results-settlement-pending')).toHaveTextContent(
      /Run secured/i
    );
    expect(screen.getByTestId('results-yield')).toHaveTextContent('Finalizing');
    expect(screen.getByTestId('results-score')).toHaveTextContent('Finalizing');
    expect(screen.getByTestId('gameover-finalizing')).toHaveTextContent('Run Secured');
    expect(screen.queryByTestId('gameover-crashed')).toBeNull();
    expect(screen.queryByText('999')).toBeNull();
    expect(screen.queryByTestId('results-collision-diagnostic')).toBeNull();
    expect(screen.queryByText('Unverified share card')).toBeNull();
    expect(screen.getByTestId('results-energy')).toHaveTextContent('reward secured');
    expect(screen.queryByText(/DNA credited/i)).toBeNull();
    expect(screen.getByTestId('impact-summary')).toHaveTextContent(
      /Career impact is finalizing/i
    );
    expect(screen.getByText(/even if you close the game/i)).toBeInTheDocument();
  });

  it('keeps detailed reward math collapsed', () => {
    render(<RunResults {...props()} />);
    const details = screen.getByTestId('results-receipt-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByTestId('results-yield-breakdown')).toHaveTextContent('Gen 11 Legacy ×1.1273');
  });

  it('shows only the clan delta and never repeats the full five', () => {
    render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: true,
        scoreDelta: 12_400,
        replacedSessionId: 'old',
        fifthBest: 19_820,
        topFive: [{ sessionId: 'secret-row', score: 999_999, rank: 1, energyCommitted: 6, generation: 11 }],
      },
    })} />);
    expect(screen.getByTestId('results-clan-battle')).toHaveTextContent('+12,400 Clan Depth');
    expect(screen.getByTestId('results-clan-battle')).toHaveTextContent('Replaced your weakest counted result');
    expect(screen.getByTestId('results-clan-battle')).toHaveTextContent('fifth-best now stands at 19,820');
    expect(screen.queryByText('999,999 Yield')).toBeNull();
  });

  // PEO §6 step 5: the contributing settlement states which of the two things
  // happened to the player's five, and what it did to the clan's total.
  it('distinguishes entering an empty slot from replacing a counted result', () => {
    const { unmount } = render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: true,
        scoreDelta: 8_000,
        replacedSessionId: null,
        clanTotal: 61_000,
      },
    })} />);
    const entered = screen.getByTestId('results-clan-placement');
    expect(entered).toHaveTextContent('Entered your five');
    expect(entered).not.toHaveTextContent('Replaced');
    unmount();

    render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: true,
        scoreDelta: 8_000,
        replacedSessionId: 'older-run',
        clanTotal: 61_000,
      },
    })} />);
    const replaced = screen.getByTestId('results-clan-placement');
    expect(replaced).toHaveTextContent('Replaced your weakest counted result');
    expect(replaced).not.toHaveTextContent('Entered your five');
  });

  it('states the exact clan total and this run’s share of it', () => {
    render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: true,
        scoreDelta: 12_400,
        clanTotal: 61_000,
      },
    })} />);
    const total = screen.getByTestId('results-clan-total');
    expect(total).toHaveTextContent('Your clan now stands at 61,000 Clan Depth');
    expect(total).toHaveTextContent('12,400 of it from this run');
  });

  it('states no clan total the server did not send', () => {
    render(<RunResults {...props({
      clanBattle: { eligible: true, enteredTopFive: true, scoreDelta: 12_400 },
    })} />);
    expect(screen.queryByTestId('results-clan-total')).toBeNull();
  });

  it('shows an exact shortfall only when the server supplied the comparable threshold', () => {
    render(<RunResults {...props({
      clanBattle: {
        eligible: true,
        enteredTopFive: false,
        thresholdBefore: 500,
        fifthBest: 500,
      },
    })} />);

    expect(screen.getByTestId('results-clan-gap')).toHaveTextContent(
      'Needed 501 · this run delivered 260 · 241 short'
    );
  });

  it('states proven crash consequences without inventing a potential score or threshold', () => {
    const crashedImpact: RunImpactEnvelope = {
      ...impact,
      outcome: 'crashed',
      receipt: {
        ...impact.receipt,
        score: 31_740,
        yieldDna: 317,
        dnaCredited: 1_902,
        energyCommitted: 6,
        commitmentMultiplierBps: 100_000,
        personalBest: { eligible: true, before: 40_000, after: 40_000, improved: false },
      },
      impacts: [],
      featuredImpactKeys: [],
      recommendedAction: null,
    };
    render(<RunResults {...props({
      outcome: 'crashed',
      impact: crashedImpact,
      clanBattle: { eligible: false, reason: 'validation_or_timing' },
    })} />);

    const consequences = screen.getByTestId('results-crash-consequences');
    expect(consequences).toHaveTextContent('1,902 DNA kept');
    expect(consequences).toHaveTextContent('No clan contribution banked');
    expect(consequences).not.toHaveTextContent(/potential|fifth-best|short|gap/i);
    expect(screen.queryByTestId('results-clan-battle-lost')).toBeNull();
  });

  it('omits a clan crash claim when no authoritative clan result exists', () => {
    const crashedWithoutClan: RunImpactEnvelope = {
      ...impact,
      outcome: 'crashed',
      impacts: [],
      featuredImpactKeys: [],
      recommendedAction: null,
    };
    render(<RunResults {...props({
      outcome: 'crashed',
      impact: crashedWithoutClan,
      clanBattle: null,
    })} />);

    const consequences = screen.getByTestId('results-crash-consequences');
    expect(consequences).toHaveTextContent('572 DNA kept');
    expect(consequences).not.toHaveTextContent(/clan|fifth-best|threshold/i);
  });
});

describe('Layer 3 recognition', () => {
  it('starts with a secured graphical DNA prize while keeping run actions available', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByTestId('results-digest')).toBeVisible();
    expect(screen.getByTestId('impact-summary')).toHaveTextContent('CYBER Mastery M6');
    expect(screen.getByTestId('impact-victory-lap')).toBeVisible();
    expect(screen.getByText(/Everything is already yours/i)).toBeInTheDocument();
    expect(screen.getByTestId('impact-beat-dna')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('impact-rune-dna').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('results-replay')).toBeEnabled();
    expect(screen.getByTestId('results-setup')).toBeEnabled();
    expect(screen.getByText(/Leaving never forfeits a secured prize/i)).toBeInTheDocument();
  });

  it('collects DNA, connected career progress, and the clan trophy through three meaningful taps', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Collect DNA/i }));
    expect(screen.getByTestId('impact-collection-payoff')).toHaveTextContent('572 DNA secured');
    expect(screen.getByTestId('impact-beat-dna')).toHaveAttribute('data-state', 'collected');
    expect(screen.getByTestId('impact-rune-career').querySelector('svg')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reveal discovery/i }));
    expect(screen.getByTestId('impact-collection-payoff')).toHaveTextContent(
      'World-first splice documented'
    );
    expect(screen.getByTestId('impact-beat-clan')).toHaveAttribute('data-state', 'ready');

    fireEvent.click(screen.getByRole('button', { name: /Raise trophy/i }));
    expect(screen.getByTestId('impact-victory-complete')).toHaveTextContent('Victory lap complete');
    expect(
      screen.queryByRole('button', { name: /Collect DNA|Reveal discovery|Raise trophy/i })
    ).toBeNull();
  });

  it('moves an accessible progress bar from before to after only when collected', async () => {
    render(<RunResults {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Collect DNA/i }));
    const progress = screen.getByRole('progressbar', { name: /CYBER Mastery M6 progress/i });
    expect(progress).toHaveAttribute('aria-valuenow', '5');
    expect(progress).toHaveAttribute('aria-valuemax', '10');
    fireEvent.click(screen.getByRole('button', { name: /Reveal discovery/i }));
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: /CYBER Mastery M6 progress/i })).toHaveAttribute(
        'aria-valuenow',
        '6'
      );
    });
  });

  it('leaves only durable exact destination lights after collection', () => {
    const attentionImpact: RunImpactEnvelope = {
      ...impact,
      impacts: [
        {
          key: 'mastery',
          pillar: 'mastery',
          kind: 'mastery_level',
          significance: 'historic',
          headline: 'CYBER Mastery M6',
          destination: 'mastery',
          artifactRef: 'CYBER',
        },
        {
          key: 'record',
          pillar: 'mastery',
          kind: 'record_tier',
          significance: 'milestone',
          headline: 'Perfect coils reached Tier 3',
          destination: 'records',
          artifactRef: 'perfect_coils',
        },
        {
          key: 'codex',
          pillar: 'discovery',
          kind: 'codex_discovery',
          significance: 'historic',
          headline: 'World-first splice documented',
          destination: 'codex',
          artifactRef: 'splice:vector_bloom',
        },
        {
          key: 'clan',
          pillar: 'clan',
          kind: 'clan_top_five',
          significance: 'milestone',
          headline: 'Entered your clan five',
          destination: 'clan',
          artifactRef: 'session-1',
        },
      ],
      featuredImpactKeys: ['mastery', 'record', 'codex', 'clan'],
    };
    render(<RunResults {...props({ impact: attentionImpact })} />);

    fireEvent.click(screen.getByRole('button', { name: /Collect DNA/i }));
    fireEvent.click(screen.getByRole('button', { name: /Accept mastery/i }));
    fireEvent.click(screen.getByRole('button', { name: /Raise trophy/i }));

    expect(screen.getByTestId('results-attention-you')).toHaveTextContent('CYBER Mastery M6');
    expect(screen.getByTestId('results-attention-you')).toHaveTextContent('+1 more');
    expect(screen.getByTestId('results-attention-lab')).toHaveTextContent('World-first splice documented');
    expect(screen.getByTestId('results-attention-compete')).toHaveTextContent('Entered your clan five');
    expect(screen.getByText(/stay on until the exact progress is visible/i)).toBeInTheDocument();
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

  it('shows routine progress as already secured without manufacturing a claim tap', () => {
    const routine = {
      ...impact,
      impacts: [{
        key: 'xp', pillar: 'mastery' as const, kind: 'mastery_xp' as const, significance: 'routine' as const, headline: '+80 CYBER Mastery XP',
      }],
      featuredImpactKeys: [],
    };
    render(<RunResults {...props({ impact: routine })} />);
    expect(screen.getByTestId('impact-routine-summary')).toHaveTextContent(
      '+80 CYBER Mastery XP'
    );
    fireEvent.click(screen.getByRole('button', { name: /Collect DNA/i }));
    expect(screen.getByTestId('impact-victory-complete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept progress/i })).toBeNull();
  });

  it('can collect every remaining secured prize with one action', () => {
    render(<RunResults {...props()} />);
    fireEvent.click(screen.getByTestId('impact-collect-remaining'));
    expect(screen.getByTestId('impact-victory-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('impact-collect-remaining')).toBeNull();
    expect(screen.getAllByText(/Collected/i).length).toBeGreaterThanOrEqual(3);
  });

  it('shows the complete static reward order without claim controls for reduced motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
    try {
      render(<RunResults {...props()} />);
      await waitFor(() => {
        expect(screen.getByTestId('impact-reduced-summary')).toBeInTheDocument();
      });
      expect(screen.getByTestId('impact-reduced-summary')).toHaveTextContent('572 DNA');
      expect(screen.getByTestId('impact-reduced-summary')).toHaveTextContent(
        'World-first splice documented'
      );
      expect(screen.queryByTestId('impact-collect-remaining')).toBeNull();
      expect(screen.queryByRole('button', { name: /Collect DNA/i })).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it('stacks mobile actions and prevents action-label wrapping', () => {
    render(<RunResults {...props()} />);
    expect(screen.getByRole('button', { name: /Collect DNA/i })).toHaveClass('whitespace-nowrap');
    expect(screen.getByTestId('results-replay')).toHaveClass('whitespace-nowrap');
    expect(screen.getByTestId('results-setup')).toHaveClass('whitespace-nowrap');
  });
});

describe('the curriculum invitation on Results (WP-D)', () => {
  const invitation = {
    id: 'curriculum-reveal' as const,
    label: 'Show me Loop Trap',
    description: 'Read what it changes and what it commits before your next run.',
    href: '/codex',
    attentionId: 'attention-1',
    declineLabel: 'Not now',
  };

  it('offers Show me and Not now, and nothing else new', () => {
    const onNextAction = jest.fn();
    const onDeclineNextAction = jest.fn();
    render(
      <RunResults
        {...props({ nextAction: invitation, onNextAction, onDeclineNextAction })}
      />
    );
    const action = screen.getByTestId('results-next-action');
    expect(action).toHaveAttribute('data-next-action', 'curriculum-reveal');
    expect(action).toHaveTextContent('Show me Loop Trap');
    expect(action).toHaveAttribute('href', '/codex');

    const decline = screen.getByTestId('results-next-action-decline');
    expect(decline).toHaveTextContent('Not now');
    expect(decline).not.toHaveTextContent(/later/i);
    fireEvent.click(decline);
    expect(onDeclineNextAction).toHaveBeenCalledTimes(1);
    expect(onNextAction).not.toHaveBeenCalled();
  });

  it('keeps Replay and Setup immediately available beside it', () => {
    render(<RunResults {...props({ nextAction: invitation, onDeclineNextAction: jest.fn() })} />);
    expect(screen.getByTestId('results-replay')).toBeEnabled();
    expect(screen.getByTestId('results-setup')).toBeEnabled();
  });

  it('records taking the invitation as well as declining it', () => {
    const onNextAction = jest.fn();
    render(<RunResults {...props({ nextAction: invitation, onNextAction, onDeclineNextAction: jest.fn() })} />);
    fireEvent.click(screen.getByTestId('results-next-action'));
    expect(onNextAction).toHaveBeenCalledTimes(1);
  });

  it('shows no decline control for any ordinary next action', () => {
    render(<RunResults {...props({ onDeclineNextAction: jest.fn() })} />);
    expect(screen.queryByTestId('results-next-action-decline')).toBeNull();
  });
});
