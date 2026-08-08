import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenomeV2WorkbenchView } from './WorkbenchView';
import {
  createGenomeV2State,
  genomeV2RunRecord,
  settleGenomeV2,
  GENOME_V2_SPLICES,
} from '@/shared/game/genomeV2';
import { GENOME_V2_GENES, genomeV2ActivePool } from '@/shared/game/genes';
import { STRAINS } from '@/shared/game/strains';

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

const PANEL_B = {
  snakes: [
    {
      id: 'cosmic-7',
      name: 'Cosmic Crown',
      dynasty: 'COSMIC',
      generation: 7,
      equipped: true,
    },
  ],
};

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function renderResearch() {
  global.fetch = jest.fn().mockResolvedValue(response(PANEL)) as unknown as typeof fetch;
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<GenomeV2WorkbenchView />);
  });
  return result;
}

/**
 * SLOT-FIRST (owner ruling, D1). The powers are no longer a permanent rail at
 * the foot of the tray; they are the contents of a picker that opens ON the
 * slot being filled. So every test that used to click a power now opens its
 * slot first, which is exactly the sequence a player performs.
 *
 * Which slot is open is DERIVED, not chosen: `genomeV2Workbench.firstOpenSlot`
 * fills the lowest empty index and the `thread`/`infuse` actions carry no slot
 * of their own, so the surface can only honestly offer the cell the reducer
 * will actually use. On a fresh bench that is slot 0; after one TAKE it is
 * slot 1. These helpers name that rather than hiding it, because a test that
 * silently assumed a different cell would be asserting a placement the engine
 * does not make.
 */
function openBenchSlot(slot = 0) {
  fireEvent.click(screen.getByTestId(`workbench-locus-${slot}`));
}

function takePower(geneId: string, slot = 0) {
  openBenchSlot(slot);
  fireEvent.click(screen.getByTestId(`workbench-gene-${geneId}`));
  fireEvent.click(screen.getByTestId('workbench-thread'));
}

/**
 * Six CYBER powers that share no Combo recipe with one another.
 *
 * A full bench is the only state in which a slot offers SWAP, so the swap and
 * swap-highlighting contracts have to reach it — but any pair that fuses would
 * merge two loci into one Combo and leave the bench SHORT of six, which is a
 * different state wearing the same description. Checked against
 * `GENOME_V2_SPLICES`: none of Golden Hour, Straight Shot, Loop Trap, Wall
 * Bounce, Split Bet and Double or Nothing name another as a parent.
 */
const NON_COMBINING_SIX = [
  'gold_trail',
  'live_wire',
  'coilkeeper',
  'wall_rush',
  'mirror_wager',
  'loan_shark',
] as const;

function fillBench() {
  NON_COMBINING_SIX.forEach((geneId, slot) => takePower(geneId, slot));
}

/** Every Combo/path mark currently on screen, as rendered text. */
function marks(): string[] {
  return screen.queryAllByTestId(/-match$/).map((mark) => mark.textContent ?? '');
}

