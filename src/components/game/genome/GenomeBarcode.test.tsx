import { render, screen } from '@testing-library/react';
import { GenomeBarcode } from './GenomeBarcode';
import type { GenomeCardModel } from '@/lib/share/genomeCardImage';

function model(overrides: Partial<GenomeCardModel> = {}): GenomeCardModel {
  return {
    snakeName: 'Ligature',
    dynasty: 'CYBER',
    generation: 11,
    score: 440,
    foods: 62,
    extracted: true,
    genes: [
      { id: 'live_wire', name: 'Live Wire', strains: ['VOLT'] },
      { id: 'vector_bloom', name: 'Vector Bloom', strains: ['VOLT', 'FLUX'] },
    ],
    splices: [],
    milestones: [],
    cascade: { base: 100, genome: 240, carry: 1, total: 240 },
    allIn: false,
    ...overrides,
  } as GenomeCardModel;
}

describe('GenomeBarcode', () => {
  it('names the run and draws one band per gene', () => {
    render(<GenomeBarcode model={model()} />);
    expect(screen.getByTestId('genome-barcode')).toHaveTextContent('Ligature');
    expect(screen.getByTestId('genome-barcode')).toHaveTextContent('CYBER · Gen 11 · 62 foods');
    expect(screen.getByTestId('genome-body-strip').children).toHaveLength(2);
  });

  it('describes the genome for a reader who cannot see the bands', () => {
    render(<GenomeBarcode model={model()} />);
    expect(screen.getByTestId('genome-body-strip')).toHaveAccessibleName(
      "This run's genome: Live Wire, Vector Bloom"
    );
  });

  it('draws one band for a run that wrote no genome', () => {
    render(<GenomeBarcode model={model({ genes: [] })} />);
    expect(screen.getByTestId('genome-body-strip').children).toHaveLength(1);
    expect(screen.getByTestId('genome-body-strip')).toHaveAccessibleName(
      "This run's genome: unwritten"
    );
  });

  it('keeps the ALL IN stamp and shows it only when the run was all in', () => {
    const { rerender } = render(<GenomeBarcode model={model()} />);
    expect(screen.queryByTestId('genome-all-in')).toBeNull();
    rerender(<GenomeBarcode model={model({ allIn: true })} />);
    expect(screen.getByTestId('genome-all-in')).toHaveTextContent('ALL IN');
  });

  /** The download left with the 2026-08-05 triage; the barcode stayed. */
  it('offers no export, no download and no second receipt', () => {
    const { container } = render(<GenomeBarcode model={model()} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByTestId('genome-cascade')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/share|download|png/i);
  });
});
