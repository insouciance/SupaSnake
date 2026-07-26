/**
 * The World Report surface — return without debt (Constitution §7.5).
 *
 * These tests render REAL reports. The fixtures are built by
 * `composeWorldReport` from a last-seen timestamp and a Serpent panel, not
 * hand-written JSON, so the strings swept below are the strings the product
 * actually authors. A hand-written fixture would let the copy rot underneath a
 * green test, which for a Rule 5 sweep would be worse than having no test.
 *
 * What is asserted here, and not at the composer:
 *
 *   - a week, a month and a season away each reach the DOM intact;
 *   - the RENDERED text — chrome included — carries no word of loss;
 *   - an N = 1 world still renders a card worth reading;
 *   - one GET, no claim URL, no second request, no write;
 *   - every "nothing to report" answer renders literally nothing.
 *
 * The flag-off path is `WorldReportCard.flagOff.test.tsx`: the flag is a
 * module-scope constant, so it needs its own module registry.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { WorldReportCard } from './WorldReportCard';
import { composeWorldReport, type WorldReport } from '@/lib/report/worldReport';
import type { WorldSettlement } from '@/lib/growth/settlementPost';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';

// Flag ON. Only the boolean is overridden — every other constant in the module
// is the real one, because the composer reads them and this suite renders real
// composed reports.
jest.mock('@/lib/report/config', () => ({
  ...jest.requireActual('@/lib/report/config'),
  WORLD_REPORT_V1_ENABLED: true,
}));

/** A Sunday. The current Serpent week runs 2026-07-20 → 2026-07-27. */
const NOW = Date.parse('2026-07-26T12:00:00.000Z');

const A_WEEK_AGO = '2026-07-14T12:00:00.000Z'; // 12 days
const A_MONTH_AGO = '2026-06-20T12:00:00.000Z'; // 36 days
const A_SEASON_AGO = '2026-04-01T12:00:00.000Z'; // 116 days

/**
 * The exact vocabulary a returning player may never meet, written as one
 * literal so a reader can see the whole promise at once. This is the same
 * promise `worldReport.test.ts` makes about the composed strings; here it is
 * made about the pixels, so chrome this component authors — headings, the
 * close button, anything a future edit adds — is held to it too.
 */
const DEBT_WORDS = /lost|lose|missed out|behind|catch up|expired|forfeit|debt|penalty/i;

const HOLLOW_FANG = {
  id: 'c1',
  name: 'Hollow Fang',
  tag: 'HFG',
  memberCount: 4,
  depth: 0,
  bestWeekDepth: 51000,
  lifetimeDepth: 120000,
  members: [],
  hiddenMembers: 0,
};

function week(weekKey: string, overrides: Partial<WorldSettlement> = {}): WorldSettlement {
  return {
    weekKey,
    clans: [],
    personalRecords: 0,
    clanRecords: 0,
    clanFirsts: 0,
    ...overrides,
  };
}

function reportFor(
  lastSeenAt: string,
  weeks: WorldSettlement[] = [],
  panel: SerpentPanel = emptySerpentPanel()
): WorldReport {
  const report = composeWorldReport({ lastSeenAt, panel, weeks }, NOW);
  if (!report) throw new Error('expected a report');
  return report;
}

