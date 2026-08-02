'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GeneId, GenePick } from '@/shared/game/genes';
import type { SpliceId } from '@/shared/game/splices';
import type { StrainId, StrainPoints } from '@/shared/game/strains';
import { CHOICE_INPUT_LOCK_MS } from '@/components/game/MutationChoiceOverlay';
import { TacticalLoomDecision } from '@/components/game/genome/TacticalLoomDecision';
import { buildLegacyTacticalLoomModel } from '@/components/game/genome/legacyTacticalLoomAdapter';
import type { TacticalLoomDecisionModel } from '@/components/game/genome/tacticalLoomPresentation';

export interface GeneChoiceOverlayProps {
  options?: [GeneId, GeneId];
  held?: GenePick[];
  strainCounts?: StrainPoints;
  source?: 'gene_food' | 'infuse' | null;
  showStrains?: boolean;
  splicesUnlocked?: boolean;
  discoveredSplices?: readonly SpliceId[];
  pityStrain?: StrainId | null;
  /**
   * Genome v2 supplies this complete server/engine projection. When absent,
   * the overlay renders the honest v1 compatibility projection above.
   */
  presentation?: TacticalLoomDecisionModel;
  onChoose: (index: 0 | 1) => void;
  onDecline: (pinCandidateIndex?: 0 | 1) => void;
  /** Required by v2 when six loci turn a pick into a two-step Recode. */
  onRecode?: (index: 0 | 1, replacementSlot: number) => void;
}

/**
 * The Tactical Loom is the Genome-era evolution of MutationChoiceOverlay.
 * Gameplay is already atomically held by the engine before this mounts; the
 * component only owns deliberate inspection and commitment of that decision.
 */
export function GeneChoiceOverlay({
  options,
  held = [],
  strainCounts = {},
  source = 'gene_food',
  showStrains = false,
  splicesUnlocked = false,
  discoveredSplices = [],
  pityStrain = null,
  presentation,
  onChoose,
  onDecline,
  onRecode,
}: GeneChoiceOverlayProps) {
  const [locked, setLocked] = useState(true);
  const model = useMemo(
    () => presentation ?? (options ? buildLegacyTacticalLoomModel({
      options,
      held,
      strainCounts,
      source,
      showStrains,
      splicesUnlocked,
      discoveredSplices,
      pityStrain,
    }) : null),
    [
      discoveredSplices,
      held,
      options,
      pityStrain,
      presentation,
      showStrains,
      source,
      splicesUnlocked,
      strainCounts,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setLocked(false), CHOICE_INPUT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!model) return null;

  return (
    <TacticalLoomDecision
      model={model}
      locked={locked}
      onChoose={(index, replacementSlot) => {
        if (replacementSlot !== undefined && onRecode) {
          onRecode(index, replacementSlot);
          return;
        }
        onChoose(index);
      }}
      onDecline={onDecline}
    />
  );
}

export default GeneChoiceOverlay;
