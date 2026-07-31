import Link from 'next/link';
import {
  LEGAL_ENTITY,
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
  DATA_PROTECTION_AUTHORITY,
  MINIMUM_AGE,
  PRODUCT,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Privacy Policy | SupaSnake',
  description:
    'How Insoucience Technologies GmbH processes personal data in SupaSnake — purposes, legal bases, recipients, retention and your rights under the GDPR.',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
      <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Activity({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="text-lg font-display uppercase tracking-arcade text-bone-white mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-beige font-body mt-2">
            Last updated: {LEGAL_VERSIONS.privacy}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <Section title="1. Who we are">
            <p className="mb-4">
              This privacy policy explains how personal data is processed when
              you use {PRODUCT.name} (the &quot;Game&quot;), available at{' '}
              {PRODUCT.url}. The controller within the meaning of Art. 4(7)
              GDPR is:
            </p>
            <p className="mb-4">
              {LEGAL_ENTITY.name}
              <br />
              {LEGAL_ENTITY.street}
              <br />
              {LEGAL_ENTITY.postalCode} {LEGAL_ENTITY.city},{' '}
              {LEGAL_ENTITY.country}
              <br />
              E-mail:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
            </p>
            <p>
              Data protection contact (Datenschutzbeauftragter):{' '}
              {LEGAL_CONTACT.dataProtectionOfficer},{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.dataProtectionEmail}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.dataProtectionEmail}
              </a>
              . You can also use our{' '}
              <Link href="/contact" className="text-venom-orange hover:underline">
                contact form
              </Link>{' '}
              (category &quot;Privacy / data request&quot;).
            </p>
          </Section>

          <Section title="2. The short version">
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>
                You can play as a guest without giving us your name or e-mail
                address. Game progress is stored under a pseudonymous account
                ID.
              </li>
              <li>
                Analytics runs only if you opt in via the cookie banner, and is
                hosted in the EU.
              </li>
              <li>
                We never sell personal data, and we do not show third-party
                advertising.
              </li>
              <li>
                Payment card data is handled exclusively by Stripe — it never
                touches our servers.
              </li>
              <li>
                Our AI features receive only aggregate game statistics — no
                names, e-mail addresses or account IDs.
              </li>
              <li>
                You can export or delete your data yourself at any time in{' '}
                <Link
                  href="/settings/privacy"
                  className="text-venom-orange hover:underline"
                >
                  Settings → Privacy
                </Link>
                .
              </li>
            </ul>
          </Section>

          <Section title="3. What we process, why, and on what legal basis">
            <Activity title="3.1 Account and authentication">
              <p className="mb-2">
                The Game uses Supabase Auth. You can play anonymously (a random
                account ID, no e-mail), register with e-mail and password, or
                sign in with Google or Apple. If you upgrade a guest account,
                the e-mail address is attached to your existing account ID so
                your progress is preserved.
              </p>
              <p className="mb-2">
                Data: account ID, e-mail address (registered accounts only),
                password hash, OAuth provider identity (Google/Apple account
                reference), session tokens, sign-in timestamps.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR (performance of the contract —
                providing your account and saved progress). Retention: until
                account deletion.
              </p>
            </Activity>

            <Activity title="3.2 Game progress and gameplay data">
              <p className="mb-2">
                All game state is stored server-side: collected snakes, breeding
                history, resources (DNA, energy), game sessions (score,
                duration, DNA earned), achievements, streaks, mastery, records,
                battle pass and season progress, and economy transactions.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR. Retention: until account
                deletion.
              </p>
            </Activity>

            <Activity title="3.3 Public profile, leaderboards and Chronicle">
              <p className="mb-2">
                Your public identity in the Game is a self-chosen handle (or an
                automatically derived placeholder such as
                &quot;handler-1234&quot;). Leaderboards and your public
                Chronicle page show your handle, scores, clan tag, titles,
                badges, avatar and mastery — never your e-mail address or
                account ID. Handle changes are recorded in an internal audit
                log.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR (leaderboards and public
                profiles are a core feature of the Game). If you prefer not to
                be recognisable, choose a handle that does not identify you, or
                keep the generated placeholder.
              </p>
            </Activity>

            <Activity title="3.4 Clans">
              <p className="mb-2">
                Clan names, tags and descriptions are user-generated content
                visible to other players, together with the member list
                (handles) and clan activity (duels, research, ratings).
              </p>
              <p>Legal basis: Art. 6(1)(b) GDPR. Retention: until deletion.</p>
            </Activity>

            <Activity title="3.5 Discord integration (optional)">
              <p className="mb-2">
                If you actively link your Discord account, we receive your
                Discord user ID and username via Discord OAuth (scopes:
                identify, guilds.join, role_connections.write), can add you to
                our Discord server and assign roles, and push your in-game
                handle and mastery as &quot;Linked Roles&quot; metadata. Clans
                can connect a Discord channel; in that case in-game events
                (duel results, level-ups, member joins, season champions) are
                posted there with your handle and clan name. OAuth tokens are
                stored encrypted (AES-256-GCM) and are deleted — and revoked at
                Discord — when you unlink; stale links are purged after 30
                days.
              </p>
              <p>
                Legal basis: Art. 6(1)(a) GDPR (consent, given by linking). You
                can withdraw it at any time by unlinking. Discord Inc. is an
                independent controller for its own platform — see
                Discord&apos;s privacy policy.
              </p>
            </Activity>

            <Activity title="3.6 Analytics (PostHog) — only with your consent">
              <p className="mb-2">
                If (and only if) you enable the &quot;Analytics&quot; category
                in the cookie banner, we use PostHog, hosted in the EU
                (eu.i.posthog.com), to understand how the Game is used. We use
                a curated event set (page views, gameplay, economy, purchases,
                engagement and social events) with autocapture and session
                recording disabled. Its device ID, analytics session, and
                person properties remain in page memory only and disappear
                when the page closes; browser storage retains only your
                analytics opt-in or opt-out choice. After sign-in, transmitted
                events are linked to your account ID. Revoking consent stops
                all capture.
              </p>
              <p>
                Legal basis: Art. 6(1)(a) GDPR and §165(3) TKG 2021 (consent).
                Manage it any time via{' '}
                <Link
                  href="/settings/privacy"
                  className="text-venom-orange hover:underline"
                >
                  Settings → Privacy
                </Link>
                .
              </p>
            </Activity>

            <Activity title="3.6a Attribution (where you came from) — only with your consent">
              <p className="mb-2">
                If (and only if) you enable the &quot;Marketing&quot; category
                in the cookie banner, we record which channel brought you to
                the Game: the campaign labels contained in the link you
                followed (utm_source, utm_medium, utm_campaign, utm_content,
                utm_term) and the host name of the referring site — never the
                full referring address. It is stored in your browser&apos;s
                session storage for the current tab only and attached, as a
                channel label, to your analytics profile if you later create an
                account. We operate no advertising network, buy no advertising,
                and place no third-party advertising tags or advertising
                identifiers. With the category off, nothing is stored and your
                visit is counted as &quot;direct&quot;.
              </p>
              <p>
                Legal basis: Art. 6(1)(a) GDPR and §165(3) TKG 2021 (consent).
              </p>
            </Activity>

            <Activity title="3.7 Error tracking (Sentry)">
              <p className="mb-2">
                To keep the Game stable we send error reports (stack traces,
                affected route, browser/OS context) to Sentry. Transmission of
                personal data is disabled by default (no IP addresses attached)
                and we do not use session replay.
              </p>
              <p>
                Legal basis: Art. 6(1)(f) GDPR (legitimate interest in
                detecting and fixing errors).
              </p>
            </Activity>

            <Activity title="3.8 AI features (&ldquo;The Analyst&rdquo;)">
              <p className="mb-2">
                The Analyst generates short narrative summaries of your game
                performance. The input sent to our AI provider (OpenAI) is a
                fact sheet of aggregate game statistics only — runs, DNA,
                extraction rate, dynasty mastery. No handle, e-mail address,
                account ID or free-text content is transmitted. Generated
                insights are cached in our database and visible only to you
                (or your clan, for clan insights). The Analyst involves no
                automated decision-making with legal or similarly significant
                effects (Art. 22 GDPR).
              </p>
              <p>
                Legal basis: Art. 6(1)(f) GDPR (legitimate interest in
                providing game features); the underlying gameplay data is
                processed under Art. 6(1)(b).
              </p>
            </Activity>

            <Activity title="3.9 E-mail">
              <p className="mb-2">
                Transactional e-mail (verification, password reset) is sent via
                our e-mail provider Resend. The weekly &quot;Analyst
                digest&quot; (your game stats and narration) is strictly opt-in
                in Settings and can be disabled there at any time.
              </p>
              <p className="mb-2">
                The &quot;Dispatch&quot; is a separate opt-in list for
                occasional product news and the results of the weekly hunt. It
                uses double opt-in: we store your address with a
                &quot;pending&quot; status and send exactly one confirmation
                e-mail. If you do not click the link in it, the address is
                never used for anything else and never receives another
                message. We store the address, its status, the timestamps, and
                a coarse channel label (see 3.6a); we never store the
                confirmation or unsubscribe token itself, only a hash of it.
                Every Dispatch message carries a one-click unsubscribe link,
                and the list is never used for advertising.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR for transactional mail;
                Art. 6(1)(a) (consent) for the digest and the Dispatch.
                Retention: until you unsubscribe. An entry that is never
                confirmed stays permanently unusable — it can never receive a
                Dispatch message — and any address can be erased on request via
                the contact address above.
              </p>
            </Activity>

            <Activity title="3.10 Purchases (Stripe)">
              <p className="mb-2">
                Purchases are processed by Stripe via Stripe Checkout. Stripe
                collects your e-mail, billing and payment card details directly
                — this data never reaches our servers. We store only the Stripe
                session and payment-intent IDs, the product, price and purchase
                status, linked to your account.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR (contract) and Art. 6(1)(c)
                (statutory retention duties). Retention: purchase records are
                kept for 7 years in line with Austrian tax law (§132 BAO), in
                anonymized form if you delete your account.
              </p>
            </Activity>

            <Activity title="3.11 Contact form and support">
              <p className="mb-2">
                If you contact us, we process the details you provide (name if
                given, e-mail address, category, message) to handle your
                request, including privacy inquiries and content reports.
              </p>
              <p>
                Legal basis: Art. 6(1)(b) GDPR (contractual/pre-contractual
                communication) or Art. 6(1)(f) (responding to inquiries);
                Art. 6(1)(c) where handling the request is legally required.
                Retention: 24 months after resolution, longer where a legal
                obligation or dispute requires it.
              </p>
            </Activity>

            <Activity title="3.12 Age verification">
              <p className="mb-2">
                At registration we ask for your birth year and month to enforce
                our minimum age of {MINIMUM_AGE}. We do not store either value —
                only a salted hash and the verification result, which expires
                after 7 days.
              </p>
              <p>
                Legal basis: Art. 6(1)(c) GDPR in conjunction with Art. 8 GDPR
                and §4(4) DSG.
              </p>
            </Activity>
          </Section>

          <Section title="4. Recipients and processors">
            <p className="mb-4">
              We use the following processors (Art. 28 GDPR) and recipients.
              Where a provider processes data outside the EU/EEA, transfers are
              safeguarded by an adequacy decision (including the EU–U.S. Data
              Privacy Framework) and/or EU Standard Contractual Clauses (SCCs):
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-venom-orange border-b border-scale-blue-light">
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Purpose</th>
                    <th className="py-2">Location / transfer basis</th>
                  </tr>
                </thead>
                <tbody className="text-beige">
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">Supabase</td>
                    <td className="py-2 pr-4">Database, authentication</td>
                    <td className="py-2">EU-hosted project</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">Vercel</td>
                    <td className="py-2 pr-4">Hosting, delivery</td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">PostHog</td>
                    <td className="py-2 pr-4">Analytics (opt-in)</td>
                    <td className="py-2">EU cloud</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">Sentry</td>
                    <td className="py-2 pr-4">Error tracking</td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">Stripe</td>
                    <td className="py-2 pr-4">Payments</td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">Resend</td>
                    <td className="py-2 pr-4">E-mail delivery</td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/40">
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 pr-4">
                      AI narration (aggregate stats only)
                    </td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Discord</td>
                    <td className="py-2 pr-4">
                      Optional account link (independent controller)
                    </td>
                    <td className="py-2">USA — DPF / SCCs</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              We do not sell personal data and we do not share it with
              advertisers. Beyond the providers above, data is disclosed only
              where we are legally required to do so.
            </p>
          </Section>

          <Section title="5. Your rights">
            <p className="mb-4">Under the GDPR you have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>Access your personal data (Art. 15)</li>
              <li>Rectification of inaccurate data (Art. 16)</li>
              <li>Erasure (&quot;right to be forgotten&quot;, Art. 17)</li>
              <li>Restriction of processing (Art. 18)</li>
              <li>Data portability (Art. 20)</li>
              <li>
                Object to processing based on legitimate interests (Art. 21)
              </li>
              <li>
                Withdraw any consent at any time, with effect for the future
                (Art. 7(3))
              </li>
            </ul>
            <p className="mb-4">
              The fastest way to exercise most rights is self-service:{' '}
              <Link
                href="/settings/privacy"
                className="text-venom-orange hover:underline"
              >
                Settings → Privacy
              </Link>{' '}
              lets you export all your data (JSON) and delete your account.
              Deletion takes effect after a 30-day grace period (sign in again
              to cancel); purchase records are retained in anonymized form
              where tax law requires. For anything else, contact{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.dataProtectionEmail}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.dataProtectionEmail}
              </a>
              .
            </p>
            <p>
              You also have the right to lodge a complaint with a supervisory
              authority, in particular the {DATA_PROTECTION_AUTHORITY.name},{' '}
              {DATA_PROTECTION_AUTHORITY.street},{' '}
              {DATA_PROTECTION_AUTHORITY.postalCode}{' '}
              {DATA_PROTECTION_AUTHORITY.city},{' '}
              <a
                href={DATA_PROTECTION_AUTHORITY.url}
                className="text-venom-orange hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {DATA_PROTECTION_AUTHORITY.url.replace('https://', '')}
              </a>
              .
            </p>
          </Section>

          <Section title="6. Children">
            <p>
              The Game is not directed at children under {MINIMUM_AGE}. In line
              with Art. 8 GDPR and §4(4) of the Austrian Data Protection Act
              (DSG), you must be at least {MINIMUM_AGE} years old to create an
              account. If you believe a child under {MINIMUM_AGE} has provided
              us personal data, contact us and we will delete it.
            </p>
          </Section>

          <Section title="7. Cookies and similar technologies">
            <p>
              Details on every cookie and localStorage entry we use — and how
              consent works — are in our{' '}
              <Link
                href="/legal/cookies"
                className="text-venom-orange hover:underline"
              >
                Cookie Policy
              </Link>
              . Non-essential technologies are used only with your consent
              (§165(3) TKG 2021), which you can change at any time.
            </p>
          </Section>

          <Section title="8. Security">
            <p>
              All traffic is TLS-encrypted. Game state is server-authoritative;
              database access is protected by row-level security so players can
              only read their own data. Discord OAuth tokens are stored with
              app-layer AES-256-GCM encryption. Payment card data is handled
              only by Stripe (PCI-DSS certified). No system is perfectly
              secure, but we follow the principle of collecting as little
              personal data as possible in the first place.
            </p>
          </Section>

          <Section title="9. Users outside the EEA">
            <p>
              We apply the GDPR standard described in this policy to all users
              worldwide. For California residents: we do not sell or share
              personal information within the meaning of the CCPA/CPRA, and you
              may exercise access and deletion rights through the same channels
              described in section 5.
            </p>
          </Section>

          <Section title="10. Changes to this policy">
            <p>
              We update this policy when the Game or our providers change. The
              date at the top reflects the latest revision; material changes
              will be announced in the Game. Earlier versions are available on
              request.
            </p>
          </Section>
        </div>

        <LegalPageFooter currentPath="/legal/privacy" />
      </div>
    </main>
  );
}
