import { render, screen } from '@testing-library/react';
import { GenomeCard } from './GenomeCard';
import type { GenomeCardModel } from '@/lib/share/genomeCardImage';

const model: GenomeCardModel = {
  snakeName: 'Helix', dynasty: 'PRIMAL', generation: 2, score: 900, foods: 65, extracted: true,
  genes: [{ id: 'gold_trail', name: 'Golden Hour', strains: ['AURUM'] }],
  splices: [{ id: 'splice_dragon_hoard', name: 'Dragon Hoard' }],
  milestones: [{ strain: 'AURUM', tier: 'Expression', name: 'Gilded Wake' }],
  allIn: true,
  cascade: { raw: 500, genome: 620, outcome: 850, total: 850 },
};

describe('GenomeCard', () => {
  it('renders the build, cascade, clutch stamp, and export affordance', () => {
    render(<GenomeCard model={model} />);
    expect(screen.getByTestId('genome-card')).toHaveTextContent('Helix');
    expect(screen.getByTestId('genome-card-genes')).toHaveTextContent('Golden Hour');
    expect(screen.getByTestId('genome-card')).toHaveTextContent('Dragon Hoard');
    expect(screen.getByTestId('genome-cascade')).toHaveTextContent('850 DNA');
    expect(screen.getByTestId('genome-all-in')).toHaveTextContent('ALL IN');
    expect(screen.getByTestId('genome-card-export')).toBeEnabled();
  });

  it('shows no streak, set-bonus or clan-duel row (WP-0.02)', () => {
    render(<GenomeCard model={model} />);
    const cascade = screen.getByTestId('genome-cascade');
    expect(cascade).not.toHaveTextContent('STREAK');
    expect(cascade).not.toHaveTextContent('SET');
    expect(cascade).not.toHaveTextContent('DUEL');
  });
});
