/**
 * @jest-environment node
 *
 * Digest email tests (Identity v1 §9.2): no-key no-op, HTML escaping of
 * artifact text (belt-and-braces on top of the narration denylist), and
 * the non-fatal send contract.
 */

import { digestEmailEnabled, digestEmailHtml, sendDigestEmail } from './email';
import type { DigestFacts } from './facts';

const facts: DigestFacts = {
  kind: 'weekly_digest',
  weekStart: '2026-07-06',
  runs: 5,
  earningRuns: 4,
  extractions: 3,
  extractionRatePct: 75,
  totalDna: 900,
  bestScore: 400,
  bestDnaRun: 350,
  activeDays: 3,
  dynastyRuns: { PRIMAL: 4 },
  topDynasty: 'PRIMAL',
  deathCauses: {},
  contracts: null,
  streak: 4,
  recordsAdvanced: [],
};

const content = {
  headline: 'A 900 DNA week',
  body: 'You banked 900 DNA across 4 earning runs.',
  tips: ['Best run: 350.'],
};

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
  jest.restoreAllMocks();
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe('digestEmailHtml', () => {
  it('renders headline, body, tips and the stats grid', () => {
    const html = digestEmailHtml({ handle: 'Souci', weekStart: '2026-07-06', content, facts });
    expect(html).toContain('A 900 DNA week');
    expect(html).toContain('Week of 2026-07-06');
    expect(html).toContain('900'); // DNA banked stat
    expect(html).toContain('75%');
    expect(html).toContain('Best run: 350.');
    expect(html).toContain('OPEN YOUR CHRONICLE');
  });

  it('escapes HTML in artifact text', () => {
    const html = digestEmailHtml({
      handle: 'x',
      weekStart: '2026-07-06',
      content: { ...content, headline: '<script>alert(1)</script>' },
      facts: null,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sendDigestEmail', () => {
  it('no RESEND_API_KEY: disabled and returns false without fetching', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');
    expect(digestEmailEnabled()).toBe(false);
    const sent = await sendDigestEmail({
      to: 'a@b.c',
      handle: 'x',
      weekStart: '2026-07-06',
      content,
      facts,
    });
    expect(sent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Resend with the bearer key and supasnake.com sender', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const sent = await sendDigestEmail({
      to: 'a@b.c',
      handle: 'x',
      weekStart: '2026-07-06',
      content,
      facts,
    });
    expect(sent).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe('SupaSnake <noreply@supasnake.com>');
    expect(body.to).toEqual(['a@b.c']);
  });

  it('non-2xx and network errors are non-fatal (false, no throw)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 500 } as Response);
    expect(
      await sendDigestEmail({ to: 'a@b.c', handle: 'x', weekStart: 'w', content, facts })
    ).toBe(false);

    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(
      await sendDigestEmail({ to: 'a@b.c', handle: 'x', weekStart: 'w', content, facts })
    ).toBe(false);
  });
});
