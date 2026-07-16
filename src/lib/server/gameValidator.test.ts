import { validateGameResult, GameResultInput } from './gameValidator';

jest.mock('@/shared/config/game', () => ({
  GAME_CONFIG: {
    economy: {
      dna: {
        foodValue: 10,
        scoreMultiplier: 0.1,
        completionBonus: 50,
        firstWinBonus: 100,
      },
    },
    session: {
      maxDuration: 600,
    },
  },
}));

describe('Game Validator', () => {
  const createInput = (overrides: Partial<GameResultInput> = {}): GameResultInput => ({
    score: 10,
    dna_earned: 101,
    duration_seconds: 60,
    died: true,
    victory: false,
    ...overrides,
  });

  describe('validateGameResult', () => {
    it('should accept valid game result', () => {
      const serverStartedAt = new Date(Date.now() - 65000);
      const input = createInput();

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject duration exceeding server elapsed time', () => {
      const serverStartedAt = new Date(Date.now() - 30000);
      const input = createInput({ duration_seconds: 60 });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DURATION'));
    });

    it('should reject duration exceeding max game duration', () => {
      const serverStartedAt = new Date(Date.now() - 700000);
      const input = createInput({ duration_seconds: 650 });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DURATION'));
    });

    it('should allow 10 second buffer for network latency', () => {
      const serverStartedAt = new Date(Date.now() - 55000);
      const input = createInput({ duration_seconds: 60 });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(true);
    });

    it('should reject impossible score for duration', () => {
      const serverStartedAt = new Date(Date.now() - 65000);
      const input = createInput({ score: 100, duration_seconds: 60 });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_SCORE'));
    });

    it('should accept reasonable score for duration', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const input = createInput({ score: 50, duration_seconds: 120 });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(true);
    });

    it('should calculate correct DNA from score', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const input = createInput({
        score: 10,
        dna_earned: 101,
        duration_seconds: 120,
      });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.adjustedDna).toBe(101);
    });

    it('should add victory bonus to DNA calculation', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const input = createInput({
        score: 10,
        dna_earned: 151,
        duration_seconds: 120,
        victory: true,
        died: false,
      });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.adjustedDna).toBe(151);
      expect(result.valid).toBe(true);
    });

    it('should reject DNA exceeding formula', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const input = createInput({
        score: 10,
        dna_earned: 500,
        duration_seconds: 120,
      });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('INVALID_DNA'));
    });

    it('should adjust DNA to expected maximum', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const input = createInput({
        score: 10,
        dna_earned: 500,
        duration_seconds: 120,
      });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.adjustedDna).toBeLessThan(500);
    });

    it('should allow 10% buffer for DNA rounding', () => {
      const serverStartedAt = new Date(Date.now() - 125000);
      const expectedDna = 101;
      const withBuffer = Math.floor(expectedDna * 1.1);
      const input = createInput({
        score: 10,
        dna_earned: withBuffer,
        duration_seconds: 120,
      });

      const result = validateGameResult(input, serverStartedAt);

      expect(result.valid).toBe(true);
    });
  });
});
