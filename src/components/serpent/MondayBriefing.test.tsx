/**
 * The Monday briefing, rendered (Constitution §7.3, Rules 5 and 14).
 *
 * The case that matters most is the player who was not there. Rule 5 says a
 * missed week costs that week's opportunity and nothing else, and the only way
 * a surface can honour that is to say so out loud — so the assertions below
 * check both halves: that the briefing exists at all for a week with no row,
 * and that its prose names what still stands rather than what was lost.
 */

import { render, screen, within } from '@testing-library/react';
import { MondayBriefing, rivalSentence } from './MondayBriefing';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import type { ClanHuntRival } from '@/lib/server/clanHunt';

const LAST_MONDAY = '2026-07-20';
const NOW = Date.parse('2026-07-27T09:00:00.000Z');

function panelWith(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  return { ...emptySerpentPanel(), ...overrides };
}

function rival(overrides: Partial<ClanHuntRival> = {}): ClanHuntRival {
  return {
    clanId: 'c2',
    name: 'Dragon Lords',
    tag: 'DRAG',
    sizeBand: 1,
    activityBand: 1,
    standingRival: false,
    yourDepth: 1200,
    theirDepth: 900,
    settled: true,
    outcome: 'won',
    ...overrides,
  };
}

describe('the player who missed the week (Rule 5)', () => {
  const away = panelWith({
    live: true,
    history: [{ weekStart: '2026-07-06', depth: 1400, clanDepth: null }],
  });

  it('still renders a briefing for the week they were absent from', () => {
    render(<MondayBriefing panel={away} weekKey={LAST_MONDAY} now={NOW} />);

    expect(screen.getByTestId('monday-briefing')).toBeInTheDocument();
    expect(screen.queryByTestId('monday-briefing-unknown')).not.toBeInTheDocument();
    expect(screen.getByText('You did not hunt this week.')).toBeInTheDocument();
  });

  it('names the opportunity as lost and everything else as standing', () => {
    render(<MondayBriefing panel={away} weekKey={LAST_MONDAY} now={NOW} />);

    const you = screen.getByTestId('briefing-you');
    expect(within(you).getByText(/its runs went with it/i)).toBeInTheDocument();
    expect(within(you).getByText(/Nothing of yours went with them/i)).toBeInTheDocument();
    expect(within(you).getByText(/no catching up waiting for you/i)).toBeInTheDocument();
    expect(
      within(you).getByText(/Your deepest week still stands at 1,400 segments/)
    ).toBeInTheDocument();
  });

  it('renders no debt, backlog, decay or make-up language anywhere', () => {
    const { container } = render(
      <MondayBriefing panel={away} weekKey={LAST_MONDAY} now={NOW} />
    );
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/\bdecay|\bexpire|\bforfeit|\bpenalt|\blost your|\breset\b/i);
    expect(text).not.toMatch(/\bcatch up\b/i);
  });

  it('points at the next week without making it an obligation', () => {
    render(<MondayBriefing panel={away} weekKey={LAST_MONDAY} now={NOW} />);
    expect(screen.getByText(/the next week is a fresh one/i)).toBeInTheDocument();
  });
});

describe('N = 1: one player, one week, no clan and no rival', () => {
  const solo = panelWith({
    live: true,
    history: [{ weekStart: LAST_MONDAY, depth: 320, clanDepth: null }],
  });

  it('reads a first week as a beginning and not as an absence of history', () => {
    render(<MondayBriefing panel={solo} weekKey={LAST_MONDAY} now={NOW} />);

    const you = screen.getByTestId('briefing-you');
    expect(within(you).getByText('You fed 320 segments.')).toBeInTheDocument();
    expect(within(you).getByText(/Your first week on the hunt/i)).toBeInTheDocument();
  });

  it('states the clanless case plainly instead of leaving the slot empty', () => {
    render(<MondayBriefing panel={solo} weekKey={LAST_MONDAY} now={NOW} />);
    expect(screen.getByTestId('briefing-clan')).toHaveTextContent(
      /without a clan, so this week’s Depth is yours alone/i
    );
  });

  it('states the absent rival as a property of the week, with no apology', () => {
    render(<MondayBriefing panel={solo} weekKey={LAST_MONDAY} now={NOW} />);

    const block = screen.getByTestId('briefing-rival');
    expect(block).toHaveTextContent(/No clan was matched to yours this week/i);
    expect(block).toHaveTextContent(/the part that always works/i);
  });

  it('offers the submerged week as a link even with no history at all', () => {
    render(<MondayBriefing panel={panelWith({ live: true })} weekKey={LAST_MONDAY} now={NOW} />);

    const links = screen.getAllByTestId('briefing-week-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', `/serpent?week=${LAST_MONDAY}`);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
  });
});

