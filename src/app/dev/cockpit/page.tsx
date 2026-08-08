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
 * - ?arrival=classic|front  ET-1 arrival-timing A/B. Turns the posed fixture
 *   into a scripted walker (a still life cannot show a motion change) and
 *   forces the WebGL arena, so one URL is the whole experiment.
 * - ?renderer=static|webgl
 * - ?arena=released|cockpit (WebGL renderer only)
 * - ?effects=off (raw scene-cost comparison)
 * - ?density=extreme (actual long coiled snake + dense causal terrain)
 * - ?pitch=1..88 (WebGL renderer only - judge board art at a candidate
 *   camera pitch in degrees from zenith. ET-5 ratified one viewpoint for the
 *   played board; this is a judging escape on a route that 404s in
 *   production, never a route back to a movable camera. Board relief is a
 *   function of exactly this number - a groove wall projects at sin(polar) -
 *   which is why the 90s board was judged AT the ratified 28 rather than near
 *   it.)
 * - ?boardTheme=cyber|primal|cosmic|stone (NEON DYNASTY THEMES: picks a board
 *   colour language independently of the scene's dynasty so all three can be
 *   flipped against one fixed scene; `stone` is the INK & AMBER board, which
 *   is also what `NEXT_PUBLIC_NINETIES_COMPOSITION=false` ships. Omitted
 *   follows the flag, then ?dynasty.)
 * - ?gridlines=1 (THE COMPARE TOGGLE. Owner ruling 2026-08-07: "we don't need
 *   the gridlines now anymore, they are rather a disturbance. the tiles
 *   already provide for proper orientation on the board." The board therefore
 *   renders LINE-FREE by default - no ink around a tile, no filament in a cut,
 *   no analytic carve - and its seams are read from the recess, the occlusion
 *   and the authored shadow tone alone. This flag restores the drawn seam
 *   exactly as it was reviewed, so the instinct can be checked against the two
 *   boards rather than against a description of them. Themed board only; the
 *   stone board's grooves are the only boundary it has.)
 * - ?boardPurple=underglow|frame|both (THE BRAND PURPLE EXPERIMENT. The owner
 *   ruled the Mark's purple a defining brand colour on 2026-08-07, overturning
 *   "purple is logo-only", and approved prototyping it on the gameboard - to be
 *   judged on screen before anything is ratified. `underglow` puts a constant
 *   violet in the floor of every seam and the bottom of every groove wall,
 *   UNDER the house neon rather than over it; `frame` bands the slab's outer
 *   chamfer - the one ring around the play space - the way the Mark's burst
 *   frames the wordmark; `both` is the pair. Absent is the shipped board, and
 *   absent is what every surface other than this route can produce: nothing
 *   here is behind a flag or an env var. See `applyBoardPurple` for the values
 *   and for why neither variant can become the house colour.)
 * - ?snake90s=1|guide|0 (the 90s cartoon character style, see
 *   `src/components/game/screen/snake90s.ts`. Omitted follows
 *   `NEXT_PUBLIC_NINETIES_COMPOSITION`; `guide` is the RATIFIED style, `1` is
 *   the dynasty-hued variant that was rendered and not chosen, `0` forces the
 *   classic snake. Read at module load, so the switcher below uses plain
 *   anchors - a client-side route change would not re-resolve it.)
 *
 * The board and the character are ONE composition and are reviewed together:
 * the board is the 90s cartoon language applied to the ground the 90s cartoon
 * snake stands on. `?boardTheme=...&snake90s=guide` is the whole picture, and
 * it is what the flag ships.
 *
 * Production: notFound() - this page never ships to players.
 */

import { notFound } from 'next/navigation';
import {
  parseBoardPurpleMode,
  parseBoardThemeSelection,
} from '@/components/game/screen/boardThemes';
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
import { parseArrivalMode } from '@/lib/game/arrivalEasing';

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

/**
 * An opt-IN switch, read strictly.
 *
 * `1`, `on` and `true` turn it on and anything else - including a missing
 * value, an empty one and `0` - leaves it off. Never `value !== undefined`:
 * `?gridlines=0` has to mean off, or the toggle cannot be turned back off from
 * the address bar, which is the one thing a compare toggle exists to do.
 */
function parseFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'on' || normalized === 'true';
}

