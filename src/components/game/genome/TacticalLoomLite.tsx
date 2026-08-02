'use client';

import { STRAINS } from '@/shared/game/strains';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import type {
  TacticalLoomConsequence,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
} from './tacticalLoomPresentation';

const LIVE_LEDGER_IDS = new Set([
  'bonds',
  'anchor',
  'loom-bond',
  'escrow',
  'stake',
  'second-life',
]);

function sameLocus(
  before: TacticalLoomGenomeSlot | undefined,
  after: TacticalLoomGenomeSlot | undefined
): boolean {
  return Boolean(
    before
    && after
    && before.kind === after.kind
    && before.label === after.label
    && before.detail === after.detail
  );
}

function changedLoci(
  before: readonly TacticalLoomGenomeSlot[],
  after: readonly TacticalLoomGenomeSlot[]
): Array<{ before: TacticalLoomGenomeSlot; after: TacticalLoomGenomeSlot }> {
  return before.flatMap((slot) => {
    const result = after.find((candidate) => candidate.index === slot.index);
    return result && !sameLocus(slot, result) ? [{ before: slot, after: result }] : [];
  });
}

function factChanged(fact: TacticalLoomFact): boolean {
  return fact.before !== fact.after;
}

function factTone(fact: TacticalLoomFact): string {
  if (fact.tone === 'danger') return 'border-strike-red/35 text-strike-red';
  if (fact.tone === 'warning') return 'border-venom-orange/35 text-venom-orange';
  if (fact.tone === 'positive') return 'border-rarity-uncommon/35 text-rarity-uncommon';
  return 'border-scale-blue-light/30 text-bone-white';
}

function DeltaChip({ fact }: { fact: TacticalLoomFact }) {
  return (
    <li
      className={`rounded-[10px] border bg-void-deep/45 px-2.5 py-2 ${factTone(fact)}`}
      data-testid={`loom-lite-fact-${fact.id}`}
      title={fact.detail}
    >
      <span className="block font-body text-[9px] font-bold uppercase tracking-[0.1em] text-beige/50">
        {fact.label}
      </span>
      <strong className="mt-0.5 block font-mono text-[11px] leading-tight">
        <span className="text-beige/50">{fact.before}</span>
        <span aria-hidden="true"> → </span>
        {fact.after}
      </strong>
    </li>
  );
}

function TriggerStrip({ consequence }: { consequence: TacticalLoomConsequence }) {
  if (!consequence.trigger) return null;
  const cadence = Math.max(0, Math.min(8, Math.floor(consequence.trigger.cadence ?? 0)));
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-[10px] border border-scale-blue-light/20 bg-void-deep/35 px-2.5 py-2"
      data-testid="loom-lite-trigger"
      title={consequence.trigger.label}
    >
      <span className="shrink-0 font-body text-[9px] font-bold uppercase tracking-[0.12em] text-beige/45">
        Trigger
      </span>
      {cadence > 0 ? (
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {Array.from({ length: cadence }, (_, index) => (
            <i
              key={index}
              className={`h-1.5 w-1.5 rounded-full ${
                index === cadence - 1
                  ? 'bg-cosmic shadow-[0_0_7px_rgba(168,85,247,0.9)]'
                  : 'border border-scale-blue-light/50 bg-void'
              }`}
            />
          ))}
        </span>
      ) : null}
      <strong className="min-w-0 truncate font-body text-[11px] text-bone-white">
        {consequence.trigger.label}
      </strong>
    </div>
  );
}

