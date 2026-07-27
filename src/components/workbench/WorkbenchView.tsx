'use client';

/**
 * THE WORKBENCH — the Codex's second view (WP-2.08).
 *
 * Every deep loadout game grows a community gear calculator, because
 * optimising a build against a changing boss by trial and error is endless and
 * nobody has the runs to spare. This one is built in, which buys it two things
 * no external calculator can have: it reads the player's REAL inventory, so
 * there is no manual data entry — the thing that makes external calculators
 * miserable — and it sits inside the weekly ritual, one link from the Monday
 * briefing, so the loop becomes read the briefing → plan the hunt → hunt.
 *
 * WHERE THE NUMBERS COME FROM. This component fetches facts and renders. Every
 * figure on screen is computed by `@/shared/game/workbench`, which computes
 * nothing itself either — it arranges answers from `strainActivations`,
 * `computeGenomeRunTotals`, `applyGenomeOutcome` and `geneWeightBreakdown`.
 * That chain is what makes the parity suite able to check the calculator
 * against the engine directly rather than against a second implementation.
 *
 * NO NEW GATE. This view inherits the Codex's own state — signed out sees the
 * invitation, signed in sees the Workbench — and adds nothing on top. §10.4
 * forbids SELLING planning information; it does not ask for it to be gated,
 * and gating a reference is the mistake WP-2.07a had just finished undoing.
 *
 * RULE 1. Nothing here is reachable from `/game`, asserted by import graph in
 * `workbench.constitution.test.ts`. A planning surface has no business inside
 * a live run.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ShareArtifactButton } from '@/components/share/ShareArtifactButton';
import { InventoryRanking } from '@/components/workbench/InventoryRanking';
import { OfferPanel } from '@/components/workbench/OfferPanel';
import { PlanEditor } from '@/components/workbench/PlanEditor';
import { ProjectionPanel } from '@/components/workbench/ProjectionPanel';
import { ReachabilityPanel } from '@/components/workbench/ReachabilityPanel';
import { StrainPanel } from '@/components/workbench/StrainPanel';
import { encodeBuildCode } from '@/lib/share/buildCode';
import { buildShare } from '@/lib/share/artifactUrls';
import { WORKBENCH_V1_ENABLED } from '@/lib/features/workbench';
import { GENES, isGeneId, type GeneId } from '@/shared/game/genes';
import { sanitizeLineage } from '@/shared/game/lineage';
import { sanitizeTraits } from '@/shared/game/traits';
import { normalizeDynastyName } from '@/shared/game/rulesets';
import { isAnomalyId, type AnomalyId } from '@/shared/game/anomalies';
import {
  conditionFromAnomaly,
  isConditionClauseId,
  type ConditionClauseId,
  type WorldCondition,
} from '@/shared/game/worldCondition';
import {
  EMPTY_PLAN,
  rankInventory,
  readWorkbench,
  suggestPlan,
  type WorkbenchAccount,
  type WorkbenchPlan,
  type WorkbenchSnake,
} from '@/shared/game/workbench';
import { isGauntletBan } from '@/shared/game/gauntlet';

interface PanelContext {
  id: string;
  label: string;
  name: string;
  summary: string;
  anomaly: AnomalyId | null;
  clauses: ConditionClauseId[];
}

interface PanelPayload {
  snakes: WorkbenchSnake[];
  account: WorkbenchAccount;
  contexts: PanelContext[];
}

/**
 * Read the panel response into the shapes the pure module takes.
 *
 * Every field goes through the same sanitiser the server uses, so a row this
 * build does not understand degrades to a snake with no lineage and no traits
 * rather than throwing on a screen a player opened to plan with.
 */
