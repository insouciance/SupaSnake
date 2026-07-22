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
}

/** A single slow wash (well below the 2.5Hz photosensitivity budget). */
export function ExpressionFlourish({ strain, tier, onDone }: ExpressionFlourishProps) {
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
