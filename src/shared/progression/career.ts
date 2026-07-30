import type {
  ProgressionDestination,
  ProgressionMoment,
  ProgressionPillar,
} from './runImpact';

export type CareerDynasty = 'CYBER' | 'PRIMAL' | 'COSMIC';

export interface PursuitCandidate {
  id: string;
  pillar: ProgressionPillar;
  kind: 'mastery_level' | 'record_tier' | 'ladder_record' | 'lineage_generation';
  targetId: string;
  headline: string;
  destination: ProgressionDestination;
  current: number;
  target: number;
}

export interface PinnedPursuit extends PursuitCandidate {
  pinnedAt: string;
}

export interface CareerPulse {
  generatedAt: string;
  mastery: Array<{
    dynasty: CareerDynasty;
    xp: number;
    level: number;
    nextLevelXp: number | null;
  }>;
  records: {
    total: number;
    tiered: number;
    apex: number;
    strongest: Array<{ id: string; value: number; tier: number }>;
  };
  discovery: {
    entries: number;
    worldFirsts: number;
    genomeWeaverUnlocked: boolean;
  };
  ladder: {
    bestByDynasty: Record<CareerDynasty, number>;
    maxBest: number;
  };
  lineage: {
    dossiers: number;
    activeSpecimens: number;
    highestGeneration: number;
  };
  clan: {
    honors: { participant: number; victor: number; stalemate: number };
    activeBattle: null | {
      battleId: string;
      cycleKey: string;
      endsAt: string;
      ownTopFive: number[];
      fifthBest: number | null;
      clanTotal: number;
      opponentTotal: number | null;
    };
  };
  recentMoments: ProgressionMoment[];
  pursuitCandidates: PursuitCandidate[];
  pinnedPursuit: PinnedPursuit | null;
}

export type LineageSpecimenStatus = 'active' | 'retired_refunded';

export interface LineageSpecimen {
  id: string;
  status: LineageSpecimenStatus;
  owned: boolean;
  /** Only the highest active generation in a dossier is selectable. */
  equippable: boolean;
  generation: number;
  parent1Id: string | null;
  parent2Id: string | null;
  traits: string[];
  lineage: Record<string, unknown> | null;
  acquiredAt: string;
  retiredAt: string | null;
  breedingHistoryId: string | null;
  runs: {
    completed: number;
    extractions: number;
    bestScore: number;
    bestYield: number;
    highestEnergy: number;
    clanDepthDelivered: number;
    lastRunAt: string | null;
  };
}

export interface LineageDossier {
  id: string;
  variant: {
    id: string;
    name: string;
    dynasty: CareerDynasty;
    rarity: string;
  };
  createdAt: string;
  updatedAt: string;
  highestActiveGeneration: number | null;
  specimens: LineageSpecimen[];
}
