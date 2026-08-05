import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, isAuthenticated: false }),
}));
jest.mock('@/lib/features/workbench', () => ({ WORKBENCH_V1_ENABLED: true }));
jest.mock('@/lib/features/genomeV2', () => ({ GENOME_V2_ENABLED: true }));

import { CurriculumTrials } from './CurriculumTrials';
import { ResearchTable } from './WorkbenchView';
import type { CurriculumHandle, CurriculumProjection } from './useCurriculum';
import { curriculumAnnotations, curriculumTrialCandidates } from '@/shared/game/curriculum';
import { GENOME_V2_STARTER_POOLS } from '@/shared/game/genes';

const facts = {
  eligibleGeneIds: [...GENOME_V2_STARTER_POOLS.CYBER],
  trialGeneId: null,
  bankedRuns: 3,
};

function projection(
  overrides: Partial<CurriculumProjection> = {}
): CurriculumProjection {
  return {
    live: true,
    dynasty: 'CYBER',
    bankedRuns: facts.bankedRuns,
    trialsOpen: true,
    trialGeneId: null,
    candidates: curriculumTrialCandidates('CYBER', facts),
    genes: curriculumAnnotations('CYBER', facts),
    ...overrides,
  };
}

function handle(
  state: CurriculumProjection | null,
  chooseTrial = jest.fn()
): CurriculumHandle {
  return { state, pending: false, error: null, chooseTrial };
}

describe('CurriculumTrials', () => {
  it('offers two candidates and says switching costs nothing', () => {
    const chooseTrial = jest.fn();
    render(<CurriculumTrials curriculum={handle(projection(), chooseTrial)} />);
    const candidates = curriculumTrialCandidates('CYBER', facts);
    for (const geneId of candidates) {
      expect(screen.getByTestId(`curriculum-choose-${geneId}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId(`curriculum-choose-${candidates[0]}`));
    expect(chooseTrial).toHaveBeenCalledWith(candidates[0]);
  });

  it('explains what opens a first trial before any BANK', () => {
    render(
      <CurriculumTrials
        curriculum={handle(projection({ trialsOpen: false, candidates: [] }))}
      />
    );
    expect(screen.getByTestId('curriculum-trials')).toHaveTextContent('BANK a run');
    expect(screen.getByTestId('curriculum-trials')).toHaveTextContent(
      'already open to read'
    );
  });

  it('recommends neither candidate', () => {
    render(<CurriculumTrials curriculum={handle(projection())} />);
    const panel = screen.getByTestId('curriculum-trials');
    expect(panel.textContent ?? '').not.toMatch(
      /recommended|suggested|best|stronger|optimal/i
    );
  });

  it('renders nothing when there is nothing truthful to say', () => {
    const { container } = render(<CurriculumTrials curriculum={handle(null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Workbench palette annotation', () => {
  const plan = { v: 2 as const, dynasty: 'CYBER' as const, actions: [] };

  it('annotates each power without gating any of it', () => {
    render(
      <ResearchTable plan={plan} onPlan={jest.fn()} curriculum={handle(projection())} />
    );
    const eligible = screen.getByTestId('workbench-gene-gold_trail');
    expect(eligible).toHaveAttribute('data-eligibility', 'offer_eligible');
    expect(
      screen.getByTestId('workbench-gene-gold_trail-eligibility')
    ).toHaveTextContent('Ordinary Power Pods can offer this.');

    // Not-yet-offerable powers stay fully interactive on the free instrument.
    const locked = screen.getByTestId('workbench-gene-coilkeeper');
    expect(locked).toHaveAttribute('data-eligibility', 'visible_locked');
    expect(locked).not.toBeDisabled();
    fireEvent.click(locked);
    expect(screen.getByTestId('workbench-focused-gene-name')).toHaveTextContent(
      'Loop Trap'
    );
  });

  it('renders exactly today’s palette when the curriculum is absent (flag off)', () => {
    render(<ResearchTable plan={plan} onPlan={jest.fn()} />);
    expect(screen.getByTestId('workbench-gene-gold_trail')).not.toHaveAttribute(
      'data-eligibility'
    );
    expect(
      screen.queryByTestId('workbench-gene-gold_trail-eligibility')
    ).toBeNull();
    expect(screen.queryByTestId('curriculum-trials')).toBeNull();
  });
});
