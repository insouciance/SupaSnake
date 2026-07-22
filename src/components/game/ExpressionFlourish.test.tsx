import { render, screen } from '@testing-library/react';
import { ExpressionFlourish } from './ExpressionFlourish';

describe('ExpressionFlourish', () => {
  it('names expressions and apexes from the shared strain catalog', () => {
    const { rerender } = render(<ExpressionFlourish strain="VOLT" tier={2} />);
    expect(screen.getByTestId('expression-flourish')).toHaveTextContent('Arc Lightning');
    rerender(<ExpressionFlourish strain="UMBRA" tier={3} />);
    expect(screen.getByTestId('expression-flourish')).toHaveTextContent('Second Sun');
  });
});
