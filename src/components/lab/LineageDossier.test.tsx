import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LineageDossier, type LineageDossierData } from './LineageDossier';

const runs = {
  completed: 12,
  extractions: 8,
  bestScore: 4200,
  bestYield: 1900,
  highestEnergy: 6,
  clanDepthDelivered: 5200,
  lastRunAt: '2026-07-29T12:00:00Z',
};

const DOSSIER: LineageDossierData = {
  id: 'dossier-1',
  variant: { id: 'variant-1', name: 'PRIMAL WARDEN', dynasty: 'PRIMAL', rarity: 'rare' },
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-30T00:00:00Z',
  highestActiveGeneration: 11,
  specimens: [
    {
      id: 'active-11',
      status: 'active',
      owned: true,
      equippable: true,
      generation: 11,
      parent1Id: 'active-10',
      parent2Id: 'parent-b',
      traits: [],
      lineage: null,
      acquiredAt: '2026-07-28T00:00:00Z',
      retiredAt: null,
      breedingHistoryId: 'breed-11',
      runs,
    },
    {
      id: 'retired-10',
      status: 'retired_refunded',
      owned: false,
      equippable: false,
      generation: 10,
      parent1Id: null,
      parent2Id: null,
      traits: [],
      lineage: null,
      acquiredAt: '2026-07-20T00:00:00Z',
      retiredAt: '2026-07-25T00:00:00Z',
      breedingHistoryId: 'breed-10',
      runs: { ...runs, completed: 4, extractions: 2 },
    },
  ],
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

it('shows the active passport and preserves a refunded generation as retired history', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ dossiers: [DOSSIER] }),
  });

  render(
    <LineageDossier accessToken="token" variantId="variant-1" specimenId="active-11" />
  );

  const dossier = await screen.findByTestId('lineage-dossier');
  expect(within(dossier).getByText('PRIMAL WARDEN lineage')).toBeInTheDocument();
  expect(within(dossier).getByText('Gen 11 passport')).toBeInTheDocument();
  expect(within(dossier).getByText('Highest active generation')).toBeInTheDocument();

  const retired = dossier.querySelector('[data-specimen-status="retired_refunded"]');
  expect(retired).toHaveAttribute('data-owned', 'false');
  expect(retired).toHaveAttribute('data-equippable', 'false');
  expect(retired).toHaveTextContent('Retired by refund');
});

it('does not invent a dossier when the server projection is unavailable', async () => {
  fetchMock.mockRejectedValueOnce(new Error('not deployed'));
  render(
    <LineageDossier accessToken="token" variantId="variant-1" specimenId="active-11" />
  );
  expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
  expect(screen.queryByTestId('lineage-dossier')).not.toBeInTheDocument();
});
