'use client';

/**
 * AimSystemPanel - Settings mirror of the Run Setup aim system picker.
 * Fetches the stored selection from /api/player and PATCHes on change
 * (optimistic with rollback). No unlock state is fetched or checked: all
 * four systems are settings from run 1 (Constitution §6.1).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AimSystemSelector } from '@/components/game/AimSystemSelector';
import {
  DEFAULT_AIM_SYSTEM,
  isAimSystemId,
  type AimSystemId,
} from '@/lib/game/aimSystems';

export function AimSystemPanel() {
  const { session } = useAuth();
  const [selected, setSelected] = useState<AimSystemId>(DEFAULT_AIM_SYSTEM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;

    fetch('/api/player', {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (isAimSystemId(data.aimSystem)) setSelected(data.aimSystem);
      })
      .catch((err) => console.error('Failed to load aim system:', err));

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleSelect = useCallback(
    async (id: AimSystemId) => {
      const previous = selected;
      setSelected(id); // optimistic
      setError(null);
      try {
        const response = await fetch('/api/player', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ aim_system: id }),
        });
        if (!response.ok) {
          throw new Error(`Aim system PATCH rejected (${response.status})`);
        }
      } catch (err) {
        console.error('Failed to save aim system, rolling back:', err);
        setSelected(previous);
        setError('Could not save your aim system. Please try again.');
      }
    },
    [selected, session?.access_token]
  );

  return (
    <div className="panel-elevated p-6 animate-fade-up">
      <h2 className="heading-display text-xl text-bone-white mb-1">Aim System</h2>
      <p className="text-beige text-sm font-body mb-4">
        Choose how the game telegraphs your snake&apos;s path. All four are
        available from your first run — pick whichever you read fastest.
      </p>
      <AimSystemSelector
        selected={selected}
        onSelect={handleSelect}
        layout="list"
      />
      {error && (
        <p className="text-strike-red text-sm font-body mt-3">{error}</p>
      )}
    </div>
  );
}

export default AimSystemPanel;
