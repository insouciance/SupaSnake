/**
 * The wardrobe's contracts.
 *
 * Two of these are constitutional and must not be relaxed without an
 * amendment:
 *
 *   R7 — commerce stays in its district. A supporter-only item the player does
 *   not own is VISIBLE and MARKED, its tap NAVIGATES to /shop, and this
 *   surface never renders a price, a currency, or a purchase control. The test
 *   asserts the absence, because absence is the whole rule.
 *
 *   §10.4 / R6 — an item the player has not EARNED is locked and inert. It is
 *   not routed to commerce, because earned things are not for sale, and a
 *   "buy" affordance on one would be the product contradicting itself.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';

import { CosmeticsMenu } from '@/components/home/CosmeticsMenu';
import type {
  SnakeCosmeticCatalog,
  SnakeCosmeticItem,
} from '@/lib/cosmetics/snakeCosmetics';
import { parseSnakeLoadout } from '@/lib/cosmetics/snakeCosmetics';

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

function catalog(items: SnakeCosmeticItem[]): SnakeCosmeticCatalog {
  return {
    live: true,
    loadout: parseSnakeLoadout({}),
    items,
  };
}

function renderMenu(
  items: SnakeCosmeticItem[],
  over: Partial<React.ComponentProps<typeof CosmeticsMenu>> = {}
) {
  const props = {
    catalog: catalog(items),
    onEquip: jest.fn(),
    onPreview: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  render(<CosmeticsMenu {...props} />);
  return props;
}

describe('CosmeticsMenu — categories', () => {
  it('shows one category per snake slot, including the empty one', () => {
    renderMenu([item()]);
    for (const label of ['Face', 'Head', 'Food']) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('opens on the first category that has something in it', () => {
    // Landing on an empty shelf makes the whole tray look broken.
    renderMenu([item({ id: 'crown_braids_amber', slot: 'crown', name: 'Amber Braids' })]);
    expect(screen.getByTestId('cosmetics-category-crown')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('cosmetic-crown_braids_amber')).toBeInTheDocument();
  });

  it('shows one shelf at a time', () => {
    renderMenu([
      item(),
      item({ id: 'crown_braids_amber', slot: 'crown', name: 'Amber Braids' }),
    ]);
    expect(screen.getByTestId('cosmetic-face_shades_deadpan')).toBeInTheDocument();
    expect(screen.queryByTestId('cosmetic-crown_braids_amber')).toBeNull();

    fireEvent.click(screen.getByTestId('cosmetics-category-crown'));
    expect(screen.getByTestId('cosmetic-crown_braids_amber')).toBeInTheDocument();
    expect(screen.queryByTestId('cosmetic-face_shades_deadpan')).toBeNull();
  });

  it('says an empty category is empty rather than hiding it', () => {
    renderMenu([item()]);
    fireEvent.click(screen.getByTestId('cosmetics-category-food_skin'));
    const shelf = screen.getByTestId('cosmetics-shelf');
    expect(within(shelf).getByText(/nothing here yet/i)).toBeInTheDocument();
  });
});

describe('CosmeticsMenu — wearing things', () => {
  it('equips an owned item on tap', () => {
    const owned = item();
    const { onEquip } = renderMenu([owned]);
    fireEvent.click(screen.getByTestId('cosmetic-face_shades_deadpan'));
    expect(onEquip).toHaveBeenCalledWith(owned);
  });

  it('takes off what is already on, from the same control', () => {
    const worn = item({ equipped: true });
    const { onEquip } = renderMenu([worn]);
    const chip = screen.getByTestId('cosmetic-face_shades_deadpan');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('data-action', 'unequip');
    fireEvent.click(chip);
    expect(onEquip).toHaveBeenCalledWith(worn);
  });

  it('previews on hover and drops the preview on leave', () => {
    const owned = item();
    const { onPreview } = renderMenu([owned]);
    const chip = screen.getByTestId('cosmetic-face_shades_deadpan');
    fireEvent.mouseEnter(chip);
    expect(onPreview).toHaveBeenCalledWith(owned);
    fireEvent.focus(chip);
    expect(onPreview).toHaveBeenCalledWith(owned);
    fireEvent.blur(chip);
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('refuses every control while a write is in flight', () => {
    renderMenu([item()], { busy: true });
    expect(screen.getByTestId('cosmetic-face_shades_deadpan')).toBeDisabled();
  });

  it('says why the server refused, in words', () => {
    renderMenu([item()], { error: 'You do not have that one yet.' });
    expect(screen.getByTestId('cosmetics-error')).toHaveTextContent(
      'You do not have that one yet.'
    );
  });

  it('closes on Done', () => {
    const { onClose } = renderMenu([item()]);
    fireEvent.click(screen.getByTestId('cosmetics-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CosmeticsMenu — commerce stays in its district (R7)', () => {
  const supporter = item({
    id: 'face_shades_gilded',
    name: 'Gilded Shades',
    owned: false,
    supporterOnly: true,
  });

  it('shows a supporter item rather than hiding it, and marks it', () => {
    renderMenu([supporter]);
    const chip = screen.getByTestId('cosmetic-face_shades_gilded');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/supporters/i);
  });

  it('routes the tap to the shop by NAVIGATION, never by transaction', () => {
    const { onEquip } = renderMenu([supporter]);
    const chip = screen.getByTestId('cosmetic-face_shades_gilded');

    // A link, so the platform knows it is navigation and the store is
    // "reached by navigation, never by interruption".
    expect(chip.tagName).toBe('A');
    expect(chip).toHaveAttribute('href', '/shop');
    expect(chip).toHaveAttribute('data-action', 'shop');

    fireEvent.click(chip);
    expect(onEquip).not.toHaveBeenCalled();
  });

  it('never renders a price, a currency, or a purchase control', () => {
    renderMenu([supporter]);
    const menu = screen.getByTestId('cosmetics-menu');
    expect(menu.textContent ?? '').not.toMatch(/[€$£]|\d+[.,]\d{2}|buy|purchase|checkout|subscribe/i);
    expect(within(menu).queryByRole('button', { name: /buy|purchase|upgrade/i })).toBeNull();
  });

  it('does not preview a supporter item the player does not own', () => {
    // The chamber must not show a hat the equip call would refuse.
    const { onPreview } = renderMenu([supporter]);
    fireEvent.mouseEnter(screen.getByTestId('cosmetic-face_shades_gilded'));
    // The menu still reports the hover; the hook is what refuses to paint it,
    // and `snakeCosmetics.test.ts` pins that. What must NOT happen here is an
    // equip.
    expect(onPreview).toHaveBeenCalled();
  });
});

describe('CosmeticsMenu — earned things are not for sale (§10.4, R6)', () => {
  const unearned = item({
    id: 'face_shades_rung',
    name: 'Rung Shades',
    owned: false,
    supporterOnly: false,
  });

  it('locks an un-earned item inert instead of offering to sell it', () => {
    const { onEquip } = renderMenu([unearned]);
    const chip = screen.getByTestId('cosmetic-face_shades_rung');
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('data-action', 'locked');
    expect(chip).toHaveTextContent(/locked/i);
    expect(chip).not.toHaveAttribute('href');
    fireEvent.click(chip);
    expect(onEquip).not.toHaveBeenCalled();
  });
});
