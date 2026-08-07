/**
 * THE 90s COMPOSITION (90S-A) - one switch for one picture.
 *
 * Gates the ratified 90s-cartoon composition: the character's cube law and
 * authored face tones (`snake90s.ts`), the neon dynasty board built from 400
 * real blocks (`boardTiles.ts` / `boardThemes.ts`), and the guide's own shades
 * and braids wherever a player has equipped them. ONE flag, because it is one
 * composition - the board is the ground the character stands on, the two were
 * reviewed together and ratified together (`concept/board-neon-themes` @
 * 9f63939, owner 2026-08-07), and a build that shipped half of them would be a
 * picture nobody approved.
 *
 * WHAT "OFF" MEANS, PRECISELY. The INK & AMBER stone board exactly as it
 * shipped, the classic snake at its shipped sizes, bevels, ink weight and lit
 * toon ramp, and the INK & AMBER cosmetics. Not a degraded composition - the
 * previous one, unchanged, because every 90s value is resolved through a style
 * profile whose `classic` entry holds the shipped numbers verbatim and whose
 * shader patch is a no-op. That is the rollback path, and CI runs it: the flag
 * is in `config/production-public-surface.json`, so the `production` e2e leg
 * arms it `true` and the `rollback` leg arms it `false` - both PINNED, never
 * inferred from an omitted variable (CLAUDE.md).
 *
 * WHAT IS DELIBERATELY NOT BEHIND IT, and why. Three things landed with this
 * package that are true of the product rather than of the composition:
 *
 *   THE TRAY'S FRAME. Its removal is its own owner ruling, and the ruling is
 *   about the TRAY - "i'm not talking about the gameboard here, but about the
 *   tray, to be clear" - which is the same object under either board. Gating
 *   it would mean a rollback re-drew a line the owner had just rejected.
 *
 *   THE HEAD-FACING FIX. A dev fixture declared a heading its own cells
 *   contradicted. That is a bug, and a bug is not a style.
 *
 *   CHAMBER = GAME LAW. The home portrait and the played head resolve one
 *   style through this flag, so they agree on BOTH legs. The chamber's room
 *   stays the near-white paper studio it was ruled to be, twice.
 *
 * ROLLING BACK IS A FORWARD RELEASE. `NEXT_PUBLIC_*` values are inlined at
 * build time, so flag-off is one reviewed deploy rather than a runtime switch.
 * See `docs/ops/RELEASE_RUNBOOK.md`.
 */
export function ninetiesCompositionEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_NINETIES_COMPOSITION
): boolean {
  return value === 'true';
}

/**
 * Build-time client boundary.
 *
 * Read at module evaluation because everything downstream of it is: the style
 * profile, the rounded-box geometry pools and the patched material caches are
 * all module-level constants, and a composition that could change mid-session
 * would mean invalidating every one of them for a switch no player can reach.
 */
export const NINETIES_COMPOSITION_ENABLED = ninetiesCompositionEnabled();
