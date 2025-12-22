'use client';

/**
 * WelcomeBackModal - Passive Engagement System
 *
 * Displays rewards earned while the player was offline.
 * Creates immediate dopamine hit on app open.
 */

import { formatOfflineDuration, type OfflineProgress } from '@/lib/progression/offlineProgress';

interface WelcomeBackModalProps {
  /** Whether to show the modal */
  isVisible: boolean;
  /** Calculated offline progress */
  progress: OfflineProgress | null;
  /** Called when user claims rewards */
  onClaim: () => void;
  /** Called when user dismisses without claiming */
  onDismiss: () => void;
  /** Whether claim is in progress */
  isLoading?: boolean;
}

interface RewardRowProps {
  icon: string;
  label: string;
  value: string;
}

function RewardRow({ icon, label, value }: RewardRowProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-gray-300">{label}</span>
      </div>
      <span className="text-xl font-bold text-green-400">{value}</span>
    </div>
  );
}

export function WelcomeBackModal({
  isVisible,
  progress,
  onClaim,
  onDismiss,
  isLoading = false,
}: WelcomeBackModalProps) {
  // Don't render if not visible or no progress data
  if (!isVisible || !progress) {
    return null;
  }

  const durationText = formatOfflineDuration(progress.elapsedMs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 border border-gray-700">
        {/* Header with celebration */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4 animate-bounce">
            <span role="img" aria-label="celebration">&#x1F389;</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back!</h2>
          <p className="text-gray-400">
            While you were away for <span className="text-white font-medium">{durationText}</span>...
          </p>
        </div>

        {/* Rewards list */}
        <div className="space-y-3 mb-6">
          <RewardRow
            icon="&#x26A1;"
            label="Energy Restored"
            value={`+${progress.energyRestored}`}
          />
          <RewardRow
            icon="&#x1F9EC;"
            label="DNA Gathered"
            value={`+${progress.passiveDnaEarned}`}
          />
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={onClaim}
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Claiming...' : 'Claim Rewards'}
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-2 text-gray-400 hover:text-gray-300 text-sm transition-colors"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeBackModal;
