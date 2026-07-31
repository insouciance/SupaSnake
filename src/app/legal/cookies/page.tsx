import Link from 'next/link';
import {
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
  PRODUCT,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Cookie Policy | SupaSnake',
  description:
    'Which cookies and browser storage SupaSnake uses, what they do, and how consent works under §165(3) TKG 2021.',
};

type StorageEntry = {
  name: string;
  kind: 'Cookie' | 'localStorage' | 'sessionStorage';
  purpose: string;
  duration: string;
};

const ESSENTIAL: StorageEntry[] = [
  {
    name: 'sb-<project>-auth-token',
    kind: 'localStorage',
    purpose: 'Your Supabase sign-in session (JWT + refresh token)',
    duration: 'Until sign-out',
  },
  {
    name: 'cookie-consent',
    kind: 'localStorage',
    purpose: 'Stores your consent choices from the cookie banner',
    duration: 'Until changed or cleared',
  },
  {
    name: 'age_verified / age_verified_at',
    kind: 'localStorage',
    purpose: 'Remembers that you passed the age gate',
    duration: 'Until cleared',
  },
  {
    name: 'supasnake-last-user',
    kind: 'localStorage',
    purpose:
      'Account-continuity hint (account ID and a masked e-mail hint, e.g. "jo***@…") so we do not silently create a different guest account. It contains no earned state.',
    duration: 'Until cleared',
  },
];

const FUNCTIONAL: StorageEntry[] = [
  {
    name: 'supasnake.pwa.install.v1.device',
    kind: 'localStorage',
    purpose:
      'Remembers whether this device dismissed or installed the optional home-screen shortcut, and how often that offer appeared. It contains no run or progression data.',
    duration: 'Until cleared',
  },
];

const ANALYTICS: StorageEntry[] = [
  {
    name: '__ph_opt_in_out_*',
    kind: 'localStorage',
    purpose:
      'Remembers only whether you opted product analytics in or out. PostHog device IDs, person properties, and analytics session state are memory-only and disappear when the page closes.',
    duration: 'Until your choice changes or storage is cleared',
  },
];

const MARKETING: StorageEntry[] = [
  {
    name: 'supasnake-attribution',
    kind: 'sessionStorage',
    purpose:
      'The campaign labels (utm_*) in the link you arrived on and the host that referred you — never the full referring address. Used to see which channels bring players. Written only after you enable the Marketing category.',
    duration: 'Until you close the browser tab',
  },
];

function StorageTable({ entries }: { entries: StorageEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="text-venom-orange border-b border-scale-blue-light">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Purpose</th>
            <th className="py-2">Duration</th>
          </tr>
        </thead>
        <tbody className="text-beige">
          {entries.map((e) => (
            <tr key={e.name} className="border-b border-scale-blue-light/40 last:border-b-0">
              <td className="py-2 pr-4 font-mono text-xs">{e.name}</td>
              <td className="py-2 pr-4">{e.kind}</td>
              <td className="py-2 pr-4">{e.purpose}</td>
              <td className="py-2">{e.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-beige hover:text-bone-white transition-colors font-body text-sm"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange mt-4">
            Cookie Policy
          </h1>
          <p className="text-beige font-body mt-2">
            Last updated: {LEGAL_VERSIONS.cookies}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              1. How {PRODUCT.name} uses cookies and browser storage
            </h2>
            <p className="mb-4">
              {PRODUCT.name} uses very few cookies. Most of what we store lives
              in your browser&apos;s localStorage (which stays on your device
              and is not sent with every request). This policy lists every
              entry, grouped by category. Under §165(3) of the Austrian
              Telecommunications Act (TKG 2021) and the GDPR, anything that is
              not strictly necessary is used only with your prior consent,
              which the cookie banner collects and which you can change at any
              time in{' '}
              <Link
                href="/settings/privacy"
                className="text-venom-orange hover:underline"
              >
                Settings → Privacy
              </Link>
              .
            </p>
            <p>
              We set no advertising or marketing cookies, and no third-party
              tracking pixels. Game progress, run receipts, rewards, and
              notification state are stored on SupaSnake&apos;s servers, never in
              browser storage.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              2. Strictly necessary (no consent required)
            </h2>
            <p className="mb-4">
              Required for the Game to function — signing in, keeping your
              session, remembering your consent choices, and the age gate.
              Legal basis: §165(3) TKG 2021 (strictly necessary exemption).
            </p>
            <StorageTable entries={ESSENTIAL} />
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              3. Functional (consent)
            </h2>
            <p className="mb-4">
              Convenience preferences. The Game works without them; you would
              just have to re-select preferences each visit.
            </p>
            <StorageTable entries={FUNCTIONAL} />
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              4. Analytics (consent)
            </h2>
            <p className="mb-4">
              Set only after you enable the Analytics category. Used to
              understand how the Game is played so we can improve it. Details
              on the processing are in section 3.6 of the{' '}
              <Link
                href="/legal/privacy"
                className="text-venom-orange hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
            <StorageTable entries={ANALYTICS} />
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              4a. Marketing (consent)
            </h2>
            <p className="mb-4">
              Written only after you enable the Marketing category, and only to
              answer one question: which channel brought you here. We keep the
              campaign labels from your link and the referring site&apos;s host
              name — never the full referring address, and never an advertising
              identifier. We run no advertising network and place no third-party
              advertising tags. If you leave this category off, nothing below is
              stored and arrivals are simply counted as direct.
            </p>
            <StorageTable entries={MARKETING} />
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              5. Third-party pages
            </h2>
            <p>
              When you start a purchase you are redirected to Stripe Checkout
              (checkout.stripe.com), which sets its own cookies for payment and
              fraud prevention under Stripe&apos;s cookie policy. If you link
              Discord, the OAuth flow happens on discord.com under
              Discord&apos;s policies. Neither happens without an action you
              take.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              6. Managing consent
            </h2>
            <p className="mb-4">
              You can accept all, reject all, or pick categories in the cookie
              banner on first visit, and change your choice any time in{' '}
              <Link
                href="/settings/privacy"
                className="text-venom-orange hover:underline"
              >
                Settings → Privacy
              </Link>
              . Rejecting non-essential categories never blocks you from
              playing. You can also clear all locally stored data via your
              browser settings.
            </p>
            <p>
              Questions? Contact{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>{' '}
              or use the{' '}
              <Link href="/contact" className="text-venom-orange hover:underline">
                contact form
              </Link>
              .
            </p>
          </section>
        </div>

        <LegalPageFooter currentPath="/legal/cookies" />
      </div>
    </main>
  );
}
