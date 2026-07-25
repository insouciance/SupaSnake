import {
  GENOME_CARD_SHARE_URL,
  buildGenomeCardModel,
  genomeCardCascadeRows,
  genomeCardFilename,
  genomeCardShareText,
  shareGenomeCard,
  type GenomeCardModel,
} from './genomeCardImage';

const model: GenomeCardModel = {
  snakeName: 'Void Dancer!', dynasty: 'COSMIC', generation: 3,
  score: 4200, foods: 80, extracted: true,
  genes: [], splices: [], milestones: [], allIn: false,
  cascade: { raw: 1000, genome: 1250, outcome: 1750, streak: 1.25, setBonus: 1.1, duel: 1.05, total: 2526 },
};

describe('Genome Card export model', () => {
  it('builds the documented payout cascade in order', () => {
    const rows = genomeCardCascadeRows(model);
    expect(rows.map((row) => row.label)).toEqual([
      'RAW', 'GENOME', 'BANK + INFUSES', 'STREAK', 'SET', 'DUEL',
    ]);
    expect(rows[1].factor).toBe(1.25);
    expect(rows[2].factor).toBe(1.4);
    expect(rows[5].value).toBe(2526);
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

/**
 * GT §8 named this the highest-leverage one-line defect in the repository:
 * the shipped card reached players as a polished 1200x630 PNG with no way
 * back to the game. Constitution Rule 14 makes carrying the link law.
 */
/** A 2D context that accepts every call and property jsdom cannot provide. */
function recordingContext(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'createLinearGradient' || property === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (property === 'measureText') return () => ({ width: 10 });
        return () => undefined;
      },
      set: () => true,
    }
  ) as Record<string, unknown>;
}

describe('Genome Card share payload — Rule 14', () => {
  const originalNavigator = global.navigator;
  const share = jest.fn().mockResolvedValue(undefined);
  const canShare = jest.fn().mockReturnValue(true);

  beforeEach(() => {
    share.mockClear();
    canShare.mockClear().mockReturnValue(true);
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { share, canShare },
    });
    // jsdom has no 2D canvas. The drawing itself is not the subject here, so
    // the real draw runs against a permissive stub and the export yields a
    // real Blob — the payload is what these tests are about.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(recordingContext() as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(new Blob(['png'])));
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    jest.restoreAllMocks();
  });

  it('points at the canonical origin, never a deployment origin', () => {
    expect(GENOME_CARD_SHARE_URL).toBe('https://supasnake.com');
  });

  it('ends the share text with the URL on its own line', () => {
    const text = genomeCardShareText(model);
    expect(text.split('\n')).toEqual([
      '2,526 DNA · 0 genes',
      'https://supasnake.com',
    ]);
  });

  it('passes a url to the share sheet', async () => {
    await expect(shareGenomeCard(model)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0];
    expect(payload.url).toBe(GENOME_CARD_SHARE_URL);
  });

  it('repeats the URL in the text, for platforms that drop url with files', async () => {
    await shareGenomeCard(model);
    const payload = share.mock.calls[0][0];
    expect(payload.text).toContain(GENOME_CARD_SHARE_URL);
    expect(payload.files).toHaveLength(1);
  });

  it('still exports the PNG when the share sheet is unavailable', async () => {
    canShare.mockReturnValue(false);
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    URL.createObjectURL = jest.fn().mockReturnValue('blob:card');
    URL.revokeObjectURL = jest.fn();

    await expect(shareGenomeCard(model)).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
});
