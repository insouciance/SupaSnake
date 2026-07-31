import {
  buildLabSetupHref,
  buildRunSetupReturnPath,
  readRunSetupDraft,
  resolveSafeRunSetupReturnPath,
} from './runSetupDraft';

describe('run setup navigation draft', () => {
  it('round-trips unsent setup choices without treating them as run authority', () => {
    const path = buildRunSetupReturnPath({
      currentSearch: '?seed=abc123&target=9000&challenge=signal%3A7&by=Rhea',
      mode: 'anomaly',
      energyCommitment: 6,
      ladderRung: 4,
    });

    expect(path).toBe(
      '/game?seed=abc123&target=9000&challenge=signal%3A7&by=Rhea&setupMode=anomaly&setupEnergy=6&setupRung=4'
    );
    expect(readRunSetupDraft(path.split('?')[1])).toEqual({
      mode: 'anomaly',
      energyCommitment: 6,
      ladderRung: 4,
    });
    expect(resolveSafeRunSetupReturnPath(path)).toBe(path);
  });

  it('encodes the complete safe return route into the Lab doorway', () => {
    expect(
      buildLabSetupHref({
        currentSearch: '',
        mode: 'earn',
        energyCommitment: 3,
        ladderRung: 2,
      })
    ).toBe(
      '/lab?returnTo=%2Fgame%3FsetupMode%3Dearn%26setupEnergy%3D3%26setupRung%3D2'
    );
  });

  it('drops unrelated query controls rather than carrying route behavior through Lab', () => {
    const path = buildRunSetupReturnPath({
      currentSearch: '?launch=ftue-v2&source=home&debug=input&seed=kept',
      mode: 'free',
      energyCommitment: 0,
      ladderRung: 0,
    });

    expect(path).toBe('/game?seed=kept&setupMode=free&setupEnergy=0&setupRung=0');
  });

  it.each([
    'https://attacker.invalid/game?setupMode=earn&setupEnergy=1&setupRung=0',
    '//attacker.invalid/game?setupMode=earn&setupEnergy=1&setupRung=0',
    '/lab?setupMode=earn&setupEnergy=1&setupRung=0',
    '/game?launch=ftue-v2&setupMode=earn&setupEnergy=1&setupRung=0',
    '/game?setupMode=earn&setupMode=free&setupEnergy=1&setupRung=0',
    '/game?setupMode=earn&setupEnergy=7&setupRung=0',
    '/game?setupMode=earn&setupEnergy=1&setupRung=999',
    '/game?setupMode=earn&setupEnergy=1&setupRung=0#resume',
  ])('rejects an unsafe or malformed return path: %s', (value) => {
    expect(resolveSafeRunSetupReturnPath(value)).toBeNull();
  });

  it('treats partial and malformed drafts as absent', () => {
    expect(readRunSetupDraft('?setupMode=earn&setupEnergy=-1&setupRung=x')).toEqual({
      mode: 'earn',
      energyCommitment: null,
      ladderRung: null,
    });
  });
});
