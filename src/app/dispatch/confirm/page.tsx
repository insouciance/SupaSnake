/**
 * /dispatch/confirm — where the confirmation email lands (§11.6).
 * Behind NEXT_PUBLIC_GROWTH_SURFACES_V1: with the flag off no confirmation
 * mail exists, so the route 404s rather than sitting there orphaned.
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { DispatchTokenAction } from '@/components/growth/DispatchTokenAction';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';

export const metadata: Metadata = {
  title: 'Confirm your Dispatch subscription',
  robots: { index: false, follow: false },
};

export default function DispatchConfirmPage() {
  if (!GROWTH_SURFACES_V1_ENABLED) notFound();

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4 py-12 text-bone-white">
      <Suspense fallback={null}>
        <DispatchTokenAction action="confirm" />
      </Suspense>
    </div>
  );
}
