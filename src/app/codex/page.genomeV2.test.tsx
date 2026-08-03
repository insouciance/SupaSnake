import { fireEvent, render, screen } from '@testing-library/react';
import CodexPage from './page';
import { LegacyGenomeArchive } from '@/components/game/genome/LegacyGenomeArchive';

jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, isAuthenticated: false }),
}));
jest.mock('@/lib/stores/codexStore', () => ({
  useCodexStore: () => ({
    ownerId: null,
    live: false,
    unlocked: false,
    bankedRuns: 0,
    unlockAt: 0,
    data: null,
    isLoading: false,
    error: null,
    fetchCodex: jest.fn(),
    reset: jest.fn(),
  }),
}));
jest.mock('@/components/ui/NavBar', () => ({ NavBar: () => <nav /> }));

describe('Genome v2 Codex rollout', () => {
  it('shows the v2 reaction atlas while keeping ordinary rules public', () => {
    render(<CodexPage />);
    expect(screen.getByTestId('genome-strategy-atlas')).toHaveAttribute(
      'data-rules-version',
      '2'
    );
    expect(screen.getByTestId('atlas-splice-archive')).toHaveTextContent(
      /Coilkeeper.*Overgrowth/
    );
    expect(screen.getByTestId('lexicon-mechanics')).toBeInTheDocument();
    expect(screen.queryByTestId('lexicon-strains')).not.toBeInTheDocument();
  });

  it('keeps v1 records in a collapsed, read-only archive beneath active Research', () => {
    render(
      <LegacyGenomeArchive
        archive={{
          rulesVersion: 1,
          recorded: 2,
          sampleSize: 1,
          genes: [{
            id: 'static_charge',
            rulesVersion: 1,
            name: 'Static Charge',
            kind: 'EP',
            strains: ['VOLT'],
            effect: 'A food eaten after fasting pays more.',
            cost: 'Portal windows are shorter.',
            discovered: true,
            firstDiscoveredAt: '2026-07-01T00:00:00Z',
            worldFirstAt: null,
            picks: 1,
            banks: 1,
          }],
          splices: [{
            id: 'splice_black_magnet',
            rulesVersion: 1,
            name: 'Black Magnet',
            parents: ['magnet_pulse', 'gravity_well'],
            strains: ['FLUX'],
            effect: 'Pull radius 4',
            cost: 'Food and portal costs.',
            discoveries: 1,
            banks: 1,
            discovered: true,
            firstDiscoveredAt: '2026-07-02T00:00:00Z',
            worldFirstAt: null,
            rewardDna: 250,
          }],
        }}
      />
    );
    const archive = screen.getByTestId('codex-legacy-archive');
    expect(archive).not.toHaveAttribute('open');
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open history'));
    expect(archive).toHaveAttribute('open');
    expect(screen.getByTestId('codex-legacy-gene-static_charge')).toHaveTextContent(
      'Static Charge'
    );
    expect(screen.getByTestId('codex-legacy-splice-splice_black_magnet')).toHaveTextContent(
      'Recipe: Magnet Pulse + Gravity Well'
    );
  });
});
