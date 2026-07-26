/**
 * The deterministic weekly settlement email.
 *
 * Four properties are asserted here, and they are the four the work package
 * exists to guarantee:
 *
 *   1. It renders from settlement data — the `GET /api/serpent/panel` payload.
 *   2. There is no model in the path. No `openai` import, no narration import,
 *      and no network call of any kind during composition.
 *   3. Rule 7 structurally: subject, HTML and text are swept for commercial
 *      vocabulary, and the sender REFUSES a message that trips the sweep.
 *   4. Opt-in only: an unconfirmed, unsubscribed, anonymous or opted-out
 *      recipient produces no request at all.
 *
 * Plus Rule 5 — a missed week renders honestly — and the flag-off path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The flag is defaulted OFF in `config.ts`, and every test below except the
// flag-off block is about the armed behaviour. `jest.mock` is hoisted above
// the imports, which a plain `process.env` assignment here would not be — the
// env parsing itself is pinned separately in `config.test.ts`.
jest.mock('@/lib/growth/config', () => ({ SETTLEMENT_DISPATCH_V1: true }));

import {
  EMAIL_PREFERENCES_URL,
  buildSettlementEmailModel,
  isSettlementMailable,
  personalWeekLines,
  recipientUnsubscribeUrl,
  sendSettlementEmail,
  settlementEmailHtml,
  settlementEmailSubject,
  settlementEmailText,
  type PlayerRecipient,
  type DispatchRecipient,
  type SettlementEmailModel,
} from './settlementEmail';
import { commercialTerms, sweepMessage } from './commercialLanguage';
import { emptySerpentPanel, type SerpentPanel } from '@/lib/server/serpent';
import type { WaitlistRow } from './dispatchWaitlist';

const WEEK = '2026-07-13';
const NOW = Date.parse('2026-07-29T12:00:00.000Z');

function panel(overrides: Partial<SerpentPanel> = {}): SerpentPanel {
  const base = emptySerpentPanel();
  return {
    ...base,
    live: true,
    you: {
      ...base.you,
      depth: 1240,
      attempts: 5,
      bestWeekDepth: 1240,
      lifetimeDepth: 3100,
    },
    clan: {
      id: 'clan-uuid',
      name: 'Hollow Fang',
      tag: 'HFG',
      memberCount: 3,
      depth: 4820,
      bestWeekDepth: 4820,
      lifetimeDepth: 9900,
      members: [
        { playerId: 'p1', handle: 'Sans_Souci', depth: 1240, attempts: 5 },
        { playerId: 'p2', handle: 'Nadir', depth: 2100, attempts: 6 },
        { playerId: 'p3', handle: 'Coil', depth: 1480, attempts: 4 },
      ],
      hiddenMembers: 0,
    },
    history: [
      { weekStart: WEEK, depth: 1240, clanDepth: 4820 },
      { weekStart: '2026-07-06', depth: 860, clanDepth: 3100 },
    ],
    chronicle: [],
    ...overrides,
  };
}

/** The player was away for the settled week: no history row for it. */
function missedWeekPanel(): SerpentPanel {
  const base = panel();
  return {
    ...base,
    you: { ...emptySerpentPanel().you },
    history: [{ weekStart: '2026-07-06', depth: 860, clanDepth: 3100 }],
  };
}

function model(personal = true, source: SerpentPanel = panel()): SettlementEmailModel {
  const built = buildSettlementEmailModel(source, WEEK, { personal }, NOW);
  expect(built).not.toBeNull();
  return built!;
}

const confirmedRow: WaitlistRow = {
  id: 'row-1',
  email: 'hunter@example.com',
  status: 'confirmed',
  confirmationSentAt: '2026-07-01T00:00:00.000Z',
  confirmationExpiresAt: '2026-07-03T00:00:00.000Z',
  confirmedAt: '2026-07-01T00:10:00.000Z',
  unsubscribedAt: null,
};

const dispatchRecipient: DispatchRecipient = {
  kind: 'dispatch',
  email: 'hunter@example.com',
  row: confirmedRow,
  unsubscribeToken: 'a'.repeat(32),
};

const playerRecipient: PlayerRecipient = {
  kind: 'player',
  email: 'player@example.com',
  optIn: true,
  emailConfirmedAt: '2026-06-01T00:00:00.000Z',
  isAnonymous: false,
};

