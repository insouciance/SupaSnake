'use client';

import { TRAINING_EXERCISES, type TrainingAttemptResult, type TrainingBestSummary } from '@/shared/game/training';

interface TrainingRecapProps {
  result: TrainingAttemptResult;
  best: TrainingBestSummary | null;
  verification: 'verifying' | 'verified' | 'offline' | 'failed' | 'diagnostic';
  circuitResults?: TrainingAttemptResult[];
  circuitRemaining?: number;
  onRetry: () => void;
  onNextVariant?: () => void;
  onContinueCircuit?: () => void;
  onExit: () => void;
}

const MEDAL_STYLE: Record<string, string> = {
  none: 'border-scale-blue-light/35 text-beige',
  bronze: 'border-amber-700/70 text-amber-600',
  silver: 'border-slate-300/70 text-slate-200',
  gold: 'border-amber-300/75 text-amber-300',
  prismatic: 'border-violet-300/80 text-violet-200 shadow-[0_0_24px_rgba(196,181,253,.22)]',
};

export function TrainingRecap({
  result,
  best,
  verification,
  circuitResults = [],
  circuitRemaining,
  onRetry,
  onNextVariant,
  onContinueCircuit,
  onExit,
}: TrainingRecapProps) {
  const { metrics } = result;
  const definition = TRAINING_EXERCISES[result.exercise];
  const circuitComplete = circuitRemaining === 0;
  const aggregate = circuitComplete
    ? [...circuitResults, result]
    : [];
  const aggregateRating = aggregate.length > 0
    ? Math.round(aggregate.reduce((sum, attempt) => sum + attempt.metrics.rating, 0) / aggregate.length)
    : null;

  return (
    <main className="consent-safe-viewport min-h-dvh app-bg px-4 py-8 text-bone-white sm:px-8">
      <div className="mx-auto max-w-4xl space-y-5 animate-fade-up" data-testid="training-recap">
        <header className="text-center">
          <p className="label-arcade text-[#67e8f9]">{definition.skill} review</p>
          <h1 className="heading-display text-4xl sm:text-6xl">
            {metrics.completed ? 'Line complete' : 'Attempt ended'}
          </h1>
          <div className={`mx-auto mt-4 inline-flex min-h-20 min-w-32 flex-col items-center justify-center rounded-arcade border-2 px-7 ${MEDAL_STYLE[metrics.medal]}`}>
            <strong className="font-display text-4xl">{metrics.rating}</strong>
            <span className="font-mono text-xs uppercase tracking-widest">{result.kind === 'sandbox' ? 'Diagnostic' : metrics.medal}</span>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Attempt metrics">
          {[
            ['Accuracy', `${metrics.accuracy}%`],
            ['Efficiency', `${metrics.efficiency}%`],
            ['Consistency', `${metrics.consistency}%`],
            ['Time', `${(metrics.durationMs / 1000).toFixed(1)}s`],
          ].map(([label, value]) => (
            <div key={label} className="panel p-4 text-center">
              <span className="font-mono text-xs uppercase text-beige/55">{label}</span>
              <strong className="mt-1 block font-display text-2xl">{value}</strong>
            </div>
          ))}
        </section>

        <section className="panel-glow [--glow:#67e8f9] p-5" role="status">
          <p className="label-arcade">Next adjustment</p>
          <p className="mt-2 font-body text-xl text-bone-white">{metrics.diagnosis}</p>
          <p className="mt-2 font-mono text-xs text-beige/55">
            {metrics.rejectedInputs} rejected · {metrics.unnecessaryInputs} extra · mean corner delta {metrics.meanTimingError.toFixed(1)} ticks
          </p>
        </section>

        {metrics.splits.length > 0 && (
          <section className="panel p-5">
            <h2 className="heading-display text-xl">Corner splits</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {metrics.splits.slice(0, 8).map((split, index) => (
                <div key={split.checkpoint} className="flex justify-between border-b border-scale-blue-light/20 py-2 font-mono text-sm">
                  <span className="text-beige/65">Corner {index + 1}</span>
                  <strong className={split.deltaTicks === 0 ? 'text-emerald-300' : 'text-bone-white'}>
                    {split.deltaTicks === null ? 'missed' : split.deltaTicks === 0 ? 'exact' : `${split.deltaTicks > 0 ? '+' : ''}${split.deltaTicks} ticks`}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {circuitComplete && aggregateRating !== null && (
          <section className="panel-glow [--glow:#c4b5fd] p-5" data-testid="circuit-summary">
            <p className="label-arcade text-violet-200">Circuit complete</p>
            <h2 className="heading-display text-3xl">Transfer rating {aggregateRating}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {aggregate.map((attempt) => (
                <span key={attempt.exercise} className="rounded-arcade border border-violet-300/25 bg-void/55 p-3 text-center">
                  <small className="block font-mono uppercase text-beige/55">{TRAINING_EXERCISES[attempt.exercise].skill}</small>
                  <strong className="font-display text-2xl">{attempt.metrics.rating}</strong>
                </span>
              ))}
            </div>
          </section>
        )}

        <p className="text-center font-body text-xs text-beige/55" data-testid="training-verification">
          {verification === 'verifying' && 'Replaying this attempt on the server…'}
          {verification === 'verified' && `Verified · ${best ? `best ${best.rating}` : 'recorded'}`}
          {verification === 'offline' && 'Verified locally; the cross-device skill profile is temporarily unavailable.'}
          {verification === 'failed' && 'The result could not be verified and was not added to your profile.'}
          {verification === 'diagnostic' && 'Sandbox diagnostic · custom routes do not enter standardized bests.'}
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {!circuitComplete && (
            <button type="button" onClick={onRetry} className="btn-go min-h-12 px-7" data-testid="retry-training">
              Retry same scenario
            </button>
          )}
          {onContinueCircuit && !circuitComplete && (
            <button type="button" onClick={onContinueCircuit} className="btn-neutral min-h-12 px-7" data-testid="continue-circuit">
              Next Circuit drill · {circuitRemaining} left
            </button>
          )}
          {onNextVariant && !circuitComplete && (
            <button type="button" onClick={onNextVariant} className="btn-neutral min-h-12 px-7">
              Next variant
            </button>
          )}
          <button type="button" onClick={onExit} className="btn-neutral min-h-12 px-7">
            {circuitComplete ? 'Finish Circuit' : 'Training Lab'}
          </button>
        </div>
      </div>
    </main>
  );
}

export default TrainingRecap;
