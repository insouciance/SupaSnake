import { fireEvent, render, screen } from '@testing-library/react';
import { EnergyCommitmentSelector } from './EnergyCommitmentSelector';
import type { EnergyStatus } from '@/shared/game/energyEnvelope';

const full: EnergyStatus = {
  available: 6,
  capacity: 6,
  recoveryIntervalSeconds: 3600,
  recoveryStartedAt: '2026-07-29T12:00:00.000Z',
  nextRecoveryAt: null,
  recoveryProgress: 1,
  serverNow: '2026-07-29T12:00:00.000Z',
  remaining: 6,
  perDay: 6,
  usedToday: 0,
  day: '2026-07-29',
  refillsAt: null,
};

describe('EnergyCommitmentSelector', () => {
  it('shows stock, the curve and the no-refund start consequence', () => {
    render(<EnergyCommitmentSelector energy={full} value={1} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Energy 6 of 6')).toBeInTheDocument();
    expect(screen.getByTestId('energy-summary')).toHaveTextContent('Commit 1 Energy');
    expect(screen.getByTestId('energy-commit-6')).toHaveTextContent('×10.0');
    expect(screen.getByText(/consumed when the run begins/i)).toBeInTheDocument();
  });

  it('uses a clear deliberate confirmation before selecting all six', () => {
    const onChange = jest.fn();
    render(<EnergyCommitmentSelector energy={full} value={1} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('energy-commit-6'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Commit all 6 Energy?' })).toBeInTheDocument();
    expect(screen.getByTestId('energy-max-confirmation')).toHaveTextContent('×10 harvest run');
    fireEvent.click(screen.getByTestId('energy-max-confirm'));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('offers an explicit lean run without gating play', () => {
    const onChange = jest.fn();
    render(<EnergyCommitmentSelector energy={full} value={2} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('energy-run-lean'));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('states automatic clan eligibility and the fifth-best threshold', () => {
    render(
      <EnergyCommitmentSelector
        energy={full}
        value={3}
        onChange={jest.fn()}
        clanBattle={{ active: true, fifthBestToBeat: 1200 }}
      />
    );
    expect(screen.getByTestId('energy-clan-eligible')).toHaveTextContent(
      'Beat 1,200 Yield'
    );
  });

  it('uses one compact reactor instead of six equal commitment buttons', () => {
    const { container } = render(
      <EnergyCommitmentSelector energy={full} value={2} onChange={jest.fn()} />
    );
    expect(screen.getByTestId('energy-commitment-slider')).toHaveAttribute('max', '6');
    expect(container.querySelectorAll('button[data-testid^="energy-commit-"]')).toHaveLength(1);
  });

  it('keeps Energy primary and the battle context subordinate in DOM order', () => {
    render(
      <EnergyCommitmentSelector
        energy={full}
        value={2}
        onChange={jest.fn()}
        clanBattle={{ active: true, fifthBestToBeat: 900 }}
      />
    );
    const summary = screen.getByTestId('energy-summary');
    const battle = screen.getByTestId('energy-clan-eligible');
    expect(summary.compareDocumentPosition(battle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('energy-commit-6')).toHaveClass('whitespace-nowrap');
  });
});