// ---------------------------------------------------------------------------

describe('the email renders from settlement data', () => {
  it('carries the week, its conditions and the settled numbers', () => {
    const m = model();
    expect(m.weekKey).toBe(WEEK);
    expect(m.weekLabel).toBe('13 July 2026');
    expect(m.conditions.length).toBeGreaterThan(0);
    expect(m.worldLines[0]).toBe(`SUPASNAKE · World Serpent · week of ${WEEK}`);
    expect(m.worldLines).toContain(
      'HOLLOW FANG reached Depth 4,820 — best week yet'
    );
    expect(m.weekUrl).toContain(`/w/${WEEK}`);
  });

  it('renders the settled numbers into both bodies, and escapes HTML', () => {
    const m = model();
    const links = { unsubscribeUrl: EMAIL_PREFERENCES_URL };
    const html = settlementEmailHtml(m, links);
    const text = settlementEmailText(m, links);

    expect(settlementEmailSubject(m)).toBe(
      'SupaSnake — the Serpent week of 13 July 2026'
    );
    expect(html).toContain('4,820');
    expect(text).toContain('4,820');
    expect(html).toContain('unsubscribe');
    expect(text).toContain('Unsubscribe: ');
  });

  it('escapes a clan name that contains markup rather than emitting it', () => {
    const hostile = panel();
    hostile.clan!.name = 'Fang <script>x</script>';
    const m = model(true, hostile);
    const html = settlementEmailHtml(m, { unsubscribeUrl: EMAIL_PREFERENCES_URL });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;SCRIPT&gt;');
  });

  it('a Dispatch-list send carries no player data at all', () => {
    const m = model(false);
    expect(m.personalLines).toBeNull();
    const text = settlementEmailText(m, { unsubscribeUrl: 'https://x/u' });
    expect(text).not.toContain('YOUR WEEK');
    expect(text).not.toContain('You fed');
  });

  it('refuses a week key that names no Serpent week', () => {
    expect(buildSettlementEmailModel(panel(), '2026-07-14', { personal: true }, NOW))
      .toBeNull();
    expect(buildSettlementEmailModel(panel(), 'nonsense', { personal: true }, NOW))
      .toBeNull();
  });
});

