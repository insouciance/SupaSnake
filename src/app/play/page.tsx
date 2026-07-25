/**
 * /play — the honest intent surface (Constitution §11.6, the Snake Query
 * Engine). "snake game" is one of the largest evergreen casual-game search
 * families on the web; this is the page that deserves to answer it.
 *
 * Server-rendered on purpose: a crawler and a stranger must see the same
 * complete answer in the first response, with no client hydration in
 * between. Behind NEXT_PUBLIC_GROWTH_SURFACES_V1 (default off) — with the
 * flag off the route 404s, exactly as if it had never shipped.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/ui/NavBar';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';
import { videoGameStructuredData } from '@/lib/growth/structuredData';
import {
  CANONICAL_ORIGIN,
  SITE_LONG_DESCRIPTION,
  SITE_NAME,
} from '@/shared/config/site';

export const metadata: Metadata = {
  title: 'Play Snake Online — Free, No Download',
  description:
    'Play SupaSnake free in your browser. A three-minute precision snake game where every run ends with a choice: bank it, push your luck, or feed the snake.',
  alternates: { canonical: `${CANONICAL_ORIGIN}/play` },
  openGraph: {
    type: 'website',
    url: `${CANONICAL_ORIGIN}/play`,
    title: `Play Snake Online — ${SITE_NAME}`,
    description:
      'A three-minute precision snake game that runs instantly in any browser. Free, no download, no ads.',
  },
};

const CONTROLS = [
  {
    device: 'Keyboard',
    body: 'Arrow keys or WASD to steer. Turns are buffered, reversals are rejected, and the snake does not move until you do.',
  },
  {
    device: 'Touch',
    body: 'Swipe or flick anywhere on the board. Touch is a first-class control scheme, not an afterthought.',
  },
  {
    device: 'Hold',
    body: 'A tactical hold pauses the simulation with the board fully visible, so reading space is a skill and not a reflex tax.',
  },
] as const;

const STEPS = [
  {
    title: 'Eat and grow',
    body: 'Standard snake rules, tuned for precision: a tight board, honest hitboxes, and a tick you can learn.',
  },
  {
    title: 'Take the offers',
    body: 'Genes appear mid-run. They change how your snake plays for the rest of the run — and they never touch your leaderboard score.',
  },
  {
    title: 'Make the deal',
    body: 'A portal opens. BANK secures what you have at ×1.25, PASS pushes your luck, INFUSE spends body length for build power. This is the whole game in one decision.',
  },
  {
    title: 'Keep what you built',
    body: 'What you bank compounds into a mastery record and a bred lineage. Nothing expires; nothing can be taken away.',
  },
] as const;

export default function PlayPage() {
  if (!GROWTH_SURFACES_V1_ENABLED) notFound();

  return (
    <div className="app-bg min-h-screen text-bone-white">
      <NavBar />
      <script
        type="application/ld+json"
        // The payload is built from typed constants in structuredData.ts —
        // no user input reaches it, and JSON.stringify escapes the rest.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(videoGameStructuredData()),
        }}
      />
      <main className="mx-auto max-w-3xl space-y-12 px-4 pb-28 pt-10 sm:pb-12 sm:pr-16">
        <header className="space-y-4">
          <h1 className="heading-display text-3xl text-venom-orange sm:text-4xl">
            Play snake online — free, in this tab
          </h1>
          <p className="font-body text-lg leading-relaxed text-bone-white">
            {SITE_LONG_DESCRIPTION}
          </p>
          <Link
            href="/"
            data-testid="play-cta"
            className="btn-go inline-flex min-h-[56px] items-center px-10 py-3 text-xl"
          >
            Play now
          </Link>
          <p className="font-body text-sm text-beige">
            No account needed. No download. Your first run starts in seconds.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="heading-display text-2xl text-venom-orange">
            How to play
          </h2>
          <ol className="space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="panel p-4">
                <p className="heading-display text-lg text-bone-white">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-1 font-body text-beige">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="heading-display text-2xl text-venom-orange">Controls</h2>
          <dl className="space-y-3">
            {CONTROLS.map((control) => (
              <div key={control.device} className="panel p-4">
                <dt className="heading-display text-lg text-bone-white">
                  {control.device}
                </dt>
                <dd className="mt-1 font-body text-beige">{control.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-4">
          <h2 className="heading-display text-2xl text-venom-orange">
            What it costs
          </h2>
          <p className="font-body leading-relaxed text-beige">
            Nothing. {SITE_NAME} is free to play, has no ads, no loot boxes and
            no energy paywall, and nothing that can be bought moves a number —
            not your score, not your progress, not your odds.
          </p>
        </section>

        <div className="pt-2">
          <Link
            href="/"
            className="btn-go inline-flex min-h-[56px] items-center px-10 py-3 text-xl"
          >
            Start a run
          </Link>
        </div>
      </main>
    </div>
  );
}
