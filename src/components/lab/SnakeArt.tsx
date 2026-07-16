'use client';

/**
 * SnakeArt - Deterministic procedural card art for snake variants.
 *
 * No image assets exist for the 30-variant catalog, so cards render a
 * generated SVG: a layered sine-wave snake body in dynasty colors with a
 * per-dynasty pattern motif and a rarity-driven frame treatment. The same
 * variant always renders the same art (seeded by variant id + name).
 *
 * Drop-in replacement for the null-artUrl gradient fallback in
 * VariantCard / VariantDetailModal.
 */

import React, { useMemo } from 'react';
import type { Rarity } from '@/shared/types/snake-data-model';

export interface SnakeArtProps {
  /** Seed source - use variant.id (stable) */
  seed: string;
  /** Variant display name, e.g. "CYBER VORTEX" */
  name: string;
  /** Dynasty name drives the pattern motif: CYBER | PRIMAL | COSMIC */
  dynasty: string;
  primaryColor: string;
  secondaryColor: string;
  rarity: Rarity;
  className?: string;
}

/** Small deterministic PRNG (mulberry32) seeded from a string hash */
function createRng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sine-wave snake body path across the card */
function snakePath(rng: () => number, w: number, h: number): string {
  const segments = 5 + Math.floor(rng() * 3); // 5-7 curve segments
  const amplitude = h * (0.10 + rng() * 0.10);
  const yCenter = h * (0.42 + rng() * 0.16);
  const step = w / segments;
  let d = `M ${-step * 0.5} ${yCenter}`;
  for (let i = 0; i < segments + 1; i++) {
    const x1 = i * step + step * 0.33;
    const x2 = i * step + step * 0.66;
    const x3 = (i + 1) * step;
    const dir = i % 2 === 0 ? 1 : -1;
    const wobble = 0.75 + rng() * 0.5;
    d += ` C ${x1} ${yCenter + dir * amplitude * wobble}, ${x2} ${yCenter + dir * amplitude * wobble}, ${x3} ${yCenter}`;
  }
  return d;
}

const RARITY_FRAME: Record<
  string,
  { stroke: string; strokeWidth: number; glow: number; label: string }
> = {
  common: { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, glow: 0, label: '' },
  uncommon: { stroke: '#4ade80', strokeWidth: 1.5, glow: 1.5, label: 'UNCOMMON' },
  rare: { stroke: '#38bdf8', strokeWidth: 2, glow: 2.5, label: 'RARE' },
  epic: { stroke: '#a78bfa', strokeWidth: 2.5, glow: 4, label: 'EPIC' },
  legendary: { stroke: '#fbbf24', strokeWidth: 3, glow: 6, label: 'LEGENDARY' },
};

/** Per-dynasty background motif */
function DynastyMotif({
  dynasty,
  rng,
  w,
  h,
  color,
}: {
  dynasty: string;
  rng: () => number;
  w: number;
  h: number;
  color: string;
}): React.ReactElement<any> {
  switch (dynasty.toUpperCase()) {
    case 'CYBER': {
      // Circuit traces: right-angle polylines with node dots
      const traces = Array.from({ length: 6 }, (_, i) => {
        const x = rng() * w;
        const y = rng() * h;
        const dx = (rng() - 0.5) * w * 0.5;
        const dy = (rng() - 0.5) * h * 0.35;
        return { key: i, points: `${x},${y} ${x + dx},${y} ${x + dx},${y + dy}`, x: x + dx, y: y + dy };
      });
      return (
        <g opacity={0.28} stroke={color} strokeWidth={1} fill="none">
          {traces.map(t => (
            <g key={t.key}>
              <polyline points={t.points} />
              <circle cx={t.x} cy={t.y} r={2} fill={color} stroke="none" />
            </g>
          ))}
        </g>
      );
    }
    case 'PRIMAL': {
      // Leaf/vine arcs
      const leaves = Array.from({ length: 7 }, (_, i) => ({
        key: i,
        cx: rng() * w,
        cy: rng() * h,
        r: 6 + rng() * 14,
        rot: rng() * 360,
      }));
      return (
        <g opacity={0.25} fill={color}>
          {leaves.map(l => (
            <ellipse
              key={l.key}
              cx={l.cx}
              cy={l.cy}
              rx={l.r}
              ry={l.r * 0.4}
              transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
            />
          ))}
        </g>
      );
    }
    case 'COSMIC':
    default: {
      // Star field with a few 4-point sparkles
      const stars = Array.from({ length: 22 }, (_, i) => ({
        key: i,
        cx: rng() * w,
        cy: rng() * h,
        r: 0.6 + rng() * 1.8,
      }));
      const sparkles = Array.from({ length: 3 }, (_, i) => ({
        key: i,
        cx: rng() * w,
        cy: rng() * h,
        s: 5 + rng() * 7,
      }));
      return (
        <g opacity={0.5} fill={color}>
          {stars.map(s => (
            <circle key={s.key} cx={s.cx} cy={s.cy} r={s.r} />
          ))}
          {sparkles.map(sp => (
            <path
              key={`sp-${sp.key}`}
              d={`M ${sp.cx} ${sp.cy - sp.s} L ${sp.cx + sp.s * 0.22} ${sp.cy - sp.s * 0.22} L ${sp.cx + sp.s} ${sp.cy} L ${sp.cx + sp.s * 0.22} ${sp.cy + sp.s * 0.22} L ${sp.cx} ${sp.cy + sp.s} L ${sp.cx - sp.s * 0.22} ${sp.cy + sp.s * 0.22} L ${sp.cx - sp.s} ${sp.cy} L ${sp.cx - sp.s * 0.22} ${sp.cy - sp.s * 0.22} Z`}
            />
          ))}
        </g>
      );
    }
  }
}

