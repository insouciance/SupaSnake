import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | OG Snake',
  description: 'Privacy Policy for OG Snake game - How we collect, use, and protect your data',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = '2026-07-16';
  const companyName = 'OG Snake';
  const contactEmail = 'bllj@proton.me';
  const dpoEmail = 'bllj@proton.me';

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
            Privacy Policy
          </h1>
          <p className="text-beige font-body mt-2">Last Updated: {lastUpdated}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 font-body text-bone-white/90">
          {/* Introduction */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Introduction
            </h2>
            <p className="mb-4">
              {companyName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) respects your privacy and is committed
              to protecting your personal data. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our game.
            </p>
            <p>
              This policy applies to users worldwide, including those in the European Economic Area
              (EEA), United Kingdom, and California.
            </p>
          </section>

          {/* Data We Collect */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              1. Data We Collect
            </h2>

            <h3 className="text-lg text-bone-white font-bold mb-2">Account Data</h3>
            <ul className="list-disc list-inside space-y-1 text-beige mb-4">
              <li>Email address (if you create an account)</li>
              <li>Username (optional)</li>
              <li>Authentication tokens</li>
            </ul>

            <h3 className="text-lg text-bone-white font-bold mb-2">Gameplay Data</h3>
            <ul className="list-disc list-inside space-y-1 text-beige mb-4">
              <li>Game progress, scores, and achievements</li>
              <li>Virtual currency balances (DNA, Energy)</li>
              <li>Snake collection and breeding history</li>
              <li>Session timestamps and duration</li>
            </ul>

            <h3 className="text-lg text-bone-white font-bold mb-2">Technical Data</h3>
            <ul className="list-disc list-inside space-y-1 text-beige mb-4">
              <li>Device type and operating system</li>
              <li>Browser type and version</li>
              <li>IP address (anonymized for analytics)</li>
              <li>Error logs and crash reports</li>
            </ul>

            <h3 className="text-lg text-bone-white font-bold mb-2">Payment Data</h3>
            <p className="text-beige">
              Payment processing is handled by Stripe. We do not store credit card numbers.
              We receive only transaction confirmations and purchase history.
            </p>
          </section>

          {/* How We Use Data */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              2. How We Use Your Data
            </h2>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li><strong className="text-bone-white">Provide the Game:</strong> Save progress, sync across devices, process purchases</li>
              <li><strong className="text-bone-white">Improve the Game:</strong> Analytics to understand player behavior and preferences</li>
              <li><strong className="text-bone-white">Ensure Security:</strong> Detect cheating, fraud, and abuse</li>
              <li><strong className="text-bone-white">Customer Support:</strong> Respond to inquiries and resolve issues</li>
              <li><strong className="text-bone-white">Legal Compliance:</strong> Meet regulatory requirements</li>
            </ul>
          </section>

          {/* Legal Basis (GDPR) */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              3. Legal Basis for Processing (GDPR)
            </h2>
            <p className="mb-4">For users in the EEA/UK, we process data based on:</p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li><strong className="text-bone-white">Contract:</strong> To provide the Game and process purchases</li>
              <li><strong className="text-bone-white">Legitimate Interest:</strong> Analytics, security, and fraud prevention</li>
              <li><strong className="text-bone-white">Consent:</strong> Marketing communications (where applicable)</li>
              <li><strong className="text-bone-white">Legal Obligation:</strong> Tax records, law enforcement requests</li>
            </ul>
          </section>

          {/* Data Sharing */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              4. Data Sharing
            </h2>
            <p className="mb-4">We may share your data with:</p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li><strong className="text-bone-white">Service Providers:</strong> Supabase (database and authentication, hosted in the EU), Stripe (payments), Vercel (hosting), Resend (transactional email - planned)</li>
              <li><strong className="text-bone-white">Analytics Partners:</strong> PostHog (product analytics, EU hosting), Sentry (error tracking, hosted in Germany) - with appropriate DPAs</li>
              <li><strong className="text-bone-white">Legal Authorities:</strong> When required by law or to protect our rights</li>
            </ul>
            <p className="mt-4">We do not sell your personal data to third parties.</p>
          </section>

          {/* Your Rights */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              5. Your Rights
            </h2>
            <p className="mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li><strong className="text-bone-white">Access:</strong> Request a copy of your personal data</li>
              <li><strong className="text-bone-white">Rectification:</strong> Correct inaccurate data</li>
              <li><strong className="text-bone-white">Erasure:</strong> Delete your account and data (&quot;right to be forgotten&quot;)</li>
              <li><strong className="text-bone-white">Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong className="text-bone-white">Restriction:</strong> Limit how we process your data</li>
              <li><strong className="text-bone-white">Objection:</strong> Object to processing based on legitimate interests</li>
              <li><strong className="text-bone-white">Withdraw Consent:</strong> Where processing is based on consent</li>
            </ul>
            <p>
              To exercise these rights, visit the{' '}
              <Link href="/settings/privacy" className="text-venom-orange hover:underline">
                Privacy Settings
              </Link>{' '}
              page or contact us at{' '}
              <a href={`mailto:${contactEmail}`} className="text-venom-orange hover:underline">
                {contactEmail}
              </a>.
            </p>
          </section>

          {/* Data Retention */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              6. Data Retention
            </h2>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>Account data: Until you delete your account</li>
              <li>Gameplay data: Until account deletion + 30 days</li>
              <li>Payment records: 7 years (legal requirement)</li>
              <li>Analytics data: 2 years (anonymized)</li>
              <li>Support tickets: 3 years after resolution</li>
            </ul>
          </section>

          {/* Children's Privacy */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              7. Children&apos;s Privacy (COPPA)
            </h2>
            <p className="mb-4">
              The Game is not intended for children under 13. We do not knowingly collect
              personal data from children under 13. If we discover that a child under 13 has
              provided personal data, we will delete it immediately.
            </p>
            <p>
              If you believe a child under 13 has provided us with personal data, please contact
              us at{' '}
              <a href={`mailto:${contactEmail}`} className="text-venom-orange hover:underline">
                {contactEmail}
              </a>.
            </p>
          </section>

          {/* California Rights (CCPA) */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              8. California Privacy Rights (CCPA)
            </h2>
            <p className="mb-4">If you are a California resident, you have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-beige mb-4">
              <li>Know what personal information is collected</li>
              <li>Know whether your data is sold or disclosed</li>
              <li>Say no to the sale of personal information</li>
              <li>Request deletion of your personal information</li>
              <li>Not be discriminated against for exercising these rights</li>
            </ul>
            <p className="text-beige">
              We do not sell personal information as defined by the CCPA.
            </p>
          </section>

          {/* International Transfers */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              9. International Data Transfers
            </h2>
            <p>
              Your data may be processed in countries outside your residence, including the
              United States. We ensure appropriate safeguards through Standard Contractual
              Clauses (SCCs) and working only with service providers who maintain adequate
              data protection standards.
            </p>
          </section>

          {/* Security */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              10. Security
            </h2>
            <p className="mb-4">
              We implement industry-standard security measures including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>Encryption in transit (TLS 1.3)</li>
              <li>Encryption at rest for sensitive data</li>
              <li>Regular security audits</li>
              <li>Access controls and authentication</li>
              <li>Row-level security on database tables</li>
            </ul>
          </section>

          {/* Contact */}
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              11. Contact Us
            </h2>
            <p className="mb-4">
              For privacy inquiries, contact our Data Protection Officer:
            </p>
            <p className="text-beige">
              Email:{' '}
              <a href={`mailto:${dpoEmail}`} className="text-venom-orange hover:underline">
                {dpoEmail}
              </a>
            </p>
            <p className="text-beige mt-2">
              General Privacy:{' '}
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
            <Link href="/legal/cookies" className="hover:text-bone-white transition-colors">
              Cookie Policy
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
