/**
 * Validation Schemas
 * Zod schemas for API input validation
 *
 * @see https://zod.dev/
 */

import { z } from 'zod';

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate request data against a schema
 * Throws ValidationError if validation fails
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      'Validation failed',
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Game submission schema
 * POST /api/game/submit
 */
export const GameSubmitSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  score: z.number().int().min(0, 'Score must be non-negative'),
  foodCollected: z.number().int().min(0),
  duration: z.number().int().min(0, 'Duration must be non-negative'),
  variantId: z.string().min(1, 'Variant ID is required'),
  moves: z.array(z.object({
    timestamp: z.number(),
    direction: z.enum(['up', 'down', 'left', 'right']),
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
  })).optional(),
});

export type GameSubmitInput = z.infer<typeof GameSubmitSchema>;

/**
 * Age verification schema
 * POST /api/age-verify
 */
export const AgeVerifySchema = z.object({
  dateOfBirth: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Date must be in YYYY-MM-DD format'
  ),
});

export type AgeVerifyInput = z.infer<typeof AgeVerifySchema>;

/**
 * Breeding request schema
 * POST /api/breeding
 */
export const BreedingRequestSchema = z.object({
  parent1Id: z.string().min(1, 'Parent 1 ID is required'),
  parent2Id: z.string().min(1, 'Parent 2 ID is required'),
}).refine(
  (data) => data.parent1Id !== data.parent2Id,
  { message: 'Parent IDs must be different' }
);

export type BreedingRequestInput = z.infer<typeof BreedingRequestSchema>;

/**
 * Player profile update schema
 * PATCH /api/player/profile
 */
export const PlayerProfileSchema = z.object({
  displayName: z.string()
    .min(3, 'Display name must be at least 3 characters')
    .max(50, 'Display name must be at most 50 characters'),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
  bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
});

export type PlayerProfileInput = z.infer<typeof PlayerProfileSchema>;

/**
 * Purchase request schema
 * POST /api/checkout
 */
export const PurchaseSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
  currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD'], {
    message: 'Invalid currency code',
  }),
  promoCode: z.string().optional(),
});

export type PurchaseInput = z.infer<typeof PurchaseSchema>;

/**
 * Clan creation schema
 * POST /api/clan
 */
export const ClanCreateSchema = z.object({
  name: z.string()
    .min(3, 'Clan name must be at least 3 characters')
    .max(30, 'Clan name must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_\-\s]+$/, 'Clan name contains invalid characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  isPublic: z.boolean().default(true),
  maxMembers: z.number().int().min(5).max(100).default(50),
});

export type ClanCreateInput = z.infer<typeof ClanCreateSchema>;

/**
 * Leaderboard query schema
 * GET /api/leaderboard
 */
export const LeaderboardQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'all_time']).default('weekly'),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export type LeaderboardQueryInput = z.infer<typeof LeaderboardQuerySchema>;

/**
 * Energy refill schema
 * POST /api/player/energy
 */
export const EnergyRefillSchema = z.object({
  type: z.enum(['ad', 'purchase', 'daily_bonus']),
  amount: z.number().int().min(1).optional(),
});

export type EnergyRefillInput = z.infer<typeof EnergyRefillSchema>;

/**
 * Streak claim schema
 * POST /api/streaks/claim
 */
export const StreakClaimSchema = z.object({
  streakDay: z.number().int().min(1).max(30),
});

export type StreakClaimInput = z.infer<typeof StreakClaimSchema>;

/**
 * Data export request schema
 * POST /api/user/export-data
 */
export const DataExportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  includeGameHistory: z.boolean().default(true),
  includeTransactions: z.boolean().default(true),
});

export type DataExportInput = z.infer<typeof DataExportSchema>;

/**
 * Account deletion schema
 * POST /api/user/delete-account
 */
export const AccountDeleteSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT', {
    message: 'Must type "DELETE MY ACCOUNT" to confirm',
  }),
  reason: z.string().max(500).optional(),
});

export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;
