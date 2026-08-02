interface GenomeResearchLinkInput {
  genomeV2Enabled: boolean;
  workbenchEnabled: boolean;
  sessionId: string | null;
  hasGenomeRecap: boolean;
  practice: boolean;
  settlementPending: boolean;
}

/** Results may link only to a live v2 Workbench backed by a settled session. */
export function genomeResearchHref(input: GenomeResearchLinkInput): string | null {
  if (
    !input.genomeV2Enabled
    || !input.workbenchEnabled
    || !input.sessionId
    || !input.hasGenomeRecap
    || input.practice
    || input.settlementPending
  ) {
    return null;
  }
  return `/codex?view=workbench&result=${encodeURIComponent(input.sessionId)}`;
}
