import {
  ninetiesCompositionEnabled,
} from './ninetiesComposition';
import {
  NINETIES_SHIPPED_STYLE,
  resolveSnakeStyle,
  SNAKE_STYLE_PROFILES,
} from '@/components/game/screen/snake90s';

describe('NEXT_PUBLIC_NINETIES_COMPOSITION', () => {
  const original = process.env.NEXT_PUBLIC_NINETIES_COMPOSITION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_NINETIES_COMPOSITION;
    } else {
      process.env.NEXT_PUBLIC_NINETIES_COMPOSITION = original;
    }
    jest.resetModules();
  });

  function readFlag(value?: string): boolean {
    if (value === undefined) {
      delete process.env.NEXT_PUBLIC_NINETIES_COMPOSITION;
    } else {
      process.env.NEXT_PUBLIC_NINETIES_COMPOSITION = value;
    }
    jest.resetModules();
    return require('./ninetiesComposition')
      .NINETIES_COMPOSITION_ENABLED as boolean;
  }

  it('is opt-in and false when omitted', () => {
    expect(readFlag()).toBe(false);
  });

  it('enables only for the exact true value', () => {
    expect(readFlag('true')).toBe(true);
    expect(readFlag('false')).toBe(false);
    expect(readFlag('TRUE')).toBe(false);
    expect(readFlag('1')).toBe(false);
    expect(readFlag(' true ')).toBe(false);
  });

  /**
   * THE ROLLBACK IS THE SHIPPED CREATURE, NOT A DEGRADED ONE.
   *
   * Every 90s value in the render path is resolved through the style profile,
   * so the off leg is only honest if `classic` still holds the numbers the
   * INK & AMBER snake shipped with. Asserted against literals on purpose: a
   * profile that drifted toward the concept would otherwise roll back into
   * something nobody has ever reviewed.
   */
  it('rolls back to the exact INK & AMBER creature, not an approximation', () => {
    const classic = SNAKE_STYLE_PROFILES.classic;
    expect(classic.headSize).toBe(0.9);
    expect(classic.bodySize).toBe(0.75);
    expect(classic.trailFootprint).toEqual([0.66, 0.8, 0.9]);
    expect(classic.headBevelRadius).toBe(0.12);
    expect(classic.bodyBevelRadius).toBe(0.085);
    expect(classic.inkHullWidth).toBe(0.058);
    expect(classic.inkColor).toBe('#0b1118');
    // The three things that make the shader patch a no-op: no cube law, no
    // authored tones, no cosmetic restyle. Emissive passes through at 1.
    expect(classic.cube).toBeNull();
    expect(classic.tones).toBeNull();
    expect(classic.cosmetics).toBeNull();
    expect(classic.headEmissiveScale).toBe(1);
    expect(classic.bodyEmissiveScale).toBe(1);
    expect(classic.forcedHeadBaseColor).toBeNull();
    expect(classic.forcedBodyBaseColor).toBeNull();
    expect(classic.forcedEmissiveColor).toBeNull();
  });
});

/**
 * THE SWITCH, at the boundary the flag actually crosses.
 *
 * `resolveSnakeStyle` is the one function that turns an environment and a URL
 * into a creature, so this is where "what does each leg ship" is answerable
 * without a browser.
 */
describe('the composition flag decides the style', () => {
  it('ships the RATIFIED style on the flag-on leg, in production', () => {
    expect(resolveSnakeStyle('', 'production', 'true')).toBe(
      NINETIES_SHIPPED_STYLE
    );
    expect(NINETIES_SHIPPED_STYLE).toBe('ninetiesGuide');
  });

  it('ships the classic creature on the flag-off leg, in production', () => {
    expect(resolveSnakeStyle('', 'production', 'false')).toBe('classic');
    expect(resolveSnakeStyle('', 'production', undefined)).toBe('classic');
  });

  it('refuses the compare toggle in a production bundle, both ways', () => {
    // A player cannot put themselves on a style the release did not ship, and
    // - just as important - cannot take themselves OFF the one it did.
    expect(resolveSnakeStyle('?snake90s=guide', 'production', 'false')).toBe(
      'classic'
    );
    expect(resolveSnakeStyle('?snake90s=1', 'production', 'false')).toBe(
      'classic'
    );
    expect(resolveSnakeStyle('?snake90s=0', 'production', 'true')).toBe(
      NINETIES_SHIPPED_STYLE
    );
  });

  it('follows the flag on a dev server when nothing is asked for', () => {
    expect(resolveSnakeStyle('', 'development', 'true')).toBe(
      NINETIES_SHIPPED_STYLE
    );
    expect(resolveSnakeStyle('?dynasty=CYBER', 'development', 'true')).toBe(
      NINETIES_SHIPPED_STYLE
    );
    expect(resolveSnakeStyle('', 'development', undefined)).toBe('classic');
  });

  it('lets a dev server compare all three, in both directions', () => {
    expect(resolveSnakeStyle('?snake90s=1', 'development', 'false')).toBe(
      'nineties'
    );
    expect(resolveSnakeStyle('?a=b&snake90s=on', 'test', 'false')).toBe(
      'nineties'
    );
    expect(resolveSnakeStyle('?snake90s=guide', 'development', 'false')).toBe(
      NINETIES_SHIPPED_STYLE
    );
    // The rollback is reachable from a flag-on dev build, which is the whole
    // point of a compare toggle: a switch that cannot be switched off compares
    // one thing against itself.
    expect(resolveSnakeStyle('?snake90s=0', 'development', 'true')).toBe(
      'classic'
    );
    expect(resolveSnakeStyle('?snake90s=off', 'development', 'true')).toBe(
      'classic'
    );
  });

  it('never lets an unreadable URL roll the composition back by accident', () => {
    // Absent, empty and unrecognised all mean "whatever this build ships".
    // Treating them as off would make a typo a silent rollback.
    for (const search of ['', '?snake90s=', '?snake90s=nineties', '?%']) {
      expect(resolveSnakeStyle(search, 'development', 'true')).toBe(
        NINETIES_SHIPPED_STYLE
      );
      expect(resolveSnakeStyle(search, 'development', 'false')).toBe('classic');
    }
  });
});
