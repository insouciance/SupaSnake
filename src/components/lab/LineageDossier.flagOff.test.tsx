import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LineageDossier } from './LineageDossier';

jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: false,
}));

it('renders and fetches no passport when Career Spine presentation is off', () => {
  global.fetch = jest.fn() as jest.Mock;
  render(
    <LineageDossier
      accessToken="token"
      variantId="variant-1"
      specimenId="specimen-1"
    />
  );
  expect(screen.queryByTestId('lineage-dossier')).not.toBeInTheDocument();
  expect(screen.queryByTestId('lineage-dossier-loading')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
