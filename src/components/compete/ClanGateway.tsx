import Link from 'next/link';
import { IconArrowRight, IconShield } from '@/components/ui/icons';

/**
 * The Clan doorway inside Compete. This remains a compact route into the
 * existing clan surface: it does not duplicate roster or battle state, and it
 * keeps the four-pillar navigation model intact.
 */
export function ClanGateway() {
  return (
    <Link
      href="/clan"
      aria-label="Open Clan competition"
      data-testid="compete-clan-entry"
      className="group relative mb-6 grid min-h-[76px] grid-cols-[3.25rem_minmax(0,1fr)_2.5rem] items-center gap-3 overflow-hidden rounded-arcade border border-cyber/45 bg-[linear-gradient(105deg,rgba(34,211,238,0.12),rgba(168,85,247,0.09)_58%,rgba(250,204,21,0.08))] px-3 py-2.5 shadow-[0_0_28px_rgba(34,211,238,0.1)] transition-[border-color,filter,transform] hover:-translate-y-0.5 hover:border-rarity-legendary/70 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rarity-legendary motion-reduce:hover:translate-y-0 sm:px-4"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-cosmic/10 blur-2xl"
      />
      <span className="relative flex h-11 w-11 rotate-45 items-center justify-center rounded-xl border border-rarity-legendary/55 bg-void-deep/85 text-rarity-legendary shadow-[0_0_18px_rgba(250,204,21,0.22)]">
        <span className="h-6 w-6 -rotate-45">
          <IconShield size={24} />
        </span>
      </span>
      <span className="relative min-w-0">
        <span className="label-arcade block whitespace-nowrap text-[9px] text-cyber">
          Clan circuit
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-display text-sm uppercase text-bone-white sm:text-lg">
          Clan Energy Battle
        </span>
        <span className="mt-0.5 block truncate font-body text-[11px] text-beige/65 sm:hidden">
          Find · Form · Fight
        </span>
        <span className="mt-0.5 hidden font-body text-xs text-beige/65 sm:block">
          Find a clan, inspect your five, and deliver for your roster.
        </span>
      </span>
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-cyber transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
        <IconArrowRight size={20} />
      </span>
    </Link>
  );
}

export default ClanGateway;
