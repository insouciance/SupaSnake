'use client';

/**
 * Pause Menu - Overlay when game is paused
 * AAA 2026 Standard: Proper pause functionality
 */

import type { DynastyId } from '@/shared/types/game';
import { themeManager } from '@/lib/theme/ThemeManager';

interface PauseMenuProps {
  dynasty: DynastyId;
  score: number;
  dnaCollected: number;
  onResume: () => void;
  onQuit: () => void;
}

export function PauseMenu({ dynasty, score, dnaCollected, onResume, onQuit }: PauseMenuProps) {
  const theme = themeManager.getTheme(dynasty);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="relative p-8 rounded-2xl shadow-2xl min-w-[300px]"
        style={{
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          border: `2px solid ${theme.primary}40`,
        }}
      >
        {/* Glowing accent */}
        <div
          className="absolute inset-0 rounded-2xl opacity-20 blur-xl -z-10"
          style={{ backgroundColor: theme.primary }}
        />

        {/* Header */}
        <h2 className="text-3xl font-bold text-center mb-6" style={{ color: theme.primary }}>
          Paused
        </h2>

        {/* Current Stats */}
        <div className="space-y-3 mb-8 p-4 rounded-lg bg-black/30">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Score</span>
            <span className="text-2xl font-bold text-white">{score}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">DNA Collected</span>
            <span className="text-xl font-bold text-green-400">+{dnaCollected}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={onResume}
            className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all transform hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
              color: '#fff',
            }}
          >
            Resume
          </button>

          <button
            onClick={onQuit}
            className="w-full py-3 px-6 rounded-xl font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-all transform hover:scale-105 active:scale-95"
          >
            Quit to Menu
          </button>
        </div>

        {/* Controls hint */}
        <p className="text-center text-gray-500 text-sm mt-6">
          Press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">ESC</kbd> or{' '}
          <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">P</kbd> to resume
        </p>
      </div>
    </div>
  );
}
