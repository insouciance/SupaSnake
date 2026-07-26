/**
 * Artifact URLs and share payloads (WP-1.08, Rule 14 and §11.3).
 *
 * The central regression this file guards is the WP-0.08 lesson: several
 * platforms drop `url` from a `navigator.share` payload when `files` is
 * present, so EVERY payload must repeat the URL as the last line of `text`.
 * That is asserted for all six artifact classes, generically, so a seventh
 * cannot be added without inheriting the check.
 */

import { describe, it, expect } from '@jest/globals';
import {
  challengePlayPath,
  clanArtifactUrl,
  clanShare,
  lineageArtifactUrl,
  lineageShare,
  profileArtifactUrl,
  profileShare,
  runArtifactPath,
  runArtifactUrl,
  runShare,
  serpentWeekArtifactPath,
  serpentWeekArtifactUrl,
  settlementLines,
  settlementShare,
  signalArtifactPath,
  signalArtifactUrl,
  signalGridLines,
  signalGridShare,
  type SharePayload,
} from './artifactUrls';
import { CANONICAL_ORIGIN } from '@/shared/config/site';
import { challengeFromRun, challengeFromSignal, signalSeedForIndex } from '@/shared/game/challenge';

const EVERY_PAYLOAD: Array<[string, SharePayload]> = [
  [
    'signal',
    signalGridShare({
      day: 214,
      dynasty: 'CYBER',
      decisions: ['infuse', 'pass', 'pass', 'bank'],
      score: 1240,
      yieldDna: 2315,
      personalBest: true,
      handle: 'Sans_Souci',
    }),
  ],
  [
    'run',
    runShare({
      seed: 'D0badf00d',
      dynasty: 'PRIMAL',
      decisions: ['pass', 'bank'],
      score: 800,
      yieldDna: null,
      personalBest: false,
    }),
  ],
  [
    'settlement',
    settlementShare({
      weekKey: '2026-07-20',
      weekIndex: 134,
      clanName: 'Hollow Fang',
      clanTag: 'FANG',
      depth: 48210,
      bestWeek: true,
      contributingMembers: 7,
    }),
  ],
  [
    'lineage',
    lineageShare({
      code: 'Vyper~CYBER~4~',
      snakeName: 'Vyper',
      dynasty: 'CYBER',
      generation: 4,
      geneNames: ['Coil', 'Fang'],
    }),
  ],
  ['clan', clanShare({ name: 'Hollow Fang', tag: 'FANG', lifetimeDepth: 512000 })],
  ['profile', profileShare({ handle: 'Sans_Souci', bestScore: 1240 })],
];

