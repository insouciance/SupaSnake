'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LEGAL_CONTACT } from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

const CATEGORIES = [
  { value: 'general', label: 'General inquiry' },
  { value: 'support', label: 'Game support / bug report' },
  { value: 'billing', label: 'Purchases & billing' },
  { value: 'privacy', label: 'Privacy / data request (GDPR)' },
  { value: 'content_report', label: 'Report content (illegal or rule-breaking)' },
  { value: 'accessibility', label: 'Accessibility barrier' },
  { value: 'legal', label: 'Legal / other' },
] as const;

export default function ContactPage() {
  const { session } = useAuth();
  const [category, setCategory] = useState<string>('general');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({ category, name, email, message, website }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('error');
      setErrorMsg(
        'Could not reach the server. Please try again or e-mail us directly.'
      );
    }
  }

  const inputClass =
    'w-full bg-scale-blue-dark border-2 border-scale-blue-light rounded-arcade px-4 py-3 font-body text-bone-white placeholder:text-beige/50 focus:border-venom-orange focus:outline-none transition-colors';

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
            Contact
          </h1>
          <p className="text-beige font-body mt-2">
            Questions, bug reports, privacy requests, content reports — this is
            the place. We reply in English and German.
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          {status === 'sent' ? (
            <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
              <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
                Message sent
              </h2>
              <p className="mb-4">
                Thanks — your message is in our inbox and will be handled by a
                person. For privacy requests we respond within the statutory
                one-month period; everything else is usually much faster.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setMessage('');
                }}
                className="text-venom-orange hover:underline"
              >
                Send another message
              </button>
            </section>
          ) : (
            <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="contact-category"
                    className="block text-beige mb-1"
                  >
                    Topic
                  </label>
                  <select
                    id="contact-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputClass}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="contact-name" className="block text-beige mb-1">
                    Name (optional)
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    className={inputClass}
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label htmlFor="contact-email" className="block text-beige mb-1">
                    E-mail address
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={320}
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>

                {/* Honeypot — hidden from real users, tempting for bots */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="contact-website">Website</label>
                  <input
                    id="contact-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="block text-beige mb-1"
                  >
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={8}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={inputClass}
                    placeholder={
                      category === 'content_report'
                        ? 'Please describe the content, where you saw it (e.g. handle, clan name, leaderboard), and why you believe it is illegal or violates the rules.'
                        : 'How can we help?'
                    }
                  />
                </div>

                {status === 'error' && (
                  <p className="text-strike-red" role="alert">
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="btn-go px-8 py-3 font-display uppercase tracking-arcade disabled:opacity-50"
                >
                  {status === 'sending' ? 'Sending…' : 'Send message'}
                </button>

                <p className="text-sm text-beige/70">
                  We process your details to answer your request — see the{' '}
                  <Link
                    href="/legal/privacy"
                    className="text-venom-orange hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  , section 3.11.
                </p>
              </form>
            </section>
          )}

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Prefer e-mail?
            </h2>
            <p>
              You can always reach us directly at{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
              . Postal address and full company details are in the{' '}
              <Link
                href="/legal/impressum"
                className="text-venom-orange hover:underline"
              >
                Impressum
              </Link>
              .
            </p>
          </section>
        </div>

        <LegalPageFooter currentPath="/contact" />
      </div>
    </main>
  );
}
