'use client';

import { useState } from 'react';
import { IconSnake } from '@/components/ui/icons';
import { LEGAL_CONTACT, MINIMUM_AGE } from '@/shared/config/legal';

/**
 * Age Gate Component
 *
 * - Blocks users under MINIMUM_AGE (14 — Austria's GDPR Art. 8 digital
 *   consent age per §4(4) DSG; also satisfies COPPA's under-13 line)
 * - Stores verification (hashed, not raw birthdate)
 * - Re-verifies periodically (anti-fraud)
 *
 * Integration:
 * - Show on first launch (App.tsx wrapper)
 * - Persist verification to server (Supabase)
 * - Check verification on each app start
 */

interface AgeGateProps {
  onVerified: (ageVerified: boolean) => void;
  onUnderage: () => void;
}

/** Shared brand header for the gate screens */
function GateBrand() {
  return (
    <div className="flex items-center justify-center gap-2 mb-6 text-venom-orange">
      <IconSnake size={30} />
      <span className="heading-display text-2xl text-glow-orange">SUPASNAKE</span>
    </div>
  );
}

export default function AgeGate({ onVerified, onUnderage }: AgeGateProps) {
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const MIN_AGE = MINIMUM_AGE;
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 100; // Reasonable age limit

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const year = parseInt(birthYear, 10);
      const month = parseInt(birthMonth, 10);

      // Validation
      if (isNaN(year)) {
        setError('Please enter a valid year');
        setLoading(false);
        return;
      }

      if (year > currentYear) {
        setError('Year cannot be in the future');
        setLoading(false);
        return;
      }

      if (year < minYear) {
        setError('Please enter a valid birth year');
        setLoading(false);
        return;
      }

      if (isNaN(month) || month < 1 || month > 12) {
        setError('Please select your birth month');
        setLoading(false);
        return;
      }

      // Calculate age
      const currentMonth = new Date().getMonth() + 1;
      const age = currentYear - year - (currentMonth < month ? 1 : 0);

      if (age < MIN_AGE) {
        // Underage - block and notify parent
        await handleUnderage(year, month);
        return;
      }

      // Verified! Save to server
      await saveAgeVerification(year, month);
      onVerified(true);

    } catch (err) {
      console.error('Age verification error:', err);
      setError('Verification failed. Please try again.');
      setLoading(false);
    }
  };

  const handleUnderage = async (year: number, month: number) => {
    try {
      // Log underage attempt server-side (GDPR: legitimate interest for
      // fraud prevention). The API stores only an anonymized hash and
      // responds 403 for underage years - that response is expected here.
      await fetch('/api/age-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthYear: year,
          birthMonth: month,
        }),
      });

      // Show underage screen
      onUnderage();
    } catch (err) {
      console.error('Underage logging error:', err);
      // Still block even if logging fails
      onUnderage();
    }
  };

  const saveAgeVerification = async (year: number, month: number) => {
    // Server verifies and stores only an anonymized hash (no raw birthdate)
    const response = await fetch('/api/age-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        birthYear: year,
        birthMonth: month,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save age verification');
    }

    // Also save to localStorage (backup if user not logged in yet)
    localStorage.setItem('age_verified', 'true');
    localStorage.setItem('age_verified_at', new Date().toISOString());
  };

  return (
    <div
      className="fixed inset-0 z-[9999] app-bg flex items-center justify-center p-4"
      data-testid="age-gate"
    >
      <div
        className="panel-glow animate-pop-in max-w-md w-full p-8 sm:p-10 text-center"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
        <GateBrand />

        {/* Title */}
        <h2 className="heading-display text-xl text-bone-white mb-2">Age Verification</h2>
        <p className="text-beige/70 font-body mb-8">
          To play SupaSnake, you must be at least {MIN_AGE} years old.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mb-5 space-y-5">
          <div>
            <label
              htmlFor="birthYear"
              className="block label-arcade text-left mb-2"
            >
              What year were you born?
            </label>
            <input
              id="birthYear"
              type="number"
              min={minYear}
              max={currentYear}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="YYYY"
              required
              disabled={loading}
              className="w-full px-4 py-3 min-h-[48px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade font-mono text-lg text-center text-bone-white placeholder:text-beige/40 focus:outline-none focus:border-venom-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="birthMonth"
              className="block label-arcade text-left mb-2"
            >
              What month were you born?
            </label>
            <select
              id="birthMonth"
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-3 min-h-[48px] bg-void-deep/70 border-2 border-scale-blue-light rounded-arcade font-mono text-lg text-bone-white focus:outline-none focus:border-venom-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="" disabled>Select month</option>
              {[
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
              ].map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-strike-red/15 border-2 border-strike-red rounded-arcade p-3 text-strike-red text-sm font-body font-semibold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !birthYear || !birthMonth}
            className="btn-go w-full py-3 min-h-[48px]"
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        {/* Privacy notice */}
        <p className="text-beige/50 text-xs font-body">
          We don&apos;t store your birth year or month. We only verify you&apos;re {MIN_AGE}+.
          <br />
          <a
            href="/legal/privacy"
            target="_blank"
            className="text-venom-orange hover:text-venom-orange-light hover:underline"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

/**
 * Underage Screen Component
 *
 * Shown when user is under MINIMUM_AGE
 * - Explains why they can't play
 * - Provides parent contact info
 * - Doesn't collect any data
 */

export function UnderageScreen() {
  return (
    <div className="fixed inset-0 z-[9999] app-bg flex items-center justify-center p-4">
      <div
        className="panel-glow animate-pop-in max-w-md w-full p-8 sm:p-10 text-center"
        style={{ '--glow': '#f43f5e' } as React.CSSProperties}
      >
        <GateBrand />

        <h2 className="heading-display text-xl text-bone-white mb-6">
          Age Requirement Not Met
        </h2>

        <p className="text-bone-white font-body text-lg mb-8">
          SupaSnake is for players aged {MINIMUM_AGE} and older.
        </p>

        <div className="panel p-5 mb-5 text-left">
          <p className="text-beige text-sm font-body">
            <strong className="text-venom-orange">Parents:</strong> If you&apos;d like to
            learn more about SupaSnake, please contact us at{' '}
            <a
              href={`mailto:${LEGAL_CONTACT.email}`}
              className="text-venom-orange hover:text-venom-orange-light hover:underline"
            >
              {LEGAL_CONTACT.email}
            </a>
          </p>
        </div>

        <p className="text-beige/50 text-xs font-body mb-8">
          This age restriction follows the GDPR digital consent age in Austria
          (§4(4) DSG) and comparable laws worldwide, including COPPA.
        </p>

        <button
          onClick={() => window.location.href = 'https://www.google.com'}
          className="btn-stop w-full py-3 min-h-[48px]"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
