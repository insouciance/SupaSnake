import type { ProgressionDestination } from './runImpact';

function fragmentToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * One routing grammar for every progression receipt, dot and Career Pulse
 * link. Artifact refs are server-authored; this function only turns them into
 * a safe route/fragment and never interprets them as progress.
 */
export function progressionArtifactHref(
  destination: ProgressionDestination,
  artifactRef?: string | null
): string {
  if (!artifactRef) {
    switch (destination) {
      case 'chronicle': return '/profile';
      case 'mastery': return '/profile#mastery';
      case 'records': return '/profile#records';
      case 'codex': return '/codex';
      case 'signal': return '/#signal';
      case 'clan': return '/clan';
      case 'lab': return '/lab';
      case 'lineage': return '/lab#lineage';
    }
  }

  const token = fragmentToken(artifactRef);
  switch (destination) {
    case 'mastery': {
      const dynasty = fragmentToken(artifactRef.replace(/^mastery:/, '').toUpperCase());
      return `/profile#mastery-${dynasty}`;
    }
    case 'records':
      return `/profile#record-${token}`;
    case 'codex': {
      if (artifactRef === 'genome_weaver') return '/codex#codex-genome-weaver';
      const [kind, ...rest] = artifactRef.split(':');
      const id = fragmentToken(rest.join(':'));
      if (kind === 'gene') return `/codex#codex-gene-${id}`;
      if (kind === 'splice') return `/codex#codex-splice-${id}`;
      if (kind === 'expression' || kind === 'apex') {
        return `/codex#codex-${kind}-${id}`;
      }
      return '/codex';
    }
    case 'signal': {
      const mark = artifactRef.startsWith('signals:')
        ? fragmentToken(artifactRef.slice('signals:'.length))
        : token;
      return `/?signal=open#signal-mark-${mark}`;
    }
    case 'clan':
      return `/clan#clan-run-${token}`;
    case 'lineage':
      return `/lab?specimen=${encodeURIComponent(artifactRef)}#lineage-specimen-${token}`;
    case 'chronicle':
      return `/profile#career-artifact-${token}`;
    case 'lab':
      return '/lab';
  }
}
