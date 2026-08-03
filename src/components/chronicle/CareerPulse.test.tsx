import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CareerPulse, type CareerPulseData } from './CareerPulse';
import { useNotificationStore } from '@/lib/stores/notificationStore';

jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: true,
}));

const PULSE: CareerPulseData = {
  generatedAt: '2026-07-30T12:00:00.000Z',
  mastery: [
    { dynasty: 'PRIMAL', xp: 14000, level: 4, nextLevelXp: 25000 },
    { dynasty: 'CYBER', xp: 3000, level: 2, nextLevelXp: 7000 },
    { dynasty: 'COSMIC', xp: 1000, level: 1, nextLevelXp: 3000 },
  ],
  records: {
    total: 21,
    tiered: 8,
    apex: 1,
    strongest: [{ id: 'risk_carrier', value: 6, tier: 5 }],
  },
  discovery: { entries: 12, worldFirsts: 1, genomeWeaverUnlocked: false },
  ladder: { bestByDynasty: { PRIMAL: 3, CYBER: 1, COSMIC: 2 }, maxBest: 3 },
  lineage: { dossiers: 3, activeSpecimens: 5, highestGeneration: 11 },
  clan: {
    honors: { participant: 2, victor: 1, stalemate: 0 },
    honorHistory: [
      {
        battleId: '550e8400-e29b-41d4-a716-446655440000',
        honor: 'victor',
        awardedAt: '2026-07-29T12:00:00.000Z',
      },
    ],
    activeBattle: {
      battleId: 'battle-1',
      cycleKey: 'cycle-7',
      endsAt: '2026-07-31T12:00:00.000Z',
      ownTopFive: [1000, 900, 800, 700, 600],
      fifthBest: 600,
      clanTotal: 9500,
      opponentTotal: 9100,
    },
  },
  recentMoments: [
    {
      id: 'moment-1',
      pillar: 'mastery',
      kind: 'mastery_level',
      significance: 'milestone',
      headline: 'PRIMAL M4 reached',
      securedAt: '2026-07-30T12:00:00.000Z',
      destination: 'mastery',
      artifactRef: 'PRIMAL',
      source: { type: 'session', id: 'session-1' },
    },
  ],
  pursuitCandidates: [
    {
      id: 'mastery:PRIMAL:5',
      pillar: 'mastery',
      kind: 'mastery_level',
      targetId: 'PRIMAL:5',
      headline: 'Reach PRIMAL M5',
      destination: 'mastery',
      current: 14000,
      target: 25000,
    },
  ],
  pinnedPursuit: null,
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
  useNotificationStore.setState({ notifications: {}, hasHydrated: true });
});

it('renders one quiet private view of the three pillars and own clan threshold', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ careerPulse: PULSE }),
  });

  render(<CareerPulse accessToken="token" />);

  expect(await screen.findByTestId('career-pulse')).toBeInTheDocument();
  expect(screen.getByText('Peak · PRIMAL M4')).toBeInTheDocument();
  expect(screen.getByTestId('mastery-summary-primal')).toHaveTextContent('PRIMAL');
  expect(screen.getByTestId('mastery-summary-primal')).toHaveTextContent('M4');
  expect(document.getElementById('mastery-CYBER')).not.toBeNull();
  expect(document.getElementById('mastery-PRIMAL')).not.toBeNull();
  expect(document.getElementById('mastery-COSMIC')).not.toBeNull();
  expect(
    screen.getByRole('link', { name: 'Open verified artifact for PRIMAL M4 reached' })
  ).toHaveAttribute('href', '/profile#mastery-PRIMAL');
  expect(screen.getByText('Gen 11')).toBeInTheDocument();
  expect(screen.getByText('12 Genome discoveries')).toBeInTheDocument();
  expect(screen.getByText(/Beat 600 Yield to improve your five/)).toBeInTheDocument();
  expect(screen.getByText(/Clan 9,500 · Rival 9,100/)).toBeInTheDocument();
  expect(screen.getByTestId('career-ladder-archive')).toBeInTheDocument();
  expect(document.getElementById('career-artifact-ladder-PRIMAL-3')).not.toBeNull();
  expect(document.getElementById('career-artifact-clan-battle-550e8400-e29b-41d4-a716-446655440000')).not.toBeNull();
  expect(screen.queryByText(/member|teammate|rank/i)).not.toBeInTheDocument();
});

