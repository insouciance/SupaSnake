'use client';

/**
 * Records cabinet (Player Identity v1 section 7.1 #3): all 21 records
 * with tier progress, grouped by category, with a capstone progress
 * ring per category. Tier glyphs use the section 5.5 tier->rarity
 * visual language; the cabinet doubles as the want-list - thresholds
 * are content, never a wall of zeros.
 */

import React from 'react';
import {
  CATEGORY_LABELS,
  TIER_NAMES,
  TIER_RARITIES,
  type RecordCategory,
  type RecordsCabinetData,
} from '@/lib/chronicle/types';
import { IconCrown } from '@/components/ui/icons';

const CATEGORY_ORDER: RecordCategory[] = [
  'extraction',
  'dynasty',
  'collection',
  'gauntlet',
  'veterancy',
  'legacy',
];

const TIER_TEXT: Record<string, string> = {
  common: 'text-beige/80',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
};

const TIER_DOT_BG: Record<string, string> = {
  common: 'bg-beige/70',
  uncommon: 'bg-rarity-uncommon',
  rare: 'bg-rarity-rare',
  epic: 'bg-rarity-epic',
  legendary: 'bg-rarity-legendary',
};

function formatValue(value: number): string {
  return value.toLocaleString();
}

/** Capstone progress ring: minTier across the category, out of 5. */
function CapstoneRing({
  minTier,
  unlocked,
  apex,
}: {
  minTier: number;
  unlocked: boolean;
  apex: boolean;
}) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(5, minTier)) / 5;
  const color = apex ? '#fbbf24' : unlocked ? '#a855f7' : '#7df9ff';
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      data-testid="capstone-ring"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="rgba(125,249,255,0.15)"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${circumference * progress} ${circumference}`}
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="22"
        textAnchor="middle"
        fill={color}
        fontSize="11"
        fontFamily="inherit"
      >
        {minTier}
      </text>
    </svg>
  );
}

/** Five tier pips; reached ones light up in their rarity color. */
function TierPips({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="tier-pips">
      {TIER_RARITIES.map((rarity, index) => (
        <span
          key={rarity}
          title={TIER_NAMES[index]}
          className={`w-2 h-2 rounded-full ${
            index < tier ? TIER_DOT_BG[rarity] : 'bg-void/80 border border-scale-blue-light/40'
          }`}
        />
      ))}
    </span>
  );
}

export function RecordsCabinet({
  data,
}: {
  data: RecordsCabinetData;
}): React.ReactElement {
  return (
    <div className="space-y-4" data-testid="records-cabinet">
      {CATEGORY_ORDER.filter((category) =>
        data.records.some((record) => record.category === category)
      ).map((category) => {
        const records = data.records.filter(
          (record) => record.category === category
        );
        const capstone = data.capstones.find(
          (entry) => entry.category === category
        );
        return (
          <div
            key={category}
            className="panel-elevated p-4 sm:p-5 animate-fade-up"
            data-testid={`records-category-${category}`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="heading-display text-lg text-bone-white">
                {CATEGORY_LABELS[category]}
              </h3>
              {capstone && (
                <div
                  className="flex items-center gap-2"
                  data-testid={`capstone-${category}`}
                  title={
                    capstone.unlocked
                      ? `Capstone unlocked: ${capstone.titleName}`
                      : `Capstone at all-Diamond: ${capstone.titleName}`
                  }
                >
                  <span
                    className={`font-body text-xs flex items-center gap-1 ${
                      capstone.unlocked
                        ? 'text-rarity-legendary'
                        : 'text-beige/60'
                    }`}
                  >
                    <IconCrown size={13} />
                    {capstone.titleName}
                  </span>
                  <CapstoneRing
                    minTier={capstone.minTier}
                    unlocked={capstone.unlocked}
                    apex={capstone.apex}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {records.map((record) => {
                const nextThreshold =
                  record.tier < 5 ? record.thresholds[record.tier] : null;
                const previousThreshold =
                  record.tier > 0 ? record.thresholds[record.tier - 1] : 0;
                const span =
                  nextThreshold !== null
                    ? Math.max(1, nextThreshold - previousThreshold)
                    : 1;
                const progress =
                  nextThreshold !== null
                    ? Math.max(
                        0,
                        Math.min(1, (record.value - previousThreshold) / span)
                      )
                    : 1;
                const tierRarity =
                  record.tier > 0 ? TIER_RARITIES[record.tier - 1] : null;
                return (
                  <div
                    key={record.id}
                    id={`record-${record.id}`}
                    className="space-y-1"
                    data-testid={`record-${record.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-body text-sm text-bone-white truncate">
                          {record.name}
                        </span>
                        {tierRarity ? (
                          <span
                            data-testid={`record-tier-${record.id}`}
                            className={`font-body text-xs font-bold ${TIER_TEXT[tierRarity]}`}
                          >
                            {TIER_NAMES[record.tier - 1]}
                          </span>
                        ) : (
                          <span className="font-body text-xs text-beige/40">
                            Unranked
                          </span>
                        )}
                      </div>
                      <TierPips tier={record.tier} />
                    </div>
                    <p className="font-body text-xs text-beige/50">
                      {record.measures}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-void/80 overflow-hidden border border-scale-blue-light/30">
                        <div
                          className="h-full rounded-full bg-[#7df9ff]/80"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                      <span className="font-body text-xs text-beige/70 whitespace-nowrap">
                        {formatValue(record.value)}
                        {nextThreshold !== null
                          ? ` / ${formatValue(nextThreshold)}`
                          : ' — Apex'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default RecordsCabinet;
