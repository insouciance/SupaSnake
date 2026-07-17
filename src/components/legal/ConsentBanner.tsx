'use client';

/**
 * Cookie Consent Banner - GDPR Compliance
 * Allows users to manage their cookie preferences
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { IconX } from '@/components/ui/icons';

const CONSENT_KEY = 'cookie-consent';

export interface ConsentPreferences {
  essential: boolean; // Always true, cannot be disabled
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

const defaultPreferences: ConsentPreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
  timestamp: '',
};

export function ConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setShowBanner(true);
    } else {
      try {
        const parsed = JSON.parse(stored) as ConsentPreferences;
        setPreferences(parsed);
      } catch {
        setShowBanner(true);
      }
    }
  }, []);

  const savePreferences = (prefs: ConsentPreferences) => {
    const withTimestamp = {
      ...prefs,
      essential: true, // Always true
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(withTimestamp));
    setPreferences(withTimestamp);
    setShowBanner(false);
    setShowDetails(false);

    // Dispatch event for analytics to pick up
    window.dispatchEvent(new CustomEvent('consent-updated', { detail: withTimestamp }));
  };

  const acceptAll = () => {
    savePreferences({
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
      timestamp: '',
    });
  };

  const rejectAll = () => {
    savePreferences({
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
      timestamp: '',
    });
  };

  const saveCustom = () => {
    savePreferences(preferences);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-void-deep/95 backdrop-blur-sm border-t-2 border-venom-orange/50 shadow-[0_-8px_32px_rgba(217,131,36,0.12)] animate-fade-up">
      <div className="max-w-6xl mx-auto">
        {!showDetails ? (
          // Simple banner
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-bone-white font-body">
                We use cookies to enhance your gaming experience.{' '}
                <Link href="/legal/cookies" className="text-venom-orange hover:text-venom-orange-light hover:underline">
                  Learn more
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowDetails(true)}
                className="btn-neutral px-4 py-2 min-h-[44px] text-sm"
              >
                Customize
              </button>
              <button
                onClick={rejectAll}
                className="btn-neutral px-4 py-2 min-h-[44px] text-sm"
              >
                Reject All
              </button>
              <button
                onClick={acceptAll}
                className="btn-go px-6 py-2 min-h-[44px] text-sm"
              >
                Accept All
              </button>
            </div>
          </div>
        ) : (
          // Detailed preferences
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="heading-display text-xl text-venom-orange text-glow-orange">
                Cookie Preferences
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                aria-label="Close cookie preferences"
                className="p-2.5 -m-1 text-beige hover:text-bone-white transition-colors"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Essential */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Essential</span>
                  <span className="text-beige text-sm font-body">Always On</span>
                </div>
                <p className="text-beige text-sm font-body">
                  Required for the game to function. Cannot be disabled.
                </p>
              </div>

              {/* Functional */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Functional</span>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, functional: !p.functional }))}
                    className={`w-12 h-6 rounded-arcade border border-scale-blue-light/60 transition-colors ${
                      preferences.functional ? 'bg-venom-orange shadow-glow-sm shadow-venom-orange/50' : 'bg-scale-blue-light'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-bone-white rounded-[2px] transition-transform ${
                        preferences.functional ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-beige text-sm font-body">
                  Remember your preferences like sound settings and theme.
                </p>
              </div>

              {/* Analytics */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Analytics</span>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                    className={`w-12 h-6 rounded-arcade border border-scale-blue-light/60 transition-colors ${
                      preferences.analytics ? 'bg-venom-orange shadow-glow-sm shadow-venom-orange/50' : 'bg-scale-blue-light'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-bone-white rounded-[2px] transition-transform ${
                        preferences.analytics ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-beige text-sm font-body">
                  Help us understand how players use the game to make improvements.
                </p>
              </div>

              {/* Marketing */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Marketing</span>
                  <button
                    onClick={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                    className={`w-12 h-6 rounded-arcade border border-scale-blue-light/60 transition-colors ${
                      preferences.marketing ? 'bg-venom-orange shadow-glow-sm shadow-venom-orange/50' : 'bg-scale-blue-light'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-bone-white rounded-[2px] transition-transform ${
                        preferences.marketing ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-beige text-sm font-body">
                  Track where players come from to improve our advertising.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={rejectAll}
                className="btn-neutral px-4 py-2 min-h-[44px] text-sm"
              >
                Reject All
              </button>
              <button
                onClick={saveCustom}
                className="btn-go px-6 py-2 min-h-[44px] text-sm"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook to get current consent status
export function useConsent(): ConsentPreferences | null {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) {
      try {
        setConsent(JSON.parse(stored));
      } catch {
        setConsent(null);
      }
    }

    const handleUpdate = (e: CustomEvent<ConsentPreferences>) => {
      setConsent(e.detail);
    };

    window.addEventListener('consent-updated', handleUpdate as EventListener);
    return () => window.removeEventListener('consent-updated', handleUpdate as EventListener);
  }, []);

  return consent;
}