function parseGeneCount(value: string | undefined): number {
  const parsed = Number(value ?? '4');
  return Number.isFinite(parsed) ? Math.max(0, Math.min(6, Math.floor(parsed))) : 4;
}

const SNAKE_STYLE_CHOICES: readonly { value: string | null; label: string }[] = [
  { value: null, label: 'FLAG' },
  { value: '0', label: 'CLASSIC' },
  { value: '1', label: '90s HUE' },
  { value: 'guide', label: '90s GUIDE' },
];

/**
 * The A/B strip.
 *
 * A SIBLING of the prototype, not a child: `verify:cockpit-prototype` audits
 * everything inside `[data-testid="cockpit-prototype"]` for board overlap,
 * minimum text size and 44px touch targets, and a dev switcher is none of
 * that fixture's business. Anchors rather than buttons or `<Link>` because
 * the style is resolved once per document load by design.
 *
 * FLAG is the first choice and it is not a style: it is "whatever
 * `NEXT_PUBLIC_NINETIES_COMPOSITION` says", which is what a player would get
 * from this build. The other three force a style regardless, so the strip
 * compares the shipped answer against the two alternatives and against the
 * rollback rather than against a description of them.
 */
function SnakeStyleSwitcher({
  params,
  active,
}: {
  params: Record<string, string | string[] | undefined>;
  active: string | undefined;
}) {
  return (
    <nav
      data-testid="snake90s-switcher"
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 60,
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 8,
        background: 'rgba(6, 9, 13, 0.86)',
        border: '1px solid rgba(255, 197, 61, 0.4)',
        fontSize: 14,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      {SNAKE_STYLE_CHOICES.map((choice) => {
        const next = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          const single = first(value);
          if (key !== 'snake90s' && single !== undefined) next.set(key, single);
        }
        if (choice.value) next.set('snake90s', choice.value);
        const selected = (active ?? null) === choice.value;
        return (
          <a
            key={choice.label}
            href={`/dev/cockpit?${next.toString()}`}
            style={{
              padding: '6px 10px',
              borderRadius: 5,
              color: selected ? '#12100d' : '#f7f2e6',
              background: selected ? '#ffc53d' : 'transparent',
              textDecoration: 'none',
            }}
          >
            {choice.label}
          </a>
        );
      })}
    </nav>
  );
}

export default async function CockpitFixturePage({ searchParams }: CockpitFixturePageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const params = await searchParams;
  // ET-1: asking for an arrival comparison implies the 3D board. A walker
  // rendered as CSS cells would be a picture of the fix rather than the fix.
  const arrivalMode = parseArrivalMode(first(params.arrival));
  return (
    <>
      <CockpitPrototype
        dynasty={parseDynasty(first(params.dynasty))}
        state={parseState(first(params.state))}
        mode={parseMode(first(params.mode))}
        geneCount={parseGeneCount(first(params.genes))}
        highContrast={first(params.contrast) === 'high'}
        reducedMotion={first(params.motion) === 'reduced'}
        arenaRenderer={
          arrivalMode || first(params.renderer) === 'webgl' ? 'webgl' : 'static'
        }
        arenaVariant={first(params.arena) === 'released' ? 'released' : 'cockpit'}
        arenaEffects={first(params.effects) !== 'off'}
        arenaDensity={first(params.density) === 'extreme' ? 'extreme' : 'standard'}
        arenaRenderTier={parseRenderTier(first(params.tier))}
        arenaPitchDeg={parsePitchDeg(first(params.pitch))}
        arenaBoardTheme={parseBoardThemeSelection(first(params.boardTheme))}
        arenaBoardSeamLines={parseFlag(first(params.gridlines))}
        arenaBoardPurple={parseBoardPurpleMode(first(params.boardPurple))}
        arenaArrivalMode={arrivalMode}
      />
      <SnakeStyleSwitcher params={params} active={first(params.snake90s)} />
    </>
  );
}
