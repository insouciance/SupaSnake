import { render, screen } from '@testing-library/react';
import { GenomeCard } from './GenomeCard';
import type { GenomeCardModel } from '@/lib/share/genomeCardImage';

const model: GenomeCardModel = {
  snakeName: 'Helix', dynasty: 'PRIMAL', generation: 2, score: 900, foods: 65, extracted: true,
  genes: [{ id: 'gold_trail', name: 'Gold Trail', strains: ['AURUM'] }],
  splices: [{ id: 'splice_dragon_hoard', name: 'Dragon Hoard' }],
  milestones: [{ strain: 'AURUM', tier: 'Expression', name: 'Gilded Wake' }],
  allIn: true,
  cascade: { raw: 500, genome: 620, outcome: 850, streak: 1.1, setBonus: 1, duel: 1, total: 935 },
};

describe('GenomeCard', () => {
  it('renders the build, cascade, clutch stamp, and export affordance', () => {
    render(<GenomeCard model={model} />);
    expect(screen.getByTestId('genome-card')).toHaveTextContent('Helix');
    expect(screen.getByTestId('genome-card-genes')).toHaveTextContent('Gold Trail');
    expect(screen.getByTestId('genome-card')).toHaveTextContent('Dragon Hoard');
    expect(screen.getByTestId('genome-cascade')).toHaveTextContent('935 DNA');
    expect(screen.getByTestId('genome-all-in')).toHaveTextContent('ALL IN');
    expect(screen.getByTestId('genome-card-export')).toBeEnabled();
  });
});
