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
  'mutation',
  'portal',
  'surge',
  'expression',
]);

export default async function DecisionFixturePage({ searchParams }: DecisionFixturePageProps) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const kind = KINDS.has(raw as CockpitDecisionFixtureKind)
    ? raw as CockpitDecisionFixtureKind
    : 'gene';
  return <CockpitDecisionFixture kind={kind} />;
}
