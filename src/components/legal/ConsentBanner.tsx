'use client';

/**
 * Cookie Consent Banner - GDPR Compliance
 * Allows users to manage their cookie preferences
 */

import { useState, useEffect, useRef } from 'react';
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

interface ConsentToggleProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

function ConsentToggle({ label, checked, onToggle }: ConsentToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onToggle}
      className="relative h-11 w-12 shrink-0 rounded-arcade focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 h-6 w-12 -translate-y-1/2 rounded-arcade border border-scale-blue-light/60 transition-colors ${
          checked
            ? 'bg-venom-orange shadow-glow-sm shadow-venom-orange/50'
            : 'bg-scale-blue-light'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-[2px] bg-bone-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function ConsentBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CONSENT_KEY);
    } catch {
      // Storage-restricted browsers still receive a usable legal choice.
    }
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

  // Publish the banner's measured height as a layout token. Responsive pages
  // reserve exactly this space instead of guessing at a breakpoint-specific
  // banner height, and ResizeObserver keeps the token current when copy wraps
  // or the preference sheet opens.
  useEffect(() => {
    const root = document.documentElement;
    const banner = bannerRef.current;
    if (!showBanner || !banner) {
      root.style.removeProperty('--consent-banner-height');
      delete root.dataset.consentVisible;
      return;
    }

    const updateHeight = () => {
      root.style.setProperty(
        '--consent-banner-height',
        `${Math.ceil(banner.getBoundingClientRect().height)}px`
      );
      root.dataset.consentVisible = 'true';
    };
    updateHeight();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateHeight);
    observer?.observe(banner);
    window.addEventListener('resize', updateHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeight);
      root.style.removeProperty('--consent-banner-height');
      delete root.dataset.consentVisible;
    };
  }, [showBanner]);

  const savePreferences = (prefs: ConsentPreferences) => {
    const withTimestamp = {
      ...prefs,
      essential: true, // Always true
      timestamp: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(withTimestamp));
    } catch {
      // The decision applies for this page lifetime even if persistence is
      // unavailable; a future visit may need to ask again.
    }
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
    <div
      ref={bannerRef}
      role="region"
      aria-label="Cookie consent"
      className="consent-banner fixed inset-x-0 z-[90] max-h-[calc(100dvh-0.5rem)] overflow-y-auto border-venom-orange/50 bg-void-deep/95 px-3 py-3 shadow-[0_-8px_32px_rgba(34,211,238,0.12)] backdrop-blur-sm animate-fade-up max-sm:top-0 max-sm:border-b-2 sm:bottom-0 sm:border-t-2 sm:px-4 sm:py-4"
    >
      <div className="max-w-6xl mx-auto">
        {!showDetails ? (
          // Simple banner
          <div className="consent-summary flex flex-col items-stretch justify-between gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1">
              <p className="text-sm leading-snug text-bone-white font-body sm:text-base">
                We use cookies to enhance your gaming experience.{' '}
                <Link href="/legal/cookies" className="text-venom-orange hover:text-venom-orange-light hover:underline">
                  Learn more
                </Link>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="btn-neutral min-h-[44px] px-2 py-2 text-xs sm:px-4 sm:text-sm"
              >
                Customize
              </button>
              <button
                type="button"
                onClick={rejectAll}
                className="btn-neutral min-h-[44px] px-2 py-2 text-xs sm:px-4 sm:text-sm"
              >
                Reject All
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="btn-go min-h-[44px] px-2 py-2 text-xs sm:px-6 sm:text-sm"
              >
                Accept All
              </button>
            </div>
          </div>
        ) : (
          // Detailed preferences
          <div
            className="space-y-3 sm:space-y-4"
            role="dialog"
            aria-label="Cookie preferences"
          >
            <div className="flex items-center justify-between">
              <h3 className="heading-display text-xl text-venom-orange text-glow-orange">
                Cookie Preferences
              </h3>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                aria-label="Close cookie preferences"
                className="-m-1 flex min-h-[44px] min-w-[44px] items-center justify-center text-beige transition-colors hover:text-bone-white focus:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
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
                  <ConsentToggle
                    label="Functional cookies"
                    checked={preferences.functional}
                    onToggle={() => setPreferences(p => ({ ...p, functional: !p.functional }))}
                  />
                </div>
                <p className="text-beige text-sm font-body">
                  Remember your preferences like sound settings and theme.
                </p>
              </div>

              {/* Analytics */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Analytics</span>
                  <ConsentToggle
                    label="Analytics cookies"
                    checked={preferences.analytics}
                    onToggle={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                  />
                </div>
                <p className="text-beige text-sm font-body">
                  Help us understand how players use the game to make improvements.
                </p>
              </div>

              {/* Marketing */}
              <div className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-bone-white font-bold">Marketing</span>
                  <ConsentToggle
                    label="Marketing cookies"
                    checked={preferences.marketing}
                    onToggle={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                  />
                </div>
                <p className="text-beige text-sm font-body">
                  Track where players come from to improve our advertising.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 sm:gap-3 sm:pt-2">
              <button
                type="button"
                onClick={rejectAll}
                className="btn-neutral px-4 py-2 min-h-[44px] text-sm"
              >
                Reject All
              </button>
              <button
                type="button"
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
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CONSENT_KEY);
    } catch {
      // Storage-restricted browsers remain on essential-only behavior.
    }
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
