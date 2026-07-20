/**
 * Splices - fusion derivation. Splices are derived, never claimed: the
 * fusion function must be deterministic, order-stable, and identical on
 * client and server.
 */

import type { GenePick } from '@/shared/game/genes';
import {
  SPLICES,
  SPLICE_IDS,
  fusePicks,
  fusedSlotCount,
  isSpliceId,
  spliceForPair,
  spliceStrains,
} from '@/shared/game/splices';

describe('splice catalog', () => {
  it('has 10 launch splices with distinct parent pairs', () => {
    expect(SPLICE_IDS.length).toBe(10);
    const keys = new Set(
      SPLICE_IDS.map((id) => [...SPLICES[id].parents].sort().join('|'))
    );
    expect(keys.size).toBe(10);
  });

  it('spliceForPair is order-free', () => {
    expect(spliceForPair('gold_trail', 'compound_interest')).toBe(
      'splice_dragon_hoard'
    );
    expect(spliceForPair('compound_interest', 'gold_trail')).toBe(
      'splice_dragon_hoard'
    );
    expect(spliceForPair('gold_trail', 'overgrowth')).toBeNull();
  });

  it('splice strains = union of both parents', () => {
    expect(spliceStrains('splice_dragon_hoard')).toEqual(['AURUM']);
    expect(spliceStrains('splice_gravity_bubble').sort()).toEqual([
      'FLUX',
      'VOLT',
    ]);
    expect(spliceStrains('splice_all_in').sort()).toEqual(['AURUM', 'UMBRA']);
  });

  it('isSpliceId rejects gene ids', () => {
    expect(isSpliceId('splice_regenesis')).toBe(true);
    expect(isSpliceId('gold_trail')).toBe(false);
  });
});

describe('fusePicks', () => {
  it('fuses on the second parent pick, at the second pick atFood', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 },
      { id: 'wall_rush', atFood: 25 },
      { id: 'compound_interest', atFood: 40 },
    ];
    const view = fusePicks(picks);
    expect(view.loose.map((p) => p.id)).toEqual(['wall_rush']);
    expect(view.splices.length).toBe(1);
    expect(view.splices[0].spliceId).toBe('splice_dragon_hoard');
    expect(view.splices[0].atFood).toBe(40);
    expect(view.splices[0].parents[0].atFood).toBe(10);
    expect(fusedSlotCount(view)).toBe(2);
  });

  it('fuses with the EARLIEST-held eligible partner (overlap resolution)', () => {
    // mirror_wager pairs with both phoenix (Styx) and compound_interest
    // (All In). Held first: compound_interest -> All In wins.
    const picks: GenePick[] = [
      { id: 'compound_interest', atFood: 10 },
      { id: 'phoenix', atFood: 20 },
      { id: 'mirror_wager', atFood: 30 },
    ];
    const view = fusePicks(picks);
    expect(view.splices[0].spliceId).toBe('splice_all_in');
    expect(view.loose.map((p) => p.id)).toEqual(['phoenix']);
  });

  it('a fused gene cannot fuse again (no chain fusion)', () => {
    // gold_trail fuses into Dragon Hoard; a later afterburner must NOT
    // form Comet Tail with the consumed gold_trail.
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 10 },
      { id: 'compound_interest', atFood: 20 },
      { id: 'afterburner', atFood: 30 },
    ];
    const view = fusePicks(picks);
    expect(view.splices.length).toBe(1);
    expect(view.splices[0].spliceId).toBe('splice_dragon_hoard');
    expect(view.loose.map((p) => p.id)).toEqual(['afterburner']);
  });

  it('supports two independent fusions in one run', () => {
    const picks: GenePick[] = [
      { id: 'gold_trail', atFood: 5 },
      { id: 'afterburner', atFood: 15 }, // -> Comet Tail
      { id: 'shed', atFood: 25 },
      { id: 'phoenix', atFood: 35 }, // -> Molted Rebirth
    ];
    const view = fusePicks(picks);
    expect(view.splices.map((s) => s.spliceId)).toEqual([
      'splice_comet_tail',
      'splice_molted_rebirth',
    ]);
    expect(view.loose).toEqual([]);
    expect(fusedSlotCount(view)).toBe(2);
  });

  it('is deterministic and does not mutate its input', () => {
    const picks: GenePick[] = [
      { id: 'time_dilation', atFood: 8 },
      { id: 'magnet_pulse', atFood: 22 },
    ];
    const copy = picks.map((p) => ({ ...p }));
    const a = fusePicks(picks);
    const b = fusePicks(picks);
    expect(a).toEqual(b);
    expect(picks).toEqual(copy);
    expect(a.splices[0].spliceId).toBe('splice_gravity_bubble');
  });
});