export function TacticalLoomLite({
  consequence,
  action,
  currentGenome,
}: {
  consequence: TacticalLoomConsequence;
  action: string;
  currentGenome: readonly TacticalLoomGenomeSlot[];
}) {
  const loci = changedLoci(currentGenome, consequence.genomeAfter);
  const strainMoments = consequence.strains.flatMap((strain) => {
    const activated = strain.thresholds.find(
      (tier) => strain.before < tier.points && strain.after >= tier.points && tier.state === 'active'
    );
    const next = activated ? null : strain.thresholds.find((tier) => tier.state === 'next');
    if (!activated && !next) return [];
    return [{ strain, tier: activated ?? next!, activated: Boolean(activated) }];
  });
  const splices = consequence.splices.filter((splice) => splice.stage === 'immediate');
  const ledgers = consequence.ledgers.filter(
    (fact) => LIVE_LEDGER_IDS.has(fact.id) && factChanged(fact)
  );
  const bodyAndTerrain = consequence.body.filter(
    (fact) => factChanged(fact)
      && ['body-length', 'future-growth', 'trigger-growth', 'terrain-rule', 'permanent-terrain'].includes(fact.id)
  );
  const changedOutcomes = consequence.outcomes.filter(factChanged);
  const phoenixConflict = consequence.retainedFacts?.find((fact) => fact.includes('Phoenix'));

  return (
    <section
      className="space-y-2.5 rounded-[14px] border border-cosmic/30 bg-gradient-to-br from-cosmic/9 via-void-deep/76 to-void/58 p-3"
      data-testid="loom-lite"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-display text-xs uppercase tracking-[0.12em] text-cosmic">
          Selected · {action}
        </span>
        <strong className="shrink-0 rounded-full border border-cosmic/35 bg-cosmic/10 px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.08em] text-cosmic">
          {consequence.salienceChip ?? consequence.category}
        </strong>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <p className="line-clamp-2 rounded-[9px] border border-rarity-uncommon/25 bg-rarity-uncommon/5 px-2.5 py-2 font-body text-xs leading-snug text-rarity-uncommon" title={consequence.effect}>
          <b className="mr-1 uppercase tracking-[0.08em]">Gain</b>{consequence.effect}
        </p>
        <p className="line-clamp-2 rounded-[9px] border border-venom-orange/25 bg-venom-orange/5 px-2.5 py-2 font-body text-xs leading-snug text-venom-orange/90" title={consequence.cost}>
          <b className="mr-1 uppercase tracking-[0.08em]">Risk</b>{consequence.cost}
        </p>
      </div>

      <TriggerStrip consequence={consequence} />

      {loci.length > 0 ? (
        <ol className="flex flex-wrap gap-1.5" aria-label="Changed Genome loci" data-testid="loom-lite-loci">
          {loci.map(({ before, after }) => (
            <li
              key={before.index}
              className="flex min-w-0 items-center gap-1.5 rounded-[9px] border border-scale-blue-light/25 bg-void-deep/40 px-2 py-1.5 font-body text-[10px]"
            >
              <span className="font-mono text-beige/45">L{before.index + 1}</span>
              <span className="max-w-24 truncate text-beige/55">{before.kind === 'empty' ? 'OPEN' : before.label}</span>
              <span className="text-cosmic" aria-hidden="true">→</span>
              <strong className="max-w-28 truncate text-bone-white">{after.kind === 'empty' ? 'OPEN' : after.label}</strong>
            </li>
          ))}
        </ol>
      ) : null}

      {strainMoments.length > 0 || splices.length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2" data-testid="loom-lite-activations">
          {strainMoments.map(({ strain, tier, activated }) => (
            <div
              key={`${strain.id}:${tier.points}`}
              className="flex min-w-0 items-center gap-2 rounded-[10px] border bg-void-deep/42 px-2.5 py-2"
              style={{ borderColor: `${strain.color}66` }}
            >
              <span className="h-5 w-5 shrink-0" style={{ color: strain.color }} aria-hidden="true">
                <StrainGlyph id={strain.id} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate font-body text-[11px]" style={{ color: strain.color }}>
                  {STRAINS[strain.id].name} {strain.before} → {strain.after}
                </strong>
                <span className="block truncate font-body text-[9px] text-beige/55">
                  {activated ? `${tier.name} lights up now` : `${tier.name} · ${tier.progressLabel}`}
                </span>
              </span>
            </div>
          ))}
          {splices.map((splice) => {
            const breaks = splice.id.endsWith(':break');
            return (
              <div
                key={splice.id}
                className={`rounded-[10px] border px-2.5 py-2 ${
                  breaks
                    ? 'border-strike-red/35 bg-strike-red/5'
                    : 'border-cosmic/35 bg-cosmic/7'
                }`}
                data-testid={`loom-lite-splice-${splice.id}`}
              >
                <strong className={`block truncate font-display text-[11px] ${breaks ? 'text-strike-red' : 'text-cosmic'}`}>
                  {breaks ? 'Breaks' : 'Forms'} · {splice.name}
                </strong>
                <span className="mt-0.5 block line-clamp-1 font-body text-[9px] text-beige/55" title={splice.rule}>
                  {splice.rule}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {ledgers.length > 0 || bodyAndTerrain.length > 0 || changedOutcomes.length > 0 || phoenixConflict ? (
        <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Immediate decision deltas">
          {ledgers.map((fact) => <DeltaChip key={fact.id} fact={fact} />)}
          {bodyAndTerrain.map((fact) => <DeltaChip key={fact.id} fact={fact} />)}
          {changedOutcomes.map((fact) => <DeltaChip key={fact.id} fact={fact} />)}
          {phoenixConflict ? (
            <li className="rounded-[10px] border border-strike-red/35 bg-strike-red/5 px-2.5 py-2 font-body text-[10px] text-strike-red">
              {phoenixConflict}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
