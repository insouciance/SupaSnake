/**
 * The lineage code (WP-1.08). A snake's card is a pure function of its URL
 * segment, so this file is mostly about what the decoder REFUSES: a card of
 * guesses is worse than a 404.
 */

import { describe, it, expect } from '@jest/globals';
import {
  MAX_LINEAGE_GENES,
  MAX_SNAKE_NAME,
  decodeLineageCode,
  encodeLineageCode,
  lineageGeneNames,
  type LineageCardModel,
} from './lineageCode';
import { GENES } from '@/shared/game/genes';

const VYPER: LineageCardModel = {
  snakeName: 'Vyper',
  dynasty: 'CYBER',
  generation: 4,
  genes: ['slipstream', 'bulk_up'],
};

describe('encodeLineageCode / decodeLineageCode', () => {
  it('round-trips a snake', () => {
    const code = encodeLineageCode(VYPER);
    expect(code).toBe('Vyper~CYBER~4~slipstream%2Cbulk_up');
    expect(decodeLineageCode(code)).toEqual(VYPER);
  });

  it('round-trips a geneless snake', () => {
    const bare: LineageCardModel = {
      snakeName: 'Nameless',
      dynasty: 'PRIMAL',
      generation: 1,
      genes: [],
    };
    expect(decodeLineageCode(encodeLineageCode(bare))).toEqual(bare);
  });

  it('round-trips a name with spaces, unicode and separators in it', () => {
    for (const snakeName of ['Grave Digger', 'Ω Serpent', 'a~b', 'a%20b', 'a&c=1']) {
      const model = { ...VYPER, snakeName };
      const decoded = decodeLineageCode(encodeLineageCode(model));
      expect(decoded?.snakeName).toBe(snakeName);
    }
  });

  it('accepts a segment Next has already percent-decoded once', () => {
    // Route params arrive decoded; the raw form must decode to the same card.
    const raw = encodeLineageCode(VYPER);
    expect(decodeLineageCode(decodeURIComponent(raw))).toEqual(VYPER);
  });

  it('refuses malformed, hostile or truncated codes', () => {
    for (const bad of [
      '',
      'Vyper',
      'Vyper~CYBER',
      'Vyper~CYBER~4',
      'Vyper~CYBER~4~x~y',
      'Vyper~EMBER~4~', // the deprecated dynasty set never resolves
      'Vyper~cyber~4~',
      '~CYBER~4~',
      'Vyper~CYBER~0~',
      'Vyper~CYBER~-1~',
      'Vyper~CYBER~99999~',
      'Vyper~CYBER~4x~',
      '%E0%A4%A~CYBER~4~',
      null,
      undefined,
      42,
      'x'.repeat(500),
    ]) {
      expect(decodeLineageCode(bad)).toBeNull();
    }
  });

  it('drops unknown and duplicated gene ids instead of inventing them', () => {
    const decoded = decodeLineageCode('Vyper~CYBER~4~slipstream%2Cnot_a_gene%2Cslipstream');
    expect(decoded?.genes).toEqual(['slipstream']);
  });

  it('bounds the name and the gene list', () => {
    const long = encodeLineageCode({
      ...VYPER,
      snakeName: 'V'.repeat(80),
      genes: Object.keys(GENES).slice(0, 20) as LineageCardModel['genes'],
    });
    const decoded = decodeLineageCode(long)!;
    expect(decoded.snakeName).toHaveLength(MAX_SNAKE_NAME);
    expect(decoded.genes.length).toBeLessThanOrEqual(MAX_LINEAGE_GENES);
  });

  it('falls back to a usable name rather than emitting an empty field', () => {
    const decoded = decodeLineageCode(
      encodeLineageCode({ ...VYPER, snakeName: '   ' })
    );
    expect(decoded?.snakeName).toBe('Snake');
  });

  it('resolves gene display names', () => {
    expect(lineageGeneNames(VYPER)).toEqual([
      GENES.slipstream.name,
      GENES.bulk_up.name,
    ]);
  });
});
