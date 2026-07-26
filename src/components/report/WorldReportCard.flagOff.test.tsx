/**
 * The World Report, flag off (Constitution §7.5, Phase 2 gate).
 *
 * The project rule is that a rollback path is TESTED, never inferred from an
 * omitted flag. `WORLD_REPORT_V1_ENABLED` is a module-scope constant, so the
 * off path needs its own module registry and therefore its own file.
 *
 * "Off" is stronger than "renders nothing": the component must not READ
 * either. A flag-off deployment makes no request, leaves no trace in any
 * server log and costs nothing, so flipping the flag is a real rollback rather
 * than a change of styling.
 */

import { render, screen, waitFor } from '@testing-library/react';

import { WorldReportCard } from './WorldReportCard';

jest.mock('@/lib/report/config', () => ({
  ...jest.requireActual('@/lib/report/config'),
  WORLD_REPORT_V1_ENABLED: false,
}));

describe('WorldReportCard (flag off)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('renders nothing and reads nothing', async () => {
    const { container } = render(<WorldReportCard token="test-token" />);

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('world-report-card')).not.toBeInTheDocument();
  });

  it('stays silent for a player who has been away a season', async () => {
    // The absence is irrelevant when the flag is down: the component returns
    // before it can learn how long anybody was away.
    const { container } = render(<WorldReportCard token="a-returning-player" />);

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
