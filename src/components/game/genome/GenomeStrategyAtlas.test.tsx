import { fireEvent, render, screen } from '@testing-library/react';
import { GenomeStrategyAtlas, type GenomeStrategyAtlasModel } from './GenomeStrategyAtlas';
import { STRAINS, STRAIN_IDS } from '@/shared/game/strains';

function atlasModel(): GenomeStrategyAtlasModel {
  return {
    rulesVersion: 2,
    rosterLabel: '13 shared + Dynasty signature',
    genes: [
      {
        id: 'live_wire',
        name: 'Live Wire',
        category: 'Execution & route',
        effect: 'Every third target becomes a topology-scaled ×3 route test.',
        cost: 'A miss burns the target to zero Yield.',
        strains: ['VOLT'],
        dynastyFacts: ['Different Dynasty speeds change the execution context.'],
      },
      {
        id: 'compound_interest',
        name: 'Compound Interest',
        category: 'Banking & wagers',
        effect: 'DECLINE mints one prospective BANK Bond.',
        cost: 'Passing spends a real build opportunity.',
        strains: ['AURUM'],
      },
    ],
    strains: STRAIN_IDS.map((id) => ({
      id,
      name: STRAINS[id].name,
      color: STRAINS[id].color,
      identity: STRAINS[id].identity,
      tiers: [3, 4, 5].map((points) => ({
        points,
        name: `${id} ${points}`,
        rule: `Rule at ${points} points`,
        cost: points === 5 ? 'Player-controlled risk' : '',
        lockedReason: points === 5 ? 'Bank 10 runs or reach M3' : undefined,
      })),
    })),
    splices: [
      {
        id: 'perfect_circuit',
        name: 'Perfect Circuit',
        rule: 'Successful Live routes arm a linked return leg.',
        cost: 'Either failed leg burns the circuit.',
        strains: ['VOLT', 'FLUX'],
        recipeKnown: true,
        parentIds: ['live_wire', 'circuit_run'],
        recipeLabel: 'Live Wire + Circuit Run',
      },
      {
        id: 'unknown',
        name: 'Worldcoil',
        rule: 'Sealed territory converts body pressure into a payout.',
        cost: 'The seal remains solid.',
        strains: ['FERAL', 'FLUX'],
        recipeKnown: false,
        parentIds: ['coilkeeper', 'overgrowth'],
        recipeLabel: 'Recipe: Coilkeeper + Overgrowth',
      },
    ],
  };
}

describe('GenomeStrategyAtlas', () => {
  it('makes every 3/4/5 ladder and tactical recipe visible before discovery', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    for (const strain of STRAIN_IDS) {
      for (const points of [3, 4, 5]) {
        expect(screen.getByTestId(`atlas-all-tier-${strain}-${points}`)).toBeInTheDocument();
      }
    }
    const archive = screen.getByTestId('atlas-splice-archive');
    expect(archive).toHaveTextContent('Worldcoil');
    expect(archive).toHaveTextContent('Sealed territory converts body pressure');
    expect(archive).toHaveTextContent('Recipe: Coilkeeper + Overgrowth');
  });

  it('uses one selected consequence board for category changes instead of duplicate cards', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    expect(screen.getAllByTestId('atlas-consequence')).toHaveLength(1);
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('Live Wire');
    fireEvent.click(screen.getByRole('tab', { name: 'Banking & wagers' }));
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('Compound Interest');
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('DECLINE mints');
    expect(screen.queryByText(/best|recommended/i)).toBeNull();
  });

  it('keeps compact category and gene controls readable on mobile', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    expect(screen.getByRole('tab', { name: 'Execution & route' })).toHaveClass('min-h-11', 'shrink-0');
    expect(screen.getByTestId('atlas-gene-live_wire').firstElementChild).toHaveClass('truncate');
  });
});
