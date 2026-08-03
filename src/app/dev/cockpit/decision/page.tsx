import { notFound } from 'next/navigation';
import {
  CockpitDecisionFixture,
  type CockpitDecisionFixtureKind,
} from '@/components/game/cockpit/CockpitDecisionFixture';

interface DecisionFixturePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KINDS = new Set<CockpitDecisionFixtureKind>([
  'hold',
  'abandon',
  'gene',
  'gene-recode',
  'mutation',
  'portal',
  'surge',
  'expression',
]);

export default async function DecisionFixturePage({ searchParams }: DecisionFixturePageProps) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  // Keep the two URLs shared during owner review working while the canonical
  // fixture names align with the actual Gene decision surface.
  const alias = raw === 'loom' ? 'gene' : raw === 'recode' ? 'gene-recode' : raw;
  const kind = KINDS.has(alias as CockpitDecisionFixtureKind)
    ? alias as CockpitDecisionFixtureKind
    : 'gene';
  return <CockpitDecisionFixture kind={kind} />;
}