/** A populated world: one week with a clan in it, records set. */
function busyWorld(lastSeenAt: string): WorldReport {
  return reportFor(
    lastSeenAt,
    [
      week('2026-07-13', {
        clans: [{ name: 'Hollow Fang', tag: 'HFG', depth: 51000, contributingMembers: 4 }],
        personalRecords: 3,
        clanRecords: 1,
        clanFirsts: 1,
      }),
    ],
    { ...emptySerpentPanel(), clan: HOLLOW_FANG }
  );
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function answerWith(body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue(jsonResponse(body));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function renderReport(report: WorldReport | null) {
  answerWith({ live: true, report });
  const view = render(<WorldReportCard token="test-token" />);
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('it composes for a week, a month and a season away', () => {
  const cases: Array<[string, () => WorldReport, string]> = [
    ['a week', () => busyWorld(A_WEEK_AGO), '12 days away. A week of the world ran without you.'],
    ['a month', () => busyWorld(A_MONTH_AGO), '36 days away. A month of the world ran without you.'],
    ['a season', () => busyWorld(A_SEASON_AGO), '116 days away. A season of the world ran without you.'],
  ];

  it.each(cases)('%s away renders its headline and its weeks', async (_label, build, headline) => {
    await renderReport(build());

    expect(await screen.findByTestId('world-report-headline')).toHaveTextContent(headline);
    expect(screen.getByTestId('world-report-section-weeks')).toBeInTheDocument();
    // The section that may never be omitted at any absence length (§7.5).
    expect(screen.getByTestId('world-report-section-standing')).toBeInTheDocument();
    expect(screen.getByTestId('world-report-section-today')).toBeInTheDocument();
  });

  it.each(cases)('%s away renders every line the server composed, in order', async (_label, build) => {
    const report = build();
    const { container } = await renderReport(report);
    await screen.findByTestId('world-report-card');

    const rendered = container.textContent ?? '';
    for (const section of report.sections) {
      expect(rendered).toContain(section.title);
      for (const line of section.lines) expect(rendered).toContain(line.text);
    }
  });

  it('a season away is no longer on screen than a month away', async () => {
    // Length is where a backlog would show. Thirteen enumerated weeks would be
    // a punch-list; the server summarises past four, and the surface adds no
    // list of its own on top of it.
    const { container: month, unmount } = await renderReport(busyWorld(A_MONTH_AGO));
    await screen.findByTestId('world-report-card');
    const monthLines = month.querySelectorAll('li').length;
    unmount();

    const { container: season } = await renderReport(busyWorld(A_SEASON_AGO));
    await screen.findByTestId('world-report-card');
    expect(season.querySelectorAll('li').length).toBe(monthLines);
  });
});

describe('it never tells a returning player they lost something', () => {
  const cases: Array<[string, () => WorldReport]> = [
    ['a week, busy world', () => busyWorld(A_WEEK_AGO)],
    ['a month, busy world', () => busyWorld(A_MONTH_AGO)],
    ['a season, busy world', () => busyWorld(A_SEASON_AGO)],
    ['a season, empty world', () => reportFor(A_SEASON_AGO)],
    [
      'a returning player with records of their own',
      () =>
        reportFor(A_MONTH_AGO, [week('2026-07-13')], {
          ...emptySerpentPanel(),
          you: { ...emptySerpentPanel().you, bestWeekDepth: 12400, lifetimeDepth: 48200 },
        }),
    ],
  ];

  it.each(cases)('%s: the rendered text carries no word of loss or debt', async (_label, build) => {
    const { container } = await renderReport(build());
    await screen.findByTestId('world-report-card');

    // Everything on screen, chrome included — headings, the hide button, the
    // link text. Not the payload: the pixels.
    expect(container.textContent ?? '').not.toMatch(DEBT_WORDS);
  });

  it.each(cases)('%s: no label a screen reader speaks carries one either', async (_label, build) => {
    const { container } = await renderReport(build());
    await screen.findByTestId('world-report-card');

    // A debt word is a debt word whether it is painted or spoken. Sweeping
    // only textContent would let one hide in an aria-label or a tooltip.
    const spoken = Array.from(container.querySelectorAll('*'))
      .flatMap((node) => ['aria-label', 'title', 'alt'].map((attr) => node.getAttribute(attr)))
      .filter((value): value is string => value !== null)
      .join(' ');
    expect(spoken).not.toMatch(DEBT_WORDS);
  });

  it.each(cases)('%s: it grades nobody and ranks nothing (Rule 8)', async (_label, build) => {
    const { container } = await renderReport(build());
    await screen.findByTestId('world-report-card');

    const rendered = container.textContent ?? '';
    expect(rendered).not.toMatch(/\b(?:rank|ranked|ranking|position|placed|top\s+\d|#\d|tier)\b/i);
    // No bar, no meter, no gauge — a graded shape is a grade even unlabelled.
    expect(container.querySelector('progress, meter, [role="progressbar"]')).toBeNull();
  });

  it('renders a clan that hunted without them as an open door', async () => {
    await renderReport(busyWorld(A_WEEK_AGO));
    const clan = await screen.findByTestId('world-report-section-clan');
    expect(clan).toHaveTextContent('HOLLOW FANG reached Depth 51,000 segments without you');
    expect(clan).toHaveTextContent('they left the door open');
  });

  it('always shows what still stands, and says so outright', async () => {
    await renderReport(busyWorld(A_SEASON_AGO));
    expect(await screen.findByTestId('world-report-section-standing')).toHaveTextContent(
      'Nothing of yours moved while you were away.'
    );
  });
});

describe('it reads meaningfully at N = 1', () => {
  // Two real players: no clan, no settled rows, no records anywhere in the
  // world. This is the DEFAULT case for this game, not an edge case.
  const alone = () => reportFor(A_MONTH_AGO);

  it('still renders a card — the spine is the calendar, not the crowd', async () => {
    const { container } = await renderReport(alone());
    await screen.findByTestId('world-report-card');

    expect(screen.getByTestId('world-report-section-weeks')).toBeInTheDocument();
    expect(screen.getByTestId('world-report-section-standing')).toBeInTheDocument();
    expect(screen.getByTestId('world-report-section-today')).toBeInTheDocument();
    // Substantial, not a stub: five weeks of calendar and a day still to play.
    expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(6);
  });

  it('names each submerged week by its conditions, which exist at any population', async () => {
    await renderReport(alone());
    const weeks = await screen.findByTestId('world-report-section-weeks');
    expect(weeks).toHaveTextContent('5 Serpent weeks surfaced and submerged.');
    expect(weeks.textContent ?? '').toMatch(/Week of \d+ \w+ 2026 · .+ — /);
  });

  it('omits the crowd sections rather than rendering them empty', async () => {
    await renderReport(alone());
    await screen.findByTestId('world-report-card');

    // No empty roster, no "0 records", no apology for a small world.
    expect(screen.queryByTestId('world-report-section-clan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('world-report-section-records')).not.toBeInTheDocument();
  });

  it('renders no empty list item anywhere', async () => {
    const { container } = await renderReport(alone());
    await screen.findByTestId('world-report-card');

    for (const item of Array.from(container.querySelectorAll('li'))) {
      expect((item.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('still offers today — the way back in exists at any population', async () => {
    await renderReport(alone());
    const today = await screen.findByTestId('world-report-section-today');
    expect(today.textContent ?? '').toMatch(/Today's Signal: .+ — .+\./);
    expect(today).toHaveTextContent('The Serpent is up.');
  });
});

describe('it requests no claim and offers nothing to collect (§12.2)', () => {
  it('makes exactly one request, a GET, with no body', async () => {
    const fetchMock = answerWith({ live: true, report: busyWorld(A_MONTH_AGO) });
    render(<WorldReportCard token="test-token" />);
    await screen.findByTestId('world-report-card');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/report');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('renders no control that could claim, collect or dismiss-forever', async () => {
    const { container } = await renderReport(busyWorld(A_MONTH_AGO));
    await screen.findByTestId('world-report-card');

    // Exactly one button, and it closes the card. Nothing else is pressable.
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('data-testid', 'world-report-close');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('links only readable artifacts, never an endpoint', async () => {
    const { container } = await renderReport(busyWorld(A_MONTH_AGO));
    await screen.findByTestId('world-report-card');

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // Rule 14: a Serpent week or a Signal day, both already public.
      expect(href).toMatch(/^https:\/\/[^/]+\/(?:w|s)\//);
      expect(href).not.toMatch(/\/api\//);
      expect(href).not.toMatch(/claim|collect|redeem|grant/i);
    }
  });

  it('carries no currency and no claim field in the payload it consumes', async () => {
    const report = busyWorld(A_MONTH_AGO);
    const raw = JSON.stringify(report);
    expect(raw).not.toMatch(/"(?:claimUrl|claim|collect|amount|reward|expiresAt|pending|owed)"/i);
    // No balance is reported on return, so no currency noun names one. The
    // engine's own effect copy is excluded: `todaySection` quotes the shipped
    // anomaly string verbatim, and describing a mechanic that pays DNA is not
    // reporting a balance. Every string this feature AUTHORS is swept.
    const authored = [
      report.headline,
      ...report.sections
        .filter((entry) => entry.id !== 'today')
        .flatMap((entry) => [entry.title, ...entry.lines.map((line) => line.text)]),
    ].join('\n');
    expect(authored).not.toMatch(/\b(?:DNA|energy|charges?|balance|wallet|credits?|gems?|XP)\b/i);
  });

  it('closing writes nothing and asks for nothing', async () => {
    const fetchMock = answerWith({ live: true, report: busyWorld(A_MONTH_AGO) });
    render(<WorldReportCard token="test-token" />);
    await screen.findByTestId('world-report-card');

    fireEvent.click(screen.getByTestId('world-report-close'));

    expect(screen.queryByTestId('world-report-card')).not.toBeInTheDocument();
    // Still one call: closing marks nothing seen. There is no row to write and
    // no state for a returning player to be behind on.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('it renders nothing when there is nothing to report', () => {
  it('renders nothing when the server has no report for this player', async () => {
    const { container } = await renderReport(null);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when the server answers live: false', async () => {
    answerWith({ live: false, report: null });
    const { container } = render(<WorldReportCard token="test-token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('reads nothing at all without a token', async () => {
    const fetchMock = answerWith({ live: true, report: busyWorld(A_WEEK_AGO) });
    const { container } = render(<WorldReportCard token={undefined} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing on a failed read — no error state, no retry, no apology', async () => {
    // There is nothing here a player can act on, so an error message would be
    // noise on the one screen meant to make coming back feel good. The failure
    // is already in Sentry, server-side (Rule 11).
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 } as unknown as Response) as unknown as typeof fetch;
    const { container } = render(<WorldReportCard token="test-token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when the request throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { container } = render(<WorldReportCard token="test-token" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
