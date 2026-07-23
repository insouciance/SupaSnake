'use client';

import type { CSSProperties } from 'react';
import type { DynastyId } from '@/shared/types/game';
import { getDynastyScreenTokens } from './gameScreenTokens';
import styles from './GameEnvironment.module.css';

interface GameEnvironmentProps {
  dynasty: DynastyId;
  highContrast?: boolean;
}

type EnvironmentStyle = CSSProperties & Record<`--${string}`, string>;

/**
 * Canonical authored game-screen environment.
 *
 * One unchanged bitmap, one reversible dynasty atmosphere, and one local
 * contrast grade. It owns no animation and no gameplay state.
 */
export function GameEnvironment({
  dynasty,
  highContrast = false,
}: GameEnvironmentProps) {
  const theme = getDynastyScreenTokens(dynasty);
  const style = {
    '--dynasty-primary': theme.primary,
    '--dynasty-ambient': theme.ambientCss,
  } as EnvironmentStyle;

  return (
    <div
      className={styles.environment}
      style={style}
      data-contrast={highContrast ? 'high' : 'default'}
      data-testid="game-environment"
      aria-hidden="true"
    >
      <div className={styles.authoredBackground} />
      <div className={styles.dynastyAtmosphere} />
      <div className={styles.environmentGrade} />
    </div>
  );
}

export default GameEnvironment;
