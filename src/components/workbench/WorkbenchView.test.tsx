/**
 * THE HONESTY CONSTRAINTS ARE ON SCREEN (WP-2.08).
 *
 * The Workbench's four constraints are the point of the feature, not
 * decoration around it, and every one of them is a sentence a future edit
 * could delete without breaking a single other test. So each is asserted here
 * as rendered output rather than as a comment:
 *
 *   1. Yield is not rawDna — all three numbers and both multipliers render.
 *   2. A projection is a floor, and says so, and names what it left out.
 *   3. Three labelled bases from the player's own history, with sample sizes.
 *   4. Slot 1 only, labelled "before overrides"; the two overrides stated
 *      CONDITIONALLY; and no slot-2 figure anywhere on the screen.
 *
 * Plus the shape decision that makes the rest work: a plan is an ordered list
 * with a stated cadence and no free-text food field.
 */

import { render, screen, within, act } from '@testing-library/react';
import { WorkbenchView } from '@/components/workbench/WorkbenchView';
import { GENOME_SPAWN } from '@/shared/game/genes';

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: false }));

const PANEL = {
  live: true,
  snakes: [
    {
      id: 'snake-1',
      name: 'CYBER SPARK',
      dynasty: 'CYBER',
      generation: 4,
      traits: [],
      lineage: { strains: ['AURUM'], strength: 1 },
      masteryLevel: 10,
      equipped: true,
    },
    {
      id: 'snake-2',
      name: 'PRIMAL THORN',
      dynasty: 'PRIMAL',
      generation: 2,
      traits: [],
      lineage: null,
      masteryLevel: 6,
      equipped: false,
    },
  ],
  account: {
    bankedRuns: 40,
    ownedVariants: 6,
    seasonalGeneIds: [],
    gauntletBan: null,
    runFoods: [40, 90, 120, 60, 150],
  },
  contexts: [
    {
      id: 'week',
      label: 'This week’s Serpent',
      name: 'Gold Rush',
      summary: 'The board pays gold.',
      anomaly: 'gold_rush',
      clauses: ['clause:deep_apex'],
    },
    {
      id: 'neutral',
      label: 'No condition',
      name: 'No condition',
      summary: 'Ordinary rules.',
      anomaly: null,
      clauses: [],
    },
  ],
};

async function renderWorkbench(panel: unknown = PANEL) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => panel,
  }) as unknown as typeof fetch;

  await act(async () => {
    render(<WorkbenchView />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    session: { access_token: 'token' },
    isAuthenticated: true,
  });
});

describe('the Workbench reads the player’s own inventory', () => {
  it('opens with a plan already computed rather than an empty form', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-view')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-plan-list')).toBeInTheDocument();
  });

  it('ranks every snake the account holds for the selected week', async () => {
    await renderWorkbench();
    const ranking = screen.getByTestId('workbench-ranking');
    expect(within(ranking).getByTestId('workbench-rank-snake-1')).toBeInTheDocument();
    expect(within(ranking).getByTestId('workbench-rank-snake-2')).toBeInTheDocument();
  });

  it('invites a signed-out visitor rather than showing an empty tool', async () => {
    mockUseAuth.mockReturnValue({ session: null, isAuthenticated: false });
    await renderWorkbench();
    expect(screen.getByTestId('workbench-signed-out')).toBeInTheDocument();
  });
});

describe('constraint 1 — Yield is not rawDna', () => {
  it('shows raw DNA, banked, salvaged and BOTH multipliers', async () => {
    await renderWorkbench();
    const floor = screen.getByTestId('workbench-projection-floor');
    expect(within(floor).getByText('Raw DNA')).toBeInTheDocument();
    expect(within(floor).getByTestId('workbench-banked-floor')).toBeInTheDocument();
    expect(within(floor).getByTestId('workbench-salvaged-floor')).toBeInTheDocument();
    // Two multipliers, rendered as ×N.NN — one for each outcome.
    expect(within(floor).getAllByText(/^×\d+\.\d\d$/)).toHaveLength(2);
  });
});

