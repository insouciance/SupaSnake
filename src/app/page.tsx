'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { MVP_DYNASTIES, DYNASTY_THEMES } from '@/shared/types/snake-data-model';
import { NavBar } from '@/components/ui/NavBar';
import { CommandPanel } from '@/components/ui/CommandPanel';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { StatDisplay } from '@/components/ui/StatDisplay';

// Static dynasty preview data (full catalog lives in the DB: 10 variants each)
const DYNASTY_PREVIEW = MVP_DYNASTIES.map((name) => ({
  name,
  colorPrimary: DYNASTY_THEMES[name].primary,
  variantCount: 10,
}));

export default function Home() {
  const { isAuthenticated, isLoading, signInAnonymously } = useAuth();
  const [selectedDynasty, setSelectedDynasty] = useState<string>('CYBER');
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handlePlay = async () => {
    if (!isAuthenticated) {
      await signInAnonymously();
    }
  };

  // Placeholder stats - in production these come from /api/player
  // DNA balance is shown in Lab, not here (server authority)
  const pilotStats = {
    rank: 142,
    streak: 5,
  };

  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white relative overflow-x-hidden">
      {/* Grid background pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #3a4750 1px, transparent 1px),
            linear-gradient(to bottom, #3a4750 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Navigation Bar */}
      <NavBar />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center p-4 sm:p-8 pt-24 pb-12">
        <div className="w-full max-w-5xl space-y-6">

          {/* Central Command Display */}
          <CommandPanel accented className="text-center py-8 sm:py-12">
            <div className="space-y-6">
              {/* Title with glow */}
              <h1
                className="text-5xl sm:text-7xl font-display uppercase tracking-arcade text-venom-orange"
                style={{ textShadow: '0 0 30px rgba(217, 131, 36, 0.4)' }}
              >
                OG Snake
              </h1>

              {/* Command Center subtitle */}
              <div className="flex items-center justify-center gap-2 text-beige/70 font-mono text-sm">
                <span className="text-venom-orange">{'>'}</span>
                <span>COMMAND CENTER</span>
                <span className="text-scale-blue-light">{'//'}</span>
                <span className={hasMounted ? 'text-green-500' : 'text-beige/70'}>ONLINE</span>
                <span className="animate-pulse text-venom-orange">_</span>
              </div>

              {/* Tagline */}
              <p className="text-lg text-beige font-body max-w-md mx-auto">
                Where Skill Creates Legacy
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link
                  href="/game"
                  onClick={handlePlay}
                  className="group px-10 py-4 bg-venom-orange border-[3px] border-venom-orange-dark rounded-arcade font-display uppercase tracking-arcade text-xl text-scale-blue-dark hover:bg-venom-orange-light hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(217,131,36,0.5)] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">▶</span>
                  <span>Launch</span>
                </Link>
                <Link
                  href="/lab"
                  className="px-10 py-4 bg-scale-blue border-[3px] border-bone-white/30 rounded-arcade font-display uppercase tracking-arcade text-xl text-bone-white hover:border-venom-orange hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">🧬</span>
                  <span>Lab</span>
                </Link>
              </div>
            </div>
          </CommandPanel>

          {/* Instrument Panel Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Pilot Stats Panel */}
            <CommandPanel title="Pilot Stats" glowOnHover>
              <div className="space-y-3">
                <StatDisplay label="Rank" value={pilotStats.rank} prefix="#" />
                <div className="border-t border-scale-blue-light/30" />
                <div className="flex items-center justify-between">
                  <StatDisplay label="Streak" value={pilotStats.streak} size="sm" />
                  <span className="text-2xl">🔥</span>
                </div>
              </div>
            </CommandPanel>

            {/* Dynasty Selector Panel */}
            <CommandPanel title="Dynasty Select" glowOnHover>
              <div className="space-y-2">
                {DYNASTY_PREVIEW.map((dynasty) => {
                  const isSelected = selectedDynasty === dynasty.name;
                  return (
                    <button
                      key={dynasty.name}
                      onClick={() => setSelectedDynasty(dynasty.name)}
                      className={`
                        w-full flex items-center gap-3 p-3 rounded-arcade border-[2px] transition-all
                        ${isSelected
                          ? 'border-venom-orange bg-scale-blue-dark/50'
                          : 'border-scale-blue-light hover:border-venom-orange/50 bg-transparent'
                        }
                      `}
                    >
                      <div
                        className="w-4 h-4 rounded-sm border border-scale-blue-light"
                        style={{ backgroundColor: dynasty.colorPrimary }}
                      />
                      <span className="font-display uppercase tracking-arcade text-sm text-bone-white">
                        {dynasty.name}
                      </span>
                      {isSelected && (
                        <span className="ml-auto text-venom-orange text-xs font-body">ACTIVE</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CommandPanel>

            {/* Systems Status Panel */}
            <CommandPanel title="Systems Status" glowOnHover>
              <div className="space-y-3">
                <StatusIndicator label="Connection" status={hasMounted ? 'online' : 'syncing'} pulse />
                <StatusIndicator label="Game Server" status="online" pulse />
                <StatusIndicator label="Leaderboards" status="online" />
                <div className="border-t border-scale-blue-light/30 my-3" />
                <StatusIndicator label="Ready to Launch" status={hasMounted ? 'online' : 'syncing'} pulse />
              </div>
            </CommandPanel>
          </div>

          {/* Mission Briefing */}
          <CommandPanel title="Mission Briefing">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-scale-blue-dark/30 rounded-arcade border border-scale-blue-light/20">
                <div className="text-3xl mb-2">🎮</div>
                <h4 className="font-display uppercase tracking-arcade text-bone-white text-sm mb-1">
                  Collect DNA
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Play snake to harvest genetic material
                </p>
              </div>
              <div className="text-center p-4 bg-scale-blue-dark/30 rounded-arcade border border-scale-blue-light/20">
                <div className="text-3xl mb-2">🧬</div>
                <h4 className="font-display uppercase tracking-arcade text-bone-white text-sm mb-1">
                  Breed Variants
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Combine snakes to unlock new species
                </p>
              </div>
              <div className="text-center p-4 bg-scale-blue-dark/30 rounded-arcade border border-scale-blue-light/20">
                <div className="text-3xl mb-2">🏆</div>
                <h4 className="font-display uppercase tracking-arcade text-bone-white text-sm mb-1">
                  Dominate Ranks
                </h4>
                <p className="text-beige/60 text-xs font-body">
                  Climb the global leaderboard
                </p>
              </div>
            </div>
          </CommandPanel>

          {/* Dynasty Preview - Compact */}
          <div className="flex justify-center gap-2 pt-2">
            {DYNASTY_PREVIEW.map(dynasty => (
              <div
                key={dynasty.name}
                className="flex gap-1 items-center px-3 py-2 bg-scale-blue/50 rounded-arcade border border-scale-blue-light/30"
              >
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: dynasty.colorPrimary }}
                />
                <span className="text-xs font-body text-beige/70">{dynasty.name}</span>
                <span className="text-xs text-beige/40 font-mono">
                  {dynasty.variantCount}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center pt-4 text-beige/30 text-xs font-mono">
            <p>v1.0.0 // NEXT.JS + THREE.JS + SUPABASE</p>
          </div>
        </div>
      </div>
    </main>
  );
}
