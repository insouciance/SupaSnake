'use client';

/**
 * WelcomeBackModal - Passive Engagement System
 *
 * Displays rewards earned while the player was offline.
 * Creates immediate dopamine hit on app open.
 * Styled as an elevated void panel with the mascot greeting the player.
 */

import Image from 'next/image';
import { formatOfflineDuration, type OfflineProgress } from '@/lib/progression/offlineProgress';
import { IconBolt, IconDna } from '@/components/ui/icons';

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
  /**
   * SupaSnake Premium daily stipend rides the claim (migration 028):
   * when set, an extra reward row renders and onClaim also claims it.
   */
  stipendEnergy?: number | null;
}

interface RewardRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function RewardRow({ icon, label, value }: RewardRowProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-void-deep/50 border border-scale-blue-light/30 rounded-arcade">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-beige font-body">{label}</span>
      </div>
      <span className="text-xl font-mono font-bold text-rarity-uncommon">{value}</span>
    </div>
  );
}

export function WelcomeBackModal({
  isVisible,
  progress,
  onClaim,
  onDismiss,
  isLoading = false,
  stipendEnergy = null,
}: WelcomeBackModalProps) {
  // Don't render if not visible or no progress data
  if (!isVisible || !progress) {
    return null;
  }

  const durationText = formatOfflineDuration(progress.elapsedMs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-deep/85 backdrop-blur-sm">
      <div
        className="panel-glow animate-pop-in p-6 max-w-md w-full mx-4"
        style={{ '--glow': '#22d3ee' } as React.CSSProperties}
      >
        {/* Header with mascot celebration */}
        <div className="text-center mb-6">
          <div className="animate-float inline-block">
            <Image
              src="/brand/mascot-sm.png"
              alt="SupaSnake mascot"
              width={96}
              height={96}
              className="mx-auto mb-3 w-24 h-auto drop-shadow-[0_0_24px_rgba(34,211,238,0.45)]"
            />
          </div>
          <h2 className="heading-display text-2xl text-venom-orange text-glow-orange mb-2">
            Welcome Back!
          </h2>
          <p className="text-beige/70 font-body">
            While you were away for{' '}
            <span className="text-bone-white font-semibold">{durationText}</span>...
          </p>
        </div>

        {/* Rewards list */}
        <div className="space-y-3 mb-6">
          <RewardRow
            icon={<IconBolt size={22} className="text-cyber" />}
            label="Energy Restored"
            value={`+${progress.energyRestored}`}
          />
          <RewardRow
            icon={<IconDna size={22} className="text-rarity-uncommon" />}
            label="DNA Gathered"
            value={`+${progress.passiveDnaEarned}`}
          />
          {stipendEnergy != null && stipendEnergy > 0 && (
            <RewardRow
              icon={<IconBolt size={22} className="text-amber-300" />}
              label="Premium Daily Stipend"
              value={`+${stipendEnergy}`}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={onClaim}
            disabled={isLoading}
            className="btn-go w-full py-3"
          >
            {isLoading ? 'Claiming...' : 'Claim Rewards'}
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-2 text-beige/60 hover:text-beige text-sm font-body transition-colors"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeBackModal;
