/**
 * Tests for MasteryPanel - the Lab's per-dynasty mastery track UI
 * (Design v2 §7.1): level, XP bar to next, M1-M10 unlock track with
 * mutation unlocks named at M3/M6/M9.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MasteryPanel, type DynastyMasteryState } from './MasteryPanel';
import { dynastyThemes } from '@/hooks/useDynastyTheme';
import {
  MASTERY_UNLOCK_TRACK,
  masteryProgress,
  masteryUnlockLabel,
} from '@/shared/game/mastery';
import type { DynastyName } from '@/shared/game/rulesets';

function masteryState(
  dynasty: DynastyName,
  xp: number
): DynastyMasteryState {
  const progress = masteryProgress(xp);
  return {
    dynasty,
    xp,
    level: progress.level,
    intoLevel: progress.intoLevel,
    toNext: progress.toNext,
    track: MASTERY_UNLOCK_TRACK.map((rung) => ({
      level: rung.level,
      kind: rung.kind,
      label: masteryUnlockLabel(dynasty, rung.level),
      unlocked: progress.level >= rung.level,
    })),
  };
}

describe('MasteryPanel', () => {
  it('renders the level, dynasty name, and XP-to-next', () => {
    // 4500 XP => M2 (3000) + 1500 into the 4000-XP M3 rung
    render(
      <MasteryPanel
        mastery={masteryState('PRIMAL', 4500)}
        dynastyTheme={dynastyThemes.PRIMAL}
      />
    );
    expect(screen.getByTestId('mastery-level').textContent).toBe('M2');
    expect(screen.getByText(/PRIMAL Mastery/i)).toBeTruthy();
    expect(screen.getByTestId('mastery-to-next').textContent).toContain(
      '1,500 / 4,000 XP to M3'
    );
  });

  it('renders all 10 track rungs with mutation names at M3/M6/M9', () => {
    render(
      <MasteryPanel
        mastery={masteryState('CYBER', 0)}
        dynastyTheme={dynastyThemes.CYBER}
      />
    );
    const track = screen.getByTestId('mastery-track');
    expect(track.querySelectorAll('li')).toHaveLength(10);
    expect(screen.getByTestId('mastery-rung-3').textContent).toContain(
      'Redline Dividend'
    );
    expect(screen.getByTestId('mastery-rung-6').textContent).toContain(
      'Afterburner'
    );
    expect(screen.getByTestId('mastery-rung-9').textContent).toContain(
      'Overclock Harvest'
    );
    // Cosmetic rungs use the doc labels
    expect(screen.getByTestId('mastery-rung-1').textContent).toContain(
      'Dynasty Emblem I'
    );
    expect(screen.getByTestId('mastery-rung-10').textContent).toContain(
      'Sovereign Emblem + Title'
    );
  });

  it('marks reached rungs unlocked and future rungs locked', () => {
    // 41,000 XP = exactly M6
    render(
      <MasteryPanel
        mastery={masteryState('COSMIC', 41000)}
        dynastyTheme={dynastyThemes.COSMIC}
      />
    );
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('0');
    // Unlocked rungs render a check, locked ones a lock - count via the
    // styled classes on the list items
    const items = screen
      .getByTestId('mastery-track')
      .querySelectorAll('li');
    const unlockedCount = Array.from(items).filter((li) =>
      li.className.includes('bg-void/60')
    ).length;
    expect(unlockedCount).toBe(6);
  });

  it('a completed track shows the Sovereign state instead of XP-to-next', () => {
    render(
      <MasteryPanel
        mastery={masteryState('PRIMAL', 175000)}
        dynastyTheme={dynastyThemes.PRIMAL}
      />
    );
    expect(screen.getByTestId('mastery-level').textContent).toBe('M10');
    expect(screen.getByTestId('mastery-to-next').textContent).toContain(
      'Track complete'
    );
  });
});
