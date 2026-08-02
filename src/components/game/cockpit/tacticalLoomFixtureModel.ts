import {
  GENOME_V2_GENES,
  GENOME_V2_GENE_STRAINS,
  type GenomeV2ActiveGeneId,
} from '@/shared/game/genes';
import {
  GENOME_V2_STRAIN_LADDERS,
  type GenomeV2SpliceId,
} from '@/shared/game/genomeV2';
import { STRAINS, type StrainId } from '@/shared/game/strains';
import type {
  TacticalLoomConsequence,
  TacticalLoomDecisionModel,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
  TacticalLoomSplicePath,
  TacticalLoomStrainProjection,
} from '@/components/game/genome/tacticalLoomPresentation';

interface FixtureGeneSlot extends TacticalLoomGenomeSlot {
  geneId?: GenomeV2ActiveGeneId;
}

const OPEN_GENOME: readonly FixtureGeneSlot[] = [
  geneSlot(0, 'circuit_run'),
  geneSlot(1, 'overgrowth'),
  geneSlot(2, 'wall_rush'),
  geneSlot(3, 'compound_interest'),
  emptySlot(4),
  emptySlot(5),
];

const FULL_GENOME: readonly FixtureGeneSlot[] = [
  geneSlot(0, 'gold_trail'),
  geneSlot(1, 'circuit_run'),
  geneSlot(2, 'overgrowth'),
  geneSlot(3, 'wall_rush'),
  geneSlot(4, 'compound_interest'),
  {
    index: 5,
    kind: 'ash',
    label: 'Ash',
    strains: [],
    detail: 'Phoenix has fired. Ash remains in this locus for the rest of the run.',
  },
];

const OPEN_POINTS: Readonly<Record<StrainId, number>> = {
  AURUM: 2,
  VOLT: 2,
  FERAL: 2,
  FLUX: 2,
  UMBRA: 0,
};

const FULL_POINTS: Readonly<Record<StrainId, number>> = {
  AURUM: 2,
  VOLT: 2,
  FERAL: 2,
  FLUX: 2,
  UMBRA: 0,
};

const CATEGORY_LABELS: Readonly<Record<GenomeV2ActiveGeneId, string>> = {
  gold_trail: 'Yield & compounding',
  compound_interest: 'Banking & deferred reward',
  loan_shark: 'Banking wager',
  live_wire: 'Execution & route mastery',
  circuit_run: 'Execution & route mastery',
  time_dilation: 'Body & planning',
  overgrowth: 'Body pressure',
  coilkeeper: 'Territory & terrain',
  wall_rush: 'Movement & terrain',
  phase_gate: 'Movement & terrain',
  mirror_wager: 'Banking wager',
  phoenix: 'Survival & insurance',
  loom_anchor: 'Genome control',
  heartwood: 'Primal signature',
  zenith_protocol: 'Cyber signature',
  constellation_crown: 'Cosmic signature',
};

function geneSlot(index: number, geneId: GenomeV2ActiveGeneId): FixtureGeneSlot {
  const gene = GENOME_V2_GENES[geneId];
  return {
    index,
    kind: 'gene',
    geneId,
    label: gene.name,
    strains: gene.strains,
    detail: gene.effect,
  };
}

function emptySlot(index: number): FixtureGeneSlot {
  return { index, kind: 'empty', label: 'Open locus', strains: [] };
}

function afterAdding(
  slots: readonly FixtureGeneSlot[],
  geneId: GenomeV2ActiveGeneId,
  replacementIndex?: number
): FixtureGeneSlot[] {
  const target = replacementIndex ?? slots.find((slot) => slot.kind === 'empty')?.index;
  return slots.map((slot) => slot.index === target ? geneSlot(slot.index, geneId) : { ...slot });
}

function strainProjection(
  points: Readonly<Record<StrainId, number>>,
  incoming: GenomeV2ActiveGeneId,
  outgoing?: GenomeV2ActiveGeneId
): TacticalLoomStrainProjection[] {
  const touched = new Set<StrainId>([
    ...GENOME_V2_GENE_STRAINS[incoming],
    ...(outgoing ? GENOME_V2_GENE_STRAINS[outgoing] : []),
  ]);

  return Array.from(touched).map((strain: StrainId) => {
    const before = points[strain];
    const after = before
      - (outgoing && GENOME_V2_GENE_STRAINS[outgoing].includes(strain) ? 1 : 0)
      + (GENOME_V2_GENE_STRAINS[incoming].includes(strain) ? 1 : 0);
    return {
      id: strain,
      name: STRAINS[strain].name,
      color: STRAINS[strain].color,
      before,
      after,
      thresholds: GENOME_V2_STRAIN_LADDERS[strain].map((tier) => ({
        points: tier.points,
        name: tier.name,
        rule: tier.rule,
        state: after >= tier.points ? 'active' : tier.points - after === 1 ? 'next' : 'future',
        progressLabel: after >= tier.points ? 'active' : `${tier.points - after} away`,
      })),
    };
  });
}

