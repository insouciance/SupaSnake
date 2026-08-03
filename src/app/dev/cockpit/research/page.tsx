import { notFound } from 'next/navigation';
import { GenomeResearchFixture } from '@/components/workbench/GenomeResearchFixture';

export default function GenomeResearchFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <GenomeResearchFixture />;
}
