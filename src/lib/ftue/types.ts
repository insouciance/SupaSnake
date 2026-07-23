import type { DynastyName } from '@/shared/types/snake-data-model';
import type { Lineage } from '@/shared/game/lineage';

export interface FtueBootstrapPlayer {
  id: string;
  dna: number;
  energy: number;
  maxEnergy: number;
  highScore: number;
  totalGamesPlayed: number;
}

export interface FtueBootstrapSnake {
  id: string;
  variantId: string;
  name: string;
  dynasty: DynastyName;
  generation: number;
  traits: string[];
  lineage: Lineage | null;
}

export interface FtueOnboardingState {
  version: 2;
  isNewPlayer: boolean;
  starterGranted: boolean;
  equipmentRepaired: boolean;
  hasCompletedFirstRun: boolean;
  needsStarterSelection: false;
}

export interface FtueBootstrapResponse {
  ftueV2: true;
  player: FtueBootstrapPlayer;
  equippedSnake: FtueBootstrapSnake;
  onboarding: FtueOnboardingState;
}
