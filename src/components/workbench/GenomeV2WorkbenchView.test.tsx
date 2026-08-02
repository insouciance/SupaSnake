import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenomeV2WorkbenchView } from './WorkbenchView';
import {
  createGenomeV2State,
  genomeV2RunRecord,
  settleGenomeV2,
} from '@/shared/game/genomeV2';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

const PANEL = {
  snakes: [
    {
      id: 'cyber-4',
      name: 'Cyber Spark',
      dynasty: 'CYBER',
      generation: 4,
      equipped: true,
    },
    {
      id: 'primal-2',
      name: 'Primal Thorn',
      dynasty: 'PRIMAL',
      generation: 2,
      equipped: false,
    },
  ],
};

async function renderResearch() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => PANEL,
  }) as unknown as typeof fetch;
  await act(async () => {
    render(<GenomeV2WorkbenchView />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token' },
    isAuthenticated: true,
  });
});

describe('Genome v2 Research table', () => {
  it('renders six tactile loci and the three player-owned lenses', async () => {
    await renderResearch();
    expect(screen.getByTestId('workbench-loci').children).toHaveLength(6);
    expect(screen.getByTestId('workbench-lens-yield')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-lens-risk')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-lens-space')).toBeInTheDocument();
  });

  it('keeps dynasty legality visible instead of flattening every pool', async () => {
    await renderResearch();
    expect(screen.queryByTestId('workbench-gene-time_dilation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workbench-snake-primal'));
    expect(screen.getByTestId('workbench-gene-time_dilation')).toBeInTheDocument();
  });

  it('reveals exact Strain and future Splice consequences by tap', async () => {
    await renderResearch();
    fireEvent.click(screen.getByTestId('workbench-tier-AURUM-3'));
    expect(screen.getByTestId('workbench-strain-disclosure')).toHaveTextContent(
      /AURUM 3/i
    );
    expect(screen.getByTestId('workbench-strain-disclosure').textContent?.length).toBeGreaterThan(40);

    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-splice-path-splice_gilded_fork'));
    const disclosure = screen.getByTestId('workbench-splice-disclosure');
    expect(disclosure).toHaveTextContent('Rule');
    expect(disclosure).toHaveTextContent('Cost');
    expect(disclosure).toHaveTextContent(/Every fifth target/i);
  });

  it('lets the player discover a reaction without ranking the answer', async () => {
    await renderResearch();
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-thread'));
    fireEvent.click(screen.getByTestId('workbench-gene-overgrowth'));
    fireEvent.click(screen.getByTestId('workbench-thread'));

    expect(screen.getAllByText('Gilded Fork').length).toBeGreaterThan(0);
    const text = screen.getByTestId('workbench-view').textContent ?? '';
    expect(text).not.toMatch(/\bscore\b|recommended|ranking|best build/i);
  });

  it('invites a signed-out player without exposing a dead surface', async () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    await renderResearch();
    expect(screen.getByTestId('workbench-signed-out')).toBeInTheDocument();
  });

  it('re-opens a settled run through its opaque authenticated reference', async () => {
    const state = createGenomeV2State('CYBER');
    const record = genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      return {
        ok: true,
        json: async () => url.includes('/api/workbench/result/')
          ? { sessionId: '123e4567-e89b-42d3-a456-426614174000', genome: record }
          : PANEL,
      } as Response;
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <GenomeV2WorkbenchView studyRef="123e4567-e89b-42d3-a456-426614174000" />
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('workbench-run-study')).toBeInTheDocument();
    });
    expect(screen.getByTestId('workbench-run-study')).toHaveTextContent('BANK secured');
    expect(screen.getByTestId('workbench-study-loci').children).toHaveLength(6);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/workbench/result/123e4567-e89b-42d3-a456-426614174000',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      })
    );
  });
});
