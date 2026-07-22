import { deriveFtue, ftueTierCap } from './genome';

describe('Genome FTUE', () => {
  it('keeps Build Seed locked until the player owns two distinct variants', () => {
    expect(deriveFtue(12, 0, 1).spawnPointsUnlocked).toBe(false);
    expect(deriveFtue(12, 0, 2).spawnPointsUnlocked).toBe(true);
  });

  it('unlocks apexes at 20 banks or through any M3 track', () => {
    expect(deriveFtue(19, 2, 2).apexesUnlocked).toBe(false);
    expect(deriveFtue(19, 3, 2).apexesUnlocked).toBe(true);
    expect(deriveFtue(20, 0, 2).apexesUnlocked).toBe(true);
  });

  it('turns the visibility ramp into an economy-binding tier cap', () => {
    expect(ftueTierCap(deriveFtue(0, 0, 2))).toBe(1);
    expect(ftueTierCap(deriveFtue(8, 0, 2))).toBe(2);
    expect(ftueTierCap(deriveFtue(20, 0, 2))).toBe(3);
  });
});