describe('constraint 2 — a projection is a floor, not a forecast', () => {
  it('says so, in those words', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-floor-label')).toHaveTextContent(
      /floor, not a forecast/i
    );
  });

  it('names what the floor left out rather than folding it in', async () => {
    await renderWorkbench();
    // Either the exclusions list or the explicit "this plan claims nothing"
    // line — never silence, which would read as "there is nothing more".
    const stated =
      screen.queryByTestId('workbench-excluded') ??
      screen.queryByTestId('workbench-excluded-none');
    expect(stated).toBeInTheDocument();
  });
});

describe('constraint 3 — three labelled bases, with their sample sizes', () => {
  it('reads the plan at the floor, the median and the best', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-projection-floor')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-projection-median')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-projection-best')).toBeInTheDocument();
  });

  it('shows how many runs each history base was drawn from', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-sample-median')).toHaveTextContent('from 5 runs');
    expect(screen.getByTestId('workbench-sample-best')).toHaveTextContent('from 5 runs');
    // The floor is derived from the plan, and says that rather than "0 runs".
    expect(screen.getByTestId('workbench-sample-floor')).toHaveTextContent(
      /derived from the plan/i
    );
  });

  it('falls back to the plan’s own floor alone when there is no history', async () => {
    await renderWorkbench({
      ...PANEL,
      account: { ...PANEL.account, runFoods: [] },
    });
    expect(screen.getByTestId('workbench-projection-floor')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-projection-median')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-projection-best')).not.toBeInTheDocument();
  });
});

describe('constraint 4 — slot 1 only, and no slot-2 figure anywhere', () => {
  it('labels the shares as being before the overrides', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-offer-caveat')).toHaveTextContent(
      /before overrides/i
    );
  });

  it('states the pity rule CONDITIONALLY — it cannot know recentOffers', async () => {
    await renderWorkbench();
    const overrides = screen.getByTestId('workbench-overrides');
    expect(overrides).toHaveTextContent(/if your last \d+ offers/i);
    expect(overrides).toHaveTextContent(/cannot know whether it has fired/i);
  });

  it('names the lineage override only when the snake actually carries one', async () => {
    await renderWorkbench();
    // snake-1 has a strength-1 AURUM lineage, so the BIAS is named…
    expect(screen.getByTestId('workbench-overrides')).toHaveTextContent(/lineage/i);
  });

  it('quotes no slot-2 number, and says why', async () => {
    await renderWorkbench();
    const refusal = screen.getByTestId('workbench-slot2-refusal');
    expect(refusal).toHaveTextContent(/Slot 2 is not quoted/);
    expect(refusal).toHaveTextContent(/will not guess/);

    // And the refusal is real: no percentage on the whole screen is attached
    // to a second slot.
    const screenText = screen.getByTestId('workbench-view').textContent ?? '';
    expect(screenText).not.toMatch(/slot 2[^.]*\d+(\.\d+)?%/i);
  });
});

describe('a loadout is an ordered plan with a cadence, never a food field', () => {
  it('states the cadence it derives pick foods from', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-plan')).toHaveTextContent(
      `one every ${GENOME_SPAWN.intervalBase} foods`
    );
  });

  it('shows the food each planned pick is assumed to land at', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-plan-food-0')).toHaveTextContent(
      `food ${GENOME_SPAWN.intervalBase}`
    );
  });

  it('offers reordering, because the order is the plan', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-plan-down-0')).toBeInTheDocument();
  });

  it('has no free-text food input anywhere', async () => {
    await renderWorkbench();
    const view = screen.getByTestId('workbench-view');
    for (const input of Array.from(view.querySelectorAll('input'))) {
      expect(['number', 'text']).not.toContain(input.getAttribute('type'));
    }
  });

  it('lists the assumptions a reading rests on rather than burying them', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-assumptions')).toBeInTheDocument();
  });
});

describe('no Score is projected, on screen or anywhere behind it', () => {
  it('the rendered surface never says score', async () => {
    await renderWorkbench();
    const text = screen.getByTestId('workbench-view').textContent ?? '';
    expect(text).not.toMatch(/\bscore\b/i);
  });
});

describe('the reachability hints name the unlock, not just the lock', () => {
  it('says what would make an unformable splice formable', async () => {
    await renderWorkbench();
    expect(screen.getByTestId('workbench-reachability')).toBeInTheDocument();
  });
});
