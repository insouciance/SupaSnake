/** @jest-environment node */

import {
  confirmationEmailHtml,
  confirmationEmailText,
  confirmationUrl,
  dispatchEmailEnabled,
  sendDispatchConfirmationEmail,
  unsubscribeUrl,
} from './dispatchEmail';

const CONFIRM = 'https://supasnake.com/dispatch/confirm?token=abc';
const UNSUB = 'https://supasnake.com/dispatch/unsubscribe?token=xyz';

describe('dispatch email links', () => {
  it('always points at the canonical origin', () => {
    expect(confirmationUrl('abc')).toBe(CONFIRM);
    expect(unsubscribeUrl('xyz')).toBe(UNSUB);
  });

  it('encodes tokens into the query string', () => {
    expect(confirmationUrl('a+b/c')).toContain('token=a%2Bb%2Fc');
  });
});

describe('confirmation email content', () => {
  const html = confirmationEmailHtml({
    confirmUrl: CONFIRM,
    unsubscribeUrl: UNSUB,
  });
  const text = confirmationEmailText({
    confirmUrl: CONFIRM,
    unsubscribeUrl: UNSUB,
  });

  it('carries the confirmation link and says nothing is sent until it is clicked', () => {
    expect(html).toContain(CONFIRM);
    expect(html).toMatch(/nothing is sent until you do/i);
    expect(text).toContain(CONFIRM);
  });

  it('carries an unsubscribe link', () => {
    expect(html).toContain(UNSUB);
    expect(text).toContain(UNSUB);
  });

  it('carries the operator identity required of a commercial e-mail sender', () => {
    expect(html).toContain('Insoucience Technologies GmbH');
    expect(html).toContain('support@supasnake.com');
  });

  it('is not commercial (Rule 7): no offer, price, or purchase language', () => {
    const forbidden = [
      /€/,
      /\bprice\b/i,
      /\bbuy\b/i,
      /\bpurchase\b/i,
      /\bsale\b/i,
      /\bdiscount\b/i,
      /\boffer\b/i,
      /\bpremium\b/i,
      /\bshop\b/i,
      /\bupgrade\b/i,
    ];
    for (const pattern of forbidden) {
      expect(html).not.toMatch(pattern);
      expect(text).not.toMatch(pattern);
    }
  });

  it('escapes interpolated values', () => {
    const escaped = confirmationEmailHtml({
      confirmUrl: 'https://x/?a="><script>',
      unsubscribeUrl: UNSUB,
    });
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});

describe('sendDispatchConfirmationEmail', () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('is disabled and sends nothing without an API key', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(dispatchEmailEnabled()).toBe(false);
    await expect(
      sendDispatchConfirmationEmail({
        to: 'player@example.com',
        confirmationToken: 'abc',
        unsubscribeToken: 'xyz',
      })
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Resend with a one-click unsubscribe header', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendDispatchConfirmationEmail({
        to: 'player@example.com',
        confirmationToken: 'abc',
        unsubscribeToken: 'xyz',
      })
    ).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toEqual(['player@example.com']);
    expect(body.html).toContain(CONFIRM);
    expect(body.headers['List-Unsubscribe']).toBe(`<${UNSUB}>`);
    expect(body.headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click'
    );
  });

  it('is non-fatal when Resend rejects the send', async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch;

    await expect(
      sendDispatchConfirmationEmail({
        to: 'player@example.com',
        confirmationToken: 'abc',
        unsubscribeToken: 'xyz',
      })
    ).resolves.toBe(false);
  });

  it('is non-fatal when the network throws', async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    await expect(
      sendDispatchConfirmationEmail({
        to: 'player@example.com',
        confirmationToken: 'abc',
        unsubscribeToken: 'xyz',
      })
    ).resolves.toBe(false);
  });
});
