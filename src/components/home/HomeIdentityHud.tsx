'use client';

import Link from 'next/link';
import { StrainGlyph } from '@/components/game/cockpit/CockpitGlyphs';
import { IconBolt, IconDna, IconGear, IconShield } from '@/components/ui/icons';
import { STRAINS, type StrainId } from '@/shared/game/strains';

export interface HomeSpecimenIdentity {
  variantName: string;
  generation: number;
  lineageStrain: StrainId | null;
}

export interface HomeClanIdentity {
  name: string;
  tag: string | null;
}

export interface HomeWalletEnergy {
  available: number;
  capacity: number;
  visible: boolean;
}

interface HomeIdentityHudProps {
  specimen: HomeSpecimenIdentity | null;
  clan: HomeClanIdentity | null;
  authenticated: boolean;
  dna: number | null;
  energy: HomeWalletEnergy | null;
}

/**
 * Server-fed identity hierarchy over the Specimen Chamber. Missing data stays
 * absent or uses a loading dash; this surface never invents a snake, clan, or
 * economy value while the authoritative request is pending.
 */
export function HomeIdentityHud({
  specimen,
  clan,
  authenticated,
  dna,
  energy,
}: HomeIdentityHudProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-4 text-center sm:pt-5">
      <h1 className="heading-display text-lg text-venom-orange text-glow-accent sm:text-xl">
        SUPASNAKE
      </h1>

      {specimen ? (
        <p
          className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap font-display text-sm uppercase text-bone-white text-glow sm:text-base"
          data-testid="home-specimen-identity"
        >
          {specimen.lineageStrain ? (
            <span
              className="inline-flex h-4 w-4 shrink-0 [&_svg]:h-full [&_svg]:w-full"
              style={{ color: STRAINS[specimen.lineageStrain].color }}
              title={`${STRAINS[specimen.lineageStrain].name} Genome lineage`}
              data-testid="home-lineage-rune"
            >
              <StrainGlyph id={specimen.lineageStrain} />
            </span>
          ) : null}
          {specimen.variantName} · Gen {specimen.generation}
        </p>
      ) : null}

      {clan ? (
        <Link
          href="/clan"
          className="pointer-events-auto mt-1 inline-flex min-h-5 items-center gap-1.5 text-rarity-legendary transition-colors hover:text-rarity-legendary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rarity-legendary"
          aria-label={`Clan ${clan.name}${clan.tag ? `, ${clan.tag}` : ''}`}
          data-testid="home-clan-identity"
        >
          <IconShield size={13} />
          <span className="whitespace-nowrap font-body text-[10px] font-bold uppercase tracking-[0.1em]">
            {clan.name}
          </span>
        </Link>
      ) : null}

      {authenticated ? (
        <div
          className="pointer-events-auto mx-auto mt-2 inline-flex min-h-9 items-center overflow-hidden rounded-full border border-scale-blue-light/40 bg-void-deep/55 px-3 shadow-panel backdrop-blur-sm"
          aria-label={`Wallet: ${dna === null ? 'DNA loading' : `${dna.toLocaleString('en-US')} DNA`}${energy?.visible ? ` and ${energy.available} of ${energy.capacity} Energy` : ''}`}
          data-testid="home-wallet"
        >
          <span className="inline-flex items-center gap-1.5" title="DNA">
            <IconDna size={14} className="text-rarity-uncommon" />
            <span className="font-mono text-[10px] font-bold text-bone-white">
              {dna === null ? '—' : dna.toLocaleString('en-US')}
            </span>
          </span>
          {energy?.visible ? (
            <>
              <span className="mx-2 h-4 w-px bg-scale-blue-light/55" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5" title="Recovered Energy">
                <IconBolt size={14} className="text-venom-orange" />
                <span className="font-mono text-[10px] font-bold text-bone-white">
                  {energy.available}/{energy.capacity}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="pointer-events-auto absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-beige/55 transition-[color,background-color] hover:bg-scale-blue/25 hover:text-venom-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-venom-orange sm:right-4 sm:top-4"
        data-testid="home-settings"
      >
        <IconGear size={18} />
      </Link>
    </header>
  );
}

export default HomeIdentityHud;
