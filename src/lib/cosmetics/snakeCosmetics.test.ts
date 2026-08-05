/**
 * The loadout's shapes, and the tolerance that keeps them safe.
 *
 * Two premises are load-bearing here and neither is obvious from the types:
 *
 *   1. Every snake slot is ALWAYS present in a parsed loadout. An absent slot
 *      and an unequipped slot are one fact, so the renderer never has to ask
 *      which kind of nothing it received.
 *   2. Unknown data degrades to "nothing worn", never to a throw. The catalog
 *      is data and the renderer is code and they deploy independently — a
 *      cosmetic added by a later migration must not break a tab that has not
 *      reloaded (doctrine FM-12).
 */

import {
  EMPTY_SNAKE_LOADOUT,
  EMPTY_SNAKE_COSMETIC_CATALOG,
  parseSnakeLoadout,
  parseSnakeCosmeticItems,
  parseSnakeCosmeticCatalog,
  previewLoadout,
  snakeCosmeticAction,
  type SnakeCosmeticItem,
} from '@/lib/cosmetics/snakeCosmetics';
import { SNAKE_COSMETIC_SLOTS } from '@/shared/game/cosmeticSlots';

function item(over: Partial<SnakeCosmeticItem> = {}): SnakeCosmeticItem {
  return {
    id: 'face_shades_deadpan',
    slot: 'face',
    component: 'shades_deadpan',
    name: 'Deadpan Shades',
    rarity: 'uncommon',
    supporterOnly: false,
    owned: true,
    equipped: false,
    ...over,
  };
}

describe('parseSnakeLoadout', () => {
  it('always answers for every snake slot, however little it was given', () => {
    for (const value of [null, undefined, 42, 'face', [], {}]) {
      const loadout = parseSnakeLoadout(value);
      expect(Object.keys(loadout).sort()).toEqual([...SNAKE_COSMETIC_SLOTS].sort());
      for (const slot of SNAKE_COSMETIC_SLOTS) {
        expect(loadout[slot]).toBeNull();
      }
    }
  });

  it('reads the component key the server stored', () => {
    const loadout = parseSnakeLoadout({
      face: 'shades_deadpan',
      crown: 'braids_amber',
      food_skin: null,
    });
    expect(loadout.face).toBe('shades_deadpan');
    expect(loadout.crown).toBe('braids_amber');
    expect(loadout.food_skin).toBeNull();
  });

  it('treats an empty string as nothing worn, not as a component named ""', () => {
    expect(parseSnakeLoadout({ face: '' }).face).toBeNull();
  });

  it('ignores slots it does not know, rather than carrying them forward', () => {
    const loadout = parseSnakeLoadout({ face: 'shades_deadpan', wings: 'x' });
    expect(loadout).not.toHaveProperty('wings');
    expect(loadout.face).toBe('shades_deadpan');
  });

  it('keeps an unknown COMPONENT, because the renderer is what decides', () => {
    // Tolerance lives at the render seam, not here: a future component key is
    // legitimate data, and dropping it in the parser would make a newer
    // catalog silently unequip itself on an older client.
    expect(parseSnakeLoadout({ face: 'shades_from_2027' }).face).toBe(
      'shades_from_2027'
    );
  });
});

describe('parseSnakeCosmeticItems', () => {
  it('drops rows that could not be rendered into a working control', () => {
    const items = parseSnakeCosmeticItems([
      { id: 'face_shades_deadpan', slot: 'face' },
      { id: '', slot: 'face' }, // no id: nothing to equip
      { slot: 'face' }, // no id at all
      { id: 'x', slot: 'wings' }, // a slot no category shows
      { id: 'y' }, // no slot
      null,
      'nonsense',
    ]);
    expect(items.map((entry) => entry.id)).toEqual(['face_shades_deadpan']);
  });

  it('is empty for anything that is not an array', () => {
    for (const value of [null, undefined, {}, 'items', 7]) {
      expect(parseSnakeCosmeticItems(value)).toEqual([]);
    }
  });

  it('falls back to the id for a nameless row rather than showing a blank chip', () => {
    const [entry] = parseSnakeCosmeticItems([
      { id: 'crown_braids_amber', slot: 'crown' },
    ]);
    expect(entry.name).toBe('crown_braids_amber');
    expect(entry.rarity).toBe('common');
  });

  it('treats every boolean as false unless the server said true', () => {
    const [entry] = parseSnakeCosmeticItems([
      {
        id: 'face_shades_deadpan',
        slot: 'face',
        owned: 'yes',
        equipped: 1,
        supporterOnly: 'true',
      },
    ]);
    // A truthy string is not a grant. Anything but `true` is not ownership.
    expect(entry.owned).toBe(false);
    expect(entry.equipped).toBe(false);
    expect(entry.supporterOnly).toBe(false);
  });
});

