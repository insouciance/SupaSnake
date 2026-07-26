/**
 * `/contract` — the player's contract as a page (Constitution §3, §11.6).
 *
 * §11.6 names this surface directly: the spike channels (Show HN, Product
 * Hunt, r/WebGames) aim at "the player contract published at a linkable URL
 * as the manifesto", because "the fair live game — real pull, no predation"
 * is the one story a predatory competitor cannot run without dismantling its
 * own revenue model.
 *
 * THREE THINGS THIS PAGE IS NOT
 *
 *   1. **Not marketing.** No pitch line, no screenshots, no urgency, no
 *      superlatives. Nine clauses, each with the question you check it with.
 *      A manifesto that reads like an advert is an advert.
 *   2. **Not commerce** (Rule 7). Zero commercial surfaces: no price, no
 *      SKU, no link to the district where money is discussed, no waitlist
 *      field, no call to support anything. The only link out is "play",
 *      which is free. `page.test.tsx` sweeps the rendered text with the
 *      same commercial-vocabulary lint that gates the Dispatch emails.
 *   3. **Not client-side.** Server-rendered with no interactivity, so a
 *      crawler, a screen reader, and a stranger on a slow phone all get the
 *      complete document in the first response.
 *
 * Rule 14: it has an address, a canonical URL, per-clause anchors, and an
 * Open Graph image (`opengraph-image.tsx`).
 *
 * Behind NEXT_PUBLIC_PLAYER_CONTRACT_V1 (default off) — flag off, it 404s.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/ui/NavBar';
import { PLAYER_CONTRACT_V1_ENABLED } from '@/lib/features/contract';
import {
  CONTRACT_CLAUSES,
  CONTRACT_CLOSING,
  CONTRACT_PREAMBLE,
  CONTRACT_SUMMARY,
  CONTRACT_TITLE,
} from '@/lib/growth/playerContract';
import { CANONICAL_ORIGIN, SITE_NAME } from '@/shared/config/site';

const CONTRACT_URL = `${CANONICAL_ORIGIN}/contract`;

export const metadata: Metadata = {
  title: `${CONTRACT_TITLE} — ${SITE_NAME}`,
  description: CONTRACT_SUMMARY,
  alternates: { canonical: CONTRACT_URL },
  openGraph: {
    type: 'article',
    url: CONTRACT_URL,
    title: `${CONTRACT_TITLE} — ${SITE_NAME}`,
    description: CONTRACT_SUMMARY,
  },
};

export default function ContractPage() {
  if (!PLAYER_CONTRACT_V1_ENABLED) notFound();

  return (
    <div className="app-bg min-h-screen text-bone-white">
      <NavBar />
      <main
        data-testid="player-contract"
        className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:pb-16 sm:pr-16"
      >
        <header className="space-y-5 border-b border-scale-blue-light/40 pb-8">
          <h1 className="heading-display text-3xl text-venom-orange sm:text-4xl">
            {CONTRACT_TITLE}
          </h1>
          <p className="font-body text-lg leading-relaxed text-bone-white">
            {CONTRACT_PREAMBLE}
          </p>
        </header>

        <ol className="mt-10 space-y-10">
          {CONTRACT_CLAUSES.map((clause, index) => (
            <li key={clause.id} id={clause.id} className="scroll-mt-8">
              <article className="space-y-3">
                <h2 className="heading-display text-xl leading-snug text-bone-white sm:text-2xl">
                  <span className="mr-2 text-venom-orange">{index + 1}.</span>
                  {clause.title}
                </h2>
                <p className="font-body leading-relaxed text-beige">
                  {clause.body}
                </p>
                <p className="border-l-2 border-venom-orange/60 pl-4 font-body text-sm leading-relaxed text-beige/90">
                  <span className="heading-display mr-2 uppercase tracking-widest text-venom-orange">
                    How you check it
                  </span>
                  {clause.test}
                </p>
                <p className="pt-1">
                  <Link
                    href={`/contract#${clause.id}`}
                    className="font-body text-xs uppercase tracking-widest text-scale-blue-light hover:text-venom-orange"
                  >
                    Link to this clause
                  </Link>
                </p>
              </article>
            </li>
          ))}
        </ol>

        <footer className="mt-12 space-y-6 border-t border-scale-blue-light/40 pt-8">
          <p className="font-body leading-relaxed text-beige">
            {CONTRACT_CLOSING}
          </p>
          <Link
            href="/"
            data-testid="contract-play-link"
            className="btn-go inline-flex min-h-[56px] items-center px-10 py-3 text-xl"
          >
            Play a run
          </Link>
        </footer>
      </main>
    </div>
  );
}