export function SnakeArt({
  seed,
  name,
  dynasty,
  primaryColor,
  secondaryColor,
  rarity,
  className,
}: SnakeArtProps): React.ReactElement<any> {
  const W = 300;
  const H = 400; // 3:4 card ratio

  const art = useMemo(() => {
    const rng = createRng(`${seed}:${name}`);
    return {
      bodyPath: snakePath(rng, W, H),
      bodyWidth: 16 + rng() * 10,
      headX: W * (0.78 + rng() * 0.1),
      motifRng: createRng(`${seed}:motif`),
      gradientAngle: Math.floor(rng() * 90),
    };
  }, [seed, name]);

  const frame = RARITY_FRAME[rarity] ?? RARITY_FRAME.common;
  const gradId = `grad-${seed.slice(0, 8)}`;
  const glowId = `glow-${seed.slice(0, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`${name} artwork`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientTransform={`rotate(${art.gradientAngle})`}
        >
          <stop offset="0%" stopColor={primaryColor} />
          <stop offset="100%" stopColor={secondaryColor} />
        </linearGradient>
        {frame.glow > 0 && (
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={frame.glow} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Background wash */}
      <rect width={W} height={H} fill={`url(#${gradId})`} opacity={0.22} />

      {/* Dynasty motif layer */}
      <DynastyMotif dynasty={dynasty} rng={art.motifRng} w={W} h={H} color={secondaryColor} />

      {/* Snake body (under-glow + body + belly line) */}
      <path
        d={art.bodyPath}
        fill="none"
        stroke={primaryColor}
        strokeWidth={art.bodyWidth + 10}
        strokeLinecap="round"
        opacity={0.25}
      />
      <path
        d={art.bodyPath}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={art.bodyWidth}
        strokeLinecap="round"
        filter={frame.glow > 0 ? `url(#${glowId})` : undefined}
      />
      <path
        d={art.bodyPath}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={art.bodyWidth * 0.25}
        strokeLinecap="round"
        strokeDasharray="1 14"
      />

      {/* Eye near the head end */}
      <circle cx={art.headX} cy={H * 0.5} r={art.bodyWidth * 0.28} fill="#0b0b12" />
      <circle
        cx={art.headX + art.bodyWidth * 0.08}
        cy={H * 0.5 - art.bodyWidth * 0.08}
        r={art.bodyWidth * 0.1}
        fill="#ffffff"
      />

      {/* Rarity frame */}
      <rect
        x={frame.strokeWidth / 2}
        y={frame.strokeWidth / 2}
        width={W - frame.strokeWidth}
        height={H - frame.strokeWidth}
        rx={12}
        fill="none"
        stroke={frame.stroke}
        strokeWidth={frame.strokeWidth}
        filter={frame.glow > 0 ? `url(#${glowId})` : undefined}
      />
    </svg>
  );
}
