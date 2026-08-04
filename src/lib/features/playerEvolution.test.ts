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

  it('is absent from the production public surface until WP-F adds it', () => {
    // WP-F owns the manifest-hash change, the four-shape e2e matrix, and the
    // rollout record. Until then the flag is unset in every environment, so
    // every run composes the complete legal Dynasty roster.
    const manifest = require('../../../config/production-public-surface.json') as {
      flags: string[];
    };
    expect(manifest.flags).not.toContain('NEXT_PUBLIC_PLAYER_EVOLUTION_V1');
    expect(manifest.flags).toHaveLength(22);
  });
});
