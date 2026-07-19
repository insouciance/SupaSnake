import Link from 'next/link';
import {
  LEGAL_ENTITY,
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
  MINIMUM_AGE,
  PRODUCT,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Terms of Service | SupaSnake',
  description:
    'Terms of Service (AGB) for SupaSnake, operated by Insoucience Technologies GmbH, Vienna, Austria.',
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

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="text-beige font-body mt-2">
            Allgemeine Geschäftsbedingungen (AGB) · Last updated:{' '}
            {LEGAL_VERSIONS.terms}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <Section title="1. Who we are and what these terms cover">
            <p className="mb-4">
              These Terms of Service (&quot;Terms&quot;) govern your use of the
              online game {PRODUCT.name} (the &quot;Game&quot;), operated by{' '}
              {LEGAL_ENTITY.name}, {LEGAL_ENTITY.street},{' '}
              {LEGAL_ENTITY.postalCode} {LEGAL_ENTITY.city},{' '}
              {LEGAL_ENTITY.country} (&quot;we&quot;, &quot;us&quot;). Contact:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>{' '}
              — full company details are in the{' '}
              <Link
                href="/legal/impressum"
                className="text-venom-orange hover:underline"
              >
                Impressum
              </Link>
              .
            </p>
            <p className="mb-4">
              By creating an account or playing the Game you agree to these
              Terms. How we handle personal data is described in the{' '}
              <Link
                href="/legal/privacy"
                className="text-venom-orange hover:underline"
              >
                Privacy Policy
              </Link>
              , which is not part of these Terms but should be read together
              with them.
            </p>
            <p>
              Nothing in these Terms limits mandatory rights you have as a
              consumer under the law of your country of residence, including
              Austrian and EU consumer protection law. If any clause conflicts
              with such rights, the mandatory law prevails.
            </p>
          </Section>

          <Section title="2. Eligibility and accounts">
            <p className="mb-4">
              You must be at least {MINIMUM_AGE} years old to use the Game
              (Austria&apos;s digital age of consent, §4(4) DSG). If you are a
              minor, purchases additionally require the consent of a parent or
              guardian.
            </p>
            <p className="mb-4">
              You can play as a <strong>guest</strong> without registering.
              Guest progress is tied to your device/browser session — if it is
              lost (e.g. cleared browser data) before you register, we may be
              unable to restore it. Registering with an e-mail address or
              Google/Apple sign-in secures your progress.
            </p>
            <p>
              Keep your credentials confidential; you are responsible for
              activity under your account unless it results from our fault.
              Notify us of any unauthorized use. One account per person;
              accounts are personal and may not be sold or transferred.
            </p>
          </Section>

          <Section title="3. The Game">
            <p className="mb-4">
              {PRODUCT.name} is a free-to-play online game with a
              collection/breeding meta-game. It is an ongoing online service:
              we continuously develop it and may add, adjust, rebalance or
              remove features, content, seasons and virtual items where this is
              reasonable for you, taking into account the legitimate interests
              of both sides (for paid content, see sections 4 and 10).
            </p>
            <p>
              Everything obtainable in the Game can be earned through play.
              Optional purchases provide convenience, not competitive
              advantage.
            </p>
          </Section>

          <Section title="4. Virtual items and purchases">
            <p className="mb-4">
              The Game offers virtual items and currency (e.g. Energy, DNA,
              bundles). When you &quot;buy&quot; a virtual item you receive a
              limited, personal, non-transferable licence to use it within the
              Game — not ownership. Virtual items have no monetary value
              outside the Game and cannot be redeemed for money.
            </p>
            <p className="mb-4">
              Prices are shown before purchase and include VAT where
              applicable. Payment is processed by Stripe; the contract is
              concluded when you complete checkout, and the item is credited to
              your account immediately.
            </p>
            <p className="mb-4">
              <strong>Right of withdrawal:</strong> as digital content is
              delivered immediately, we ask for your express consent to
              immediate delivery and your acknowledgment that you thereby lose
              your 14-day right of withdrawal (§18(1)(11) FAGG). Details,
              including the model withdrawal form, are in the{' '}
              <Link
                href="/legal/withdrawal"
                className="text-venom-orange hover:underline"
              >
                withdrawal notice
              </Link>
              .
            </p>
            <p>
              <strong>Statutory warranty:</strong> your statutory warranty
              rights for digital content (in Austria under the
              Verbrauchergewährleistungsgesetz, implementing Directive (EU)
              2019/770) remain unaffected — if purchased content is defective
              or not provided, you have the remedies provided by law. Nothing
              here means &quot;all sales are final&quot;.
            </p>
          </Section>

          <Section title="5. Fair play and conduct">
            <p className="mb-4">When using the Game you must not:</p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>
                use cheats, exploits, bots, automation or unauthorized
                third-party software, or abuse bugs (report them instead);
              </li>
              <li>
                attempt to access our systems or other players&apos; accounts
                without authorization, or disrupt the service;
              </li>
              <li>harass, threaten or abuse other players;</li>
              <li>
                buy, sell, trade or transfer accounts or virtual items outside
                the Game;
              </li>
              <li>use the Game for any unlawful purpose.</li>
            </ul>
          </Section>

          <Section title="6. Your content (handles, clan names, descriptions)">
            <p className="mb-4">
              The Game lets you create limited content visible to others: your
              handle, clan names, tags and descriptions
              (&quot;User Content&quot;). You grant us a non-exclusive,
              worldwide, royalty-free licence to display User Content within
              the Game and connected services (e.g. leaderboards, public
              profiles, linked Discord channels) for as long as it exists in
              the Game.
            </p>
            <p className="mb-4">User Content must not:</p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>be illegal, defamatory, hateful, or harassing;</li>
              <li>infringe third-party rights (trademarks, personality rights);</li>
              <li>impersonate other persons, staff, or entities;</li>
              <li>contain sexual content involving minors, or extremist content;</li>
              <li>include personal data of others (doxxing).</li>
            </ul>
            <p>
              We may rename, edit or remove violating User Content and restrict
              repeat offenders (see section 7).
            </p>
          </Section>

          <Section title="7. Moderation, reporting and complaints (DSA)">
            <p className="mb-4">
              You can report content you believe is illegal or violates these
              Terms via the{' '}
              <Link href="/contact" className="text-venom-orange hover:underline">
                contact form
              </Link>{' '}
              (category &quot;Report content&quot;) or by e-mail to{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
              . Reports are reviewed by a person; we do not use automated
              content-moderation decisions.
            </p>
            <p className="mb-4">
              If we restrict or remove your content or account, we will inform
              you of the reasons (unless legally prevented) and you may contest
              the decision by replying through the same channels; we will
              re-review it. This implements our obligations under Regulation
              (EU) 2022/2065 (Digital Services Act). Our DSA point of contact
              is stated in the{' '}
              <Link
                href="/legal/impressum"
                className="text-venom-orange hover:underline"
              >
                Impressum
              </Link>
              .
            </p>
            <p>
              Enforcement is proportionate: warnings first where appropriate,
              temporary restrictions for repeated violations, and permanent
              measures only for serious or persistent abuse (e.g. cheating,
              illegal content).
            </p>
          </Section>

          <Section title="8. Intellectual property">
            <p className="mb-4">
              All content of the Game — graphics, audio, code, names, logos,
              game design — belongs to {LEGAL_ENTITY.name} or its licensors and
              is protected by intellectual property law.
            </p>
            <p>
              We grant you a limited, non-exclusive, non-transferable,
              revocable licence to use the Game for personal, non-commercial
              purposes. Streaming and video content of your own gameplay is
              welcome, including monetized creator content, provided it does
              not misrepresent the Game or use our assets outside gameplay
              footage.
            </p>
          </Section>

          <Section title="9. Availability">
            <p>
              We aim for high availability but the Game is provided as an
              online service and may be temporarily unavailable due to
              maintenance, updates or failures. We do not guarantee
              uninterrupted availability; planned extended downtime will be
              announced where feasible. Your statutory rights in respect of
              paid content remain unaffected.
            </p>
          </Section>

          <Section title="10. Changes to the Game and to these Terms">
            <p className="mb-4">
              We may modify the Game as described in section 3. If a change
              materially degrades access to or usability of digital content you
              paid for, you have the statutory remedies of the
              Verbrauchergewährleistungsgesetz, including — for more than
              minor impairments — termination of the affected contract.
            </p>
            <p>
              We may amend these Terms for good reason (legal changes, new
              features, closing loopholes). We will announce material changes
              in the Game or by e-mail at least 30 days before they take
              effect. If you do not agree, you may terminate your account free
              of charge before the changes apply; continued use after the
              effective date constitutes acceptance. Changes never apply
              retroactively.
            </p>
          </Section>

          <Section title="11. Termination">
            <p className="mb-4">
              <strong>By you:</strong> you may stop playing and delete your
              account at any time in{' '}
              <Link
                href="/settings/privacy"
                className="text-venom-orange hover:underline"
              >
                Settings → Privacy
              </Link>{' '}
              (30-day grace period, cancellable by signing in again).
            </p>
            <p className="mb-4">
              <strong>By us:</strong> we may suspend or terminate your account
              for good cause — serious or repeated violation of these Terms,
              legal requirements, or discontinuation of the Game. Except where
              immediate action is required (e.g. cheating, illegal content,
              security), we will warn you first. If we discontinue the Game
              entirely, we will give reasonable advance notice.
            </p>
            <p>
              On termination your licence to the Game and virtual items ends.
              Where we terminate without cause attributable to you, or you
              terminate because of a change under section 10, statutory
              reimbursement rights for unusable paid content remain unaffected.
            </p>
          </Section>

          <Section title="12. Liability and warranty">
            <p className="mb-4">
              We are liable without limitation for damage caused intentionally
              or by gross negligence, for personal injury, and under mandatory
              statutory liability rules.
            </p>
            <p className="mb-4">
              For slight negligence we are liable only for breaches of
              essential contractual obligations (obligations whose fulfilment
              makes proper performance of the contract possible at all),
              limited to the foreseeable damage typical for this type of
              contract. Otherwise, liability for slight negligence is
              excluded. This does not limit statutory warranty rights of
              consumers for paid digital content (section 4).
            </p>
            <p>
              The free part of the Game is provided with the standard of care
              owed for services provided free of charge; mandatory statutory
              rules remain unaffected.
            </p>
          </Section>

          <Section title="13. Governing law and disputes">
            <p className="mb-4">
              These Terms are governed by Austrian law, excluding its conflict
              of law rules and the UN Convention on Contracts for the
              International Sale of Goods. If you are a consumer habitually
              resident in the EU/EEA, you additionally enjoy the protection of
              the mandatory provisions of the law of your country of
              residence, and you may sue or be sued in the courts of that
              country.
            </p>
            <p>
              We are not obliged and not willing to participate in dispute
              resolution before a consumer arbitration board. Please contact
              us first — most issues can be resolved directly:{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
              .
            </p>
          </Section>

          <Section title="14. Final provisions">
            <p className="mb-4">
              These Terms are available in English; the contract language is
              English. The current version can be accessed here at any time,
              and the version you accepted is recorded with your account.
            </p>
            <p>
              If individual provisions of these Terms are invalid, the
              remainder stays in force. Invalid provisions are replaced by the
              statutory rules.
            </p>
          </Section>
        </div>

        <LegalPageFooter currentPath="/legal/terms" />
      </div>
    </main>
  );
}
