/**
 * Core Game Types for SupaSnake MVP
 * Server authority - all game state managed server-side
 *
 * The collectible catalog (dynasties, variants, owned snakes) lives in the
 * database; its types are in `@/shared/types/snake-data-model`. This module
 * only keeps the dynasty NAME union used for theming the 3D game.
 */

/**
 * Dynasty names as seeded in the `dynasties` table.
 * Used as theme keys for the game renderer (ThemeManager, particles, lights).
 */
export type DynastyId = 'CYBER' | 'PRIMAL' | 'COSMIC';