function readPanel(raw: unknown): PanelPayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const rawSnakes = Array.isArray(body.snakes) ? body.snakes : [];
  const snakes: WorkbenchSnake[] = rawSnakes.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const generation = Number(row.generation ?? 1);
    const mastery = Number(row.masteryLevel ?? 0);
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? 'Snake'),
      dynasty: normalizeDynastyName(row.dynasty),
      generation: Number.isFinite(generation) && generation > 0 ? Math.floor(generation) : 1,
      traits: sanitizeTraits(row.traits),
      lineage: sanitizeLineage(row.lineage),
      masteryLevel: Number.isFinite(mastery) && mastery > 0 ? Math.floor(mastery) : 0,
    };
  });

  const rawAccount = (body.account ?? {}) as Record<string, unknown>;
  const banked = Number(rawAccount.bankedRuns ?? 0);
  const variants = Number(rawAccount.ownedVariants ?? 0);
  const account: WorkbenchAccount = {
    bankedRuns: Number.isFinite(banked) && banked > 0 ? Math.floor(banked) : 0,
    ownedVariants: Number.isFinite(variants) && variants > 0 ? Math.floor(variants) : 0,
    seasonalGeneIds: (Array.isArray(rawAccount.seasonalGeneIds)
      ? rawAccount.seasonalGeneIds
      : []
    ).filter((id): id is GeneId => isGeneId(id)),
    gauntletBan: isGauntletBan(rawAccount.gauntletBan) ? rawAccount.gauntletBan : null,
    runFoods: (Array.isArray(rawAccount.runFoods) ? rawAccount.runFoods : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  };

  const contexts: PanelContext[] = (Array.isArray(body.contexts) ? body.contexts : []).map(
    (entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? 'neutral'),
        label: String(row.label ?? 'No condition'),
        name: String(row.name ?? 'No condition'),
        summary: String(row.summary ?? ''),
        anomaly: isAnomalyId(row.anomaly) ? row.anomaly : null,
        clauses: (Array.isArray(row.clauses) ? row.clauses : []).filter(
          (id): id is ConditionClauseId => isConditionClauseId(id)
        ),
      };
    }
  );

  return { snakes, account, contexts };
}

