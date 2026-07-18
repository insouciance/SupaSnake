/**
 * PlayerCard tests (Player Identity v1 section 4) - the three render
 * variants, the generated-name state with its self-only claim
 * affordance, the founder marker, badges (max 3 worn), clan tag, and
 * the mastery-tiered avatar frame.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PlayerCard, frameTierForLevel, bannerBackground } from './PlayerCard';
import type { PlayerIdentity } from '@/lib/identity/types';

function identity(overrides: Partial<PlayerIdentity> = {}): PlayerIdentity {
  return {
    playerId: 'player-1',
    userId: 'user-1',
    handle: 'Souci',
    displayHandle: 'Souci',
    isGenerated: false,
    isFounder: false,
    title: 'Solstice Sovereign',
    bannerId: 'solstice_banner',
    bannerRender: { kind: 'gradient', from: '#7c2d12', to: '#facc15' },
    badges: [
      { id: 'badge_founder', name: 'Founding Handler', rarity: 'legendary' },
      { id: 'solstice_badge', name: 'Solstice Badge', rarity: 'rare' },
    ],
    avatar: {
      variantId: 'variant-1',
      variantName: 'PRIMAL WARDEN',
      rarity: 'rare',
      dynasty: 'PRIMAL',
      generation: 8,
    },
    clanTag: 'FANG',
    clanName: 'Fang Dynasty',
    mastery: { PRIMAL: 7, CYBER: 2 },
    legacyScore: 0,
    ...overrides,
  };
}

describe('PlayerCard', () => {
  describe('row variant', () => {
    it('renders the one-line row: avatar chip, handle, title, clan tag, top badge', () => {
      render(<PlayerCard identity={identity()} variant="row" />);
      const card = screen.getByTestId('player-card');
      expect(card).toHaveAttribute('data-variant', 'row');
      expect(screen.getByTestId('player-card-handle')).toHaveTextContent('Souci');
      expect(screen.getByTestId('player-card-title')).toHaveTextContent('Solstice Sovereign');
      expect(screen.getByTestId('player-card-clan')).toHaveTextContent('[FANG]');
      expect(screen.getByTestId('player-card-avatar')).toBeInTheDocument();
      // Only the TOP badge on a row
      expect(screen.getAllByTestId('player-card-badge')).toHaveLength(1);
      expect(screen.getByTestId('player-card-badge')).toHaveTextContent('Founding Handler');
    });
  });

  describe('card variant', () => {
    it('renders banner backdrop, badges (max 3), and mastery pips', () => {
      render(<PlayerCard identity={identity()} variant="card" />);
      expect(screen.getByTestId('player-card')).toHaveAttribute('data-variant', 'card');
      expect(screen.getByTestId('player-card-banner')).toHaveStyle({
        background: 'linear-gradient(135deg, #7c2d12 0%, #facc15 100%)',
      });
      expect(screen.getAllByTestId('player-card-badge')).toHaveLength(2);
      expect(screen.getByTestId('player-card-mastery')).toHaveTextContent('P7');
      expect(screen.getByTestId('player-card-mastery')).toHaveTextContent('C2');
    });

    it('never renders more than 3 badges (the curation cap)', () => {
      const badges = Array.from({ length: 5 }, (_, i) => ({
        id: `badge-${i}`,
        name: `Badge ${i}`,
        rarity: 'rare',
      }));
      render(<PlayerCard identity={identity({ badges })} variant="card" />);
      expect(screen.getAllByTestId('player-card-badge')).toHaveLength(3);
    });
  });

  describe('full variant', () => {
    it('adds the founder detail line for founders', () => {
      render(<PlayerCard identity={identity({ isFounder: true })} variant="full" />);
      expect(screen.getByTestId('player-card')).toHaveAttribute('data-variant', 'full');
      expect(screen.getByTestId('player-card-founder')).toHaveTextContent('Founding Handler');
    });

    it('shows no founder line for non-founders', () => {
      render(<PlayerCard identity={identity({ isFounder: false })} variant="full" />);
      expect(screen.queryByTestId('player-card-founder')).not.toBeInTheDocument();
    });

    it('shows the Legacy Score on the full card (section 6.2)', () => {
      render(<PlayerCard identity={identity({ legacyScore: 1230 })} variant="full" />);
      expect(screen.getByTestId('player-card-legacy')).toHaveTextContent('1,230');
    });

    it('hides the Legacy Score at 0 (empty-state rule: never a 0-count)', () => {
      render(<PlayerCard identity={identity({ legacyScore: 0 })} variant="full" />);
      expect(screen.queryByTestId('player-card-legacy')).not.toBeInTheDocument();
    });

    it('keeps the Legacy Score off the card/row variants (full only)', () => {
      render(<PlayerCard identity={identity({ legacyScore: 1230 })} variant="card" />);
      expect(screen.queryByTestId('player-card-legacy')).not.toBeInTheDocument();
    });
  });

  describe('generated-name state (section 3.2/3.3)', () => {
    const generated = identity({
      handle: null,
      displayHandle: 'handler-0417',
      isGenerated: true,
      title: null,
    });

    it('renders the derived name muted with a claim affordance for self', () => {
      const onClaim = jest.fn();
      render(
        <PlayerCard identity={generated} variant="card" isSelf onClaim={onClaim} />
      );
      expect(screen.getByTestId('player-card-handle')).toHaveTextContent('handler-0417');
      expect(screen.getByTestId('player-card-handle')).toHaveClass('text-beige/50');
      fireEvent.click(screen.getByTestId('player-card-claim'));
      expect(onClaim).toHaveBeenCalledTimes(1);
    });

    it('never offers the claim on someone else\'s card', () => {
      render(<PlayerCard identity={generated} variant="card" onClaim={jest.fn()} />);
      expect(screen.queryByTestId('player-card-claim')).not.toBeInTheDocument();
    });

    it('never offers the claim once a handle exists', () => {
      render(
        <PlayerCard identity={identity()} variant="card" isSelf onClaim={jest.fn()} />
      );
      expect(screen.queryByTestId('player-card-claim')).not.toBeInTheDocument();
    });
  });

  describe('avatar frame (section 4.1 mastery tiers)', () => {
    it('maps mastery levels to frame treatments', () => {
      expect(frameTierForLevel(0)).toBe('plain');
      expect(frameTierForLevel(2)).toBe('plain');
      expect(frameTierForLevel(3)).toBe('inlaid');
      expect(frameTierForLevel(6)).toBe('inlaid');
      expect(frameTierForLevel(7)).toBe('gilt');
      expect(frameTierForLevel(9)).toBe('gilt');
      expect(frameTierForLevel(10)).toBe('animated');
    });

    it("frames the avatar by the avatar dynasty's mastery", () => {
      render(<PlayerCard identity={identity()} variant="card" />);
      // PRIMAL M7 -> gilt
      expect(screen.getByTestId('player-card-avatar')).toHaveAttribute(
        'data-frame-tier',
        'gilt'
      );
    });

    it('renders a placeholder chip when no snake is collected yet', () => {
      render(<PlayerCard identity={identity({ avatar: null })} variant="card" />);
      expect(screen.getByTestId('player-card-avatar')).toHaveAttribute(
        'data-frame-tier',
        'plain'
      );
    });
  });

  describe('banner render', () => {
    it('falls back to the Hatchery Standard gradient family', () => {
      expect(bannerBackground(null)).toBe(
        'linear-gradient(135deg, #131a2a 0%, #0b0b12 100%)'
      );
    });
  });
});