function splice(
  id: GenomeV2SpliceId,
  name: string,
  stage: TacticalLoomSplicePath['stage'],
  rule: string,
  cost: string,
  recipeLabel: string
): TacticalLoomSplicePath {
  return {
    id,
    name,
    stage,
    rule,
    cost,
    recipeKnown: true,
    recipeLabel,
    activation: 'available',
  };
}

const PERFECT_CIRCUIT = splice(
  'splice_perfect_circuit',
  'Perfect Circuit',
  'immediate',
  'Successful Live routes arm a linked return leg with a larger shared payout.',
  'Either failed leg burns the whole circuit.',
  'Live Wire + Circuit Run'
);

const WORLDCOIL = splice(
  'splice_worldcoil',
  'Worldcoil',
  'immediate',
  'Sealed territory converts Overgrowth pressure into a higher next-target tier.',
  'The seal is permanent and Overgrowth keeps adding body.',
  'Coilkeeper + Overgrowth'
);

const RIFTLINE_NEXT = splice(
  'splice_riftline',
  'Riftline',
  'one-step',
  'A deliberate redirect can open a one-use riftline to the empowered target.',
  'Traversed gate cells become permanent Scars.',
  'One gene away · Phase Gate joins Wall Rush'
);

const WORLDBODY_NEXT = splice(
  'splice_worldcoil',
  'Worldcoil',
  'one-step',
  'Coilkeeper would convert current Overgrowth pressure into territorial payout.',
  'Every claimed cell would remain solid.',
  'One gene away · Coilkeeper joins Overgrowth'
);

function ledgerFacts(bondsAfter = 1): TacticalLoomFact[] {
  return [
    {
      id: 'carry',
      label: 'Carry',
      before: '2 CONTINUE · ×1.9531',
      after: '2 CONTINUE · ×1.9531',
      detail: 'Carry stays uncapped. The next explicit CONTINUE raises BANK and lowers crash salvage.',
    },
    {
      id: 'bonds',
      label: 'BANK Bonds',
      before: '1 / 3 · +8%',
      after: `${bondsAfter} / 3 · +${bondsAfter * 8}%`,
      detail: 'Bonds compound at BANK and pay nothing on crash.',
      tone: bondsAfter > 1 ? 'positive' : 'neutral',
    },
    {
      id: 'escrow',
      label: 'Loan Escrow',
      before: 'none',
      after: 'none',
    },
    {
      id: 'stake',
      label: 'Mirror Stake',
      before: 'none',
      after: 'none',
    },
  ];
}

function outcomeFacts(bank = '×2.1094'): TacticalLoomFact[] {
  return [
    {
      id: 'bank',
      label: 'BANK projection now',
      before: '×2.1094',
      after: bank,
      detail: 'The incoming gene changes future earning routes; it does not invent retroactive Yield.',
      tone: bank !== '×2.1094' ? 'positive' : 'neutral',
    },
    {
      id: 'crash',
      label: 'Crash projection now',
      before: '×0.5840',
      after: '×0.5840',
      detail: 'Ordinary salvage remains separate from Bonds, Escrow, and Stake.',
    },
  ];
}

function openCandidateConsequence(
  geneId: 'live_wire' | 'coilkeeper'
): TacticalLoomConsequence {
  const liveWire = geneId === 'live_wire';
  return {
    category: CATEGORY_LABELS[geneId],
    effect: GENOME_V2_GENES[geneId].effect,
    cost: GENOME_V2_GENES[geneId].cost,
    genomeAfter: afterAdding(OPEN_GENOME, geneId),
    strains: strainProjection(OPEN_POINTS, geneId),
    splices: liveWire ? [PERFECT_CIRCUIT, RIFTLINE_NEXT] : [WORLDCOIL, RIFTLINE_NEXT],
    ledgers: ledgerFacts(),
    targets: liveWire
      ? [{
          id: 'exclusive-target',
          label: 'Exclusive target rule',
          before: 'Circuit pair every 4th',
          after: '+ Live route every 3rd',
          detail: 'If triggers coincide, the stable acquisition-order queue assigns exactly one transformation per target.',
          tone: 'positive',
        }]
      : [{
          id: 'exclusive-target',
          label: 'Next seal reward',
          before: 'none',
          after: '×4–×6 after charge',
          detail: 'Eight foods charge a new seal; at least four newly enclosed cells are required.',
          tone: 'positive',
        }],
    body: liveWire
      ? [
          { id: 'length', label: 'Length now', before: '74', after: '74' },
          { id: 'pressure', label: 'Board committed', before: '31%', after: '31%' },
        ]
      : [
          { id: 'length', label: 'Length now', before: '74', after: '74' },
          {
            id: 'terrain',
            label: 'Next successful seal',
            before: '0 permanent cells',
            after: 'at least 4',
            detail: 'Sealed cells remain solid for the rest of the run.',
            tone: 'warning',
          },
        ],
    outcomes: outcomeFacts(),
    dynastyFacts: liveWire
      ? [
          'PRIMAL gives more planning time than CYBER, but its longer body can make the topology-derived route less forgiving.',
          'The route budget is calculated from the actual board and legal path, not from a fixed timer.',
        ]
      : [
          'PRIMAL can form seals naturally while wall-coiling, but every seal removes future recovery space.',
          'The same gene is materially harder on a dense late board; that Dynasty and run-state fit is intentional.',
        ],
  };
}

