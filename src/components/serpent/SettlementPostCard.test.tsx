/**
 * The one-tap publish card: it shows the whole post before it offers the
 * button, it publishes only when tapped, and it is not there at all with the
 * flag down.
 *
 * The flag is mocked through a getter rather than by resetting modules: a
 * `jest.resetModules()` here would hand the component a second copy of React
 * and the render would fail for a reason that has nothing to do with the flag.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

let mockFlag = true;
jest.mock('@/lib/growth/config', () => ({
  get SETTLEMENT_DISPATCH_V1() {
    return mockFlag;
  },
}));

import { SettlementPostCard } from './SettlementPostCard';

const WEEK = '2026-07-13';
const NOW = Date.parse('2026-07-29T12:00:00.000Z');

function panel(): SerpentPanel {
  const base = emptySerpentPanel();
  return {
    ...base,
    live: true,
    you: { ...base.you, depth: 1240, attempts: 5, bestWeekDepth: 1240 },
    clan: {
      id: 'clan-uuid',
      name: 'Hollow Fang',
      tag: 'HFG',
      memberCount: 2,
      depth: 4820,
      bestWeekDepth: 4820,
      lifetimeDepth: 9900,
      members: [
        { playerId: 'p1', handle: 'Sans_Souci', depth: 1240, attempts: 5 },
        { playerId: 'p2', handle: 'Nadir', depth: 3580, attempts: 6 },
      ],
      hiddenMembers: 0,
    },
    history: [{ weekStart: WEEK, depth: 1240, clanDepth: 4820 }],
    chronicle: [],
  };
}

beforeEach(() => {
  mockFlag = true;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SettlementPostCard — flag on', () => {
  it('shows every line that would be published, plus the URL', () => {
    render(<SettlementPostCard panel={panel()} weekKey={WEEK} now={NOW} />);
    const lines = screen.getAllByTestId('settlement-post-line').map((n) => n.textContent);
    expect(lines[0]).toBe(`SUPASNAKE · World Serpent · week of ${WEEK}`);
    expect(lines).toContain('HOLLOW FANG reached Depth 4,820 — best week yet');
    expect(lines).toContain('2 members hunted');
    expect(screen.getByTestId('settlement-post-body').textContent).toContain(`/w/${WEEK}`);
  });

  it('says plainly that nothing goes anywhere until the tap', () => {
    render(<SettlementPostCard panel={panel()} weekKey={WEEK} now={NOW} />);
    expect(screen.getByTestId('settlement-post').textContent).toContain(
      'Nothing goes anywhere until you tap publish'
    );
  });

  it('publishes nothing on render — the share sheet opens only on the tap', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
      writable: true,
    });

    render(<SettlementPostCard panel={panel()} weekKey={WEEK} now={NOW} />);
    expect(share).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Publish this week' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));

    const payload = share.mock.calls[0][0] as { text: string; url: string };
    // The WP-0.08 invariant survives the round trip through the button.
    expect(payload.text.split('\n').pop()).toBe(payload.url);
    expect(payload.text).toContain('HOLLOW FANG reached Depth 4,820');
    // Rule 7: nothing commercial reaches the share sheet.
    expect(payload.text).not.toMatch(/buy|price|offer|bundle|premium|upgrade/i);
  });
});

describe('SettlementPostCard — flag off', () => {
  beforeEach(() => {
    mockFlag = false;
  });

  it('renders nothing at all', () => {
    const { container } = render(
      <SettlementPostCard panel={panel()} weekKey={WEEK} now={NOW} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('settlement-post')).toBeNull();
  });

  it('offers no publish affordance for a share sheet to be opened from', () => {
    render(<SettlementPostCard panel={panel()} weekKey={WEEK} now={NOW} />);
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });
});

describe('SettlementPostCard — a week it cannot compose', () => {
  it('renders nothing for a key that names no Serpent week', () => {
    const { container } = render(
      <SettlementPostCard panel={panel()} weekKey="2026-07-14" now={NOW} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing rather than throwing when the copy breaks Rule 7', () => {
    const selling = panel();
    selling.clan!.name = 'Premium Bundle';
    const { container } = render(
      <SettlementPostCard panel={selling} weekKey={WEEK} now={NOW} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
