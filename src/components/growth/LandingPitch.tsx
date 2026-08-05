'use client';

/**
 * The landing page's below-the-fold meaning (Constitution §11.4):
 * "the Chamber stays; add one pitch line … and below-the-fold 'what is
 * this' for scrollers and crawlers."
 *
 * Two constraints shaped this component and must survive every future edit:
 *
 * 1. **It lives entirely below the fold.** It renders after the 100dvh
 *    Chamber, so the §5 protection holds exactly: LAUNCH is in the same
 *    place, at the same tap count, for a visitor who never scrolls.
 * 2. **It is not commerce** (Rule 7). No price, no SKU, no store link —
 *    what the product refuses to be is the pitch (§11.1).
 */

import Link from 'next/link';
import { DispatchWaitlistForm } from '@/components/growth/DispatchWaitlistForm';
import { SITE_NAME } from '@/shared/config/site';

const CHOICES = [
  {
    key: 'bank',
    label: 'BANK',
    body: 'Leave now and keep it all. Safe, smaller, certain.',
  },
  {
    key: 'pass',
    label: 'RIDE ON',
    body: 'Keep going. The board gets harder and the pot gets bigger.',
  },
  {
    key: 'infuse',
    label: 'TRADE UP',
    // NOT the R15 contradiction it was flagged as: sentence two already says
    // "longer", which is what the code does (`performInfuse` pushes segments).
    // What sentence one did was open with "trade body length FOR", which a
    // first-time reader hears as giving length away - so the two sentences
    // read as opposites. Same fact, one direction now.
    body: 'Take a new power and grow to carry it. A stronger snake is a longer, harder snake.',
  },
] as const;

const PROMISES = [
  'No ads. Ever.',
  'No loot boxes, no gacha, no paid randomness.',
  'Nothing you can buy moves a number.',
  'Nothing you earn expires or can be taken away.',
  'No install, no store page — it runs in this tab.',
] as const;

export function LandingPitch() {
  return (
    <section
      id="what-is-supasnake"
      data-testid="landing-pitch"
      className="app-bg border-t border-scale-blue-light/40 px-4 py-16 text-bone-white sm:px-8 sm:pr-16"
    >
      <div className="mx-auto max-w-3xl space-y-12">
        <div className="space-y-4">
          <h2 className="heading-display text-2xl text-venom-orange sm:text-3xl">
            What is {SITE_NAME}?
          </h2>
          <p className="font-body text-lg leading-relaxed text-bone-white">
            You know Snake. Now every run ends with a deal: bank it, push your
            luck, or feed the snake — and breed a bloodline that hunts better
            than the last one.
          </p>
          <p className="font-body leading-relaxed text-beige">
            A three-minute precision run in your browser. When it ends well, a
            portal opens and the simulation freezes with the whole board
            visible. What you do next is the game.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="label-arcade text-venom-orange">The extraction</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHOICES.map((choice) => (
              <div key={choice.key} className="panel p-4">
                <p className="heading-display text-lg text-bone-white">
                  {choice.label}
                </p>
                <p className="mt-1 font-body text-sm text-beige">{choice.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="label-arcade text-venom-orange">Three dynasties</h3>
          <p className="font-body leading-relaxed text-beige">
            CYBER accelerates, PRIMAL compounds, COSMIC reroutes space. They are
            genuinely different rulesets, not palette swaps — and the
            leaderboard score measures the pilot, never the build.
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="label-arcade text-venom-orange">The promise</h3>
          <ul className="space-y-2">
            {PROMISES.map((promise) => (
              <li
                key={promise}
                className="flex gap-3 font-body text-beige"
              >
                <span aria-hidden="true" className="text-venom-orange">
                  ▸
                </span>
                <span>{promise}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <DispatchWaitlistForm />
        </div>

        <nav
          aria-label="More about SupaSnake"
          className="flex flex-wrap gap-x-6 gap-y-2 font-body text-sm text-beige"
        >
          <Link href="/play" className="hover:text-venom-orange">
            How to play
          </Link>
          <Link href="/leaderboard" className="hover:text-venom-orange">
            Leaderboard
          </Link>
          <Link href="/codex" className="hover:text-venom-orange">
            Genome Research
          </Link>
        </nav>
      </div>
    </section>
  );
}
