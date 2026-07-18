'use client';

/**
 * Season chapters (Player Identity v1 section 7.1 #5): one chapter per
 * season the account overlapped - track level reached, completion,
 * championship banner if Crowned. Seasons before the account existed
 * simply don't render (section 7.2 - no "missed" framing).
 */

import React from 'react';
import { IconCrown, IconTrophy } from '@/components/ui/icons';
import type { SeasonChapter } from '@/lib/chronicle/types';

export function SeasonChapters({
  chapters,
}: {
  chapters: SeasonChapter[];
}): React.ReactElement {
  if (chapters.length === 0) {
    return (
      <p
        className="font-body text-sm text-beige/60"
        data-testid="season-chapters-empty"
      >
        Your first season chapter is being written now.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="season-chapters">
      {chapters.map((chapter) => (
        <div
          key={chapter.seq}
          className="panel p-4 space-y-2"
          data-testid={`season-chapter-${chapter.seq}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="heading-display text-base text-bone-white">
              {chapter.name}
            </h3>
            {chapter.active ? (
              <span className="font-body text-xs text-[#7df9ff]">
                In progress
              </span>
            ) : (
              <span className="font-body text-xs text-beige/50">
                {chapter.startsOn} — {chapter.endsOn}
              </span>
            )}
          </div>

          {chapter.trackLevel !== null ? (
            <p className="font-body text-sm text-beige/80">
              Track level{' '}
              <span className="text-venom-orange font-bold">
                L{chapter.trackLevel}
              </span>
              {chapter.maxLevel !== null && (
                <span className="text-beige/50"> / L{chapter.maxLevel}</span>
              )}
              {chapter.completed && (
                <span
                  className="ml-2 text-rarity-legendary inline-flex items-center gap-1"
                  data-testid="season-track-complete"
                >
                  <IconTrophy size={13} /> Track completed
                </span>
              )}
            </p>
          ) : (
            <p className="font-body text-sm text-beige/50">
              {chapter.active
                ? 'The track is open — your first contract starts this chapter.'
                : 'Sat out.'}
            </p>
          )}

          {chapter.champion && (
            <p
              className={`font-body text-xs flex items-center gap-1.5 ${
                chapter.crowned ? 'text-rarity-legendary' : 'text-beige/60'
              }`}
              data-testid={
                chapter.crowned ? 'season-crowned' : 'season-champion'
              }
            >
              <IconCrown size={13} />
              {chapter.crowned ? (
                <>Crowned — champion with {chapter.champion.clanName}</>
              ) : (
                <>
                  Champions: {chapter.champion.clanName}
                  {chapter.champion.clanTag
                    ? ` [${chapter.champion.clanTag}]`
                    : ''}
                </>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default SeasonChapters;