describe('a clan of one', () => {
  it('reads the clan Depth as the sum it is, at one member', () => {
    render(
      <MondayBriefing
        panel={panelWith({
          live: true,
          history: [{ weekStart: LAST_MONDAY, depth: 320, clanDepth: 320 }],
        })}
        weekKey={LAST_MONDAY}
        now={NOW}
      />
    );
    expect(screen.getByTestId('briefing-clan')).toHaveTextContent(
      /Your clan fed 320 segments that week — every member’s segments added together/
    );
  });
});

describe('every week is linkable (Rule 14)', () => {
  const panel = panelWith({
    live: true,
    history: [
      { weekStart: '2026-07-06', depth: 1400, clanDepth: null },
      { weekStart: '2026-07-13', depth: 900, clanDepth: null },
    ],
  });

  it('renders one copyable link per week, newest first', () => {
    render(<MondayBriefing panel={panel} weekKey={LAST_MONDAY} now={NOW} />);

    const links = screen.getAllByTestId('briefing-week-link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/serpent?week=2026-07-20',
      '/serpent?week=2026-07-13',
      '/serpent?week=2026-07-06',
    ]);
  });

  it('tells a stranger a bad link is bad rather than silently substituting', () => {
    render(<MondayBriefing panel={panel} weekKey="2026-07-22" now={NOW} />);

    expect(screen.getByTestId('monday-briefing-unknown')).toHaveTextContent(
      /There is no Serpent week at/i
    );
    // The picker is still there, so a wrong link is a dead end for nobody.
    expect(screen.getAllByTestId('briefing-week-link').length).toBeGreaterThan(0);
  });
});

describe('the rival layer', () => {
  const panel = panelWith({
    live: true,
    history: [{ weekStart: LAST_MONDAY, depth: 1200, clanDepth: 1200 }],
  });

  it('is ignored when it belongs to a different week', () => {
    render(
      <MondayBriefing
        panel={panel}
        weekKey={LAST_MONDAY}
        rival={rival()}
        rivalWeekStart="2026-07-27"
        now={NOW}
      />
    );
    expect(screen.getByTestId('briefing-rival')).toHaveTextContent(
      /No clan was matched to yours this week/i
    );
  });

  it('renders the pairing when it belongs to the week being read', () => {
    render(
      <MondayBriefing
        panel={panel}
        weekKey={LAST_MONDAY}
        rival={rival()}
        rivalWeekStart={LAST_MONDAY}
        now={NOW}
      />
    );
    expect(screen.getByTestId('briefing-rival')).toHaveTextContent(
      /Paired with Dragon Lords/
    );
  });
});

describe('rivalSentence', () => {
  it('states a loss without taking anything from the player', () => {
    expect(rivalSentence(rival({ outcome: 'lost', yourDepth: 900, theirDepth: 1200 }))).toBe(
      'Paired with Dragon Lords: 900 segments against 1,200 segments. The laurel went to them this week; nothing of yours moved with it.'
    );
  });

  it('states a win as kept, a draw as level, and a running week as unfinished', () => {
    expect(rivalSentence(rival())).toMatch(/The laurel is yours, and it stays yours\./);
    expect(rivalSentence(rival({ outcome: 'draw' }))).toMatch(/The week was level\./);
    expect(rivalSentence(rival({ settled: false, outcome: null }))).toMatch(
      /when the week was last read\./
    );
  });
});