function optionOrder(): string[] {
  return Array.from(screen.getByTestId('workbench-gene-palette').children).map(
    (option) => option.getAttribute('data-testid') ?? ''
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token', user: { id: 'user-a' } },
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

  it('keeps the full focused gene name visible and every Strain rung at the 44px target contract', async () => {
    await renderResearch();
    openBenchSlot();
    fireEvent.click(screen.getByTestId('workbench-gene-compound_interest'));
    expect(screen.getByTestId('workbench-focused-gene-name')).toHaveTextContent(
      'Stash'
    );

    for (const tier of [2, 3, 4]) {
      expect(screen.getByTestId(`workbench-tier-AURUM-${tier}`)).toHaveClass(
        'min-h-11',
        'min-w-11'
      );
    }
  });

  it('keeps dynasty legality visible instead of flattening every pool', async () => {
    await renderResearch();
    openBenchSlot();
    expect(screen.queryByTestId('workbench-gene-time_dilation')).not.toBeInTheDocument();

    // Switching specimen is off the tray, so it dismisses the picker the way
    // any tap outside does. The Dynasty's own pool is read by opening a slot
    // again — the legality lives in the pool, never in the picker's memory.
    fireEvent.click(screen.getByTestId('workbench-snake-primal'));
    openBenchSlot();
    expect(screen.getByTestId('workbench-gene-time_dilation')).toBeInTheDocument();
  });

  it('shows every gene Strain at first glance, including both halves of a dual-Strain gene', async () => {
    await renderResearch();
    // FIRST GLANCE IS NOW THE PICKER'S FIRST SCREEN. The contract is unchanged
    // — both halves of a dual-Strain gene are legible before any inspection,
    // TACTICAL_GENOME_V2 §2 — but the surface the player meets a power on is
    // the option list inside the slot's picker, so that is where it is read.
    openBenchSlot();
    expect(screen.getByTestId('workbench-gene-loan_shark-strain-AURUM')).toBeVisible();
    expect(screen.getByTestId('workbench-gene-loan_shark-strain-UMBRA')).toBeVisible();

    fireEvent.click(screen.getByTestId('workbench-gene-loan_shark'));
    expect(screen.getByTestId('workbench-focused-gene-strain-AURUM')).toBeVisible();
    expect(screen.getByTestId('workbench-focused-gene-strain-UMBRA')).toBeVisible();
    fireEvent.click(screen.getByTestId('workbench-thread'));
    expect(screen.getByTestId('workbench-locus-0-strain-AURUM')).toBeVisible();
    expect(screen.getByTestId('workbench-locus-0-strain-UMBRA')).toBeVisible();
  });

  it('reveals exact Strain and future Splice consequences by tap', async () => {
    await renderResearch();
    fireEvent.click(screen.getByTestId('workbench-tier-AURUM-3'));
    expect(screen.getByTestId('workbench-strain-disclosure')).toHaveTextContent(
      /Gold 3/i
    );
    expect(screen.getByTestId('workbench-strain-disclosure').textContent?.length).toBeGreaterThan(40);

    // The ladder is a tray readout and stays outside the picker; the Splice
    // branches belong to a power, so they are read where the power is chosen.
    openBenchSlot();
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    fireEvent.click(screen.getByTestId('workbench-splice-path-splice_gilded_fork'));
    const disclosure = screen.getByTestId('workbench-splice-disclosure');
    expect(disclosure).toHaveTextContent('Rule');
    expect(disclosure).toHaveTextContent('Cost');
    expect(disclosure).toHaveTextContent(/Every 5th food/i);
  });

  it('lets the player discover a reaction without ranking the answer', async () => {
    await renderResearch();
    takePower('gold_trail', 0);
    takePower('overgrowth', 1);

    expect(screen.getAllByText('The Bag').length).toBeGreaterThan(0);
    const text = screen.getByTestId('workbench-view').textContent ?? '';
    expect(text).not.toMatch(/\bscore\b|recommended|ranking|best build/i);
  });

  it('keeps the complete research instrument playable before sign-in', async () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    const view = await renderResearch();
    expect(screen.getByTestId('workbench-public-research')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-loci').children).toHaveLength(6);
    fireEvent.click(screen.getByTestId('workbench-snake-primal'));
    openBenchSlot();
    expect(screen.getByTestId('workbench-gene-time_dilation')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({
      session: { access_token: 'token', user: {} },
      isAuthenticated: true,
    });
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-public-research')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-loci').children).toHaveLength(6);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed across player A logout and player B login while B loads', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const playerB = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-b'
        ? playerB.promise
        : Promise.resolve(response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    takePower('gold_trail');
    expect(screen.getByText('1 move')).toBeInTheDocument();

    authState = { session: null, isAuthenticated: false } as unknown as typeof authState;
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-public-research')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();

    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();

    await act(async () => {
      playerB.resolve(response(PANEL_B));
      await playerB.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('ignores a stale slow response after the authenticated owner changes', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const playerA = deferred<Response>();
    const playerB = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-a' ? playerA.promise : playerB.promise;
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      playerB.resolve(response(PANEL_B));
      await playerB.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    });

    await act(async () => {
      playerA.resolve(response(PANEL));
      await playerA.promise;
    });
    expect(screen.getByTestId('workbench-snake-cosmic')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-snake-cyber')).not.toBeInTheDocument();
  });

  it('keeps a panel failure fail-closed while public Research remains playable', async () => {
    let authState = {
      session: { access_token: 'token-a', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return Promise.resolve(authorization === 'Bearer token-b'
        ? response({ error: 'Player B collection is unavailable.' }, false)
        : response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    takePower('gold_trail');
    expect(screen.getByText('1 move')).toBeInTheDocument();

    authState = {
      session: { access_token: 'token-b', user: { id: 'user-b' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);

    await waitFor(() => {
      expect(screen.getByTestId('workbench-error')).toHaveTextContent(
        'Player B collection is unavailable.'
      );
    });
    expect(screen.getByTestId('workbench-error')).toHaveTextContent(
      'Public research specimens remain available below.'
    );
    expect(screen.getByTestId('workbench-snake-cyber')).toHaveTextContent('Gen 1');
    expect(screen.getByTestId('workbench-snake-primal')).toHaveTextContent('Gen 1');
    expect(screen.getByTestId('workbench-snake-cosmic')).toHaveTextContent('Gen 1');
    expect(screen.queryByText('Gen 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Gen 2')).not.toBeInTheDocument();
    expect(screen.queryByText('1 move')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workbench-snake-primal'));
    takePower('time_dilation');
    expect(screen.getByText('1 move')).toBeInTheDocument();
  });

  it('preserves the current experiment across a same-owner token refresh', async () => {
    let authState = {
      session: { access_token: 'token-a-1', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    mockUseAuth.mockImplementation(() => authState);
    const refreshed = deferred<Response>();
    global.fetch = jest.fn((_, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return authorization === 'Bearer token-a-2'
        ? refreshed.promise
        : Promise.resolve(response(PANEL));
    }) as unknown as typeof fetch;

    const view = render(<GenomeV2WorkbenchView />);
    await waitFor(() => {
      expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    });
    takePower('gold_trail');
    expect(screen.getByText('1 move')).toBeInTheDocument();

    authState = {
      session: { access_token: 'token-a-2', user: { id: 'user-a' } },
      isAuthenticated: true,
    };
    view.rerender(<GenomeV2WorkbenchView />);
    expect(screen.getByTestId('workbench-snake-cyber')).toBeInTheDocument();
    expect(screen.getByText('1 move')).toBeInTheDocument();

    await act(async () => {
      refreshed.resolve(response(PANEL));
      await refreshed.promise;
    });
    await waitFor(() => {
      expect(screen.getByText('1 move')).toBeInTheDocument();
    });
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

  it('describes an unreached Dampened Minor as available, never already active', async () => {
    const state = createGenomeV2State('PRIMAL', {
      startingStrainPoints: { AURUM: 1 },
      suppressedStrains: ['AURUM'],
    });
    const record = genomeV2RunRecord(state, settleGenomeV2(state, 'bank'));
    global.fetch = jest.fn(async (input) => ({
      ok: true,
      json: async () => String(input).includes('/api/workbench/result/')
        ? { sessionId: '123e4567-e89b-42d3-a456-426614174001', genome: record }
        : PANEL,
    } as Response)) as unknown as typeof fetch;

    await act(async () => {
      render(
        <GenomeV2WorkbenchView studyRef="123e4567-e89b-42d3-a456-426614174001" />
      );
    });

    const study = await screen.findByTestId('workbench-run-study');
    const aurum = study.querySelector('[data-testid="workbench-strain-AURUM"]');
    expect(aurum).toHaveTextContent(
      'Dampened · Level I still works; higher levels are capped'
    );
    expect(aurum).not.toHaveTextContent('Minor stays active');
  });
});

/**
 * SWAP — the move slot-first newly makes sayable.
 *
 * Gene-first picking could not express this. The rail chose a POWER and the
 * reducer chose where it landed, so "replace what slot 3 holds" had no
 * sentence: the only question the surface asked was which power you liked.
 * Once the slot is the question, replacing its contents becomes a first-class
 * move — and the only move on this instrument that destroys something.
 *
 * These lock the Recode grammar the Constitution already states, at the
 * surface that now exposes it: a swap is offered only when the bench is full,
 * it lands in the slot the player pointed at, and what it displaces is gone.
 */
describe('Genome v2 Research table · swapping a held slot', () => {
  it('lands the replacement in the slot the player pointed at and leaves with it', async () => {
    await renderResearch();
    fillBench();
    expect(
      screen.getByText('All six slots are full. Tap one to swap it.')
    ).toBeInTheDocument();

    openBenchSlot(0);
    const picker = screen.getByTestId('workbench-picker');
    expect(picker).toHaveAttribute('data-mode', 'swap');
    // The heading names the power leaving, because the slot — not the
    // catalog — is what the player is being asked about.
    expect(picker).toHaveTextContent(
      `swap out ${GENOME_V2_GENES.gold_trail.name}`
    );

    // Redline shares no recipe with anything held, so this is a swap and only
    // a swap: no Combo forms to move the result to another locus.
    fireEvent.click(screen.getByTestId('workbench-gene-zenith_protocol'));
    const swap = screen.getByTestId('workbench-recode');
    expect(swap).toBeEnabled();
    expect(swap).toHaveTextContent('SWAP');
    fireEvent.click(swap);

    expect(screen.getByTestId('workbench-locus-0')).toHaveTextContent(
      GENOME_V2_GENES.zenith_protocol.name
    );
    expect(screen.getByTestId('workbench-loci')).not.toHaveTextContent(
      GENOME_V2_GENES.gold_trail.name
    );
    // Committing answers the question, so the panel that asked it goes.
    expect(screen.queryByTestId('workbench-picker')).not.toBeInTheDocument();
    expect(screen.getByText('7 moves')).toBeInTheDocument();
  });

  it('warns that the displaced power is gone for good, then never re-offers it', async () => {
    await renderResearch();
    fillBench();
    openBenchSlot(0);
    fireEvent.click(screen.getByTestId('workbench-gene-zenith_protocol'));
    // The destruction is stated BEFORE the commit, on the same panel as the
    // button that performs it — a swap is the one irreversible move here.
    expect(screen.getByTestId('workbench-picker')).toHaveTextContent(
      `${GENOME_V2_GENES.gold_trail.name} leaves for good`
    );
    fireEvent.click(screen.getByTestId('workbench-recode'));

    // A displaced power has been SEEN, and the pool never re-offers what a run
    // has already spent. Re-offering it would sell the player a power the
    // reducer would refuse.
    openBenchSlot(1);
    expect(screen.queryByTestId('workbench-gene-gold_trail')).not.toBeInTheDocument();
  });

  it('offers a read rather than a swap while an open slot remains', async () => {
    await renderResearch();
    NON_COMBINING_SIX.slice(0, 5).forEach((geneId, slot) => takePower(geneId, slot));

    // Five held, one open. A swap here would destroy a power to solve a
    // problem the open slot already solves for free, so the held slot opens
    // to be READ and the picker says when swapping becomes available.
    openBenchSlot(0);
    expect(screen.getByTestId('workbench-picker')).toHaveAttribute('data-mode', 'read');
    expect(screen.getByTestId('workbench-picker-held')).toHaveTextContent(
      'Swapping this slot opens once all six are full.'
    );
    expect(screen.queryByTestId('workbench-recode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-gene-palette')).not.toBeInTheDocument();
  });
});

/**
 * HIGHLIGHTING — what the second slot knows that the first cannot.
 *
 * A rail at the foot of the tray had no occasion to say this: it was the same
 * list whatever the bench held. A picker opened at a slot is asked a narrower
 * question — what goes HERE, next to THAT — so it can mark the options that
 * combo or share a path with what is already held.
 *
 * Every claim below is checked against the rules tables the component reads
 * (`GENOME_V2_SPLICES` for recipes, `STRAINS` for path names, the catalog for
 * gene names) rather than against copied strings, so a rename in the rules
 * moves these tests with it instead of leaving them asserting a dead label.
 */
describe('Genome v2 Research table · partner and strain-mate highlighting', () => {
  it('marks nothing on an empty bench, because there is nothing yet to pair with', async () => {
    await renderResearch();
    openBenchSlot(0);
    expect(marks()).toHaveLength(0);
    expect(screen.getByTestId('workbench-picker')).toHaveTextContent(
      'Catalog order · nothing here is ranked.'
    );
  });

  it('marks the Combo partners and path-mates of what is already held', async () => {
    await renderResearch();
    takePower('gold_trail', 0);
    openBenchSlot(1);

    // Stash both completes a recipe with Golden Hour and walks the same path,
    // so it carries both marks. The Combo claim is the strong one — the engine
    // has projected that threading it FORMS the recipe.
    const stash = screen.getByTestId('workbench-gene-compound_interest-match');
    expect(stash).toHaveTextContent(
      `MAKES ${GENOME_V2_SPLICES.splice_dragon_hoard.name}`
    );
    expect(stash).toHaveTextContent(`SHARES ${STRAINS.AURUM.name.toUpperCase()}`);

    // Feast forms a recipe with Golden Hour but walks a different path: a
    // Combo mark and no path mark. The two facts are independent and neither
    // is allowed to imply the other.
    const feast = screen.getByTestId('workbench-gene-overgrowth-match');
    expect(feast).toHaveTextContent(
      `MAKES ${GENOME_V2_SPLICES.splice_gilded_fork.name}`
    );
    expect(feast).not.toHaveTextContent('SHARES');

    // Double or Nothing shares the path and no recipe: the mirror case.
    const deal = screen.getByTestId('workbench-gene-loan_shark-match');
    expect(deal).toHaveTextContent(`SHARES ${STRAINS.AURUM.name.toUpperCase()}`);
    expect(deal).not.toHaveTextContent('MAKES');

    // A power with neither relation is left alone. Marking everything would
    // mark nothing.
    expect(
      screen.queryByTestId('workbench-gene-live_wire-match')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('workbench-gene-live_wire')).not.toHaveAttribute(
      'data-match'
    );
  });

  it('highlights without reordering, because catalog order is the only order that ranks nothing', async () => {
    await renderResearch();
    takePower('gold_trail', 0);
    openBenchSlot(1);

    // Sorting the marked options to the top would be a recommendation, which
    // is the one thing this instrument may never make. The list stays in the
    // pool's own order and lets the marks do the speaking.
    expect(optionOrder()).toEqual(
      genomeV2ActivePool('CYBER')
        .filter((geneId) => geneId !== 'gold_trail')
        .map((geneId) => `workbench-gene-${geneId}`)
    );
    // Concretely: Feast is marked and still sits behind two unmarked powers.
    expect(optionOrder().indexOf('workbench-gene-overgrowth')).toBeGreaterThan(
      optionOrder().indexOf('workbench-gene-live_wire')
    );
  });

  it('weakens the Combo claim to a pairing when the move is a swap', async () => {
    await renderResearch();
    fillBench();
    openBenchSlot(0);

    // A swap cannot promise a Combo. The engine only projects `completesSplice`
    // through a thread, and a full bench has nothing to thread into — so the
    // strong claim is not merely withheld here, it is unavailable. What is
    // left is the honest one: these two belong to one recipe.
    expect(screen.getByTestId('workbench-picker')).not.toHaveTextContent('MAKES');

    const phoenix = screen.getByTestId('workbench-gene-phoenix-match').textContent ?? '';
    expect(phoenix).toMatch(/^PAIRS WITH /);
    // Whatever it names must actually be on the bench — a pairing with a power
    // the player does not hold is not a reason to take anything.
    const partner = phoenix.replace(/^PAIRS WITH /, '').split('SHARES')[0];
    expect(NON_COMBINING_SIX.map((geneId) => GENOME_V2_GENES[geneId].name)).toContain(
      partner
    );

    // THE EXCLUSION. Stash's only bench partner is Golden Hour, which is the
    // power this swap removes. Crediting that pairing would sell a Combo that
    // the very act of taking it destroys, so Stash keeps only the path mark it
    // earns from Double or Nothing.
    const stash = screen.getByTestId('workbench-gene-compound_interest-match');
    expect(stash).not.toHaveTextContent('PAIRS WITH');
    expect(stash).toHaveTextContent(`SHARES ${STRAINS.AURUM.name.toUpperCase()}`);
  });
});

/**
 * DISMISSAL — the way out of a panel that can spend.
 *
 * The rail could not be dismissed because it was never open; it was furniture.
 * A picker is a question, and a question needs an answer that is not an answer.
 * Every route out below leaves the plan byte-identical, which is what makes
 * opening a slot a safe thing to do — and a player who cannot back out of a
 * surface stops touching it.
 */
describe('Genome v2 Research table · dismissing the picker', () => {
  it('closes on a tap away and spends nothing', async () => {
    await renderResearch();
    openBenchSlot(0);
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));
    expect(screen.getByTestId('workbench-focused-reaction')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workbench-picker-catcher'));
    expect(screen.queryByTestId('workbench-picker')).not.toBeInTheDocument();
    // A selection is not a purchase. The slot is as open as it was.
    expect(screen.getByText('0 moves')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-locus-0')).toHaveTextContent('OPEN');
  });

  it('closes on Escape and spends nothing', async () => {
    await renderResearch();
    openBenchSlot(0);
    fireEvent.click(screen.getByTestId('workbench-gene-gold_trail'));

    // Escape is the keyboard's tap-away. Without it the panel is a trap for
    // anyone not using a pointer.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('workbench-picker')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('dismisses through a written NOT NOW rather than a close cross', async () => {
    await renderResearch();
    openBenchSlot(0);
    const picker = screen.getByTestId('workbench-picker');

    // A cross beside a live choice reads as a decision — players click it to
    // mean "no" and cannot tell it from "cancel my selection" or "undo". On a
    // surface where the neighbouring buttons SPEND, the way out has to say in
    // words that it costs nothing.
    expect(screen.getByTestId('workbench-picker-close')).toHaveTextContent('NOT NOW');
    const crosses = Array.from(picker.querySelectorAll('button')).filter(
      (button) =>
        /^[×✕✖✗xX]$/.test((button.textContent ?? '').trim())
        || /close/i.test(button.getAttribute('aria-label') ?? '')
    );
    expect(crosses).toHaveLength(0);

    fireEvent.click(screen.getByTestId('workbench-picker-close'));
    expect(screen.queryByTestId('workbench-picker')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('keeps the tap-away catcher alive only while the picker is open', async () => {
    await renderResearch();
    // A permanent invisible full-viewport layer would swallow taps meant for
    // the tray, so it exists exactly as long as there is something to dismiss.
    expect(screen.queryByTestId('workbench-picker-catcher')).not.toBeInTheDocument();
    openBenchSlot(0);
    expect(screen.getByTestId('workbench-picker-catcher')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('workbench-picker-catcher')).not.toBeInTheDocument();
  });

  it('closes when the slot that opened it is tapped again', async () => {
    await renderResearch();
    openBenchSlot(0);
    expect(screen.getByTestId('workbench-picker')).toBeInTheDocument();
    // The slot is a toggle: the thing that asked the question withdraws it.
    openBenchSlot(0);
    expect(screen.queryByTestId('workbench-picker')).not.toBeInTheDocument();
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });

  it('drops the selection when the question moves to another slot', async () => {
    await renderResearch();
    fillBench();
    openBenchSlot(0);
    fireEvent.click(screen.getByTestId('workbench-gene-zenith_protocol'));
    expect(screen.getByTestId('workbench-focused-reaction')).toBeInTheDocument();

    // Tapping another slot moves the picker there rather than costing a tap to
    // close first — the catcher deliberately sits below the slot row. The
    // selection must NOT travel: it was an answer to a different question, and
    // carrying it over would arm a commit the player never aimed at this slot.
    openBenchSlot(1);
    expect(screen.getByTestId('workbench-picker')).toHaveTextContent(
      `swap out ${GENOME_V2_GENES.live_wire.name}`
    );
    expect(screen.queryByTestId('workbench-focused-reaction')).not.toBeInTheDocument();
    expect(screen.getByText('6 moves')).toBeInTheDocument();
  });
});
