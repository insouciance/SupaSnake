import Link from 'next/link';
import {
  LEGAL_ENTITY,
  LEGAL_CONTACT,
  LEGAL_VERSIONS,
  PRODUCT,
} from '@/shared/config/legal';
import { LegalPageFooter } from '@/components/legal/LegalPageFooter';

export const metadata = {
  title: 'Accessibility Statement | SupaSnake',
  description:
    'Accessibility statement for SupaSnake — our current conformance status, known limitations, and how to report barriers.',
};

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-scale-blue-dark text-bone-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-beige hover:text-bone-white transition-colors font-body text-sm"
          >
            &larr; Back to Home
          </Link>
          <h1 className="text-4xl font-display uppercase tracking-arcade text-venom-orange mt-4">
            Accessibility Statement
          </h1>
          <p className="text-beige font-body mt-2">
            Last updated: {LEGAL_VERSIONS.accessibility}
          </p>
        </div>

        <div className="space-y-8 font-body text-bone-white/90">
          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Our commitment
            </h2>
            <p className="mb-4">
              {LEGAL_ENTITY.name} wants {PRODUCT.name} to be playable and its
              services usable by as many people as possible. We orient
              ourselves at the Web Content Accessibility Guidelines (WCAG) 2.1
              Level AA, the standard referenced by the European Accessibility
              Act and the Austrian Barrierefreiheitsgesetz (BaFG) for
              e-commerce services.
            </p>
            <p>
              Account management, the shop, legal pages and settings are
              standard web interfaces we aim to keep fully accessible:
              keyboard-navigable, screen-reader compatible, with sufficient
              color contrast and without time limits.
            </p>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Known limitations
            </h2>
            <ul className="list-disc list-inside space-y-2 text-beige">
              <li>
                The 3D game itself is a real-time, visually rendered canvas
                scene. It is inherently graphics- and reflex-based and is not
                currently usable with a screen reader.
              </li>
              <li>
                Gameplay supports multiple input methods (touch and keyboard)
                and several aim-assist modes, but does not yet offer a
                reduced-motion or high-contrast game mode.
              </li>
              <li>
                Some interactive game overlays may not yet expose complete
                ARIA semantics.
              </li>
            </ul>
          </section>

          <section className="bg-scale-blue border-[3px] border-scale-blue-light rounded-arcade p-6">
            <h2 className="text-xl font-display uppercase tracking-arcade text-venom-orange mb-4">
              Feedback and enforcement
            </h2>
            <p className="mb-4">
              If you encounter a barrier in {PRODUCT.name} — especially in
              account management, purchasing or legal information — please tell
              us via the{' '}
              <Link href="/contact" className="text-venom-orange hover:underline">
                contact form
              </Link>{' '}
              or{' '}
              <a
                href={`mailto:${LEGAL_CONTACT.email}`}
                className="text-venom-orange hover:underline"
              >
                {LEGAL_CONTACT.email}
              </a>
              . We take reports seriously and prioritise fixes to purchase and
              account flows.
            </p>
            <p>
              In Austria, complaints about accessibility of e-commerce
              services can also be addressed to the competent market
              surveillance authority (Sozialministeriumservice).
            </p>
          </section>
        </div>

        <LegalPageFooter currentPath="/legal/accessibility" />
      </div>
    </main>
  );
}
