import { playerEvolutionEnabled } from './playerEvolution';

describe('Player Evolution curriculum rollout flag', () => {
  const original = process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1;
    } else {
      process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 = original;
    }
    jest.resetModules();
  });

  function readBuildFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1;
    } else {
      process.env.NEXT_PUBLIC_PLAYER_EVOLUTION_V1 = value;
    }
    jest.resetModules();
    return require('./playerEvolution').PLAYER_EVOLUTION_ENABLED as boolean;
  }

  it('keeps both direct and build-time evaluation opt-in', () => {
    expect(playerEvolutionEnabled('true')).toBe(true);
    expect(playerEvolutionEnabled(undefined)).toBe(false);
    expect(readBuildFlag('true')).toBe(true);
    expect(readBuildFlag()).toBe(false);
  });

  it.each(['false', 'TRUE', '1', ' true '])(
    'rejects the non-exact value %s',
    (value) => {
      expect(playerEvolutionEnabled(value)).toBe(false);
      expect(readBuildFlag(value)).toBe(false);
    }
  );

  it('is the 23rd flag of the production public surface (WP-F)', () => {
    // WP-B shipped this flag absent from the manifest and asserted the
    // absence. WP-F is the rollout package, so the assertion inverts rather
    // than disappears: the manifest is the ONLY place a production-on
    // NEXT_PUBLIC_* surface is declared, `production-env-validation.cjs`
    // splices the same list into its required variables, and the deploy
    // workflow injects it at build and runtime. A flag that is not here is
    // off in production no matter what any document claims.
    const manifest = require('../../../config/production-public-surface.json') as {
      flags: string[];
    };
    expect(manifest.flags).toContain('NEXT_PUBLIC_PLAYER_EVOLUTION_V1');
    expect(manifest.flags).toHaveLength(23);
  });

  it('is required of a production environment and folded into the hash', () => {
    // Two mechanical consequences of the line above, checked rather than
    // assumed: the env validator derives its required list from the manifest
    // (so no separate edit was needed — §13 decision 17), and the release
    // contract hash is a function of the flag list, so adding one flag is a
    // reviewed hash change, never a silent drift.
    const {
      PRODUCTION_PUBLIC_FLAGS,
      PRODUCTION_PUBLIC_SURFACE_HASH,
    } = require('../../../scripts/production-public-surface.cjs') as {
      PRODUCTION_PUBLIC_FLAGS: string[];
      PRODUCTION_PUBLIC_SURFACE_HASH: string;
    };
    const {
      REQUIRED_VARIABLES,
    } = require('../../../scripts/production-env-validation.cjs') as {
      REQUIRED_VARIABLES: string[];
    };

    expect(PRODUCTION_PUBLIC_FLAGS).toContain('NEXT_PUBLIC_PLAYER_EVOLUTION_V1');
    expect(REQUIRED_VARIABLES).toContain('NEXT_PUBLIC_PLAYER_EVOLUTION_V1');
    expect(PRODUCTION_PUBLIC_SURFACE_HASH).toBe(
      'ac678998f5c58d0a1cab711e759271f426d2fa5b09a503bf20094406ffd8e2be'
    );
  });
});
