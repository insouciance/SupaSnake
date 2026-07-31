'use strict';

const { createHash } = require('node:crypto');
const manifest = require('../config/production-public-surface.json');

const PRODUCTION_PUBLIC_FLAGS = Object.freeze([...manifest.flags].sort());
const PRODUCTION_SUPABASE_PROJECT_REF = manifest.supabaseProjectRef;
const PRODUCTION_SUPABASE_URL =
  `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;

const canonicalContract = JSON.stringify({
  version: manifest.version,
  supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  flags: PRODUCTION_PUBLIC_FLAGS,
});
const PRODUCTION_PUBLIC_SURFACE_HASH = createHash('sha256')
  .update(canonicalContract, 'utf8')
  .digest('hex');

function supabaseProjectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(
    typeof url === 'string' ? url.trim() : ''
  );
  return match?.[1] ?? null;
}

function inspectProductionPublicSurface(environment) {
  const enabledFlags = PRODUCTION_PUBLIC_FLAGS.filter(
    (name) => environment[name]?.trim() === 'true'
  );
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
    enabledFlags,
    disabledFlags,
  };
}

module.exports = {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  inspectProductionPublicSurface,
  supabaseProjectRefFromUrl,
};
