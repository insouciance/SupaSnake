/**
 * Game Result Validator - Anti-cheat validation
 * Validates score, DNA, duration against expected ranges
 */

import { GAME_CONFIG } from '@/shared/config/game';

export interface GameResultInput {
  score: number;
  dna_earned: number;
  duration_seconds: number;
  died: boolean;
  victory: boolean;
}

export interface ValidationResult {
  valid: boolean;
  adjustedDna: number;
  errors: string[];
}

export function validateGameResult(
  input: GameResultInput,
  serverStartedAt: Date
): ValidationResult {
  const errors: string[] = [];
  const now = Date.now();
  const serverElapsed = Math.floor((now - serverStartedAt.getTime()) / 1000);

  if (input.duration_seconds > serverElapsed + 10) {
    errors.push('INVALID_DURATION: Client duration exceeds server elapsed time');
  }

  if (input.duration_seconds > GAME_CONFIG.session.maxDuration) {
    errors.push('INVALID_DURATION: Duration exceeds maximum');
  }

  const maxReasonableScore = Math.ceil(input.duration_seconds / 2);
  if (input.score > maxReasonableScore) {
    errors.push(
      `INVALID_SCORE: Score ${input.score} exceeds max ${maxReasonableScore} for ${input.duration_seconds}s`
    );
  }

  const { dna } = GAME_CONFIG.economy;
  const validScore = Math.min(input.score, maxReasonableScore);
  let expectedDna = validScore * dna.foodValue;
  expectedDna += Math.floor(validScore * dna.scoreMultiplier);

  if (input.victory) {
    expectedDna += dna.completionBonus;
  }

  if (input.dna_earned > expectedDna * 1.1) {
    errors.push(`INVALID_DNA: Claimed ${input.dna_earned}, max ${expectedDna}`);
  }

  const adjustedDna = Math.min(input.dna_earned, expectedDna);

  return {
    valid: errors.length === 0,
    adjustedDna,
    errors,
  };
}
