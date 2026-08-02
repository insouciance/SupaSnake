import { GENOME_V2_GENES } from '@/shared/game/genes';
import {
  GENOME_V2_SPLICES,
  GENOME_V2_STRAIN_LADDERS,
  genomeV2StrainPoints,
  type GenomeV2State,
} from '@/shared/game/genomeV2';
import { STRAIN_IDS, STRAINS, type StrainId } from '@/shared/game/strains';
import type { GenomeV2ActivationPresentation } from './genomeV2PresentationAdapter';

export interface GenomeV2CommitMoment {
  id: string;
  label: string;
  detail: string;
  strain?: StrainId;
  tone?: 'positive' | 'warning';
}

export interface GenomeV2CommitPresentation {
  id: string;
  title: string;
  rule: string;
  moments: readonly GenomeV2CommitMoment[];
}

function tierUnlocked(
  points: 3 | 4 | 5,
  activation: GenomeV2ActivationPresentation
): boolean {
  if (points === 4) return activation.expressions.unlocked;
  if (points === 5) return activation.apex.unlocked;
  return true;
}

/**
 * Compares two canonical reducer states after an atomic player decision.
 * This is presentation-only: it neither predicts nor replays a Genome event.
 */
export function buildGenomeV2CommitPresentation(
  before: GenomeV2State,
  after: GenomeV2State,
  activation: GenomeV2ActivationPresentation
): GenomeV2CommitPresentation | null {
  if (after.eventIndex <= before.eventIndex) return null;

  const acquired = Object.values(after.instances)
    .filter((instance) => !(instance.instanceId in before.instances))
    .sort((left, right) => right.acquisitionOrdinal - left.acquisitionOrdinal)[0];
  const formed = after.activeSplices.find((id) => !before.activeSplices.includes(id));
  const broken = before.activeSplices.find((id) => !after.activeSplices.includes(id));
  const beforePoints = genomeV2StrainPoints(before);
  const afterPoints = genomeV2StrainPoints(after);
  const moments: GenomeV2CommitMoment[] = [];

  for (const strain of STRAIN_IDS) {
    const from = beforePoints[strain] ?? 0;
    const to = afterPoints[strain] ?? 0;
    const rung = GENOME_V2_STRAIN_LADDERS[strain].find(
      (tier) => from < tier.points && to >= tier.points
    );
    if (!rung) continue;
    const unlocked = tierUnlocked(rung.points, activation);
    moments.push({
      id: `rung:${strain}:${rung.points}`,
      label: `${STRAINS[strain].name} ${rung.points} · ${rung.name}`,
      detail: unlocked
        ? rung.rule
        : `Rung reached; activation remains locked. ${rung.rule}`,
      strain,
      tone: unlocked ? 'positive' : 'warning',
    });
  }

  if (formed) {
    moments.unshift({
      id: `splice:${formed}`,
      label: `${GENOME_V2_SPLICES[formed].name} formed`,
      detail: GENOME_V2_SPLICES[formed].rule,
      tone: 'positive',
    });
  }
  if (broken) {
    moments.unshift({
      id: `splice-broken:${broken}`,
      label: `${GENOME_V2_SPLICES[broken].name} broken`,
      detail: 'Its fused rule is no longer active after this Recode.',
      tone: 'warning',
    });
  }

  const beforePhoenix = Boolean(before.secondLife && !before.secondLife.consumed);
  const afterPhoenix = Boolean(after.secondLife && !after.secondLife.consumed);
  if (!beforePhoenix && afterPhoenix) {
    moments.push({
      id: 'second-life:ready',
      label: 'Second life ready',
      detail: 'Phoenix will rewind one fatal collision, then leave Ash in its locus.',
      tone: 'positive',
    });
  } else if (beforePhoenix && !afterPhoenix && broken) {
    moments.push({
      id: 'second-life:lost',
      label: 'Second life removed',
      detail: 'The outgoing fused locus owned the active second life.',
      tone: 'warning',
    });
  }

  if (after.bonds !== before.bonds) {
    moments.push({
      id: 'ledger:bonds',
      label: `BANK Bonds ${before.bonds} → ${after.bonds}`,
      detail: 'Bonds remain prospective and pay only when the run is banked.',
      tone: 'positive',
    });
  }
  if (after.anchor.charges !== before.anchor.charges) {
    moments.push({
      id: 'ledger:anchor',
      label: `Anchor ${before.anchor.charges} → ${after.anchor.charges}`,
      detail: after.anchor.charges > before.anchor.charges
        ? 'A future DECLINE may pin one offered gene.'
        : 'The charged Anchor was committed by this decision.',
      tone: after.anchor.charges > before.anchor.charges ? 'positive' : 'warning',
    });
  }

  const beforeGrowth = (before as GenomeV2State & { bodyGrowthAdded?: number }).bodyGrowthAdded ?? 0;
  const afterGrowth = (after as GenomeV2State & { bodyGrowthAdded?: number }).bodyGrowthAdded ?? 0;
  if (afterGrowth > beforeGrowth) {
    moments.push({
      id: 'body:growth',
      label: `+${afterGrowth - beforeGrowth} body committed`,
      detail: 'The Genome action permanently increased this run’s body pressure.',
      tone: 'warning',
    });
  }

  if (!acquired && moments.length === 0) return null;
  const acquiredGene = acquired ? GENOME_V2_GENES[acquired.geneId] : null;
  const formedSplice = formed ? GENOME_V2_SPLICES[formed] : null;
  return {
    id: `genome-commit:${after.eventIndex}`,
    title: formedSplice?.name ?? acquiredGene?.name ?? 'Genome committed',
    rule: formedSplice?.rule
      ?? acquiredGene?.effect
      ?? moments[0]?.detail
      ?? 'The active Genome was updated.',
    moments: moments.slice(0, 4),
  };
}
