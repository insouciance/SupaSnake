'use client';

/**
 * Privacy Settings Page - GDPR Compliance
 * Allows users to manage their data and consent preferences
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';

interface ConsentPreferences {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export default function PrivacySettingsPage() {
  const { user, session, isAuthenticated, isAnonymous, signOut } = useAuth();
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    essential: true,
    functional: true,
    analytics: false,
    marketing: false,
  });
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load preferences from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('cookie-consent');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPreferences(parsed);
      } catch {
        // Use defaults
      }
    }
  }, []);

  const savePreferences = () => {
    setLoading(true);
    const withTimestamp = {
      ...preferences,
      essential: true,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('cookie-consent', JSON.stringify(withTimestamp));
    window.dispatchEvent(new CustomEvent('consent-updated', { detail: withTimestamp }));
    setMessage({ type: 'success', text: 'Preferences saved successfully' });
    setLoading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportData = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Please sign in to export your data' });
      return;
    }

    setExportLoading(true);
    try {
      const response = await fetch('/api/user/export-data', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supasnake-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setMessage({ type: 'success', text: 'Data exported successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to export data' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Please sign in to delete your account' });
      return;
    }

    setDeleteLoading(true);
    try {
      const immediate = isAnonymous;
      const response = await fetch('/api/user/delete-account', {
        method: immediate ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(
          immediate
            ? {
                confirm: true,
                confirmation: deleteEmail,
              }
            : { confirmEmail: deleteEmail }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Deletion request failed');
      }

      if (immediate) {
        await signOut();
        setMessage({
          type: 'success',
          text: 'Your guest account and gameplay data have been deleted.',
        });
      } else {
        const deletionDate = new Date(data.scheduledDeletion).toLocaleDateString();
        // End the current session so cancellation really requires a new
        // authentication event, matching the legal copy and server behavior.
        await signOut();
        setMessage({
          type: 'success',
          text: `Account deletion scheduled for ${deletionDate}. Sign in again before then to cancel.`,
        });
      }
      setShowDeleteConfirm(false);
      setDeleteEmail('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to schedule deletion' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-beige hover:text-bone-white transition-colors font-body text-sm"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange mt-4">
            Privacy Settings
          </h1>
          <p className="text-beige font-body mt-2">
            Manage your data and privacy preferences
          </p>
        </div>

        {/* Messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-arcade border-[3px] ${
              message.type === 'success'
                ? 'bg-venom-orange/20 border-venom-orange text-venom-orange'
                : 'bg-strike-red/20 border-strike-red text-strike-red'
            }`}
          >
            <p className="font-body">{message.text}</p>
          </div>
        )}

        {/* Cookie Preferences */}
        <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 mb-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-4">
            Cookie Preferences
          </h2>

          <div className="space-y-4">
            {/* Essential */}
            <div className="flex items-center justify-between p-4 bg-scale-blue-dark rounded-arcade">
              <div>
                <span className="font-body text-bone-white font-bold">Essential</span>
                <p className="text-beige text-sm font-body">Required for the game to function</p>
              </div>
              <span className="text-beige text-sm font-body">Always On</span>
            </div>

            {/* Functional */}
            <div className="flex items-center justify-between p-4 bg-scale-blue-dark rounded-arcade">
              <div>
                <span className="font-body text-bone-white font-bold">Functional</span>
                <p className="text-beige text-sm font-body">Remember your preferences</p>
              </div>
              <button
                onClick={() => setPreferences(p => ({ ...p, functional: !p.functional }))}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.functional ? 'bg-venom-orange' : 'bg-scale-blue-light'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-bone-white rounded-full transition-transform ${
                    preferences.functional ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between p-4 bg-scale-blue-dark rounded-arcade">
              <div>
                <span className="font-body text-bone-white font-bold">Analytics</span>
                <p className="text-beige text-sm font-body">Help us improve the game</p>
              </div>
              <button
                onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.analytics ? 'bg-venom-orange' : 'bg-scale-blue-light'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-bone-white rounded-full transition-transform ${
                    preferences.analytics ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between p-4 bg-scale-blue-dark rounded-arcade">
              <div>
                <span className="font-body text-bone-white font-bold">Marketing</span>
                <p className="text-beige text-sm font-body">Advertising attribution</p>
              </div>
              <button
                onClick={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.marketing ? 'bg-venom-orange' : 'bg-scale-blue-light'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-bone-white rounded-full transition-transform ${
                    preferences.marketing ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <button
            onClick={savePreferences}
            disabled={loading}
            className="mt-6 w-full px-6 py-3 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-scale-blue-dark hover:bg-venom-orange-light transition-all disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Preferences'}
          </button>
        </section>

        {/* Data Export */}
        <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 mb-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-4">
            Export Your Data
          </h2>
          <p className="text-beige font-body mb-4">
            Download a copy of all your personal data in JSON format (GDPR Article 20).
          </p>
          <button
            onClick={handleExportData}
            disabled={exportLoading || !isAuthenticated}
            className="w-full px-6 py-3 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light transition-all disabled:opacity-50"
          >
            {exportLoading ? 'Exporting...' : 'Download My Data'}
          </button>
          {!isAuthenticated && (
            <p className="text-beige/60 text-sm font-body mt-2">
              Sign in to export your data
            </p>
          )}
        </section>

        {/* Delete Account */}
        <section className="bg-scale-blue border-[3px] border-strike-red/50 rounded-arcade p-6">
          <h2 className="text-xl font-display uppercase tracking-arcade text-strike-red mb-4">
            Delete Account
          </h2>
          <p className="text-beige font-body mb-4">
            {isAnonymous
              ? 'Permanently delete this guest account and its gameplay data immediately. Guest accounts cannot be recovered after sign-out.'
              : 'Permanently delete your account and associated gameplay data after a 30-day grace period. Signing in again during that period cancels the request.'}
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={!isAuthenticated}
              className="w-full px-6 py-3 bg-strike-red/20 border-[3px] border-strike-red rounded-arcade font-display uppercase tracking-arcade text-strike-red hover:bg-strike-red hover:text-bone-white transition-all disabled:opacity-50"
            >
              Request Account Deletion
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-strike-red font-body font-bold">
                {isAnonymous
                  ? 'Type DELETE MY ACCOUNT to confirm:'
                  : 'Enter your email to confirm deletion:'}
              </p>
              <input
                type={isAnonymous ? 'text' : 'email'}
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder={isAnonymous ? 'DELETE MY ACCOUNT' : user?.email ?? 'your@email.com'}
                className="w-full px-4 py-3 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade text-bone-white font-body focus:border-strike-red focus:outline-none"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteEmail('');
                  }}
                  className="flex-1 px-6 py-3 bg-scale-blue-dark border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-scale-blue-light transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading || !deleteEmail}
                  className="flex-1 px-6 py-3 bg-strike-red border-[3px] border-red-900 rounded-arcade font-display uppercase tracking-arcade text-bone-white hover:bg-red-700 transition-all disabled:opacity-50"
                >
                  {deleteLoading
                    ? 'Processing...'
                    : isAnonymous
                      ? 'Delete Now'
                      : 'Schedule Deletion'}
                </button>
              </div>
            </div>
          )}
          {!isAuthenticated && (
            <p className="text-beige/60 text-sm font-body mt-2">
              Sign in to delete your account
            </p>
          )}
        </section>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t border-scale-blue-light">
          <div className="flex flex-wrap gap-6 text-beige font-body text-sm">
            <Link href="/legal/privacy" className="hover:text-bone-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/cookies" className="hover:text-bone-white transition-colors">
              Cookie Policy
            </Link>
            <Link href="/legal/terms" className="hover:text-bone-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
