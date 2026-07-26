/**
 * The artifact landing pages (WP-1.08).
 *
 * Two things are proven here:
 *
 * 1. FLAG OFF. With `NEXT_PUBLIC_SHARE_ARTIFACTS_V1` unset, every one of the
 *    five new pages calls `notFound()`. Tested deliberately rather than
 *    inferred from an omitted variable — the rollback path is the one CI
 *    must never guess at.
 * 2. FLAG ON. Each page resolves the artifact its URL names, and the way in
 *    (Rule 14) points at a live board on the right seed.
 *
 * The pages are async server components, so they are invoked directly and
 * their element tree is inspected — no renderer, no DOM.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { signalSeedForIndex } from '@/shared/game/challenge';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const row =
        table === 'clans'
          ? {
              id: 'c',
              name: 'Hollow Fang',
              tag: 'FANG',
              member_count: 9,
              lifetime_depth: 512000,
              best_week_depth: 48210,
            }
          : table === 'serpent_weeks'
            ? { id: 'w', seed: 'Sdeadbeef', modifiers: ['gold_rush'], settled_at: 'x' }
            : { depth: 48210, contributing_members: 7 };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.ilike = chain;
      builder.maybeSingle = async () => ({ data: row, error: null });
      return builder;
    },
  }),
}));

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;

function loadPages(flag: 'on' | 'off') {
  jest.resetModules();
  if (flag === 'on') process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = 'true';
  else delete process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;
  return {
    signal: require('./s/[day]/page').default,
    run: require('./r/[seed]/page').default,
    week: require('./w/[week]/page').default,
    clan: require('./c/[tag]/page').default,
    lineage: require('./x/[code]/page').default,
  };
}

const CALLS: Array<[string, (pages: ReturnType<typeof loadPages>) => Promise<unknown>]> = [
  ['/s/214', (p) => p.signal({ params: Promise.resolve({ day: '214' }), searchParams: Promise.resolve({}) })],
  ['/r/<seed>', (p) => p.run({ params: Promise.resolve({ seed: 'D0badf00d' }), searchParams: Promise.resolve({}) })],
  ['/w/2026-07-20', (p) => p.week({ params: Promise.resolve({ week: '2026-07-20' }), searchParams: Promise.resolve({}) })],
  ['/c/FANG', (p) => p.clan({ params: Promise.resolve({ tag: 'FANG' }) })],
  ['/x/<code>', (p) => p.lineage({ params: Promise.resolve({ code: 'Vyper~CYBER~4~slipstream' }) })],
];

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1;
  else process.env.NEXT_PUBLIC_SHARE_ARTIFACTS_V1 = ORIGINAL_FLAG;
});

describe('flag off — NEXT_PUBLIC_SHARE_ARTIFACTS_V1 unset', () => {
  it.each(CALLS)('%s is not found', async (_name, call) => {
    const pages = loadPages('off');
    await expect(call(pages)).rejects.toThrow(NOT_FOUND.message);
  });
});

describe('flag on', () => {
  let pages: any;

  beforeEach(() => {
    pages = loadPages('on');
  });

  /** Walk an element tree collecting props of interest. */
  function landingProps(element: any): any {
    expect(element).toBeTruthy();
    return element.props;
  }

  it.each(CALLS)('%s renders a landing page', async (_name, call) => {
    const props = landingProps(await call(pages));
    expect(props.card).toBeTruthy();
    expect(typeof props.actionHref).toBe('string');
    expect(props.actionLabel.length).toBeGreaterThan(0);
    // Rule 7: the landing page of an artifact carries no commercial surface.
    const copy = [
      props.actionLabel,
      props.blurb ?? '',
      props.secondary?.label ?? '',
      props.card.title,
      props.card.subtitle ?? '',
      props.card.callToAction,
    ].join(' ');
    expect(copy).not.toMatch(/\b(buy|shop|store|upgrade|premium|subscribe|sale)\b/i);
    expect(props.secondary?.href).not.toBe('/shop');
  });

  it('drops a Signal challenge onto the day seed with the target attached', async () => {
    const props = landingProps(
      await pages.signal({
        params: Promise.resolve({ day: '214' }),
        searchParams: Promise.resolve({ t: '1240', by: 'Sans_Souci', d: 'ippb' }),
      })
    );
    expect(props.actionHref).toBe(
      `/game?seed=${signalSeedForIndex(214)}&target=1240&challenge=signal%3A214&by=Sans_Souci`
    );
    expect(props.actionLabel).toBe('Take the challenge');
    expect(props.card.title).toBe("Beat Sans_Souci's 1,240");
    expect(props.card.provenance).toBe('claimed');
  });

  it('ignores a forged seed in a Signal URL', async () => {
    const props = landingProps(
      await pages.signal({
        params: Promise.resolve({ day: '214' }),
        searchParams: Promise.resolve({ seed: 'forged', t: '1240' }),
      })
    );
    expect(props.actionHref).toContain(`seed=${signalSeedForIndex(214)}`);
    expect(props.actionHref).not.toContain('forged');
  });

  it('renders the settlement card from the settled clan row', async () => {
    const props = landingProps(
      await pages.week({
        params: Promise.resolve({ week: '2026-07-20' }),
        searchParams: Promise.resolve({ c: 'fang' }),
      })
    );
    expect(props.card.title).toBe('HOLLOW FANG reached Depth 48,210 — best week yet');
    expect(props.card.provenance).toBe('verified');
  });

  it('404s an artifact whose identifier cannot be one', async () => {
    await expect(
      pages.signal({ params: Promise.resolve({ day: 'x' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow(NOT_FOUND.message);
    await expect(
      pages.run({ params: Promise.resolve({ seed: 'a/b' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow(NOT_FOUND.message);
    await expect(
      pages.week({ params: Promise.resolve({ week: '2026-07-22' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow(NOT_FOUND.message);
    // A lowercase tag IS valid — `/c/fang` and `/c/FANG` are the same clan,
    // because a link read off a screenshot should not depend on shift keys.
    await expect(pages.clan({ params: Promise.resolve({ tag: 'WAYTOOLONG' }) })).rejects.toThrow(
      NOT_FOUND.message
    );
    await expect(pages.clan({ params: Promise.resolve({ tag: 'a-b' }) })).rejects.toThrow(
      NOT_FOUND.message
    );
    await expect(pages.lineage({ params: Promise.resolve({ code: 'garbage' }) })).rejects.toThrow(
      NOT_FOUND.message
    );
  });
});
