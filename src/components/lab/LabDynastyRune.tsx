'use client';

import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import type { StrainId } from '@/shared/game/strains';

/**
 * The Lab uses the same canonical Genome marks as the arena and Setup. These
 * are semantic dynasty-to-strain anchors, not invented decoration.
 */
export const LAB_DYNASTY_STRAIN: Record<string, StrainId> = {
  CYBER: 'VOLT',
  PRIMAL: 'FERAL',
  COSMIC: 'FLUX',
};

export function labDynastyStrain(dynastyName: string): StrainId {
  return LAB_DYNASTY_STRAIN[dynastyName.toUpperCase()] ?? 'FERAL';
}

interface LabDynastyRuneProps {
  dynastyName: string;
  className?: string;
}

export function LabDynastyRune({
  dynastyName,
  className = '',
}: LabDynastyRuneProps) {
  return (
    <span className={`inline-flex [&_svg]:h-full [&_svg]:w-full ${className}`} aria-hidden="true">
      <StrainGlyph id={labDynastyStrain(dynastyName)} />
    </span>
  );
}

export default LabDynastyRune;
