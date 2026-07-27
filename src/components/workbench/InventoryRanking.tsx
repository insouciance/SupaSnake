'use client';

/**
 * "Which of my snakes fits this week" (WP-2.08).
 *
 * The question the Workbench exists to answer, and the one no external
 * calculator can answer at all, because it needs the collection. Every row is
 * one full reading of the same plan on a different snake, ranked by the banked
 * Yield at the widest basis the account has evidence for — which is the plan's
 * own floor until the player has finished a run, and is labelled as such.
 *
 * The number in the row is a Yield, not a Score: Score is independent of build
 * by Rule 2 and there is no score field on a reading to render even by
 * accident.
 */

import { StrainChip } from '@/components/traits/StrainChip';
import type { WorkbenchRankedSnake } from '@/shared/game/workbench';

function num(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

const BASIS_COPY: Record<WorkbenchRankedSnake['basis'], string> = {
  floor: 'at the plan’s own floor',
  median: 'at your median run',
  best: 'at your best run',
};

export interface InventoryRankingProps {
  ranked: readonly WorkbenchRankedSnake[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function InventoryRanking({ ranked, selectedId, onSelect }: InventoryRankingProps) {
  return (
    <section className="panel p-5" data-testid="workbench-ranking">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="heading-display text-xl">Which of your snakes fits</h3>
        <p className="font-body text-xs text-beige/55">
          {ranked.length} {ranked.length === 1 ? 'snake' : 'snakes'}, this plan, this week
          {ranked.length > 0 ? ` — ${BASIS_COPY[ranked[0].basis]}` : ''}.
        </p>
      </div>

      {ranked.length === 0 ? (
        <p className="font-body text-sm text-beige/60" data-testid="workbench-ranking-empty">
          No snakes to rank yet. Breed one in the Lab and it appears here.
        </p>
      ) : (
        <ol className="space-y-2">
          {ranked.map((entry, index) => (
            <li key={entry.snake.id}>
              <button
                type="button"
                onClick={() => onSelect(entry.snake.id)}
                className={`w-full rounded-arcade border p-3 text-left transition-colors ${
                  entry.snake.id === selectedId
                    ? 'border-venom-orange/70 bg-venom-orange/5'
                    : 'border-scale-blue-light/30 hover:border-scale-blue-light/60'
                }`}
                data-testid={`workbench-rank-${entry.snake.id}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-beige/45">#{index + 1}</span>
                  <span className="font-display text-bone-white">{entry.snake.name}</span>
                  <span className="font-mono text-xs text-beige/55">
                    Gen {entry.snake.generation} · {entry.snake.dynasty}
                  </span>
                  {entry.ridesTheTilt && (
                    <span
                      className="font-body text-xs text-cosmic"
                      data-testid={`workbench-rides-tilt-${entry.snake.id}`}
                    >
                      lineage rides this week’s tilt
                    </span>
                  )}
                  <span className="ml-auto font-mono text-venom-orange">
                    {num(entry.banked)} banked
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {entry.apexes.map((strain) => (
                    <StrainChip key={`apex-${strain}`} strain={strain} emphasis />
                  ))}
                  {entry.expressions
                    .filter((strain) => !entry.apexes.includes(strain))
                    .map((strain) => (
                      <StrainChip key={`expr-${strain}`} strain={strain} />
                    ))}
                  {entry.apexes.length === 0 && entry.expressions.length === 0 && (
                    <span className="font-body text-xs text-beige/45">
                      This plan reaches no Expression on this snake.
                    </span>
                  )}
                  {entry.unreachableGenes.length > 0 && (
                    <span className="font-body text-xs text-strike-red/75">
                      {entry.unreachableGenes.length} planned{' '}
                      {entry.unreachableGenes.length === 1 ? 'gene is' : 'genes are'} not in
                      its pool
                    </span>
                  )}
                </div>

                <p className="mt-1 font-mono text-xs text-beige/40">
                  {num(entry.rawDna)} raw DNA over {entry.foods} foods
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
