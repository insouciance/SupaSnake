import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CareerPulse } from './CareerPulse';

jest.mock('@/lib/features/careerSpine', () => ({
  CAREER_SPINE_V1_ENABLED: false,
}));

it('renders and fetches nothing when Career Spine presentation is off', () => {
  global.fetch = jest.fn() as jest.Mock;
  render(<CareerPulse accessToken="token" />);
  expect(screen.queryByTestId('career-pulse')).not.toBeInTheDocument();
  expect(screen.queryByTestId('career-pulse-loading')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
