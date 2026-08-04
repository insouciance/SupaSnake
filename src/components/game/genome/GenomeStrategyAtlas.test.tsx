import { fireEvent, render, screen, within } from '@testing-library/react';
import { GenomeStrategyAtlas, type GenomeStrategyAtlasModel } from './GenomeStrategyAtlas';
import { STRAINS, STRAIN_IDS } from '@/shared/game/strains';

function atlasModel(): GenomeStrategyAtlasModel {
  return {
    rulesVersion: 2,
    rosterLabel: '13 shared + Dynasty signature',
    genes: [
      {
        id: 'live_wire',
        name: 'Straight Shot',
        category: 'Execution & route',
        effect: 'Every third target becomes a topology-scaled ×3 route test.',
        cost: 'A miss burns the target to zero Yield.',
        strains: ['VOLT'],
        dynastyFacts: ['Different Dynasty speeds change the execution context.'],
      },
      {
        id: 'compound_interest',
        name: 'Stash',
        category: 'Banking & wagers',
        effect: 'DECLINE mints one prospective BANK Bond.',
        cost: 'Passing spends a real build opportunity.',
        strains: ['AURUM'],
      },
      {
        id: 'phoenix',
        name: 'Phoenix',
        category: 'Execution & route',
        effect: 'One deliberate recovery becomes Ash after it fires.',
        cost: 'Occupies its locus and stops contributing Strain after use.',
        strains: ['FERAL', 'UMBRA'],
      },
    ],
    strains: STRAIN_IDS.map((id) => ({
      id,
      name: STRAINS[id].name,
      color: STRAINS[id].color,
      identity: STRAINS[id].identity,
      tiers: [2, 3, 4].map((points) => ({
        points,
        name: `${id} ${points}`,
        rule: `Rule at ${points} points`,
        cost: points === 4 ? 'Player-controlled risk' : '',
        lockedReason: points === 4 ? 'Bank 10 runs or reach M3' : undefined,
      })),
    })),
    splices: [
      {
        id: 'perfect_circuit',
        name: 'Round Trip',
        rule: 'Successful Live routes arm a linked return leg.',
        cost: 'Either failed leg burns the circuit.',
        strains: ['VOLT', 'FLUX'],
        recipeKnown: true,
        parentIds: ['live_wire', 'circuit_run'],
        recipeLabel: 'Straight Shot + Food Chain',
      },
      {
        id: 'unknown',
        name: 'Full Circle',
        rule: 'Sealed territory converts body pressure into a payout.',
        cost: 'The seal remains solid.',
        strains: ['FERAL', 'FLUX'],
        recipeKnown: false,
        parentIds: ['coilkeeper', 'overgrowth'],
        recipeLabel: 'Recipe: Loop Trap + Overgrowth',
      },
    ],
  };
}

describe('GenomeStrategyAtlas', () => {
  it('makes every 2/3/4 ladder and tactical recipe visible before discovery', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    for (const strain of STRAIN_IDS) {
      for (const points of [2, 3, 4]) {
        expect(screen.getByTestId(`atlas-all-tier-${strain}-${points}`)).toBeInTheDocument();
      }
    }
    const archive = screen.getByTestId('atlas-splice-archive');
    expect(archive).toHaveTextContent('Full Circle');
    expect(archive).toHaveTextContent('Sealed territory converts body pressure');
    expect(archive).toHaveTextContent('Recipe: Loop Trap + Overgrowth');
  });

  it('uses one selected consequence board for category changes instead of duplicate cards', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    expect(screen.getAllByTestId('atlas-consequence')).toHaveLength(1);
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('Straight Shot');
    fireEvent.click(screen.getByRole('tab', { name: 'Banking & wagers' }));
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('Stash');
    expect(screen.getByTestId('atlas-consequence')).toHaveTextContent('DECLINE mints');
    expect(screen.queryByText(/best|recommended/i)).toBeNull();
  });

  it('keeps compact category and gene controls readable on mobile', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    expect(screen.getByRole('tab', { name: 'Execution & route' })).toHaveClass('min-h-11', 'shrink-0');
    expect(screen.getByTestId('atlas-gene-live_wire').firstElementChild).toHaveClass('truncate');
  });

  it('shows rune, independent color, and written family for both sides of a dual gene', () => {
    render(<GenomeStrategyAtlas model={atlasModel()} />);
    const phoenix = within(screen.getByTestId('atlas-gene-phoenix'));
    const feral = phoenix.getByTestId('strain-chip-FERAL');
    const umbra = phoenix.getByTestId('strain-chip-UMBRA');
    expect(feral).toHaveTextContent('Coils');
    expect(umbra).toHaveTextContent('Risk');
    expect(feral.querySelector('svg')).toBeInTheDocument();
    expect(umbra.querySelector('svg')).toBeInTheDocument();
    expect(feral.style.color).not.toBe(umbra.style.color);
  });
});
