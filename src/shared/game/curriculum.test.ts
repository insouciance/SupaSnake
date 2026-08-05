import {
  CURRICULUM_DECLINE_LABEL,
  CURRICULUM_MAX_TRIAL_CANDIDATES,
  curriculumAnnotations,
  curriculumArtifactRef,
  curriculumGeneFromArtifactRef,
  curriculumHintMessage,
  curriculumInvitation,
  curriculumTrialCandidates,
  curriculumTrialSelectable,
  curriculumTrialsOpen,
  curriculumUnlockBeat,
  type CurriculumFacts,
} from './curriculum';
import {
  GENOME_V2_GENES,
  GENOME_V2_STARTER_POOLS,
  genomeV2ActivePool,
} from './genes';

function facts(overrides: Partial<CurriculumFacts> = {}): CurriculumFacts {
  return {
    eligibleGeneIds: [...GENOME_V2_STARTER_POOLS.CYBER],
    trialGeneId: null,
    bankedRuns: 3,
    ...overrides,
  };
}

describe('curriculum trial candidates', () => {
  it('offers nothing before the first BANK (§4.4)', () => {
    expect(curriculumTrialsOpen(facts({ bankedRuns: 0 }))).toBe(false);
    expect(curriculumTrialCandidates('CYBER', facts({ bankedRuns: 0 }))).toEqual([]);
  });

  it('offers at most two, from different decision categories', () => {
    for (const dynasty of ['CYBER', 'PRIMAL', 'COSMIC'] as const) {
      const candidates = curriculumTrialCandidates(
        dynasty,
        facts({ eligibleGeneIds: [...GENOME_V2_STARTER_POOLS[dynasty]] })
      );
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(CURRICULUM_MAX_TRIAL_CANDIDATES);
      const categories = candidates.map((id) => GENOME_V2_GENES[id].category);
      expect(new Set(categories).size).toBe(categories.length);
    }
  });

  it('is deterministic for the same facts', () => {
    expect(curriculumTrialCandidates('PRIMAL', facts())).toEqual(
      curriculumTrialCandidates('PRIMAL', facts())
    );
  });

  it('never proposes a Gene the account already holds, or its own trial', () => {
    const candidates = curriculumTrialCandidates('CYBER', facts());
    for (const geneId of candidates) {
      expect(GENOME_V2_STARTER_POOLS.CYBER).not.toContain(geneId);
    }
    const [first] = candidates;
    expect(
      curriculumTrialCandidates('CYBER', facts({ trialGeneId: first }))
    ).not.toContain(first);
  });

  it('stays inside the Dynasty roster', () => {
    const roster = genomeV2ActivePool('CYBER');
    for (const geneId of curriculumTrialCandidates('CYBER', facts())) {
      expect(roster).toContain(geneId);
    }
  });

  it('empties once every Gene in the Dynasty is eligible', () => {
    const complete = facts({ eligibleGeneIds: genomeV2ActivePool('COSMIC') });
    expect(curriculumTrialCandidates('COSMIC', complete)).toEqual([]);
  });
});

describe('curriculumTrialSelectable', () => {
  it('accepts only the server’s own candidates', () => {
    const state = facts();
    const [candidate] = curriculumTrialCandidates('CYBER', state);
    expect(curriculumTrialSelectable('CYBER', state, candidate)).toBe(true);
    expect(curriculumTrialSelectable('CYBER', state, 'gold_trail')).toBe(false);
    expect(curriculumTrialSelectable('CYBER', state, 'not_a_gene')).toBe(false);
    expect(curriculumTrialSelectable('CYBER', state, null)).toBe(false);
  });

  it('refuses a Gene that is not legal for this Dynasty', () => {
    // The CYBER Signature is not in the PRIMAL roster.
    expect(
      curriculumTrialSelectable('PRIMAL', facts(), 'zenith_protocol')
    ).toBe(false);
  });

  it('refuses everything before the first BANK', () => {
    const state = facts({ bankedRuns: 0 });
    expect(curriculumTrialSelectable('CYBER', state, 'coilkeeper')).toBe(false);
  });
});

