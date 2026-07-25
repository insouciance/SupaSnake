import {
  buildGenomeCardModel,
  genomeCardCascadeRows,
  genomeCardFilename,
  type GenomeCardModel,
} from './genomeCardImage';

const model: GenomeCardModel = {
  snakeName: 'Void Dancer!', dynasty: 'COSMIC', generation: 3,
  score: 4200, foods: 80, extracted: true,
  genes: [], splices: [], milestones: [], allIn: false,
  cascade: { raw: 1000, genome: 1250, outcome: 1750, total: 1750 },
};

describe('Genome Card export model', () => {
  it('builds the settled payout cascade in order, and stops at the outcome', () => {
    // WP-0.02: raw -> genome -> outcome multiplier. The STREAK / SET / DUEL
    // rows are gone because the factors they displayed are gone.
    const rows = genomeCardCascadeRows(model);
    expect(rows.map((row) => row.label)).toEqual([
      'RAW', 'GENOME', 'BANK + INFUSES',
    ]);
    expect(rows[1].factor).toBe(1.25);
    expect(rows[2].factor).toBe(1.4);
    expect(rows[2].value).toBe(1750);
  });

  it('shows the harvest factor only when a lean run paid less than it was worth', () => {
    const lean = { ...model, cascade: { ...model.cascade, total: 875 } };
    const rows = genomeCardCascadeRows(lean);
    expect(rows.map((row) => row.label)).toEqual([
      'RAW', 'GENOME', 'BANK + INFUSES', 'HARVEST',
    ]);
    expect(rows[3].value).toBe(875);
    expect(rows[3].factor).toBe(0.5);
  });

  it('never renders a streak, set-bonus or clan-duel factor again', () => {
    const labels = genomeCardCascadeRows(model).map((row) => row.label);
    expect(labels).not.toContain('STREAK');
    expect(labels).not.toContain('SET');
    expect(labels).not.toContain('DUEL');
  });

  it('creates a stable safe PNG filename', () => {
    expect(genomeCardFilename(model)).toBe('supasnake-genome-void-dancer-4200.png');
  });

  it('builds only from the server-accepted genome and payout anchors', () => {
    const built = buildGenomeCardModel({
      genome: {
        picks: [{ id: 'gold_trail', atFood: 10 }],
        splices: [{ id: 'splice_dragon_hoard', atFood: 20 }],
        expressions: { AURUM: 20, NOPE: 1 },
        apexes: { AURUM: 30 },
        infuses: [{ atFood: 15 }, { atFood: 25 }, { atFood: 40 }],
      },
      validation: {
        genelessRawDna: 100,
        rawDna: 140,
        baseDna: 210,
        adjustedDna: 254,
        extracted: true,
      },
      // A stale client may still send the old breakdown. It must be inert.
      dnaMultiplier: { streak: 1.1, setBonus: 1.05, clanDuel: 1.05 },
    }, {
      snakeName: 'Spark', dynasty: 'CYBER', generation: 2, score: 900, foods: 44,
    });

    expect(built).toMatchObject({
      genes: [{ id: 'gold_trail', name: 'Gold Trail' }],
      splices: [{ id: 'splice_dragon_hoard' }],
      cascade: { raw: 100, genome: 140, outcome: 210, total: 254 },
      allIn: true,
    });
    expect(built?.milestones).toHaveLength(2);
    expect(buildGenomeCardModel({ genome: {}, validation: {} }, {
      snakeName: 'x', dynasty: 'CYBER', generation: 1, score: 0, foods: 0,
    })).toBeNull();
  });
});
