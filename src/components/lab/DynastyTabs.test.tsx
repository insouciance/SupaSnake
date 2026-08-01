import { fireEvent, render, screen } from '@testing-library/react';
import { DynastyTabs } from './DynastyTabs';
import type { Dynasty } from '@/shared/types/snake-data-model';

function dynasty(name: 'CYBER' | 'PRIMAL' | 'COSMIC', index: number): Dynasty {
  return {
    id: `dynasty-${index}`,
    name,
    displayName: `${name} Dynasty`,
    description: name,
    colorPrimary: '#00ffff',
    colorSecondary: '#ffd700',
    statBonusType: 'size',
    statBonusValue: 0,
    sortOrder: index,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const dynasties = [dynasty('CYBER', 1), dynasty('PRIMAL', 2), dynasty('COSMIC', 3)];

describe('DynastyTabs', () => {
  it('uses the canonical Genome rune for every compact dynasty seal', () => {
    render(
      <DynastyTabs
        dynasties={dynasties}
        activeDynastyId="dynasty-1"
        onSelect={jest.fn()}
        completionByDynasty={{
          'dynasty-1': { owned: 3, total: 8 },
          'dynasty-2': { owned: 2, total: 8 },
          'dynasty-3': { owned: 1, total: 8 },
        }}
      />
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('tab', { name: /CYBER dynasty, 3 of 8 owned/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('changes dynasty with one direct tap', () => {
    const onSelect = jest.fn();
    render(
      <DynastyTabs
        dynasties={dynasties}
        activeDynastyId="dynasty-1"
        onSelect={onSelect}
        completionByDynasty={{}}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /COSMIC dynasty/i }));
    expect(onSelect).toHaveBeenCalledWith('dynasty-3');
  });
});
