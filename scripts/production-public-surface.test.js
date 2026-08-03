const {
  PRODUCTION_PUBLIC_FLAGS,
  PRODUCTION_PUBLIC_SURFACE_HASH,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  inspectProductionPublicSurface,
  supabaseProjectRefFromUrl,
} = require('./production-public-surface.cjs');

describe('production public-surface contract', () => {
  function exactEnvironment() {
    return {
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      SUPASNAKE_PUBLIC_SURFACE_HASH: PRODUCTION_PUBLIC_SURFACE_HASH,
      ...Object.fromEntries(PRODUCTION_PUBLIC_FLAGS.map((name) => [name, 'true'])),
    };
  }

  it('has one stable exact contract covering every production-on surface', () => {
    expect(PRODUCTION_PUBLIC_FLAGS).toHaveLength(22);
    expect(PRODUCTION_PUBLIC_FLAGS).toEqual(
      [...PRODUCTION_PUBLIC_FLAGS].sort()
    );
    expect(new Set(PRODUCTION_PUBLIC_FLAGS).size).toBe(
      PRODUCTION_PUBLIC_FLAGS.length
    );
    expect(PRODUCTION_PUBLIC_FLAGS).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_FTUE_V2',
        'NEXT_PUBLIC_GENOME_V2',
        'NEXT_PUBLIC_HUD_COCKPIT_V1',
        'NEXT_PUBLIC_RUN_FLOW_V1',
        'NEXT_PUBLIC_CAREER_SPINE_V1',
        'NEXT_PUBLIC_LADDER_V1',
      ])
    );
    expect(PRODUCTION_PUBLIC_SURFACE_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(PRODUCTION_SUPABASE_PROJECT_REF).toBe('gmpwyzqafoyowndbvlma');
  });

  it('accepts only the exact project, hash, and all enabled flags', () => {
    expect(inspectProductionPublicSurface(exactEnvironment())).toMatchObject({
      healthy: true,
      disabledFlags: [],
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      contractHash: PRODUCTION_PUBLIC_SURFACE_HASH,
    });

    const wrongProject = exactEnvironment();
    wrongProject.NEXT_PUBLIC_SUPABASE_URL = 'https://other.supabase.co';
    expect(inspectProductionPublicSurface(wrongProject).healthy).toBe(false);

    const wrongHash = exactEnvironment();
    wrongHash.SUPASNAKE_PUBLIC_SURFACE_HASH = '0'.repeat(64);
    expect(inspectProductionPublicSurface(wrongHash).healthy).toBe(false);

    const flagOff = exactEnvironment();
    flagOff.NEXT_PUBLIC_LADDER_V1 = 'false';
    expect(inspectProductionPublicSurface(flagOff)).toMatchObject({
      healthy: false,
      disabledFlags: ['NEXT_PUBLIC_LADDER_V1'],
    });
  });

  it('parses only canonical hosted Supabase URLs', () => {
    expect(supabaseProjectRefFromUrl(PRODUCTION_SUPABASE_URL)).toBe(
      PRODUCTION_SUPABASE_PROJECT_REF
    );
    expect(supabaseProjectRefFromUrl(`${PRODUCTION_SUPABASE_URL}/`)).toBe(
      PRODUCTION_SUPABASE_PROJECT_REF
    );
    expect(supabaseProjectRefFromUrl('http://gmpwyzqafoyowndbvlma.supabase.co')).toBeNull();
    expect(supabaseProjectRefFromUrl('https://supabase.co')).toBeNull();
  });
});
