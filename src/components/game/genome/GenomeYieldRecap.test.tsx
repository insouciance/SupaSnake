import { render, screen } from '@testing-library/react';
import { GenomeYieldRecap } from './GenomeYieldRecap';

describe('GenomeYieldRecap', () => {
  it('shows build execution and exact Yield contribution without grading or recommending it', () => {
    render(
      <GenomeYieldRecap
        model={{
          rulesVersion: 2,
          baseYield: 1_000,
          genomeYield: 2_640,
          genomeDelta: 1_640,
          factorLabel: '×2.64',
          activeGenes: [
            { id: 'live_wire', name: 'Live Wire', strains: ['VOLT'] },
            { id: 'compound_interest', name: 'Compound Interest', strains: ['AURUM'] },
          ],
          activeSplices: [{ id: 'perfect_circuit', name: 'Perfect Circuit' }],
          rows: [
            { id: 'route', label: 'Route contracts', amount: 1_200, detail: '4 of 5 completed', tone: 'gain' },
            { id: 'escrow', label: 'Escrow forfeited', amount: -160, detail: 'BANK before contract 6/6', tone: 'forfeit' },
            { id: 'bonds', label: 'Bonds at BANK', amount: 600, detail: '3 prospective Bonds converted', tone: 'gain' },
          ],
          executionSummary: 'This Genome paid through four clean route contracts and three deliberate DECLINE Bonds.',
          bankCrashSummary: 'BANK converted Bonds; the unfinished Loan Escrow remained forfeited.',
        }}
      />
    );
    expect(screen.getByTestId('results-genome-recap')).toHaveTextContent('1,000 → 2,640 Yield');
    expect(screen.getByTestId('results-genome-recap')).toHaveTextContent('×2.64');
    expect(screen.getByTestId('results-genome-row-route')).toHaveTextContent('4 of 5 completed');
    expect(screen.getByTestId('results-genome-row-escrow')).toHaveTextContent('-160');
    expect(screen.getByTestId('results-genome-recap')).not.toHaveTextContent(/best|recommended|optimal/i);
  });
});
