'use client';

/**
 * Choose or switch the next trial (WP-D; PEO §4.4).
 *
 * Two candidates, from different decision categories, both server-chosen.
 * Switching is free and loses nothing — the copy says so, because a player who
 * suspects a hidden cost will not experiment, and experimenting is the entire
 * point of the trial.
 *
 * This panel RECOMMENDS NOTHING. The two candidates are presented in catalog
 * order with identical weight; there is no "suggested", no ordering by power,
 * and no consequence to choosing either one. Boundary 4: unlocks teach
 * horizontal options, never power tiers.
 */

import { GENOME_V2_GENES } from '@/shared/game/genes';
import type { GenomeV2ActiveGeneId } from '@/shared/game/genes';
import type { CurriculumHandle } from './useCurriculum';
import styles from './WorkbenchView.module.css';

export function CurriculumTrials({ curriculum }: { curriculum: CurriculumHandle }) {
  const state = curriculum.state;
  if (!state || !state.live) return null;

  const trial = state.trialGeneId ? GENOME_V2_GENES[state.trialGeneId] : null;

  if (!state.trialsOpen) {
    return (
      <section
        className={styles.curriculumTrials}
        aria-labelledby="curriculum-trials-title"
        data-testid="curriculum-trials"
        data-state="closed"
      >
        <p id="curriculum-trials-title">Your next experiment</p>
        <small>
          BANK a run and you can choose which new power the Pods introduce next.
          Every rule on this bench is already open to read.
        </small>
      </section>
    );
  }

  return (
    <section
      className={styles.curriculumTrials}
      aria-labelledby="curriculum-trials-title"
      data-testid="curriculum-trials"
      data-state={trial ? 'chosen' : 'open'}
    >
      <p id="curriculum-trials-title">Your next experiment</p>
      <small>
        {trial
          ? `${trial.name} holds one Pod slot until you use it once. Switch whenever you like — switching costs nothing and loses nothing.`
          : 'Choose which power the Pods introduce next. It holds one Pod slot until you use it once; the other candidate and DECLINE stay on every offer.'}
      </small>
      {state.candidates.length > 0 ? (
        <div className={styles.curriculumChoices}>
          {state.candidates.map((geneId: GenomeV2ActiveGeneId) => {
            const gene = GENOME_V2_GENES[geneId];
            return (
              <button
                key={geneId}
                type="button"
                onClick={() => curriculum.chooseTrial(geneId)}
                disabled={curriculum.pending}
                data-testid={`curriculum-choose-${geneId}`}
              >
                <strong>{trial ? `Switch to ${gene.name}` : `Try ${gene.name}`}</strong>
                <small>{gene.effect}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <small data-testid="curriculum-no-candidates">
          Every power in this Dynasty is already in your Pods.
        </small>
      )}
      {curriculum.error ? (
        <p role="alert" data-testid="curriculum-error">
          {curriculum.error}
        </p>
      ) : null}
    </section>
  );
}

export default CurriculumTrials;
