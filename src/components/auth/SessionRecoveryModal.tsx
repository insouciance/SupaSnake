'use client';

/**
 * Session Recovery Modal - Appears when token expires during gameplay
 * Options: Re-login, Continue as guest, Sign out
 */

import { useState } from 'react';
import { useSessionRecovery } from '@/hooks/useSessionRecovery';
import { LoginForm } from './LoginForm';
import { IconLock } from '@/components/ui/icons';

interface SessionRecoveryModalProps {
  onDismiss?: () => void;
  onRecovered?: () => void;
}

export function SessionRecoveryModal({ onDismiss, onRecovered }: SessionRecoveryModalProps) {
  const {
    isSessionExpired,
    isRecovering,
    error,
    attemptRecovery,
    handleSignOut,
    dismissRecovery,
  } = useSessionRecovery();

  const [showLoginForm, setShowLoginForm] = useState(false);

  if (!isSessionExpired) return null;

  const handleTryRefresh = async () => {
    const success = await attemptRecovery();
    if (success) {
      onRecovered?.();
    }
  };

  const handleLoginSuccess = () => {
    dismissRecovery();
    onRecovered?.();
  };

  const handleContinueAsGuest = async () => {
    await handleSignOut();
    dismissRecovery();
    onDismiss?.();
  };

  const handleClose = () => {
    dismissRecovery();
    onDismiss?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm">
      <div
        className="panel-glow animate-pop-in p-6 max-w-md w-full mx-4 text-bone-white"
        style={{ '--glow': '#D98324' } as React.CSSProperties}
      >
        {showLoginForm ? (
          <>
            <h2 className="heading-display text-xl text-bone-white mb-4">Sign In</h2>
            <LoginForm
              onSuccess={handleLoginSuccess}
              showForgotPassword={false}
              showSignUpLink={false}
            />
            <button
              onClick={() => setShowLoginForm(false)}
              className="w-full mt-4 py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
            >
              Back
            </button>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <IconLock size={40} className="mx-auto mb-4 text-venom-orange" />
              <h2 className="heading-display text-xl text-bone-white mb-2">Session Expired</h2>
              <p className="text-beige/70 text-sm font-body">
                {error || 'Your session has expired. Sign in to continue.'}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleTryRefresh}
                disabled={isRecovering}
                className="btn-go w-full py-3"
              >
                {isRecovering ? 'Refreshing...' : 'Try to Refresh Session'}
              </button>

              <button
                onClick={() => setShowLoginForm(true)}
                className="btn-neutral w-full py-3"
              >
                Sign In Again
              </button>

              <button
                onClick={handleContinueAsGuest}
                className="btn-neutral w-full py-3"
              >
                Continue as Guest
              </button>

              <button
                onClick={handleClose}
                className="w-full py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SessionRecoveryModal;
