import { fireEvent, render, screen } from '@testing-library/react';
import { UnlockConfirmModal } from './UnlockConfirmModal';
import type { Dynasty, SnakeVariant } from '@/shared/types/snake-data-model';

const dynasty: Dynasty = {
  id: 'dynasty-cyber',
  name: 'CYBER',
  displayName: 'Cyber Dynasty',
  description: 'Tempo under pressure',
  colorPrimary: '#00ffff',
  colorSecondary: '#ff00ff',
  statBonusType: 'speed',
  statBonusValue: 0,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const variant: SnakeVariant = {
  id: 'variant-cyber',
  dynastyId: dynasty.id,
  name: 'CYBER SPARK',
  rarity: 'rare',
  loreText: 'Born in the blue hour.',
  artUrl: null,
  baseStats: { speed: 10, size: 5, hp: 100 },
  unlockCostDna: 600,
  isStarter: false,
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('UnlockConfirmModal', () => {
  it('shows one clear unlock commitment and its resulting balance', () => {
    const onConfirm = jest.fn();
    render(
      <UnlockConfirmModal
        variant={variant}
        dynasty={dynasty}
        currentDna={1000}
        isOpen
        onClose={jest.fn()}
        onConfirm={onConfirm}
        isUnlocking={false}
        error={null}
      />
    );

    expect(screen.getByRole('heading', { name: 'Unlock CYBER SPARK?' })).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.getByTestId('unlock-confirm-modal').querySelector('svg')).not.toBeNull();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Unlock and equip CYBER SPARK for 600 DNA',
      })
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps an unaffordable unlock disabled and states the exact shortfall', () => {
    render(
      <UnlockConfirmModal
        variant={variant}
        dynasty={dynasty}
        currentDna={250}
        isOpen
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isUnlocking={false}
        error={null}
      />
    );

    expect(screen.getByText('Need 350 more DNA')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Unlock and equip CYBER SPARK for 600 DNA',
      })
    ).toBeDisabled();
  });
});