function openDeclineConsequence(): TacticalLoomConsequence {
  return {
    category: 'Opportunity cost & compounding',
    effect: 'Spend this offer, preserve both open loci, and mint BANK Bond 2 of 3.',
    cost: 'Live Wire and Coilkeeper do not enter the run. This offer cannot be recovered.',
    genomeAfter: OPEN_GENOME,
    strains: [],
    splices: [RIFTLINE_NEXT],
    ledgers: ledgerFacts(2),
    targets: [{
      id: 'offer-cadence',
      label: 'Next cadence offer',
      before: 'this decision',
      after: '4–6 foods',
      detail: 'DECLINE is economic only because it gives up two viable build paths now.',
    }],
    body: [{ id: 'open-loci', label: 'Open loci', before: '2', after: '2' }],
    outcomes: outcomeFacts('×2.2656'),
    dynastyFacts: [
      'PRIMAL can use the preserved slots to wait for a more territorial combination, but the current execution paths are gone.',
    ],
  };
}

function idsAfterReplacement(
  incoming: GenomeV2ActiveGeneId,
  replacementIndex: number
): GenomeV2ActiveGeneId[] {
  return FULL_GENOME.flatMap((slot) => {
    if (slot.index === replacementIndex) return [incoming];
    return slot.geneId ? [slot.geneId] : [];
  });
}

function recodeSplices(
  incoming: 'live_wire' | 'phase_gate',
  replacementIndex: number
): TacticalLoomSplicePath[] {
  const ids = new Set(idsAfterReplacement(incoming, replacementIndex));
  const paths: TacticalLoomSplicePath[] = [];
  if (ids.has('live_wire') && ids.has('circuit_run')) paths.push(PERFECT_CIRCUIT);
  if (ids.has('phase_gate') && ids.has('wall_rush')) {
    paths.push({ ...RIFTLINE_NEXT, stage: 'immediate', recipeLabel: 'Phase Gate + Wall Rush' });
  }
  if (ids.has('overgrowth') && !ids.has('coilkeeper')) paths.push(WORLDBODY_NEXT);
  return paths.slice(0, 2);
}

function recodeConsequence(
  incoming: 'live_wire' | 'phase_gate',
  replacementIndex: number
): TacticalLoomConsequence {
  const outgoing = FULL_GENOME[replacementIndex].geneId;
  const outgoingLabel = FULL_GENOME[replacementIndex].label;
  const result = afterAdding(FULL_GENOME, incoming, replacementIndex);
  return {
    category: CATEGORY_LABELS[incoming],
    effect: `${GENOME_V2_GENES[incoming].effect} ${outgoingLabel} stops producing future effects.`,
    cost: `First Recode adds +8 permanent segments. ${GENOME_V2_GENES[incoming].cost}`,
    genomeAfter: result,
    strains: strainProjection(FULL_POINTS, incoming, outgoing),
    splices: recodeSplices(incoming, replacementIndex),
    ledgers: ledgerFacts(),
    targets: [{
      id: 'retired-rule',
      label: 'Retired future rule',
      before: outgoingLabel,
      after: GENOME_V2_GENES[incoming].name,
      detail: 'Already resolved targets and earned Yield remain secured in the run ledger.',
    }],
    body: [
      { id: 'length', label: 'Length', before: '96', after: '104', tone: 'warning' },
      {
        id: 'recode-cost',
        label: 'Later Recode cost',
        before: '+8 now',
        after: '+10 thereafter',
        detail: 'Recode never shortens the snake.',
      },
    ],
    outcomes: outcomeFacts(),
    dynastyFacts: [
      incoming === 'live_wire'
        ? 'This execution gene rewards PRIMAL only while the remaining geometry still supports a clean route.'
        : 'Phase Gate can recover distance, but its permanent Scars compete directly with PRIMAL wall-coiling space.',
    ],
    retainedFacts: [
      'earned Yield',
      'BANK Bonds',
      'prior growth',
      'permanent terrain',
      'Ash',
      'outstanding liabilities',
    ],
  };
}

