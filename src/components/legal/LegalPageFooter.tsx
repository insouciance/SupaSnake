import Link from 'next/link';

const LEGAL_LINKS = [
  { href: '/legal/impressum', label: 'Impressum' },
  { href: '/legal/terms', label: 'Terms of Service' },
  { href: '/legal/privacy', label: 'Privacy Policy' },
  { href: '/legal/cookies', label: 'Cookie Policy' },
  { href: '/legal/withdrawal', label: 'Right of Withdrawal' },
  { href: '/legal/accessibility', label: 'Accessibility' },
  { href: '/contact', label: 'Contact' },
];

/** Cross-link block rendered at the bottom of every legal page. */
export function LegalPageFooter({ currentPath }: { currentPath?: string }) {
  return (
    <div className="mt-12 pt-8 border-t border-scale-blue-light">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-beige font-body text-sm">
        {LEGAL_LINKS.filter((l) => l.href !== currentPath).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="hover:text-bone-white transition-colors"
          >
            {l.label}
          </Link>
        ))}
        <Link href="/" className="hover:text-bone-white transition-colors">
          Back to Game
        </Link>
      </div>
    </div>
  );
}

export { LEGAL_LINKS };
