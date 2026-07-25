'use client';

/**
 * ChronicleView (Player Identity v1 section 7): the career surface,
 * section order per section 7.1 - full Player Card header (Legacy Score
 * rides on the card), PB timeline, records cabinet, collection log,
 * season chapters, clan history, trivia, then any private extras the own
 * page injects (records refresh, Early Career achievements).
 *
 * Empty states per section 7.2: forward-looking prompts, never empty
 * grids; the public <5-earning-runs payload (limited) renders header +
 * collection log only.
 */

import React from 'react';
import { PlayerCard } from '@/components/identity/PlayerCard';
import { RecordsCabinet } from '@/components/chronicle/RecordsCabinet';
import { PBTimeline } from '@/components/chronicle/PBTimeline';
import { CollectionLog } from '@/components/chronicle/CollectionLog';
import { SeasonChapters } from '@/components/chronicle/SeasonChapters';
import { ClanChapter } from '@/components/chronicle/ClanChapter';
import type { ChroniclePayload } from '@/lib/chronicle/types';

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="space-y-3 animate-fade-up" data-testid={testId}>
      <h2 className="heading-display text-xl text-venom-orange text-glow-orange">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface ChronicleViewProps {
  payload: ChroniclePayload;
  isSelf?: boolean;
  /** Private extras (refresh button, Early Career) - own page only. */
  extras?: React.ReactNode;
  /** Analyst artifacts (Identity v1 I4) - own page only, all optional. */
  archetypeSlot?: React.ReactNode;
  digestSlot?: React.ReactNode;
  recallSlot?: React.ReactNode;
}

export function ChronicleView({
  payload,
  isSelf = false,
  extras,
  archetypeSlot,
  digestSlot,
  recallSlot,
}: ChronicleViewProps): React.ReactElement {
  return (
    <div className="space-y-8" data-testid="chronicle-view">
      {/* Header: the full Player Card (Legacy Score + founder line) */}
      <PlayerCard identity={payload.identity} variant="full" isSelf={isSelf} />

      {/* Seasonal archetype (section 9.6): identity-level, header-adjacent */}
      {archetypeSlot}

      {payload.limited ? (
        <p
          className="font-body text-sm text-beige/60"
          data-testid="chronicle-limited"
        >
          This chronicle opens after five earning runs.
        </p>
      ) : (
        <>
          {digestSlot && (
            <Section title="This Week" testId="section-digest">
              {digestSlot}
            </Section>
          )}

          <Section title="Personal Bests" testId="section-pb">
            {payload.pbTimeline ? (
              <PBTimeline data={payload.pbTimeline} />
            ) : (
              <p className="font-body text-sm text-beige/60">
                Your first banked run starts your timeline.
              </p>
            )}
          </Section>

          <Section title="Records" testId="section-records">
            {payload.records ? (
              <RecordsCabinet data={payload.records} />
            ) : (
              <p className="font-body text-sm text-beige/60">
                Records open with your first banked run.
              </p>
            )}
          </Section>
        </>
      )}

      <Section title="Collection Log" testId="section-collection">
        <CollectionLog entries={payload.collectionLog} />
      </Section>

      {!payload.limited && (
        <>
          {recallSlot && (
            <Section title="Season Recall" testId="section-recall">
              {recallSlot}
            </Section>
          )}

          <Section title="Season Chapters" testId="section-seasons">
            {payload.seasons ? (
              <SeasonChapters chapters={payload.seasons} />
            ) : (
              <p className="font-body text-sm text-beige/60">
                Your first season chapter is being written now.
              </p>
            )}
          </Section>

          <Section title="Clan" testId="section-clan">
            {payload.clan ? (
              <ClanChapter clan={payload.clan} />
            ) : (
              <p className="font-body text-sm text-beige/60">
                Join a clan to start its story.
              </p>
            )}
          </Section>

          {/* Trivia: footnotes from retired systems. No empty state - a
              career with no footnotes simply has no section (WP-0.07). */}
          {payload.trivia.length > 0 && (
            <Section title="Trivia" testId="section-trivia">
              <ul className="space-y-2">
                {payload.trivia.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid={`trivia-${entry.id}`}
                    className="rounded-arcade border border-scale-blue-light/40 bg-void/50 px-4 py-3"
                  >
                    <p className="font-body text-sm text-bone-white">
                      {entry.label}
                    </p>
                    <p className="font-body text-xs text-beige/70 mt-0.5">
                      {entry.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {extras}
    </div>
  );
}

export default ChronicleView;
