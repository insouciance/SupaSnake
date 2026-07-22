/**
 * Validation Schemas Tests
 * Validates Zod schemas for API input validation
 */

import {
  GameSubmitSchema,
  AgeVerifySchema,
  BreedingRequestSchema,
  PlayerProfileSchema,
  PurchaseSchema,
  AccountDeleteSchema,
  validateRequest,
  ValidationError,
} from './schemas';

describe('Validation Schemas', () => {
  describe('GameSubmitSchema', () => {
    it('should validate valid game submission', () => {
      const validData = {
        sessionId: 'session_123',
        score: 1500,
        foodCollected: 30,
        duration: 120,
        variantId: 'snake_001',
      };

      const result = GameSubmitSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative scores', () => {
      const invalidData = {
        sessionId: 'session_123',
        score: -100,
        foodCollected: 30,
        duration: 120,
        variantId: 'snake_001',
      };

      const result = GameSubmitSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        sessionId: 'session_123',
        // Missing score
        foodCollected: 30,
      };

      const result = GameSubmitSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid session ID format', () => {
      const invalidData = {
        sessionId: '',
        score: 100,
        foodCollected: 10,
        duration: 60,
        variantId: 'snake_001',
      };

      const result = GameSubmitSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('AgeVerifySchema', () => {
    it('should validate numeric birth year and month', () => {
      const validData = {
        birthYear: 2000,
        birthMonth: 1,
      };

      const result = AgeVerifySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('normalizes digit-only form strings', () => {
      const result = AgeVerifySchema.safeParse({
        birthYear: '2000',
        birthMonth: '12',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ birthYear: 2000, birthMonth: 12 });
      }
    });

    it('rejects legacy and partially numeric shapes', () => {
      expect(
        AgeVerifySchema.safeParse({ dateOfBirth: '2000-01-15' }).success
      ).toBe(false);
      expect(
        AgeVerifySchema.safeParse({ birthYear: '2000x', birthMonth: 1 }).success
      ).toBe(false);
    });

    it('should reject missing birth input', () => {
      expect(AgeVerifySchema.safeParse({}).success).toBe(false);
    });
  });

  describe('AccountDeleteSchema', () => {
    it('accepts registered and anonymous confirmation forms', () => {
      expect(
        AccountDeleteSchema.safeParse({ confirmEmail: 'player@example.com' })
          .success
      ).toBe(true);
      expect(
        AccountDeleteSchema.safeParse({ confirmation: 'DELETE MY ACCOUNT' })
          .success
      ).toBe(true);
    });

    it('rejects malformed confirmation values', () => {
      expect(AccountDeleteSchema.safeParse({}).success).toBe(false);
      expect(
        AccountDeleteSchema.safeParse({ confirmEmail: 'not-an-email' }).success
      ).toBe(false);
      expect(
        AccountDeleteSchema.safeParse({ confirmation: 'DELETE' }).success
      ).toBe(false);
    });
  });

  describe('BreedingRequestSchema', () => {
    it('should validate valid breeding request', () => {
      const validData = {
        parent1Id: 'variant_001',
        parent2Id: 'variant_002',
      };

      const result = BreedingRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject same parent IDs', () => {
      const invalidData = {
        parent1Id: 'variant_001',
        parent2Id: 'variant_001',
      };

      const result = BreedingRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty parent IDs', () => {
      const invalidData = {
        parent1Id: '',
        parent2Id: 'variant_002',
      };

      const result = BreedingRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('PlayerProfileSchema', () => {
    it('should validate valid profile update', () => {
      const validData = {
        displayName: 'PlayerOne',
        avatarUrl: 'https://example.com/avatar.png',
      };

      const result = PlayerProfileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject display name too short', () => {
      const invalidData = {
        displayName: 'AB',
      };

      const result = PlayerProfileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject display name too long', () => {
      const invalidData = {
        displayName: 'A'.repeat(51),
      };

      const result = PlayerProfileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid avatar URL', () => {
      const invalidData = {
        displayName: 'ValidName',
        avatarUrl: 'not-a-url',
      };

      const result = PlayerProfileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const validData = {
        displayName: 'ValidName',
      };

      const result = PlayerProfileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('PurchaseSchema', () => {
    it('should validate valid purchase request', () => {
      const validData = {
        productId: 'energy_pack_small',
        quantity: 1,
        currency: 'USD',
      };

      const result = PurchaseSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid quantity', () => {
      const invalidData = {
        productId: 'energy_pack',
        quantity: 0,
        currency: 'USD',
      };

      const result = PurchaseSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid currency code', () => {
      const invalidData = {
        productId: 'energy_pack',
        quantity: 1,
        currency: 'INVALID',
      };

      const result = PurchaseSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should default quantity to 1', () => {
      const validData = {
        productId: 'energy_pack',
        currency: 'USD',
      };

      const result = PurchaseSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(1);
      }
    });
  });

  describe('validateRequest', () => {
    it('should return validated data for valid input', () => {
      const schema = GameSubmitSchema;
      const validData = {
        sessionId: 'session_123',
        score: 1500,
        foodCollected: 30,
        duration: 120,
        variantId: 'snake_001',
      };

      const result = validateRequest(schema, validData);
      expect(result).toEqual(validData);
    });

    it('should throw ValidationError for invalid input', () => {
      const schema = GameSubmitSchema;
      const invalidData = {
        sessionId: '',
        score: -100,
      };

      expect(() => validateRequest(schema, invalidData)).toThrow(ValidationError);
    });

    it('should include field errors in ValidationError', () => {
      const schema = GameSubmitSchema;
      const invalidData = {
        sessionId: '',
        score: -100,
      };

      try {
        validateRequest(schema, invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toBeDefined();
        expect((error as ValidationError).errors.length).toBeGreaterThan(0);
      }
    });
  });
});
