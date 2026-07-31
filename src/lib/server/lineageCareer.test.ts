import { readLineageDossiers } from './lineageCareer';

function client(options: { dossierError?: object; specimenError?: object } = {}) {
  return {
    from: jest.fn((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.in = jest.fn(() => chain);
      chain.order = jest.fn(() => chain);
      chain.then = jest.fn((resolve: (value: unknown) => unknown) =>
        resolve(
          table === 'lineage_dossiers'
            ? {
                data: options.dossierError
                  ? null
                  : [
                      {
                        id: 'dossier-1',
                        snake_variant_id: 'variant-1',
                        created_at: '2026-01-01T00:00:00Z',
                        updated_at: '2026-07-30T00:00:00Z',
                        snake_variants: {
                          id: 'variant-1',
                          name: 'PRIMAL SEED',
                          rarity: 'common',
                          dynasties: { name: 'PRIMAL' },
                        },
                      },
                    ],
                error: options.dossierError ?? null,
              }
            : {
                data: options.specimenError
                  ? null
                  : [
                      {
                        specimen_id: 'active-5',
                        dossier_id: 'dossier-1',
                        status: 'active',
                        generation: 5,
                        traits: [],
                        lineage: null,
                        acquired_at: '2026-07-01T00:00:00Z',
                        runs_completed: 10,
                        extractions: 8,
                        best_score: 500,
                        best_yield: 400,
                        highest_energy: 6,
                        clan_depth_delivered: 1200,
                      },
                      {
                        specimen_id: 'active-4',
                        dossier_id: 'dossier-1',
                        status: 'active',
                        generation: 4,
                        traits: [],
                        lineage: null,
                        acquired_at: '2026-06-01T00:00:00Z',
                      },
                      {
                        specimen_id: 'refunded-11',
                        dossier_id: 'dossier-1',
                        status: 'retired_refunded',
                        generation: 11,
                        traits: [],
                        lineage: null,
                        acquired_at: '2026-05-01T00:00:00Z',
                        retired_at: '2026-07-29T00:00:00Z',
                      },
                    ],
                error: options.specimenError ?? null,
              }
        )
      );
      return chain;
    }),
  };
}

describe('lineage dossier projection', () => {
  it('never treats a refunded higher generation as owned or equippable', async () => {
    const result = await readLineageDossiers(client() as never, 'player-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dossier = result.dossiers[0];
    expect(dossier.highestActiveGeneration).toBe(5);
    expect(dossier.specimens.find((snake) => snake.id === 'active-5')).toMatchObject({
      status: 'active',
      owned: true,
      equippable: true,
    });
    expect(dossier.specimens.find((snake) => snake.id === 'active-4')).toMatchObject({
      owned: true,
      equippable: false,
    });
    expect(dossier.specimens.find((snake) => snake.id === 'refunded-11')).toMatchObject({
      status: 'retired_refunded',
      owned: false,
      equippable: false,
      retiredAt: '2026-07-29T00:00:00Z',
    });
  });

  it('degrades cleanly before migration 061', async () => {
    const result = await readLineageDossiers(
      client({ dossierError: { code: '42P01', message: 'lineage_dossiers missing' } }) as never,
      'player-1'
    );
    expect(result).toEqual({ ok: true, available: false, dossiers: [] });
  });

  it('reports a real specimen read failure', async () => {
    const result = await readLineageDossiers(
      client({ specimenError: { code: '08006', message: 'connection failure' } }) as never,
      'player-1'
    );
    expect(result.ok).toBe(false);
  });
});
