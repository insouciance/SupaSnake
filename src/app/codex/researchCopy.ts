export interface GenomeResearchCopy {
  intro: string;
  signedOutRecord: string;
}

/** Flag-accurate copy for the production instrument and both rollback shapes. */
export function genomeResearchCopy(
  genomeV2Enabled: boolean,
  workbenchV1Enabled: boolean
): GenomeResearchCopy {
  if (genomeV2Enabled) {
    return {
      intro: 'Touch a possible Genome. Follow what it awakens. Rewind and try another path.',
      signedOutRecord: 'The Workbench is open to everyone. Sign in to connect discoveries, world-first history, and Genome Weaver progress to your account.',
    };
  }
  return {
    intro: workbenchV1Enabled
      ? 'Sign in to plan a Genome against your collection and current conditions.'
      : 'Genome research instruments are not active in this version.',
    signedOutRecord: 'Sign in to connect discoveries, world-first history, and Genome Weaver progress to your account.',
  };
}
