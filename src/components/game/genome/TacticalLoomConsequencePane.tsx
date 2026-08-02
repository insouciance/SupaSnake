'use client';

import { STRAINS } from '@/shared/game/strains';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import type {
  TacticalLoomConsequence,
  TacticalLoomFact,
  TacticalLoomGenomeSlot,
} from './tacticalLoomPresentation';

function GenomeStrip({
  slots,
  label,
  testKey,
}: {
  slots: readonly TacticalLoomGenomeSlot[];
  label: string;
  testKey: 'before' | 'after';
}) {
  return (
    <div>
      <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-beige/55">
        {label}
      </p>
      <ol className="grid grid-cols-6 gap-1.5" aria-label={label} data-testid={`loom-genome-${testKey}`}>
        {slots.map((slot) => {
          const color = slot.strains[0] ? STRAINS[slot.strains[0]].color : '#64748b';
          return (
            <li
              key={slot.index}
              title={slot.detail ?? slot.label}
              className={`flex min-h-11 min-w-0 items-center justify-center rounded-[10px] border px-1 text-center font-body text-[10px] font-bold leading-tight sm:text-xs ${
                slot.kind === 'empty' ? 'border-dashed opacity-45' : ''
              }`}
              style={{ borderColor: `${color}99`, backgroundColor: `${color}18` }}
              data-testid={`loom-${testKey}-slot-${slot.index}`}
            >
              <span className="line-clamp-2">{slot.kind === 'empty' ? 'OPEN' : slot.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FactRows({ title, facts }: { title: string; facts: readonly TacticalLoomFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section aria-label={title}>
      <h4 className="mb-2 font-display text-sm uppercase tracking-[0.12em] text-bone-white">{title}</h4>
      <dl className="space-y-2">
        {facts.map((fact) => (
          <div
            key={fact.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-[10px] border border-scale-blue-light/20 bg-void-deep/35 px-3 py-2"
            data-testid={`loom-fact-${fact.id}`}
          >
            <dt className="min-w-0 font-body text-xs text-beige/70">{fact.label}</dt>
            <dd
              className={`whitespace-nowrap text-right font-mono text-xs font-bold ${
                fact.tone === 'danger'
                  ? 'text-strike-red'
                  : fact.tone === 'positive'
                    ? 'text-rarity-uncommon'
                    : fact.tone === 'warning'
                      ? 'text-venom-orange'
                      : 'text-bone-white'
              }`}
            >
              <span className="text-beige/45">{fact.before}</span>
              {fact.before !== fact.after ? <span aria-hidden="true"> → </span> : null}
              <span>{fact.after}</span>
            </dd>
            {fact.detail ? (
              <dd className="col-span-2 mt-1 font-body text-[11px] leading-snug text-beige/50">
                {fact.detail}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

export function TacticalLoomConsequencePane({
  consequence,
  action,
  currentGenome,
}: {
  consequence: TacticalLoomConsequence;
  action: string;
  currentGenome: readonly TacticalLoomGenomeSlot[];
}) {
  return (
    <div
      className="space-y-5"
      data-testid="loom-consequence-pane"
      aria-live="polite"
      aria-atomic="true"
    >
      <section className="rounded-[14px] border border-cosmic/35 bg-cosmic/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-sm uppercase tracking-[0.14em] text-cosmic">{action}</p>
          <span className="rounded-full border border-scale-blue-light/35 px-2 py-1 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-beige/65">
            {consequence.category}
          </span>
        </div>
        <p className="mt-2 font-body text-sm leading-snug text-rarity-uncommon">{consequence.effect}</p>
        <p className="mt-1 font-body text-xs leading-snug text-strike-red/85">{consequence.cost}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Genome before and after">
        <GenomeStrip slots={currentGenome} label="Current Genome" testKey="before" />
        <GenomeStrip slots={consequence.genomeAfter} label="Resulting Genome" testKey="after" />
      </section>

      {consequence.strains.length > 0 ? (
        <section aria-label="Strain consequences" data-testid="loom-strain-network">
          <h4 className="mb-2 font-display text-sm uppercase tracking-[0.12em] text-bone-white">
            Strain network
          </h4>
          <div className="space-y-3">
            {consequence.strains.map((strain) => (
              <article
                key={strain.id}
                className="rounded-[12px] border bg-void-deep/35 p-3"
                style={{ borderColor: `${strain.color}55` }}
                data-testid={`loom-strain-${strain.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-display text-sm" style={{ color: strain.color }}>
                    <span className="inline-block h-5 w-5" aria-hidden="true"><StrainGlyph id={strain.id} /></span>
                    {strain.name}
                  </p>
                  <p className="whitespace-nowrap font-mono text-xs text-bone-white">
                    {strain.before} → <b>{strain.after}</b> points
                  </p>
                </div>
                <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                  {strain.thresholds.map((tier) => (
                    <li
                      key={tier.points}
                      className={`rounded-[9px] border px-2.5 py-2 ${
                        tier.state === 'active'
                          ? 'border-rarity-uncommon/55 bg-rarity-uncommon/8'
                          : tier.state === 'next'
                            ? 'border-cosmic/55 bg-cosmic/8'
                            : 'border-scale-blue-light/20 bg-void/30'
                      }`}
                      data-testid={`loom-tier-${strain.id}-${tier.points}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-xs text-bone-white">{tier.points} · {tier.name}</p>
                        <span className="font-mono text-[10px] text-beige/50">{tier.progressLabel}</span>
                      </div>
                      <p className="mt-1 font-body text-[10px] leading-snug text-beige/65">{tier.rule}</p>
                      {tier.lockedReason ? (
                        <p className="mt-1 font-body text-[10px] leading-snug text-venom-orange">
                          Locked · {tier.lockedReason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {consequence.splices.length > 0 ? (
        <section aria-label="Splice paths" data-testid="loom-splice-paths">
          <h4 className="mb-2 font-display text-sm uppercase tracking-[0.12em] text-bone-white">
            Splice paths
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {consequence.splices.map((splice) => (
              <article key={splice.id} className="rounded-[10px] border border-cosmic/30 bg-cosmic/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm text-cosmic">{splice.name}</p>
                  <span className="whitespace-nowrap font-body text-[9px] font-bold uppercase tracking-[0.1em] text-beige/45">
                    {splice.stage === 'immediate' ? 'Now' : 'One gene away'}
                  </span>
                </div>
                <p className="mt-1 font-body text-[11px] leading-snug text-beige/75">{splice.rule}</p>
                <p className="mt-1 font-body text-[10px] leading-snug text-strike-red/75">{splice.cost}</p>
                <p className="mt-2 font-body text-[10px] text-beige/45">{splice.recipeLabel}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <FactRows title="Banking & liabilities" facts={consequence.ledgers} />
          <FactRows title="Target queue" facts={consequence.targets} />
        </div>
        <div className="space-y-4">
          <FactRows title="Body & space" facts={consequence.body} />
          <FactRows title="BANK / crash" facts={consequence.outcomes} />
        </div>
      </div>

      {consequence.dynastyFacts.length > 0 ? (
        <section className="rounded-[12px] border border-venom-orange/25 bg-venom-orange/5 p-3" data-testid="loom-dynasty-facts">
          <h4 className="font-display text-xs uppercase tracking-[0.12em] text-venom-orange">Dynasty interaction</h4>
          <ul className="mt-2 space-y-1 font-body text-xs leading-snug text-beige/70">
            {consequence.dynastyFacts.map((fact) => <li key={fact}>• {fact}</li>)}
          </ul>
        </section>
      ) : null}

      {consequence.retainedFacts && consequence.retainedFacts.length > 0 ? (
        <section className="rounded-[12px] border border-scale-blue-light/25 bg-void-deep/35 p-3" data-testid="loom-retained-facts">
          <h4 className="font-display text-xs uppercase tracking-[0.12em] text-bone-white">Recode preserves</h4>
          <p className="mt-1 font-body text-xs leading-snug text-beige/65">
            {consequence.retainedFacts.join(' · ')}
          </p>
        </section>
      ) : null}
    </div>
  );
}
