/**
 * Route wiring for "every artifact URL renders an OG image" (WP-1.08
 * acceptance, Rule 14).
 *
 * WHY `next/og` IS MOCKED HERE. `ImageResponse` rasterises through Satori,
 * which loads its WASM by dynamic import — impossible under Jest's CommonJS
 * VM without `--experimental-vm-modules`, and not worth reconfiguring the
 * whole suite for. Turning the flag on would also make these the slowest
 * tests in the repository by an order of magnitude.
 *
 * So the split is deliberate and stated: this file proves every route
 * RESOLVES — the right card model for the right params, and a real card for
 * every malformed input rather than a throw — and `e2e/share-artifacts.
 * spec.ts` proves the bytes, fetching each `opengraph-image` URL from a live
 * server and asserting an image content type and a non-trivial body. Neither
 * half is sufficient alone; both run in CI.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ArtifactCardModel } from '@/lib/og/artifactCard';

/** Every card the routes under test asked to render, in order. */
const rendered: ArtifactCardModel[] = [];

jest.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: { props: ArtifactCardModel }) {
      // A stand-in body: the real PNG's size is asserted in the e2e spec.
      super(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        headers: { 'content-type': 'image/png' },
      });
      rendered.push(element.props);
    }
  },
}));

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

const signalImage = require('./s/[day]/opengraph-image').default;
const runImage = require('./r/[seed]/opengraph-image').default;
const weekImage = require('./w/[week]/opengraph-image').default;
const clanImage = require('./c/[tag]/opengraph-image').default;
const lineageImage = require('./x/[code]/opengraph-image').default;
const profileImage = require('./p/[handle]/opengraph-image').default;
const challengeImage = require('./og/challenge/route').GET;

beforeEach(() => {
  rendered.length = 0;
});

async function assertImageResponse(response: Response): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/^image\//);
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
}

/** The route reads only `nextUrl`; jsdom has no Next server to build one. */
function nextRequest(url: string) {
  const request = new Request(url);
  Object.defineProperty(request, 'nextUrl', {
    value: new URL(url),
    configurable: true,
  });
  return request as any;
}

function lastCard(): ArtifactCardModel {
  expect(rendered).toHaveLength(1);
  return rendered[0];
}

describe('every artifact class has an opengraph-image route that resolves', () => {
  it('Signal day — /s/214', async () => {
    await assertImageResponse(await signalImage({ params: Promise.resolve({ day: '214' }) }));
    const card = lastCard();
    expect(card.kicker).toContain('#214');
    expect(card.stats?.some((stat) => stat.label === 'Seed')).toBe(true);
    // A bare Signal link claims nothing.
    expect(card.provenance).toBe('verified');
  });

  it('run — /r/<seed>', async () => {
    await assertImageResponse(
      await runImage({ params: Promise.resolve({ seed: 'D0badf00d' }) })
    );
    expect(lastCard().stats).toContainEqual({ label: 'Seed', value: 'D0badf00d' });
  });

  it('Serpent week — /w/2026-07-20', async () => {
    await assertImageResponse(
      await weekImage({ params: Promise.resolve({ week: '2026-07-20' }) })
    );
    const card = lastCard();
    expect(card.kicker).toContain('2026-07-20');
    expect(card.provenance).toBe('verified');
  });

  it('clan — /c/FANG, falling back when the tag resolves to nothing', async () => {
    await assertImageResponse(await clanImage({ params: Promise.resolve({ tag: 'FANG' }) }));
    expect(lastCard().kicker).toBe('Clan');
  });

  it('lineage — /x/<code>', async () => {
    await assertImageResponse(
      await lineageImage({ params: Promise.resolve({ code: 'Vyper~CYBER~4~slipstream' }) })
    );
    const card = lastCard();
    expect(card.title).toBe('Vyper');
    expect(card.kicker).toBe('Lineage · CYBER');
    // Everything on it came out of the link.
    expect(card.provenance).toBe('claimed');
  });

  it('profile — /p/<handle>', async () => {
    await assertImageResponse(
      await profileImage({ params: Promise.resolve({ handle: 'Sans_Souci' }) })
    );
    expect(lastCard().kicker).toBe('Chronicle');
  });
});

