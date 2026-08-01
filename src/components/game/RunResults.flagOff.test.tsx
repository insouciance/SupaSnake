import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RunResults, type RunResultsProps } from './RunResults';

jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: false,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

it('keeps settlement visible but suppresses the recognition ceremony when off', () => {
  const props: RunResultsProps = {
    outcome: 'extracted',
    practice: false,
    score: 420,
    dnaCredited: 180,
    yieldDna: 240,
    yieldBreakdown: null,
    energyCommitted: 1,
    commitmentMultiplierBps: 10_000,
    clanBattle: null,
    take: null,
    takeState: 'idle',
    onCollectTake: jest.fn(),
    impact: {
      version: 1,
      sessionId: 'session-1',
      settledAt: '2026-07-30T10:00:00.000Z',
      outcome: 'extracted',
      dynasty: 'CYBER',
      receipt: {
        validated: true,
        score: 440,
        yieldDna: 260,
        dnaCredited: 260,
        energyCommitted: 1,
        commitmentMultiplierBps: 10_000,
        generation: 3,
        personalBest: { eligible: true, before: 400, after: 440, improved: true },
      },
      impacts: [{
        key: 'mastery:CYBER:level:2',
        pillar: 'mastery',
        kind: 'mastery_level',
        significance: 'milestone',
        headline: 'CYBER Mastery M2',
        destination: 'mastery',
        artifactRef: 'CYBER',
      }],
      featuredImpactKeys: ['mastery:CYBER:level:2'],
      recommendedAction: null,
    },
    nextAction: {
      id: 'chronicle',
      label: 'Open your Chronicle',
      description: 'Review your career.',
      href: '/profile',
    },
    onNextAction: jest.fn(),
    onReplay: jest.fn(),
    onSetup: jest.fn(),
    replayPending: false,
    replayDisabled: false,
    replayEnergy: 1,
  };

  render(<RunResults {...props} />);

  expect(screen.getByTestId('results-score')).toHaveTextContent('440');
  expect(screen.getByTestId('results-personal-best')).toBeInTheDocument();
  expect(screen.getByTestId('impact-summary')).toHaveTextContent(
    'Persistent progress was secured by the server.'
  );
  expect(screen.queryByTestId('impact-victory-lap')).not.toBeInTheDocument();
});