export function WorkbenchView() {
  const { session, isAuthenticated } = useAuth();
  const [panel, setPanel] = useState<PanelPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextId, setContextId] = useState('week');
  const [snakeId, setSnakeId] = useState<string | null>(null);
  const [plan, setPlan] = useState<WorkbenchPlan>(EMPTY_PLAN);
  const [planTouched, setPlanTouched] = useState(false);

  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch('/api/workbench/panel', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setError(
            typeof body?.error === 'string'
              ? body.error
              : 'The Workbench could not read your collection.'
          );
          return;
        }
        setPanel(readPanel(body));
      })
      .catch(() => {
        if (!cancelled) setError('The Workbench could not reach the server.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const context = useMemo<PanelContext | null>(
    () => panel?.contexts.find((entry) => entry.id === contextId) ?? null,
    [panel, contextId]
  );

  const condition = useMemo<WorldCondition>(
    () => conditionFromAnomaly(context?.anomaly ?? null, context?.clauses ?? []),
    [context]
  );

  const snake = useMemo<WorkbenchSnake | null>(() => {
    if (!panel || panel.snakes.length === 0) return null;
    return panel.snakes.find((entry) => entry.id === snakeId) ?? panel.snakes[0];
  }, [panel, snakeId]);

  const reading = useMemo(
    () => (panel && snake ? readWorkbench(snake, plan, panel.account, condition) : null),
    [panel, snake, plan, condition]
  );

  const ranked = useMemo(
    () => (panel ? rankInventory(panel.snakes, plan, panel.account, condition) : []),
    [panel, plan, condition]
  );

  /**
   * Open with something computed rather than an empty form — but only until
   * the player touches the plan, after which their plan is the plan and a
   * context change must never silently rewrite it.
   */
  useEffect(() => {
    if (planTouched || !reading || !snake) return;
    if (plan.genes.length > 0) return;
    const suggested = suggestPlan(reading.pool, snake.lineage, reading.condition.tilt);
    if (suggested.genes.length > 0) setPlan(suggested);
  }, [planTouched, reading, snake, plan.genes.length]);

  const changePlan = useCallback((next: WorkbenchPlan) => {
    setPlanTouched(true);
    setPlan(next);
  }, []);

  if (!WORKBENCH_V1_ENABLED) return null;

  if (!isAuthenticated) {
    return (
      <section className="panel p-6 text-center" data-testid="workbench-signed-out">
        <p className="mb-4 font-body text-beige">
          The Workbench plans a hunt against your own collection — which snakes
          you hold, which genes they can be offered, and how far this week&apos;s
          conditions let them reach. Sign in and it reads them for you.
        </p>
        <Link href="/login" className="btn-go inline-block px-7 py-3">
          Sign In
        </Link>
      </section>
    );
  }

  if (isLoading && !panel) {
    return (
      <div className="panel p-8 text-center text-beige/60" data-testid="workbench-loading">
        Opening the Workbench…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-arcade border border-strike-red/70 bg-strike-red/15 p-4"
        data-testid="workbench-error"
      >
        {error}
      </div>
    );
  }

  if (!panel || !snake || !reading) {
    return (
      <div className="panel p-8 text-center text-beige/70" data-testid="workbench-no-snakes">
        The Workbench needs a snake to plan with. Breed one in the Lab and it
        appears here.
      </div>
    );
  }

  const code = encodeBuildCode({
    snakeName: snake.name,
    dynasty: snake.dynasty,
    generation: snake.generation,
    genes: [...plan.genes],
    anomaly: context?.anomaly ?? null,
    clause: context?.clauses[0] ?? null,
    infuses: plan.infuses,
  });

  return (
    <div className="space-y-6 animate-fade-up" data-testid="workbench-view">
      {/* ── The context selector ───────────────────────────────────────── */}
      <section className="panel-elevated p-5" data-testid="workbench-context">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="heading-display text-xl">Planning against</h3>
          <div className="flex flex-wrap gap-2">
            {panel.contexts.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setContextId(entry.id)}
                className={`px-3 py-1 font-body text-sm transition-colors ${
                  entry.id === contextId
                    ? 'text-venom-orange underline'
                    : 'text-beige/60 hover:text-bone-white'
                }`}
                data-testid={`workbench-context-${entry.id}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 font-display text-bone-white" data-testid="workbench-context-name">
          {reading.condition.name}
        </p>
        <p className="mt-1 font-body text-sm text-beige/70">{reading.condition.summary}</p>
        {reading.condition.clauses.length > 0 && (
          <ul className="mt-3 space-y-1" data-testid="workbench-context-clauses">
            {reading.condition.clauses.map((clause) => (
              <li
                key={clause.id}
                className={`font-body text-xs ${
                  clause.polarity === 'benefit' ? 'text-cyber' : 'text-strike-red/80'
                }`}
              >
                <span className="font-display text-bone-white">{clause.name}</span> —{' '}
                {clause.effect}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── The snake ──────────────────────────────────────────────────── */}
      <section className="panel p-5" data-testid="workbench-snake">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="heading-display text-xl">Planning with</h3>
          <ShareArtifactButton
            payload={buildShare({
              code,
              snakeName: snake.name,
              dynasty: snake.dynasty,
              generation: snake.generation,
              geneNames: plan.genes.map((gene) => GENES[gene].name),
              contextName: reading.condition.name,
              infuses: plan.infuses,
            })}
            label="Share this build"
          />
        </div>
        <select
          className="mt-3 w-full rounded-arcade border border-scale-blue-light/40 bg-void-deep p-2 font-body text-bone-white"
          value={snake.id}
          onChange={(event) => setSnakeId(event.target.value)}
          aria-label="Choose a snake to plan with"
          data-testid="workbench-snake-select"
        >
          {panel.snakes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} — Gen {entry.generation} {entry.dynasty}
            </option>
          ))}
        </select>
        {reading.poolBlocked && (
          <p
            className="mt-3 font-body text-sm text-strike-red/85"
            data-testid="workbench-pool-blocked"
          >
            This snake is Ascetic: no gene foods spawn for it at all, so no plan
            can be assembled on it. Everything below reads as empty because it
            genuinely is.
          </p>
        )}
      </section>

      <PlanEditor
        plan={plan}
        pool={reading.pool}
        unreachable={reading.unreachableGenes.map((entry) => entry.gene)}
        onChange={changePlan}
      />

      <ProjectionPanel projections={reading.projections} excluded={reading.excluded} />
      <StrainPanel strains={reading.strains} tierCap={reading.tierCap} />
      <OfferPanel offers={reading.offers} />
      <ReachabilityPanel reachability={reading.reachability} />
      <InventoryRanking
        ranked={ranked}
        selectedId={snake.id}
        onSelect={(id) => setSnakeId(id)}
      />
    </div>
  );
}
