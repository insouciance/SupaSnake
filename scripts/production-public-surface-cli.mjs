#!/usr/bin/env node

import surface from './production-public-surface.cjs';

const {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_PROJECT_REF,
} = surface;

const command = process.argv[2];

if (command === 'hash') {
  process.stdout.write(`${PRODUCTION_PUBLIC_SURFACE_HASH}\n`);
} else if (command === 'github-env') {
  for (const name of PRODUCTION_PUBLIC_FLAGS) {
    process.stdout.write(`${name}=true\n`);
  }
  process.stdout.write(
    `SUPASNAKE_PUBLIC_SURFACE_HASH=${PRODUCTION_PUBLIC_SURFACE_HASH}\n`
  );
} else if (command === 'vercel-args') {
  const values = [
    ...PRODUCTION_PUBLIC_FLAGS.map((name) => `${name}=true`),
    `SUPASNAKE_PUBLIC_SURFACE_HASH=${PRODUCTION_PUBLIC_SURFACE_HASH}`,
  ];
  for (const value of values) {
    process.stdout.write(`--build-env\n${value}\n--env\n${value}\n`);
  }
} else if (command === 'json') {
  process.stdout.write(
    `${JSON.stringify({
      version: 1,
      contractHash: PRODUCTION_PUBLIC_SURFACE_HASH,
      supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      flags: PRODUCTION_PUBLIC_FLAGS,
    })}\n`
  );
} else {
  console.error('Usage: production-public-surface-cli.mjs hash|github-env|vercel-args|json');
  process.exitCode = 2;
}
