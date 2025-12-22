'use client';

/**
 * Session Recovery Modal - Appears when token expires during gameplay
 * Options: Re-login, Continue as guest, Sign out
 */

import { useState } from 'react';
import { useSessionRecovery } from '@/hooks/useSessionRecovery';
import { LoginForm } from './LoginForm';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg p-6 shadow-xl max-w-md w-full mx-4">
        {showLoginForm ? (
          <>
            <h2 className="text-xl font-bold mb-4">Sign In</h2>
            <LoginForm
              onSuccess={handleLoginSuccess}
              showForgotPassword={false}
              showSignUpLink={false}
            />
            <button
              onClick={() => setShowLoginForm(false)}
              className="w-full mt-4 py-2 text-gray-500 hover:text-gray-400 text-sm transition-colors"
            >
              Back
            </button>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-4">&#x23F1;</div>
              <h2 className="text-xl font-bold mb-2">Session Expired</h2>
              <p className="text-gray-400 text-sm">
                {error || 'Your session has expired. Sign in to continue.'}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleTryRefresh}
                disabled={isRecovering}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-bold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50"
              >
                {isRecovering ? 'Refreshing...' : 'Try to Refresh Session'}
              </button>

              <button
                onClick={() => setShowLoginForm(true)}
                className="w-full py-3 bg-gray-700 rounded-lg font-medium hover:bg-gray-600 transition-colors"
              >
                Sign In Again
              </button>

              <button
                onClick={handleContinueAsGuest}
                className="w-full py-3 bg-gray-700 rounded-lg font-medium hover:bg-gray-600 transition-colors"
              >
                Continue as Guest
              </button>

              <button
                onClick={handleClose}
                className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm transition-colors"
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
