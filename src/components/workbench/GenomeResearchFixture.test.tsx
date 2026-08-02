import { render, screen } from '@testing-library/react';
import { GenomeResearchFixture } from './GenomeResearchFixture';

jest.mock('@/lib/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

it('renders the responsive Research Loom visual specimen', () => {
  render(<GenomeResearchFixture />);
  expect(screen.getByTestId('workbench-research-table')).toBeInTheDocument();
  expect(screen.getByTestId('workbench-loci').children).toHaveLength(6);
  expect(screen.getAllByText('Gilded Fork').length).toBeGreaterThan(0);
});