describe('every share payload carries its URL twice (the WP-0.08 lesson)', () => {
  it.each(EVERY_PAYLOAD)('%s: url is set and is the last line of text', (_name, share) => {
    expect(share.url).toMatch(/^https:\/\//);
    expect(share.text.split('\n').at(-1)).toBe(share.url);
    expect(share.text).toContain(share.url);
    expect(share.title.length).toBeGreaterThan(0);
  });

  it.each(EVERY_PAYLOAD)('%s: never points at a preview deployment', (_name, share) => {
    expect(share.url.startsWith(CANONICAL_ORIGIN)).toBe(true);
  });

  it.each(EVERY_PAYLOAD)('%s: carries no commercial line (Rule 7)', (_name, share) => {
    expect(share.text).not.toMatch(/\b(buy|shop|store|upgrade|premium|sale|€|\$\d)/i);
  });

  it.each(EVERY_PAYLOAD)('%s: never implies a loss (Rules 5 and 6)', (_name, share) => {
    expect(share.text).not.toMatch(/\b(lost|expired|forfeit|reset to zero|decayed)\b/i);
  });

  it('emits no blank lines from absent optional facts', () => {
    const share = profileShare({ handle: 'Sans_Souci', bestScore: null });
    expect(share.text.split('\n').some((line) => line.trim() === '')).toBe(false);
  });
});

describe('the six artifact paths', () => {
  it('writes the Signal link exactly as §11.3 does', () => {
    expect(signalArtifactPath(214)).toBe('/s/214');
    expect(signalArtifactUrl(214)).toBe(`${CANONICAL_ORIGIN}/s/214`);
  });

  it('appends only the challenge parameters that exist, in a stable order', () => {
    expect(
      signalArtifactPath(214, { target: 1240, by: 'Sans_Souci', decisions: ['infuse', 'bank'] })
    ).toBe('/s/214?t=1240&by=Sans_Souci&d=ib');
    expect(signalArtifactPath(214, { target: null, by: null, decisions: [] })).toBe('/s/214');
  });

  it('escapes anything hostile in a path segment', () => {
    expect(runArtifactPath('a/b?c=d')).toBe('/r/a%2Fb%3Fc%3Dd');
    expect(lineageArtifactUrl('Vy per~CYBER~4~')).toBe(
      `${CANONICAL_ORIGIN}/x/Vy%20per~CYBER~4~`
    );
  });

  it('addresses the rest of the classes', () => {
    expect(serpentWeekArtifactPath('2026-07-20')).toBe('/w/2026-07-20');
    expect(serpentWeekArtifactPath('2026-07-20', 'FANG')).toBe('/w/2026-07-20?c=FANG');
    expect(serpentWeekArtifactUrl('2026-07-20')).toBe(`${CANONICAL_ORIGIN}/w/2026-07-20`);
    expect(clanArtifactUrl('FANG')).toBe(`${CANONICAL_ORIGIN}/c/FANG`);
    expect(profileArtifactUrl('Sans_Souci')).toBe(`${CANONICAL_ORIGIN}/p/Sans_Souci`);
    expect(runArtifactUrl('D0badf00d')).toBe(`${CANONICAL_ORIGIN}/r/D0badf00d`);
  });
});

describe('the way in (Rule 14: "a way in")', () => {
  it('sends a Signal challenge to a live board on the day seed', () => {
    const challenge = challengeFromSignal(214, { t: '1240', by: 'Sans_Souci' });
    expect(challengePlayPath(challenge)).toBe(
      `/game?seed=${signalSeedForIndex(214)}&target=1240&challenge=signal%3A214&by=Sans_Souci`
    );
  });

  it('sends a run challenge to the same seed it was cut from', () => {
    const challenge = challengeFromRun('D0badf00d', {})!;
    expect(challengePlayPath(challenge)).toBe(
      '/game?seed=D0badf00d&challenge=run%3AD0badf00d'
    );
  });
});

describe('the artifact copy', () => {
  it('composes the Signal grid in the shape §11.3 specifies', () => {
    expect(
      signalGridLines({
        day: 214,
        dynasty: 'CYBER',
        decisions: ['infuse', 'pass', 'pass', 'bank'],
        score: 1240,
        yieldDna: 2315,
        personalBest: true,
      })
    ).toEqual([
      'SUPASNAKE · Signal #214 · CYBER',
      '⚡▶▶💰  infuse · pass · pass · BANKED ×1.25',
      'Score 1,240 · best ↑ · Yield 2,315',
    ]);
  });

  it('omits the personal-best mark and the Yield when there are none', () => {
    expect(
      signalGridLines({
        day: 3,
        dynasty: 'PRIMAL',
        decisions: ['crash'],
        score: 40,
        yieldDna: null,
        personalBest: false,
      })[2]
    ).toBe('Score 40');
  });

  it('writes the settlement card as §11.3 quotes it', () => {
    expect(
      settlementLines({
        weekKey: '2026-07-20',
        weekIndex: 134,
        clanName: 'Hollow Fang',
        clanTag: 'FANG',
        depth: 48210,
        bestWeek: true,
        contributingMembers: 7,
      })[1]
    ).toBe('HOLLOW FANG reached Depth 48,210 — best week yet');
  });

  it('drops the "best week yet" claim on an ordinary week', () => {
    expect(
      settlementLines({
        weekKey: '2026-07-20',
        weekIndex: 134,
        clanName: 'Hollow Fang',
        clanTag: 'FANG',
        depth: 900,
        bestWeek: false,
        contributingMembers: 1,
      })
    ).toEqual([
      'SUPASNAKE · World Serpent · week of 2026-07-20',
      'HOLLOW FANG reached Depth 900',
      '1 member hunted',
    ]);
  });

  it('makes a Signal share link back to the same day as a challenge', () => {
    const share = signalGridShare({
      day: 214,
      dynasty: 'CYBER',
      decisions: ['bank'],
      score: 1240,
      yieldDna: null,
      personalBest: false,
      handle: 'Sans_Souci',
    });
    expect(share.url).toBe(`${CANONICAL_ORIGIN}/s/214?t=1240&by=Sans_Souci&d=b`);
  });
});
