export interface GenomeResearchCopy {
  intro: string;
  signedOutRecord: string;
}

/** Flag-accurate copy for all four Genome/Workbench rollout shapes. */
export function genomeResearchCopy(
  genomeV2Enabled: boolean,
  workbenchV1Enabled: boolean,
): GenomeResearchCopy {
  if (genomeV2Enabled && workbenchV1Enabled) {
    return {
      intro:
        'Touch a possible Genome. Follow what it awakens. Rewind and try another path.',
      signedOutRecord:
        'The Workbench is open to everyone. Sign in to connect discoveries, world-first history, and Genome Weaver progress to your account.',
    };
  }
  return {
    intro:
      !genomeV2Enabled && workbenchV1Enabled
        ? 'Sign in to plan your Powers against your collection and current conditions.'
        : 'Power research instruments are not active in this version.',
    signedOutRecord:
      'Sign in to connect discoveries, world-first history, and Genome Weaver progress to your account.',
  };
}