describe('parseSnakeCosmeticCatalog', () => {
  it('is not live when there was no payload', () => {
    expect(parseSnakeCosmeticCatalog(null)).toEqual(EMPTY_SNAKE_COSMETIC_CATALOG);
    expect(EMPTY_SNAKE_COSMETIC_CATALOG.live).toBe(false);
    expect(EMPTY_SNAKE_COSMETIC_CATALOG.loadout).toEqual(EMPTY_SNAKE_LOADOUT);
  });

  it('is live the moment the server answered, even with an empty catalog', () => {
    const catalog = parseSnakeCosmeticCatalog({ loadout: {}, items: [] });
    expect(catalog.live).toBe(true);
    expect(catalog.items).toEqual([]);
  });
});

describe('snakeCosmeticAction', () => {
  it('offers to take off what is already on', () => {
    expect(snakeCosmeticAction(item({ owned: true, equipped: true }))).toBe(
      'unequip'
    );
  });

  it('offers to put on what is owned', () => {
    expect(snakeCosmeticAction(item({ owned: true, equipped: false }))).toBe(
      'equip'
    );
  });

  it('sends an un-owned supporter item to the store and nowhere else', () => {
    expect(
      snakeCosmeticAction(item({ owned: false, supporterOnly: true }))
    ).toBe('shop');
  });

  it('marks an un-owned earned item locked, never as something to buy', () => {
    // Constitution §10.4: variants and earned items are never sold. An item
    // the player has not earned must not route to commerce.
    expect(
      snakeCosmeticAction(item({ owned: false, supporterOnly: false }))
    ).toBe('locked');
  });

  it('never routes an OWNED supporter item to the store', () => {
    // §10.2 lapse contract / R6: what you were granted, you keep and you
    // wear. A lapsed Keeper must not be asked to buy their own hat back.
    expect(
      snakeCosmeticAction(item({ owned: true, supporterOnly: true, equipped: false }))
    ).toBe('equip');
    expect(
      snakeCosmeticAction(item({ owned: true, supporterOnly: true, equipped: true }))
    ).toBe('unequip');
  });
});

describe('previewLoadout', () => {
  const base = parseSnakeLoadout({ face: null, crown: 'braids_amber' });

  it('shows the item in its own slot and leaves the others alone', () => {
    const next = previewLoadout(base, item({ owned: true }));
    expect(next.face).toBe('shades_deadpan');
    expect(next.crown).toBe('braids_amber');
  });

  it('shows the slot empty when previewing a take-off', () => {
    const next = previewLoadout(
      base,
      item({ slot: 'crown', component: 'braids_amber', owned: true, equipped: true })
    );
    expect(next.crown).toBeNull();
  });

  it('refuses to preview anything the player could not actually put on', () => {
    // Painting a locked item on the snake would be the menu promising what
    // the equip call is about to refuse.
    for (const locked of [
      item({ owned: false, supporterOnly: true }),
      item({ owned: false, supporterOnly: false }),
    ]) {
      expect(previewLoadout(base, locked)).toBe(base);
    }
  });

  it('does not mutate the loadout it was given', () => {
    const before = { ...base };
    previewLoadout(base, item({ owned: true }));
    expect({ ...base }).toEqual(before);
  });
});
