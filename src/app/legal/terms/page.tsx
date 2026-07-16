import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | OG Snake',
  description: 'Terms of Service for OG Snake game',
};

export default function TermsOfServicePage() {
  const lastUpdated = '2026-07-16';
  const companyName = 'OG Snake';
  const contactEmail = 'bllj@proton.me';

  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
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
          <p className="text-beige font-body mt-2">Last Updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 font-body text-bone-white/90">
          {/* Section 1 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="mb-4">
              By accessing or using {companyName} (&quot;the Game&quot;), you agree to be bound by these
              Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Game.
            </p>
            <p>
              We reserve the right to modify these Terms at any time. Your continued use of the
              Game after any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              2. Eligibility
            </h2>
            <p className="mb-4">
              You must be at least 13 years old to use this Game. If you are under 18, you must
              have parental or guardian consent to use the Game and make any purchases.
            </p>
            <p>
              By using the Game, you represent and warrant that you meet these eligibility requirements.
            </p>
          </section>

          {/* Section 3 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              3. Account Registration
            </h2>
            <p className="mb-4">
              You may create an account to save your progress and access additional features.
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activities that occur under your account.
            </p>
            <p>
              You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          {/* Section 4 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              4. Virtual Items and Purchases
            </h2>
            <p className="mb-4">
              The Game may offer virtual items, currency (DNA, Energy), and other digital content
              for purchase. All purchases are final and non-refundable except as required by law.
            </p>
            <p className="mb-4">
              Virtual items have no real-world value and cannot be exchanged for real currency.
              We reserve the right to modify, remove, or adjust virtual items at any time.
            </p>
            <p>
              All game variants can be unlocked through gameplay. Purchases provide convenience,
              not competitive advantages.
            </p>
          </section>

          {/* Section 5 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              5. User Conduct
            </h2>
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>Use cheats, exploits, automation software, bots, or hacks</li>
              <li>Attempt to gain unauthorized access to our systems or other users&apos; accounts</li>
              <li>Engage in any activity that disrupts the Game or servers</li>
              <li>Harass, threaten, or abuse other players</li>
              <li>Use the Game for any illegal purpose</li>
              <li>Sell, trade, or transfer your account or virtual items outside the Game</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              6. Intellectual Property
            </h2>
            <p className="mb-4">
              All content in the Game, including graphics, audio, code, and trademarks, is owned
              by {companyName} or its licensors and is protected by intellectual property laws.
            </p>
            <p>
              You are granted a limited, non-exclusive, non-transferable license to use the Game
              for personal, non-commercial purposes.
            </p>
          </section>

          {/* Section 7 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              7. Termination
            </h2>
            <p className="mb-4">
              We may suspend or terminate your access to the Game at any time, with or without
              cause, with or without notice. Upon termination, your license to use the Game ends
              immediately.
            </p>
            <p>
              You may delete your account at any time through the settings menu or by contacting
              us at {contactEmail}.
            </p>
          </section>

          {/* Section 8 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              8. Disclaimer of Warranties
            </h2>
            <p className="mb-4">
              THE GAME IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL
              WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              We do not guarantee that the Game will be uninterrupted, error-free, or secure.
            </p>
          </section>

          {/* Section 9 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              9. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, {companyName.toUpperCase()} SHALL NOT BE LIABLE
              FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM
              YOUR USE OF THE GAME.
            </p>
          </section>

          {/* Section 10 */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              10. Contact Us
            </h2>
            <p>
              If you have questions about these Terms, please contact us at:{' '}
              <a href={`mailto:${contactEmail}`} className="text-venom-orange hover:underline">
                {contactEmail}
              </a>
            </p>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-scale-blue-light">
          <div className="flex flex-wrap gap-6 text-beige font-body text-sm">
            <Link href="/legal/privacy" className="hover:text-bone-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/cookies" className="hover:text-bone-white transition-colors">
              Cookie Policy
            </Link>
            <Link href="/" className="hover:text-bone-white transition-colors">
              Back to Game
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
