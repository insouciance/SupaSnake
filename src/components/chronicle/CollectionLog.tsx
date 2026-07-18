'use client';

/**
 * Collection log (Player Identity v1 section 7.1 #4): every variant
 * with its first-acquired date (OSRS collection log); missing variants
 * render as silhouettes - silhouettes are content, they are the
 * want-list (section 7.2). This section ALWAYS renders.
 */

import React from 'react';
import { SnakeArt } from '@/components/lab/SnakeArt';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import { IconSnake } from '@/components/ui/icons';
import type { CollectionLogEntry } from '@/lib/chronicle/types';
import type { Rarity } from '@/shared/types/snake-data-model';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function CollectionLog({
  entries,
}: {
  entries: CollectionLogEntry[];
}): React.ReactElement {
  const collected = entries.filter((entry) => entry.acquiredAt !== null).length;

  return (
    <div className="space-y-3" data-testid="collection-log">
      <p className="font-body text-xs text-beige/60">
        {collected} of {entries.length} discovered
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
        {entries.map((entry) => {
          const theme = dynastyThemes[entry.dynasty] ?? dynastyThemes.CYBER;
          const discovered = entry.acquiredAt !== null;
          return (
            <div
              key={entry.variantId}
              data-testid={
                discovered ? 'collection-entry' : 'collection-silhouette'
              }
              className={`rounded-arcade border p-2 text-center space-y-1 ${
                discovered
                  ? 'border-scale-blue-light/50 bg-void/60'
                  : 'border-scale-blue-light/25 bg-void/40'
              }`}
              title={
                discovered
                  ? `${entry.name} — first acquired ${formatDate(entry.acquiredAt as string)}`
                  : `${entry.name} — undiscovered`
              }
            >
              <div className="w-full aspect-square rounded-arcade overflow-hidden flex items-center justify-center bg-void/70">
                {discovered ? (
                  <SnakeArt
                    seed={entry.variantId}
                    name={entry.name}
                    dynasty={entry.dynasty}
                    primaryColor={theme.primary}
                    secondaryColor={theme.secondary}
                    rarity={entry.rarity as Rarity}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <IconSnake size={28} className="text-beige/25" />
                )}
              </div>
              <p
                className={`font-body text-[11px] truncate ${
                  discovered ? 'text-bone-white' : 'text-beige/35'
                }`}
              >
                {entry.name}
              </p>
              <p className="font-body text-[10px] text-beige/45">
                {discovered
                  ? formatDate(entry.acquiredAt as string)
                  : 'Undiscovered'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CollectionLog;
