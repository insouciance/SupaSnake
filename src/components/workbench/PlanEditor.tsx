'use client';

/**
 * The plan editor — an ORDERED plan with a stated cadence (WP-2.08).
 *
 * The single most consequential shape decision in the Workbench is visible
 * here: a loadout is not a set of genes. `strainActivations` walks point
 * events in `atFood` order, so the same six genes taken in two different
 * orders reach their Expression at two different foods — and under a tight
 * tier cap or a threshold clause, sometimes one order reaches it and the other
 * never does. So the plan is a LIST with move-up and move-down, every row
 * shows the food it is assumed to land at, and the cadence those foods come
 * from is printed on screen rather than assumed.
 *
 * There is deliberately no free-text food field. A player who could type
 * "my third gene at food 41" would be planning a run that the spawn cadence
 * cannot produce, and the tool would answer them precisely and wrongly.
 */

import { StrainChip } from '@/components/traits/StrainChip';
import { GENES, geneStrains, type GeneId } from '@/shared/game/genes';
import {
  MAX_PLAN_GENES,
  MAX_PLAN_INFUSES,
  PLAN_ASSUMPTIONS,
  PLAN_FOOD_STEP,
  planInfuseFoods,
  planPickFoods,
  type WorkbenchPlan,
} from '@/shared/game/workbench';

export interface PlanEditorProps {
  plan: WorkbenchPlan;
  /** The genes this snake can actually be offered, in pool order. */
  pool: readonly GeneId[];
  /** Genes in the plan that this snake's pool cannot offer. */
  unreachable: readonly GeneId[];
  onChange: (plan: WorkbenchPlan) => void;
}

export function PlanEditor({ plan, pool, unreachable, onChange }: PlanEditorProps) {
  const pickFoods = planPickFoods(plan.genes.length);
  const infuseFoods = planInfuseFoods(plan.genes.length, plan.infuses);
  const held = new Set(plan.genes);
  const unreachableSet = new Set(unreachable);

  const setGenes = (genes: GeneId[]) => onChange({ ...plan, genes });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= plan.genes.length) return;
    const next = [...plan.genes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setGenes(next);
  };

  return (
    <section className="panel p-5" data-testid="workbench-plan">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="heading-display text-xl">The plan</h3>
        <p className="font-body text-xs text-beige/60">
          {plan.genes.length} / {MAX_PLAN_GENES} genes · one every {PLAN_FOOD_STEP} foods
        </p>
      </div>

      {plan.genes.length === 0 ? (
        <p className="font-body text-sm text-beige/60" data-testid="workbench-plan-empty">
          No genes planned yet. Add one below — the order you add them in is the
          order the run picks them up, and the order changes the answer.
        </p>
      ) : (
        <ol className="space-y-2" data-testid="workbench-plan-list">
          {plan.genes.map((gene, index) => (
            <li
              key={`${gene}-${index}`}
              className="flex flex-wrap items-center gap-3 rounded-arcade border border-scale-blue-light/30 p-3"
              data-testid={`workbench-plan-pick-${index}`}
            >
              <span className="font-mono text-xs text-beige/50">#{index + 1}</span>
              <span className="font-display text-bone-white">{GENES[gene].name}</span>
              <span className="flex gap-1">
                {geneStrains(gene).map((strain) => (
                  <StrainChip key={strain} strain={strain} />
                ))}
              </span>
              <span
                className="font-mono text-xs text-cyber"
                data-testid={`workbench-plan-food-${index}`}
              >
                food {pickFoods[index]}
              </span>
              {unreachableSet.has(gene) && (
                <span className="font-body text-xs text-strike-red/80">
                  not in this snake&apos;s pool
                </span>
              )}
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${GENES[gene].name} earlier`}
                  data-testid={`workbench-plan-up-${index}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={() => move(index, index + 1)}
                  disabled={index === plan.genes.length - 1}
                  aria-label={`Move ${GENES[gene].name} later`}
                  data-testid={`workbench-plan-down-${index}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={() => setGenes(plan.genes.filter((_, i) => i !== index))}
                  aria-label={`Remove ${GENES[gene].name}`}
                  data-testid={`workbench-plan-remove-${index}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* ── The infuse cadence, and what it costs ───────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="workbench-infuses">
        <span className="font-display text-sm text-bone-white">Infuses</span>
        <button
          type="button"
          className="btn-secondary px-3 py-1"
          onClick={() => onChange({ ...plan, infuses: Math.max(0, plan.infuses - 1) })}
          disabled={plan.infuses === 0}
          aria-label="One fewer infuse"
          data-testid="workbench-infuse-less"
        >
          −
        </button>
        <span className="font-mono text-lg text-venom-orange">{plan.infuses}</span>
        <button
          type="button"
          className="btn-secondary px-3 py-1"
          onClick={() =>
            onChange({ ...plan, infuses: Math.min(MAX_PLAN_INFUSES, plan.infuses + 1) })
          }
          disabled={plan.infuses >= MAX_PLAN_INFUSES}
          aria-label="One more infuse"
          data-testid="workbench-infuse-more"
        >
          +
        </button>
        <span className="font-body text-xs text-beige/60">
          {infuseFoods.length > 0
            ? `Planned at food ${infuseFoods.join(', ')} — after the last gene, at the same cadence.`
            : `Up to ${MAX_PLAN_INFUSES} per run. Each grows your body to carry a strain point.`}
        </span>
      </div>

      {/* ── Adding a gene ──────────────────────────────────────────────── */}
      <div className="mt-5">
        <p className="mb-2 font-body text-xs text-beige/60">
          Add a gene — in the order you mean to pick it up.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="workbench-pool">
          {pool.map((gene) => (
            <button
              key={gene}
              type="button"
              className="btn-secondary px-3 py-1 text-xs disabled:opacity-40"
              disabled={held.has(gene) || plan.genes.length >= MAX_PLAN_GENES}
              onClick={() => setGenes([...plan.genes, gene])}
              data-testid={`workbench-add-${gene}`}
            >
              {GENES[gene].name}
            </button>
          ))}
        </div>
      </div>

      {/* ── The assumptions, listed rather than buried ─────────────────── */}
      <ul
        className="mt-5 space-y-1 border-t border-scale-blue-light/20 pt-4"
        data-testid="workbench-assumptions"
      >
        {PLAN_ASSUMPTIONS.map((line) => (
          <li key={line} className="font-body text-xs text-beige/55">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
