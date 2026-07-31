/**
 * /dev/cockpit - deterministic whole-screen art-direction fixture.
 *
 * The fixture never mounts the engine or starts a run. It exists to validate
 * environment crop, arena prominence, responsive cockpit geometry, glyph
 * silhouettes, and state hierarchy before integrating the live game page.
 *
 * Query flags:
 * - ?dynasty=PRIMAL|CYBER|COSMIC
 * - ?state=ready|active|portal|apex
 * - ?mode=standard|free|anomaly
 * - ?genes=0..6
 * - ?contrast=high
 * - ?motion=reduced
 * - ?renderer=static|webgl
 * - ?arena=released|cockpit (WebGL renderer only)
 * - ?effects=off (raw scene-cost comparison)
 * - ?density=extreme (actual long coiled snake + dense causal terrain)
 *
 * Production: notFound() - this page never ships to players.
 */

import { notFound } from 'next/navigation';
import {
  CockpitPrototype,
  type CockpitPrototypeMode,
  type CockpitPrototypeState,
} from '@/components/game/cockpit/CockpitPrototype';
import type { DynastyId } from '@/shared/types/game';

interface CockpitFixturePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDynasty(value: string | undefined): DynastyId {
  return value === 'CYBER' || value === 'COSMIC' || value === 'PRIMAL'
    ? value
    : 'PRIMAL';
}

function parseState(value: string | undefined): CockpitPrototypeState {
  return value === 'ready' || value === 'portal' || value === 'apex' || value === 'active'
    ? value
    : 'portal';
}

function parseMode(value: string | undefined): CockpitPrototypeMode {
  return value === 'free' || value === 'anomaly' || value === 'standard'
    ? value
    : 'anomaly';
}

function parseGeneCount(value: string | undefined): number {
  const parsed = Number(value ?? '4');
  return Number.isFinite(parsed) ? Math.max(0, Math.min(6, Math.floor(parsed))) : 4;
}

export default async function CockpitFixturePage({ searchParams }: CockpitFixturePageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const params = await searchParams;
  return (
    <CockpitPrototype
      dynasty={parseDynasty(first(params.dynasty))}
      state={parseState(first(params.state))}
      mode={parseMode(first(params.mode))}
      geneCount={parseGeneCount(first(params.genes))}
      highContrast={first(params.contrast) === 'high'}
      reducedMotion={first(params.motion) === 'reduced'}
      arenaRenderer={first(params.renderer) === 'webgl' ? 'webgl' : 'static'}
      arenaVariant={first(params.arena) === 'released' ? 'released' : 'cockpit'}
      arenaEffects={first(params.effects) !== 'off'}
      arenaDensity={first(params.density) === 'extreme' ? 'extreme' : 'standard'}
    />
  );
}