describe('curriculumAnnotations', () => {
  it('describes every Gene in the Dynasty roster exactly once', () => {
    const annotations = curriculumAnnotations('PRIMAL', facts({
      eligibleGeneIds: [...GENOME_V2_STARTER_POOLS.PRIMAL],
    }));
    expect(annotations.map((entry) => entry.geneId)).toEqual(
      genomeV2ActivePool('PRIMAL')
    );
  });

  it('marks eligibility truthfully and never as power', () => {
    const state = facts({ trialGeneId: 'coilkeeper' });
    const annotations = curriculumAnnotations('CYBER', state);
    const eligible = annotations.find((entry) => entry.geneId === 'gold_trail');
    const trial = annotations.find((entry) => entry.geneId === 'coilkeeper');
    const locked = annotations.find((entry) => entry.state === 'visible_locked');

    expect(eligible).toMatchObject({ state: 'offer_eligible', offerable: true });
    expect(trial).toMatchObject({ state: 'trial', offerable: true });
    expect(locked?.offerable).toBe(false);

    for (const entry of annotations) {
      expect(entry.nextStep.length).toBeGreaterThan(0);
      // Later, not stronger (§9.4) — and never the bare word "locked".
      expect(entry.nextStep).not.toMatch(/\block(ed)?\b/i);
      expect(entry.nextStep).not.toMatch(/stronger|better|upgrade|rare/i);
    }
  });

  it('tells a pre-BANK account the one thing that opens a trial', () => {
    const annotations = curriculumAnnotations('CYBER', facts({ bankedRuns: 0 }));
    const locked = annotations.find((entry) => entry.state === 'visible_locked');
    expect(locked?.nextStep).toContain('BANK a run');
    expect(locked?.selectable).toBe(false);
  });

  it('says switching costs nothing once a trial is running (§4.4)', () => {
    const state = facts({ trialGeneId: 'coilkeeper' });
    const annotations = curriculumAnnotations('CYBER', state);
    const selectable = annotations.find((entry) => entry.selectable);
    expect(selectable?.nextStep).toContain('costs nothing');
  });

  it('marks exactly the selectable candidates as selectable', () => {
    const state = facts();
    const candidates = new Set(curriculumTrialCandidates('CYBER', state));
    const marked = curriculumAnnotations('CYBER', state)
      .filter((entry) => entry.selectable)
      .map((entry) => entry.geneId);
    expect(new Set(marked)).toEqual(candidates);
  });
});

describe('reveal copy (§5)', () => {
  it('states the fact and its consequence, never a feature name alone', () => {
    const beat = curriculumUnlockBeat('coilkeeper');
    expect(beat.headline).toBe('Loop Trap joined your Power Pods');
    expect(beat.detail).toContain('real run');
    // A REVEAL grants nothing.
    expect(`${beat.headline} ${beat.detail}`).not.toMatch(
      /DNA|reward|bonus|claim/i
    );
    // Headlines must fit the 160-char database check.
    expect(beat.headline.length).toBeLessThanOrEqual(160);
  });

  it('invites with Show me and declines with Not now', () => {
    const invitation = curriculumInvitation('coilkeeper');
    expect(invitation.label).toBe('Show me Loop Trap');
    expect(invitation.declineLabel).toBe(CURRICULUM_DECLINE_LABEL);
    expect(CURRICULUM_DECLINE_LABEL).toBe('Not now');
    expect(invitation.href).toBe('/codex');
    expect(invitation.description).toMatch(/before your next run/);
  });

  it('names the Gene and the place to look in the banner', () => {
    const message = curriculumHintMessage('coilkeeper');
    expect(message).toContain('Loop Trap');
    expect(message).toMatch(/read the rule/i);
  });

  it('never writes "Later" anywhere in the reveal grammar (§13 row 13)', () => {
    const strings = [
      curriculumUnlockBeat('coilkeeper').headline,
      curriculumUnlockBeat('coilkeeper').detail,
      curriculumInvitation('coilkeeper').label,
      curriculumInvitation('coilkeeper').description,
      curriculumInvitation('coilkeeper').declineLabel,
      curriculumHintMessage('coilkeeper'),
      ...curriculumAnnotations('CYBER', facts()).map((entry) => entry.nextStep),
    ];
    for (const value of strings) {
      expect(value).not.toMatch(/\blater\b/i);
    }
  });
});

describe('artifact refs', () => {
  it('round-trips a Gene id', () => {
    expect(curriculumArtifactRef('coilkeeper')).toBe('gene:coilkeeper');
    expect(curriculumGeneFromArtifactRef('gene:coilkeeper')).toBe('coilkeeper');
  });

  it('refuses anything that is not a current-roster Gene', () => {
    expect(curriculumGeneFromArtifactRef(undefined)).toBeNull();
    expect(curriculumGeneFromArtifactRef('splice:tidal_lock')).toBeNull();
    expect(curriculumGeneFromArtifactRef('gene:not_a_gene')).toBeNull();
  });
});
