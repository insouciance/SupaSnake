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
 * - ?tier=0..4 (pin the render-quality governor to one tier - measurement only)
 * - ?contrast=high
 * - ?motion=reduced
 * - ?renderer=static|webgl
 * - ?arena=released|cockpit (WebGL renderer only)
 * - ?effects=off (raw scene-cost comparison)
 * - ?density=extreme (actual long coiled snake + dense causal terrain)
 * - ?pitch=1..88 (WebGL renderer only - judge board art at a candidate
 *   camera pitch in degrees from zenith. ET-5 ratified one viewpoint for the
 *   played board; this is a judging escape on a route that 404s in
 *   production, never a route back to a movable camera.)
 *
 * Production: notFound() - this page never ships to players.
 */

import { notFound } from 'next/navigation';
import {
  MAX_RENDER_TIER,
  type RenderTier,
} from '@/components/game/screen/renderQuality';
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

function parseRenderTier(value: string | undefined): RenderTier | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_RENDER_TIER) {
    return undefined;
  }
  return parsed as RenderTier;
}

/**
 * ET-5 dev pitch escape. Bounded to the surveyor's own free-look range so a
 * typo cannot ask three's spherical math for a degenerate pole.
 */
function parsePitchDeg(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 88) return undefined;
  return parsed;
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
      arenaRenderTier={parseRenderTier(first(params.tier))}
      arenaPitchDeg={parsePitchDeg(first(params.pitch))}
    />
  );
}
