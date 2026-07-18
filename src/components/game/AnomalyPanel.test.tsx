/**
 * Tests for the Weekly Anomaly board entry (Design v2 §7.2): modifier
 * header, rotation countdown, the player's best line, and the top 10.
 */

import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import {
  AnomalyPanel,
  formatWeekCountdown,
  type AnomalyBoardView,
} from './AnomalyPanel';

function board(overrides: Partial<AnomalyBoardView> = {}): AnomalyBoardView {
  return {
    live: true,
    anomaly: {
      id: 'gold_rush',
      name: 'Gold Rush',
      effect: 'All food ×1.5 DNA — exit portals spawn 6 foods later',
      endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    },
    top: [
      { rank: 1, name: 'Viper', score: 4200 },
      { rank: 2, name: 'Coil', score: 3100 },
    ],
    my: { best: 900, rank: 7, runs: 3 },
    ...overrides,
  };
}

describe('AnomalyPanel', () => {
  it('renders the modifier name, effect line, and countdown', () => {
    render(<AnomalyPanel board={board()} />);
    expect(screen.getByTestId('anomaly-name')).toHaveTextContent('Gold Rush');
    expect(screen.getByText(/All food ×1\.5 DNA/)).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-countdown')).toHaveTextContent(/2d 2[0-3]h|3d 0h/);
  });

  it('shows the player best / rank / run count', () => {
    render(<AnomalyPanel board={board()} />);
    const my = screen.getByTestId('anomaly-my-best');
    expect(my).toHaveTextContent(/Your best/);
    expect(my).toHaveTextContent('900');
    expect(my).toHaveTextContent('#7');
    expect(my).toHaveTextContent('3 runs');
  });

  it('invites a first run when the player has no board entry yet', () => {
    render(<AnomalyPanel board={board({ my: null })} />);
    expect(screen.getByTestId('anomaly-my-best')).toHaveTextContent(
      /No runs on this board yet/
    );
  });

  it('lists the top entries with ranks and scores', () => {
    render(<AnomalyPanel board={board()} />);
    const top = screen.getByTestId('anomaly-top');
    expect(top).toHaveTextContent('#1');
    expect(top).toHaveTextContent('Viper');
    expect(top).toHaveTextContent('4200');
    expect(top).toHaveTextContent('Coil');
  });

  it('omits the top list while the board is empty', () => {
    render(<AnomalyPanel board={board({ top: [] })} />);
    expect(screen.queryByTestId('anomaly-top')).toBeNull();
  });
});

describe('formatWeekCountdown', () => {
  const now = Date.UTC(2026, 6, 22, 12); // Wed 12:00

  it('formats days + hours, hours + minutes, then minutes', () => {
    expect(
      formatWeekCountdown(new Date(Date.UTC(2026, 6, 27)).toISOString(), now)
    ).toBe('4d 12h');
    expect(
      formatWeekCountdown(new Date(Date.UTC(2026, 6, 22, 15, 30)).toISOString(), now)
    ).toBe('3h 30m');
    expect(
      formatWeekCountdown(new Date(Date.UTC(2026, 6, 22, 12, 20)).toISOString(), now)
    ).toBe('20m');
  });

  it('never renders a negative window', () => {
    expect(
      formatWeekCountdown(new Date(Date.UTC(2026, 6, 22, 11)).toISOString(), now)
    ).toBe('rotating…');
    expect(formatWeekCountdown('not-a-date', now)).toBe('rotating…');
  });
});
