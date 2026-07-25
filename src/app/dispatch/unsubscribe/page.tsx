/**
 * /dispatch/unsubscribe — the exit, reachable from every Dispatch message
 * (§11.6, Rule 7: no email is ever commercial and every one carries this).
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { DispatchTokenAction } from '@/components/growth/DispatchTokenAction';
import { GROWTH_SURFACES_V1_ENABLED } from '@/lib/features/growth';

export const metadata: Metadata = {
  title: 'Leave the Dispatch',
  robots: { index: false, follow: false },
};

export default function DispatchUnsubscribePage() {
  if (!GROWTH_SURFACES_V1_ENABLED) notFound();

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4 py-12 text-bone-white">
      <Suspense fallback={null}>
        <DispatchTokenAction action="unsubscribe" />
      </Suspense>
    </div>
  );
}
