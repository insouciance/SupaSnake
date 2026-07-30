import { progressionArtifactHref } from './destinations';

describe('progressionArtifactHref', () => {
  it('keeps generic destinations stable when no exact artifact exists', () => {
    expect(progressionArtifactHref('chronicle')).toBe('/profile');
    expect(progressionArtifactHref('mastery')).toBe('/lab#mastery');
    expect(progressionArtifactHref('records')).toBe('/profile#records');
    expect(progressionArtifactHref('lineage')).toBe('/lab#lineage');
  });

  it('routes server-authored artifacts to the exact rendered proof', () => {
    expect(progressionArtifactHref('mastery', 'mastery:primal')).toBe(
      '/lab?dynasty=PRIMAL#mastery-PRIMAL'
    );
    expect(progressionArtifactHref('records', 'tight coil')).toBe(
      '/profile#record-tight-coil'
    );
    expect(progressionArtifactHref('codex', 'gene:phase-shift')).toBe(
      '/codex#codex-gene-phase-shift'
    );
    expect(progressionArtifactHref('signal', 'signals:25')).toBe(
      '/?signal=open#signal-mark-25'
    );
    expect(progressionArtifactHref('clan', 'session-1')).toBe(
      '/clan#clan-run-session-1'
    );
    expect(progressionArtifactHref('lineage', 'specimen-1')).toBe(
      '/lab?specimen=specimen-1#lineage-specimen-specimen-1'
    );
    expect(progressionArtifactHref('chronicle', 'ladder:CYBER:12')).toBe(
      '/profile#career-artifact-ladder-CYBER-12'
    );
  });

  it('sanitizes fragments and URL-encodes query values', () => {
    expect(progressionArtifactHref('lineage', 'specimen / one')).toBe(
      '/lab?specimen=specimen%20%2F%20one#lineage-specimen-specimen---one'
    );
  });
});