function recodeCandidate(geneId: 'live_wire' | 'phase_gate') {
  const gene = GENOME_V2_GENES[geneId];
  const pendingConsequence: TacticalLoomConsequence = {
    category: CATEGORY_LABELS[geneId],
    effect: `${gene.effect} Confirm this incoming gene, then choose exactly which current locus leaves.`,
    cost: `First Recode adds +8 permanent segments. ${gene.cost}`,
    genomeAfter: FULL_GENOME,
    strains: [],
    splices: [],
    ledgers: ledgerFacts(),
    targets: [{
      id: 'recode-next-step',
      label: 'Next step',
      before: 'incoming gene',
      after: 'choose outgoing locus',
      detail: 'Strain and Splice consequences appear only after the outgoing locus is known.',
    }],
    body: [{ id: 'length', label: 'Length', before: '96', after: '104', tone: 'warning' }],
    outcomes: outcomeFacts(),
    dynastyFacts: [
      'The correct outgoing locus depends on current geometry, liabilities, target queue, and the Splice path you intend to preserve.',
    ],
    retainedFacts: [
      'earned Yield',
      'BANK Bonds',
      'prior growth',
      'permanent terrain',
      'Ash',
      'outstanding liabilities',
    ],
  };
  return {
    action: 'FORK' as const,
    geneId,
    name: GENOME_V2_GENES[geneId].name,
    category: CATEGORY_LABELS[geneId],
    strains: GENOME_V2_GENE_STRAINS[geneId],
    consequence: pendingConsequence,
    replacementChoices: FULL_GENOME.map((slot) => ({
      slotIndex: slot.index,
      label: slot.label,
      kind: slot.kind,
      strains: slot.strains,
      growthCost: 8,
      consequence: slot.kind === 'ash'
        ? recodeConsequence(geneId, 0)
        : recodeConsequence(geneId, slot.index),
      disabledReason: slot.kind === 'ash' ? 'Ash is permanent this run' : undefined,
    })),
  };
}

export function tacticalLoomFixtureModel(
  mode: 'thread' | 'recode'
): TacticalLoomDecisionModel {
  if (mode === 'recode') {
    return {
      rulesVersion: 2,
      title: 'Tactical Loom · Full Genome',
      sourceLabel: 'Cadence offer · 43 foods · Recode 1',
      dynasty: 'PRIMAL',
      currentGenome: FULL_GENOME,
      candidates: [recodeCandidate('live_wire'), recodeCandidate('phase_gate')],
      decline: {
        action: 'DECLINE',
        name: 'Keep this Genome',
        consequence: {
          category: 'Opportunity cost & compounding',
          effect: 'Spend this offer, keep every current locus, and mint BANK Bond 2 of 3.',
          cost: 'Neither incoming gene can return after this offer resolves.',
          genomeAfter: FULL_GENOME,
          strains: [],
          splices: [RIFTLINE_NEXT, WORLDBODY_NEXT],
          ledgers: ledgerFacts(2),
          targets: [],
          body: [{ id: 'length', label: 'Length', before: '96', after: '96' }],
          outcomes: outcomeFacts('×2.2656'),
          dynastyFacts: ['Keeping the current Genome avoids +8 body, but gives up both available Recode paths.'],
        },
      },
    };
  }

  return {
    rulesVersion: 2,
    title: 'Tactical Loom',
    sourceLabel: 'Cadence offer · 18 foods · 2 open loci',
    dynasty: 'PRIMAL',
    currentGenome: OPEN_GENOME,
    candidates: [
      {
        action: 'THREAD',
        geneId: 'live_wire',
        name: GENOME_V2_GENES.live_wire.name,
        category: CATEGORY_LABELS.live_wire,
        strains: GENOME_V2_GENE_STRAINS.live_wire,
        consequence: openCandidateConsequence('live_wire'),
      },
      {
        action: 'THREAD',
        geneId: 'coilkeeper',
        name: GENOME_V2_GENES.coilkeeper.name,
        category: CATEGORY_LABELS.coilkeeper,
        strains: GENOME_V2_GENE_STRAINS.coilkeeper,
        consequence: openCandidateConsequence('coilkeeper'),
      },
    ],
    decline: {
      action: 'DECLINE',
      name: 'Mint Bond +8%',
      consequence: openDeclineConsequence(),
    },
  };
}