it('marks only a Mastery artifact that is visibly rendered in You as seen', async () => {
  const masteryRecognition = {
    id: 'mastery-primal',
    kind: 'recognition' as const,
    status: 'unseen' as const,
    destination: 'mastery',
    headline: 'PRIMAL M4 reached',
    momentId: 'moment-primal',
    artifactRef: 'PRIMAL',
    source: { type: 'run', id: 'session-1' },
    createdAt: '2026-07-30T12:00:00.000Z',
  };
  const unknownRecognition = {
    ...masteryRecognition,
    id: 'mastery-unknown',
    momentId: 'moment-unknown',
    artifactRef: 'UNKNOWN',
  };
  useNotificationStore.getState().replaceServerItems([
    masteryRecognition,
    unknownRecognition,
  ]);
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ careerPulse: PULSE }) })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        item: {
          ...masteryRecognition,
          status: 'seen',
          seenAt: '2026-07-30T12:01:00.000Z',
        },
      }),
    });

  render(<CareerPulse accessToken="token" />);

  expect(await screen.findByTestId('mastery-summary-primal')).toBeVisible();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/progression/attention',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ id: 'mastery-primal', transition: 'seen' }),
      })
    );
  });
  expect(useNotificationStore.getState().notifications['mastery-primal']).toBeUndefined();
  expect(useNotificationStore.getState().notifications['mastery-unknown']).toBeDefined();
});

it('pins only an id supplied by the authoritative candidate list', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ careerPulse: PULSE }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        careerPulse: {
          ...PULSE,
          pinnedPursuit: { ...PULSE.pursuitCandidates[0], pinnedAt: '2026-07-30T12:01:00Z' },
        },
      }),
    });

  render(<CareerPulse accessToken="token" />);
  const select = await screen.findByLabelText('Choose a career pursuit');
  fireEvent.change(select, { target: { value: 'mastery:PRIMAL:5' } });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[1]).toEqual([
    '/api/progression/career-pulse',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ candidateId: 'mastery:PRIMAL:5' }),
    }),
  ]);
  expect(
    await screen.findByRole('progressbar', { name: 'Reach PRIMAL M5' })
  ).toBeInTheDocument();
});

it('degrades without fabricating progress when the read fails', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  render(<CareerPulse accessToken="token" />);
  expect(
    await screen.findByText(/progress remains secured/i)
  ).toBeInTheDocument();
});

it('renders the full permanent clan honor archive rather than starving old proof', async () => {
  const honorHistory = Array.from({ length: 11 }, (_, index) => ({
    battleId: `battle-${index + 1}`,
    honor: 'victor' as const,
    awardedAt: `2026-07-${String(29 - index).padStart(2, '0')}T12:00:00.000Z`,
  }));
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      careerPulse: { ...PULSE, clan: { ...PULSE.clan, honorHistory } },
    }),
  });

  render(<CareerPulse accessToken="token" />);

  expect(await screen.findByTestId('career-pulse')).toBeInTheDocument();
  expect(document.getElementById('career-artifact-clan-battle-battle-11')).not.toBeNull();
});

it('does not clear an unknown Chronicle ref merely because it is in the recent feed', async () => {
  useNotificationStore.getState().replaceServerItems([{
    id: 'future-artifact',
    kind: 'recognition',
    status: 'unseen',
    destination: 'chronicle',
    headline: 'Future proof',
    momentId: 'future-moment',
    artifactRef: 'future:proof',
    source: { type: 'moment', id: 'future-moment' },
    createdAt: '2026-07-30T12:00:00.000Z',
  }]);
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      careerPulse: {
        ...PULSE,
        recentMoments: [{
          ...PULSE.recentMoments[0],
          destination: 'chronicle',
          artifactRef: 'future:proof',
        }],
      },
    }),
  });

  render(<CareerPulse accessToken="token" />);

  expect(await screen.findByTestId('career-pulse')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(
    '/api/progression/attention',
    expect.objectContaining({ method: 'PATCH' })
  );
  expect(useNotificationStore.getState().notifications['future-artifact']).toBeDefined();
});
