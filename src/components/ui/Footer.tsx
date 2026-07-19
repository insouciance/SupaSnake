import Link from 'next/link';
import { LEGAL_ENTITY } from '@/shared/config/legal';
import { LEGAL_LINKS } from '@/components/legal/LegalPageFooter';

/**
 * Global site footer, rendered once in the root layout. Deliberately
 * unobtrusive: the game UI is full-screen, so this sits below the fold of
 * scrollable pages and never overlays the play area.
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 border-t border-scale-blue-light/40 bg-scale-blue-dark/95 px-6 py-6 font-body text-sm text-beige">
      <div className="max-w-4xl mx-auto flex flex-col gap-3">
        <nav
          aria-label="Legal"
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-bone-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-beige/70">
          &copy; {year} {LEGAL_ENTITY.name}, {LEGAL_ENTITY.city},{' '}
          {LEGAL_ENTITY.country}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
