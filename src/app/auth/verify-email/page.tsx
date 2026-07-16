'use client';

/**
 * Email Verification Page - Landing after email confirmation
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';

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
  }, [isLoading, isAuthenticated, errorParam, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-scale-blue-dark px-4">
      <div className="w-full max-w-md">
        <div className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6 text-center">
          {status === 'verifying' && (
            <>
              <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-display uppercase tracking-arcade text-bone-white mb-2">Verifying Email</h2>
              <p className="text-beige font-body">Please wait...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-4xl mb-4 text-green-400">&#x2713;</div>
              <h2 className="text-xl font-display uppercase tracking-arcade text-green-400 mb-2">Email Verified!</h2>
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
              <div className="text-4xl mb-4 text-strike-red">&#x2717;</div>
              <h2 className="text-xl font-display uppercase tracking-arcade text-strike-red mb-2">Verification Failed</h2>
              <p className="text-beige font-body mb-4">
                {errorDescription || 'The verification link may have expired.'}
              </p>
              <div className="space-y-3">
                <Link
                  href="/login"
                  className="block px-6 py-2 bg-scale-blue-light border-[3px] border-scale-blue-light rounded-arcade font-display uppercase tracking-arcade text-beige hover:text-bone-white hover:border-venom-orange transition-all"
                >
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
        <div className="min-h-screen flex items-center justify-center bg-scale-blue-dark">
          <div className="w-12 h-12 border-4 border-venom-orange border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
