'use client';

import { useState } from 'react';
import { ResearchTable } from './WorkbenchView';
import type { GenomeV2ExperimentPlan } from '@/shared/game/genomeV2Workbench';
import styles from './WorkbenchView.module.css';

const FIXTURE_PLAN: GenomeV2ExperimentPlan = {
  v: 2,
  dynasty: 'CYBER',
  actions: [
    { kind: 'thread', geneId: 'gold_trail' },
    { kind: 'thread', geneId: 'overgrowth' },
    { kind: 'thread', geneId: 'loan_shark' },
    { kind: 'continue' },
  ],
};

/** Development-only visual specimen for desktop and touch-width review. */
export function GenomeResearchFixture() {
  const [plan, setPlan] = useState(FIXTURE_PLAN);
  return (
    <main className="app-bg min-h-screen px-3 py-5 text-bone-white sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className={styles.workbench}>
          <ResearchTable plan={plan} onPlan={setPlan} />
        </div>
      </div>
    </main>
  );
}