describe('there is no LLM in this path', () => {
  const source = readFileSync(
    join(__dirname, 'settlementEmail.ts'),
    'utf8'
  );
  const postSource = readFileSync(join(__dirname, 'settlementPost.ts'), 'utf8');

  it('imports no OpenAI client and no narration module', () => {
    for (const file of [source, postSource]) {
      expect(file).not.toMatch(/from\s+['"]openai['"]/);
      expect(file).not.toMatch(/@\/lib\/analyst\/narrate/);
      expect(file).not.toMatch(/generateWeeklyDigest|budgetRemaining|ArtifactContent/);
      expect(file).not.toMatch(/api\.openai\.com|chat\/completions/);
    }
  });

  it('composes the whole message without touching the network', async () => {
    const spy = jest.fn();
    const original = global.fetch;
    global.fetch = spy as unknown as typeof fetch;
    try {
      const m = model();
      settlementEmailSubject(m);
      settlementEmailHtml(m, { unsubscribeUrl: 'https://x/u' });
      settlementEmailText(m, { unsubscribeUrl: 'https://x/u' });
      personalWeekLines(panel(), WEEK, NOW);
    } finally {
      global.fetch = original;
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('is deterministic — the same week composes byte-identically twice', () => {
    const links = { unsubscribeUrl: 'https://x/u' };
    const first = settlementEmailText(model(), links);
    const second = settlementEmailText(model(), links);
    expect(first).toBe(second);
  });
});

describe('opt-in only', () => {
  const refused: [string, Parameters<typeof isSettlementMailable>[0]][] = [
    ['a Dispatch address that never confirmed', {
      ...dispatchRecipient,
      row: { ...confirmedRow, status: 'pending', confirmedAt: null },
    }],
    ['a Dispatch address that unsubscribed', {
      ...dispatchRecipient,
      row: {
        ...confirmedRow,
        status: 'unsubscribed',
        confirmedAt: null,
        unsubscribedAt: '2026-07-02T00:00:00.000Z',
      },
    }],
    ['a confirmed status with no confirmation timestamp', {
      ...dispatchRecipient,
      row: { ...confirmedRow, confirmedAt: null },
    }],
    ['a Dispatch address with no row at all', { ...dispatchRecipient, row: null }],
    ['a Dispatch address with no unsubscribe token', {
      ...dispatchRecipient,
      unsubscribeToken: '',
    }],
    ['a player who never opted in', { ...playerRecipient, optIn: false }],
    ['a player whose address never confirmed', {
      ...playerRecipient,
      emailConfirmedAt: null,
    }],
    ['an anonymous session', { ...playerRecipient, isAnonymous: true }],
    ['a player with no address', { ...playerRecipient, email: null }],
  ];

  it.each(refused)('never mails %s', (_label, recipient) => {
    expect(isSettlementMailable(recipient)).toBe(false);
  });

  it('mails a confirmed Dispatch address and an opted-in registered player', () => {
    expect(isSettlementMailable(dispatchRecipient)).toBe(true);
    expect(isSettlementMailable(playerRecipient)).toBe(true);
  });

  it('a refused recipient produces no request at all', async () => {
    const send = jest.fn();
    process.env.RESEND_API_KEY = 'test-key';
    const result = await sendSettlementEmail({
      recipient: { ...dispatchRecipient, row: { ...confirmedRow, status: 'pending', confirmedAt: null } },
      model: model(),
      fetchImpl: send as unknown as typeof fetch,
    });
    delete process.env.RESEND_API_KEY;
    expect(result).toBe('not-mailable');
    expect(send).not.toHaveBeenCalled();
  });

  it('gives the Dispatch branch a token unsubscribe link and the player branch their settings', () => {
    expect(recipientUnsubscribeUrl(dispatchRecipient)).toContain(
      '/dispatch/unsubscribe?token='
    );
    expect(recipientUnsubscribeUrl(playerRecipient)).toBe(EMAIL_PREFERENCES_URL);
  });
});

describe('Rule 5 — a missed week', () => {
  it('reports the week honestly and takes nothing away', () => {
    const lines = personalWeekLines(missedWeekPanel(), WEEK, NOW);
    expect(lines).not.toBeNull();
    const prose = lines!.join(' ');
    expect(prose).toContain('You did not hunt this week.');
    expect(prose).toContain('Nothing of yours went with them');
    expect(prose).toContain('Your deepest week still stands at 860 segments.');
    expect(prose).toContain('the next week is a fresh one');
  });

  it('never guilts, never implies decay, never demands a return', () => {
    const m = buildSettlementEmailModel(missedWeekPanel(), WEEK, { personal: true }, NOW)!;
    const body = [
      settlementEmailSubject(m),
      settlementEmailText(m, { unsubscribeUrl: EMAIL_PREFERENCES_URL }),
    ].join('\n');
    expect(body).not.toMatch(
      /you lost|forfeit|expired|decay|decayed|reset|streak|falling behind|come back|we miss you|don'?t lose/i
    );
  });

  it('is not a shorter or emptier email than a hunted week', () => {
    const away = buildSettlementEmailModel(missedWeekPanel(), WEEK, { personal: true }, NOW)!;
    expect(away.personalLines!.length).toBeGreaterThanOrEqual(3);
    expect(away.worldLines.length).toBeGreaterThan(0);
  });
});

describe('Rule 7, structurally', () => {
  const links = { unsubscribeUrl: 'https://supasnake.com/dispatch/unsubscribe?token=abc' };
  const variants: [string, () => SettlementEmailModel][] = [
    ['a clan week, personal', () => model(true)],
    ['a clan week, list-only', () => model(false)],
    ['a missed week', () => model(true, missedWeekPanel())],
    ['no clan', () => model(true, { ...panel(), clan: null })],
  ];

  it.each(variants)('carries zero commercial vocabulary: %s', (_label, build) => {
    const m = build();
    const hits = sweepMessage({
      subject: settlementEmailSubject(m),
      html: settlementEmailHtml(m, links),
      text: settlementEmailText(m, links),
    });
    expect(hits).toEqual([]);
  });

  it('the required unsubscribe wording survives the sweep', () => {
    const m = model();
    expect(settlementEmailText(m, links)).toContain('Unsubscribe: ');
    expect(commercialTerms(settlementEmailText(m, links))).toEqual([]);
  });

  it('carries no price, no store link and no call to buy', () => {
    const text = settlementEmailText(model(), links);
    expect(text).not.toMatch(/[$€£]/);
    expect(text).not.toMatch(/\/shop|\/store|\/pricing|checkout|stripe/i);
  });

  it('refuses to send a message that trips the sweep, instead of sending it', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const send = jest.fn();
    const selling = model();
    selling.worldLines = [...selling.worldLines, 'The Founder bundle is 20% off'];
    const result = await sendSettlementEmail({
      recipient: dispatchRecipient,
      model: selling,
      fetchImpl: send as unknown as typeof fetch,
    });
    delete process.env.RESEND_API_KEY;
    expect(result).toBe('refused-commercial');
    expect(send).not.toHaveBeenCalled();
    // The refusal is reported, not swallowed: a Rule 7 breach must be visible.
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('Rule 7'));
    logged.mockRestore();
  });
});

describe('the send itself', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    jest.restoreAllMocks();
  });

  it('posts to Resend once, with List-Unsubscribe, and nowhere else', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const send = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await sendSettlementEmail({
      recipient: dispatchRecipient,
      model: model(),
      fetchImpl: send as unknown as typeof fetch,
    });

    expect(result).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(url).not.toMatch(/openai/);
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(['hunter@example.com']);
    expect(body.headers['List-Unsubscribe']).toMatch(/^<https:\/\/.*\/dispatch\/unsubscribe/);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('advertises the unsubscribe link for a player without claiming one-click', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const send = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await sendSettlementEmail({
      recipient: playerRecipient,
      model: model(),
      fetchImpl: send as unknown as typeof fetch,
    });
    const body = JSON.parse(String((send.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.headers['List-Unsubscribe']).toBe(`<${EMAIL_PREFERENCES_URL}>`);
    expect(body.headers['List-Unsubscribe-Post']).toBeUndefined();
  });

  it('is non-fatal: a rejected send reports rather than throwing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const send = jest.fn().mockResolvedValue({ ok: false, status: 422 });
    await expect(
      sendSettlementEmail({
        recipient: dispatchRecipient,
        model: model(),
        fetchImpl: send as unknown as typeof fetch,
      })
    ).resolves.toBe('failed');

    const throwing = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(
      sendSettlementEmail({
        recipient: dispatchRecipient,
        model: model(),
        fetchImpl: throwing as unknown as typeof fetch,
      })
    ).resolves.toBe('failed');
  });

  it('sends nothing without a Resend key', async () => {
    const send = jest.fn();
    const result = await sendSettlementEmail({
      recipient: dispatchRecipient,
      model: model(),
      fetchImpl: send as unknown as typeof fetch,
    });
    expect(result).toBe('disabled');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('flag off — the rollback path, tested rather than inferred', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    jest.resetModules();
  });

  async function loadWithFlag(on: boolean) {
    jest.resetModules();
    jest.doMock('@/lib/growth/config', () => ({ SETTLEMENT_DISPATCH_V1: on }));
    return import('./settlementEmail');
  }

  it('is disabled with the flag down, even with a Resend key present', async () => {
    const mod = await loadWithFlag(false);
    process.env.RESEND_API_KEY = 'test-key';
    expect(mod.settlementEmailEnabled()).toBe(false);
  });

  it('sends nothing at all with the flag down, even to a confirmed address', async () => {
    const mod = await loadWithFlag(false);
    process.env.RESEND_API_KEY = 'test-key';
    const send = jest.fn();
    const result = await mod.sendSettlementEmail({
      recipient: dispatchRecipient,
      model: model(),
      fetchImpl: send as unknown as typeof fetch,
    });
    expect(result).toBe('disabled');
    expect(send).not.toHaveBeenCalled();
  });

  it('with the flag up, still needs a Resend key before it is enabled', async () => {
    const mod = await loadWithFlag(true);
    expect(mod.settlementEmailEnabled()).toBe(false);
    process.env.RESEND_API_KEY = 'test-key';
    expect(mod.settlementEmailEnabled()).toBe(true);
  });

  it('composition still works with the flag down — only the send is gated', async () => {
    const mod = await loadWithFlag(false);
    const built = mod.buildSettlementEmailModel(panel(), WEEK, { personal: true }, NOW);
    expect(built).not.toBeNull();
    expect(built!.worldLines.length).toBeGreaterThan(0);
  });
});
