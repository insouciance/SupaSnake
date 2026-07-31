import { createHash } from 'node:crypto';
import manifest from '../../../config/production-public-surface.json';

export const PRODUCTION_PUBLIC_FLAGS = Object.freeze(
  [...manifest.flags].sort()
);
export const PRODUCTION_SUPABASE_PROJECT_REF = manifest.supabaseProjectRef;
export const PRODUCTION_SUPABASE_URL =
  `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;

const canonicalContract = JSON.stringify({
  version: manifest.version,
  supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  flags: PRODUCTION_PUBLIC_FLAGS,
});

export const PRODUCTION_PUBLIC_SURFACE_HASH = createHash('sha256')
  .update(canonicalContract, 'utf8')
  .digest('hex');

export interface ProductionPublicSurfaceInspection {
  healthy: boolean;
  version: number;
  contractHash: string;
  declaredHash: string;
  projectRef: string | null;
  expectedProjectRef: string;
  enabledFlagCount: number;
  expectedFlagCount: number;
  disabledFlags: string[];
}

export function supabaseProjectRefFromUrl(url: string | undefined): string | null {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url?.trim() ?? '');
  return match?.[1] ?? null;
}

export function inspectProductionPublicSurface(
  environment: NodeJS.ProcessEnv
): ProductionPublicSurfaceInspection {
  const disabledFlags = PRODUCTION_PUBLIC_FLAGS.filter(
    (name) => environment[name]?.trim() !== 'true'
  );
  const projectRef = supabaseProjectRefFromUrl(
    environment.NEXT_PUBLIC_SUPABASE_URL
  );
  const declaredHash = environment.SUPASNAKE_PUBLIC_SURFACE_HASH?.trim() ?? '';

  return {
    healthy:
      disabledFlags.length === 0 &&
      projectRef === PRODUCTION_SUPABASE_PROJECT_REF &&
      declaredHash === PRODUCTION_PUBLIC_SURFACE_HASH,
    version: manifest.version,
    contractHash: PRODUCTION_PUBLIC_SURFACE_HASH,
    declaredHash,
    projectRef,
    expectedProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    enabledFlagCount: PRODUCTION_PUBLIC_FLAGS.length - disabledFlags.length,
    expectedFlagCount: PRODUCTION_PUBLIC_FLAGS.length,
    disabledFlags,
  };
}
