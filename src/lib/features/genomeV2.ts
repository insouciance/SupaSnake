/** Genome v2 is opt-in. Missing, mixed-case, or truthy-looking values are OFF. */
export function genomeV2Enabled(
  value: string | undefined = process.env.NEXT_PUBLIC_GENOME_V2
): boolean {
  return value === 'true';
}

/** Build-time client boundary. Server routes call `genomeV2Enabled` directly. */
export const GENOME_V2_ENABLED = genomeV2Enabled();
