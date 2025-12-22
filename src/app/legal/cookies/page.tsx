import Link from 'next/link';

export const metadata = {
  title: 'Cookie Policy | OG Snake',
  description: 'Cookie Policy for OG Snake game - How we use cookies and similar technologies',
};

export default function CookiePolicyPage() {
  const lastUpdated = '2024-12-13';
  const contactEmail = 'privacy@ogsnake.com';

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
            Cookie Policy
          </h1>
          <p className="text-beige font-body mt-2">Last Updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 font-body text-bone-white/90">
          {/* What Are Cookies */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              What Are Cookies?
            </h2>
            <p className="mb-4">
              Cookies are small text files stored on your device when you visit a website or use an
              application. They help us remember your preferences, understand how you use our game,
              and improve your experience.
            </p>
            <p>
              We also use similar technologies like local storage and session storage for the same purposes.
            </p>
          </section>

          {/* Types of Cookies */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Types of Cookies We Use
            </h2>

            {/* Essential */}
            <div className="mb-6 p-4 bg-scale-blue-dark rounded-arcade border border-scale-blue-light">
              <h3 className="text-lg text-bone-white font-bold mb-2">Essential Cookies</h3>
              <p className="text-beige text-sm mb-2">Required for the game to function. Cannot be disabled.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-beige border-b border-scale-blue-light">
                    <th className="pb-2">Cookie</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-bone-white/80">
                  <tr className="border-b border-scale-blue-light/50">
                    <td className="py-2 text-venom-orange">sb-access-token</td>
                    <td className="py-2">Authentication session</td>
                    <td className="py-2">1 hour</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/50">
                    <td className="py-2 text-venom-orange">sb-refresh-token</td>
                    <td className="py-2">Session refresh</td>
                    <td className="py-2">7 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-venom-orange">age-verified</td>
                    <td className="py-2">Age verification status</td>
                    <td className="py-2">7 days</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Functional */}
            <div className="mb-6 p-4 bg-scale-blue-dark rounded-arcade border border-scale-blue-light">
              <h3 className="text-lg text-bone-white font-bold mb-2">Functional Cookies</h3>
              <p className="text-beige text-sm mb-2">Remember your preferences. Can be disabled.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-beige border-b border-scale-blue-light">
                    <th className="pb-2">Cookie</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-bone-white/80">
                  <tr className="border-b border-scale-blue-light/50">
                    <td className="py-2 text-venom-orange">theme</td>
                    <td className="py-2">UI theme preference</td>
                    <td className="py-2">1 year</td>
                  </tr>
                  <tr className="border-b border-scale-blue-light/50">
                    <td className="py-2 text-venom-orange">audio-enabled</td>
                    <td className="py-2">Sound settings</td>
                    <td className="py-2">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-venom-orange">selected-dynasty</td>
                    <td className="py-2">Last selected dynasty</td>
                    <td className="py-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Analytics */}
            <div className="mb-6 p-4 bg-scale-blue-dark rounded-arcade border border-scale-blue-light">
              <h3 className="text-lg text-bone-white font-bold mb-2">Analytics Cookies</h3>
              <p className="text-beige text-sm mb-2">Help us understand how you use the game. Can be disabled.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-beige border-b border-scale-blue-light">
                    <th className="pb-2">Cookie</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-bone-white/80">
                  <tr className="border-b border-scale-blue-light/50">
                    <td className="py-2 text-venom-orange">amp_*</td>
                    <td className="py-2">Amplitude analytics</td>
                    <td className="py-2">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-venom-orange">sentry-*</td>
                    <td className="py-2">Error tracking</td>
                    <td className="py-2">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Marketing */}
            <div className="p-4 bg-scale-blue-dark rounded-arcade border border-scale-blue-light">
              <h3 className="text-lg text-bone-white font-bold mb-2">Marketing Cookies</h3>
              <p className="text-beige text-sm mb-2">Track advertising effectiveness. Can be disabled.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-beige border-b border-scale-blue-light">
                    <th className="pb-2">Cookie</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody className="text-bone-white/80">
                  <tr>
                    <td className="py-2 text-venom-orange">adjust_*</td>
                    <td className="py-2">Attribution tracking</td>
                    <td className="py-2">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Local Storage */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Local Storage
            </h2>
            <p className="mb-4">
              We use browser local storage for non-sensitive UI preferences only. Game progress
              and account data are stored securely on our servers, not in your browser.
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li><strong className="text-bone-white">UI preferences:</strong> Sound settings, visual preferences</li>
              <li><strong className="text-bone-white">Consent choices:</strong> Your cookie preferences</li>
            </ul>
          </section>

          {/* Managing Cookies */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Managing Your Cookie Preferences
            </h2>
            <p className="mb-4">
              You can manage your cookie preferences at any time:
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>
                <strong className="text-bone-white">In-Game:</strong> Visit{' '}
                <Link href="/settings/privacy" className="text-venom-orange hover:underline">
                  Privacy Settings
                </Link>
              </li>
              <li>
                <strong className="text-bone-white">Browser Settings:</strong> Most browsers allow you to
                block or delete cookies through their settings menu
              </li>
            </ul>
            <p className="text-beige text-sm">
              Note: Disabling essential cookies may prevent the game from functioning properly.
            </p>
          </section>

          {/* Third-Party Cookies */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Third-Party Services
            </h2>
            <p className="mb-4">
              We use the following third-party services that may set their own cookies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>
                <strong className="text-bone-white">Supabase:</strong> Authentication and database{' '}
                <a href="https://supabase.com/privacy" className="text-venom-orange hover:underline" target="_blank" rel="noopener noreferrer">
                  (Privacy Policy)
                </a>
              </li>
              <li>
                <strong className="text-bone-white">Stripe:</strong> Payment processing{' '}
                <a href="https://stripe.com/privacy" className="text-venom-orange hover:underline" target="_blank" rel="noopener noreferrer">
                  (Privacy Policy)
                </a>
              </li>
              <li>
                <strong className="text-bone-white">Vercel:</strong> Hosting{' '}
                <a href="https://vercel.com/legal/privacy-policy" className="text-venom-orange hover:underline" target="_blank" rel="noopener noreferrer">
                  (Privacy Policy)
                </a>
              </li>
              <li>
                <strong className="text-bone-white">Amplitude:</strong> Analytics{' '}
                <a href="https://amplitude.com/privacy" className="text-venom-orange hover:underline" target="_blank" rel="noopener noreferrer">
                  (Privacy Policy)
                </a>
              </li>
              <li>
                <strong className="text-bone-white">Sentry:</strong> Error tracking{' '}
                <a href="https://sentry.io/privacy/" className="text-venom-orange hover:underline" target="_blank" rel="noopener noreferrer">
                  (Privacy Policy)
                </a>
              </li>
            </ul>
          </section>

          {/* Updates */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Changes to This Policy
            </h2>
            <p>
              We may update this Cookie Policy from time to time. We will notify you of any
              material changes by posting the new policy on this page and updating the
              &quot;Last Updated&quot; date.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Contact Us
            </h2>
            <p>
              If you have questions about our use of cookies, please contact us at:{' '}
              <a href={`mailto:${contactEmail}`} className="text-venom-orange hover:underline">
                {contactEmail}
              </a>
            </p>
          </section>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-scale-blue-light">
          <div className="flex flex-wrap gap-6 text-beige font-body text-sm">
            <Link href="/legal/terms" className="hover:text-bone-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="hover:text-bone-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/settings/privacy" className="hover:text-bone-white transition-colors">
              Privacy Settings
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
