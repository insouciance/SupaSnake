'use client';

/**
 * Email Verification Page - Landing after email confirmation
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { IconCheck, IconX } from '@/components/ui/icons';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  useEffect(() => {
    if (errorParam) {
      setStatus('error');
      return;
    }

    if (!isLoading && isAuthenticated) {
      setStatus('success');
      const timer = setTimeout(() => {
        router.push('/game');
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Auth check finished with no session and no explicit error param:
    // the link was expired/invalid or already used in another tab. Never
    // hang on "Verifying..." forever.
    if (!isLoading && !isAuthenticated) {
      const timer = setTimeout(() => setStatus('error'), 4000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isAuthenticated, errorParam, router]);

  return (
    <div className="app-bg min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="panel-elevated animate-pop-in p-6 text-center">
          {status === 'verifying' && (
            <>
              <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h2 className="heading-display text-xl text-bone-white mb-2">Verifying Email</h2>
              <p className="text-beige font-body">Please wait...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <IconCheck size={40} className="mx-auto mb-4 text-rarity-uncommon drop-shadow-[0_0_12px_rgba(74,222,128,0.6)]" />
              <h2 className="heading-display text-xl text-rarity-uncommon mb-2">Email Verified!</h2>
              <p className="text-beige font-body mb-4">
                Your account is now fully activated.
              </p>
              <p className="text-beige/60 text-sm font-body">
                Redirecting to game in 3 seconds...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <IconX size={40} className="mx-auto mb-4 text-strike-red drop-shadow-[0_0_12px_rgba(164,36,36,0.6)]" />
              <h2 className="heading-display text-xl text-strike-red mb-2">Verification Failed</h2>
              <p className="text-beige font-body mb-4">
                {errorDescription || 'The verification link may have expired.'}
              </p>
              <div className="space-y-3">
                <Link href="/login" className="btn-neutral block px-6 py-2.5 min-h-[44px]">
                  Go to Login
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-beige hover:text-venom-orange text-sm font-body transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="app-bg min-h-screen flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