describe('the challenge image route carries the dare the file convention cannot see', () => {
  it('renders a Signal target and the decision arc', async () => {
    await assertImageResponse(
      await challengeImage(
        nextRequest(
          'https://supasnake.com/og/challenge?kind=signal&day=214&t=1240&by=Sans_Souci&d=ippb'
        )
      )
    );
    const card = lastCard();
    expect(card.title).toBe("Beat Sans_Souci's 1,240");
    expect(card.glyphs).toBe('⚡▶▶💰');
    expect(card.subtitle).toBe('infuse · pass · pass · BANKED ×1.25');
    expect(card.provenance).toBe('claimed');
  });

  it('renders a run target with its dynasty', async () => {
    await assertImageResponse(
      await challengeImage(
        nextRequest('https://supasnake.com/og/challenge?kind=run&seed=D0badf00d&t=900&dy=primal')
      )
    );
    const card = lastCard();
    expect(card.kicker).toBe('Run · PRIMAL');
    expect(card.title).toBe('Beat 900');
  });

  it('ignores a dynasty that is not one of the three', async () => {
    await assertImageResponse(
      await challengeImage(
        nextRequest('https://supasnake.com/og/challenge?kind=run&seed=abc&dy=EMBER')
      )
    );
    expect(lastCard().kicker).toBe('Run');
  });

  it('derives a Signal seed from the day even when the query forges one', async () => {
    await assertImageResponse(
      await challengeImage(
        nextRequest('https://supasnake.com/og/challenge?kind=signal&day=214&seed=forged')
      )
    );
    expect(lastCard().stats).not.toContainEqual({ label: 'Seed', value: 'forged' });
  });
});

describe('a malformed artifact URL still renders a real card, never a grey box', () => {
  it('an unparseable Signal day falls back to today', async () => {
    await assertImageResponse(
      await signalImage({ params: Promise.resolve({ day: 'not-a-day' }) })
    );
    expect(lastCard().kicker).toMatch(/^World Signal · #\d+ · \d{4}-\d{2}-\d{2}$/);
  });

  it('an unusable run seed falls back to a Signal card', async () => {
    await assertImageResponse(await runImage({ params: Promise.resolve({ seed: 'a/b' }) }));
    expect(lastCard().kicker).toContain('World Signal');
  });

  it('a week that is not a Monday falls back to the current week', async () => {
    await assertImageResponse(
      await weekImage({ params: Promise.resolve({ week: '2026-07-22' }) })
    );
    expect(lastCard().kicker).toContain('World Serpent');
  });

  it('an undecodable lineage code falls back to a generic card', async () => {
    await assertImageResponse(
      await lineageImage({ params: Promise.resolve({ code: 'garbage' }) })
    );
    expect(lastCard().title).toBe('Every snake is bred, not bought');
  });

  it('an invalid handle falls back to a generic Chronicle card', async () => {
    await assertImageResponse(
      await profileImage({ params: Promise.resolve({ handle: 'handler-0001' }) })
    );
    expect(lastCard().title).toBe('Where skill creates legacy');
  });

  it('a malformed challenge seed still produces an image', async () => {
    await assertImageResponse(
      await challengeImage(nextRequest('https://supasnake.com/og/challenge?kind=run&seed=a/b'))
    );
    expect(lastCard().kicker).toContain('World Signal');
  });
});

describe('no card carries a commercial surface (Rule 7)', () => {
  it('holds for every card these routes can produce', async () => {
    await signalImage({ params: Promise.resolve({ day: '214' }) });
    await runImage({ params: Promise.resolve({ seed: 'D0badf00d' }) });
    await weekImage({ params: Promise.resolve({ week: '2026-07-20' }) });
    await clanImage({ params: Promise.resolve({ tag: 'FANG' }) });
    await lineageImage({ params: Promise.resolve({ code: 'Vyper~CYBER~4~' }) });
    await profileImage({ params: Promise.resolve({ handle: 'Sans_Souci' }) });

    expect(rendered).toHaveLength(6);
    for (const card of rendered) {
      const text = [card.kicker, card.title, card.subtitle, card.callToAction]
        .concat((card.stats ?? []).map((stat) => `${stat.label} ${stat.value}`))
        .join(' ');
      expect(text).not.toMatch(/\b(buy|shop|store|upgrade|premium|subscribe|sale)\b/i);
      expect(text).not.toMatch(/[€$]\s?\d/);
      // Rules 5 and 6: nothing on a card may imply a loss.
      expect(text).not.toMatch(/\b(lost|expired|forfeit|decayed|dropped to)\b/i);
    }
  });
});
