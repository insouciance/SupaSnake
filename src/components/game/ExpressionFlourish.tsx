'use client';

import { useEffect, useState } from 'react';
import {
  STRAINS,
  STRAIN_TIER_NAMES,
  type StrainId,
} from '@/shared/game/strains';

interface ExpressionFlourishProps {
  strain: StrainId;
  tier: 2 | 3;
  onDone?: () => void;
  presentation?: 'overlay' | 'cockpit';
}

/** A single slow wash (well below the 2.5Hz photosensitivity budget). */
export function ExpressionFlourish({
  strain,
  tier,
  onDone,
  presentation = 'overlay',
}: ExpressionFlourishProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const def = STRAINS[strain];
  const name = tier === 3
    ? STRAIN_TIER_NAMES[strain].apex
    : STRAIN_TIER_NAMES[strain].expression;

  useEffect(() => {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(prefersReducedMotion);
    const timer = window.setTimeout(
      () => onDone?.(),
      prefersReducedMotion ? 1200 : 1800
    );
    return () => window.clearTimeout(timer);
  }, [onDone]);

  if (presentation === 'cockpit') {
    return (
      <div
        className={`flex h-full w-full items-center justify-center border-y bg-void-deep/76 px-3 text-center ${
          reducedMotion ? '' : 'animate-pop-in'
        }`}
        data-testid="expression-flourish"
        role="status"
        aria-live="polite"
        style={{ borderColor: `${def.color}70`, boxShadow: `inset 0 0 22px ${def.color}18` }}
      >
        <p className="truncate font-body text-sm font-bold uppercase tracking-[0.08em] text-bone-white">
          <span style={{ color: def.color }}>
            {tier === 3 ? `${def.name} Apex` : `${def.name} Expression`}
          </span>
          <span className="mx-2 text-beige/45">·</span>
          {name}
        </p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      data-testid="expression-flourish"
      style={{
        background: `radial-gradient(circle at center, ${def.color}35 0%, ${def.color}12 42%, transparent 72%)`,
      }}
    >
      <div
        className={`rounded-arcade border bg-void-deep/85 px-7 py-4 text-center shadow-2xl ${
          reducedMotion ? '' : 'animate-pop-in'
        }`}
        style={{ borderColor: def.color, boxShadow: `0 0 42px ${def.color}55` }}
      >
        <p className="label-arcade" style={{ color: def.color }}>
          {tier === 3 ? `${def.name} Apex` : `${def.name} Expression`}
        </p>
        <p className="heading-display text-3xl text-bone-white text-glow">{name}</p>
      </div>
    </div>
  );
}

export default ExpressionFlourish;
