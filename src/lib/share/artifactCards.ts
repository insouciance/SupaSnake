/**
 * The card model for each artifact class (WP-1.08).
 *
 * Pure: data in, `ArtifactCardModel` out. Kept apart from
 * `@/lib/og/artifactCard` so the copy, the provenance decision and the
 * number formatting can be asserted in a unit test without rasterising a
 * 1200×630 PNG — and so the same models can drive the landing pages, which
 * must say exactly what the image says.
 */

import type { ArtifactCardModel, ArtifactStat } from '@/lib/og/artifactCard';
import { payload, type SharePayload } from '@/lib/share/artifactUrls';
import {
  decisionGlyphs,
  decisionWords,
  type Challenge,
} from '@/shared/game/challenge';
import type { LineageCardModel } from '@/lib/share/lineageCode';
import { lineageGeneNames } from '@/lib/share/lineageCode';

function count(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

/**
 * Pass an artifact on, exactly as it arrived.
 *
 * A landing page already holds the card model and the URL that produced it,
 * so a re-share is those two things and nothing invented: it cannot claim a
 * dynasty, a score or a Depth the page was never told. Assembled through
 * `payload`, which appends the URL as the last line of `text` (the WP-0.08
 * lesson) — no share text is ever built anywhere else.
 */
export function cardShare(card: ArtifactCardModel, url: string): SharePayload {
  return payload(
    `SupaSnake — ${card.title}`,
    [card.kicker, card.glyphs ?? '', card.title, card.subtitle ?? ''],
    url
  );
}

/**
 * The Signal day. The day, its date and its seed are derived from the UTC
 * calendar and are therefore verified; a target and a decision string come
 * off the URL and make the card a claim.
 */
export function signalCardModel(input: {
  day: number;
  dayKey: string;
  seed: string;
  challenge: Challenge;
}): ArtifactCardModel {
  const { challenge } = input;
  const claimed = challenge.target !== null || challenge.decisions.length > 0;
  const title =
    challenge.target !== null
      ? challenge.by
        ? `Beat ${challenge.by}'s ${count(challenge.target)}`
        : `Beat ${count(challenge.target)}`
      : 'Today’s conditions, worldwide';

  return {
    kicker: `World Signal · #${Math.floor(input.day)} · ${input.dayKey}`,
    title,
    glyphs: decisionGlyphs(challenge.decisions) || undefined,
    subtitle:
      challenge.decisions.length > 0 ? decisionWords(challenge.decisions) : undefined,
    stats: [
      { label: 'Signal', value: `#${Math.floor(input.day)}` },
      { label: 'Seed', value: input.seed },
      ...(challenge.target !== null
        ? [{ label: 'Target', value: count(challenge.target) }]
        : []),
    ],
    provenance: claimed ? 'claimed' : 'verified',
    callToAction: 'One tap to a live board on this seed',
  };
}

/** A run outside the Signal, addressed by its own seed. Always a claim. */
export function runCardModel(input: {
  challenge: Challenge;
  dynasty?: string | null;
}): ArtifactCardModel {
  const { challenge } = input;
  return {
    kicker: input.dynasty ? `Run · ${input.dynasty.toUpperCase()}` : 'Run',
    title:
      challenge.target !== null
        ? challenge.by
          ? `Beat ${challenge.by}'s ${count(challenge.target)}`
          : `Beat ${count(challenge.target)}`
        : 'Take this seed',
    glyphs: decisionGlyphs(challenge.decisions) || undefined,
    subtitle:
      challenge.decisions.length > 0 ? decisionWords(challenge.decisions) : undefined,
    stats: [
      { label: 'Seed', value: challenge.seed },
      ...(challenge.target !== null
        ? [{ label: 'Target', value: count(challenge.target) }]
        : []),
    ],
    provenance: 'claimed',
    callToAction: 'One tap to a live board on this seed',
  };
}

/**
 * The Serpent settlement card — §11.3's clan-scale share. Every number here
 * is read from a settled row, so it is verified; when no clan is named the
 * card still stands on the week's own derived facts.
 *
 * Rule 5 / Rule 6: this card reports what a week ADDED. `bestWeek` is the
 * only comparative it carries, and it can only ever be good news.
 */
export function settlementCardModel(input: {
  weekKey: string;
  weekIndex: number;
  seed: string;
  modifierNames: readonly string[];
  clan: {
    name: string;
    tag: string;
    depth: number;
    bestWeek: boolean;
    contributingMembers: number;
  } | null;
}): ArtifactCardModel {
  const modifiers =
    input.modifierNames.length > 0 ? input.modifierNames.join(' · ') : 'No modifier';

  if (!input.clan) {
    return {
      kicker: `World Serpent · week of ${input.weekKey}`,
      title: 'The hunt is open',
      subtitle: modifiers,
      stats: [
        { label: 'Week', value: `#${Math.floor(input.weekIndex)}` },
        { label: 'Seed', value: input.seed },
      ],
      provenance: 'verified',
      callToAction: 'Three best runs make your Depth',
    };
  }

  return {
    kicker: `World Serpent · week of ${input.weekKey}`,
    title: `${input.clan.name.toUpperCase()} reached Depth ${count(input.clan.depth)}${
      input.clan.bestWeek ? ' — best week yet' : ''
    }`,
    subtitle: modifiers,
    stats: [
      { label: 'Depth', value: count(input.clan.depth) },
      {
        label: input.clan.contributingMembers === 1 ? 'Member hunted' : 'Members hunted',
        value: count(input.clan.contributingMembers),
      },
      { label: 'Seed', value: input.seed },
    ],
    provenance: 'verified',
    callToAction: 'Three best runs make your Depth',
  };
}

/** A clan, as a public object. Read from the clan row, so verified. */
export function clanCardModel(input: {
  name: string;
  tag: string;
  memberCount: number;
  lifetimeDepth: number;
  bestWeekDepth: number;
}): ArtifactCardModel {
  return {
    kicker: `Clan · [${input.tag}]`,
    title: input.name,
    subtitle: `${count(input.memberCount)} ${
      input.memberCount === 1 ? 'member' : 'members'
    } hunting the Serpent`,
    stats: [
      { label: 'Lifetime Depth', value: count(input.lifetimeDepth) },
      { label: 'Best week', value: count(input.bestWeekDepth) },
    ],
    provenance: 'verified',
    callToAction: 'Every member’s Depth adds — no thresholds, no bars',
  };
}

/** A snake. Everything on the card came out of the link, so it is a claim. */
export function lineageCardModelFor(model: LineageCardModel): ArtifactCardModel {
  const genes = lineageGeneNames(model);
  return {
    kicker: `Lineage · ${model.dynasty}`,
    title: model.snakeName,
    subtitle: genes.length > 0 ? genes.join(' · ') : 'Unwritten — no genes held',
    stats: [
      { label: 'Generation', value: `Gen ${Math.max(1, Math.floor(model.generation))}` },
      { label: 'Dynasty', value: model.dynasty },
      { label: 'Genes', value: count(genes.length) },
    ],
    provenance: 'claimed',
    callToAction: 'Breed your own in the Snake Lab',
  };
}

/** A profile. Read from the public Chronicle, so verified. */
export function profileCardModel(input: {
  handle: string;
  bestScore: number | null;
  totalRuns: number | null;
  lifetimeDepth: number | null;
}): ArtifactCardModel {
  const stats: ArtifactStat[] = [];
  if (input.bestScore !== null) {
    stats.push({ label: 'Best score', value: count(input.bestScore) });
  }
  if (input.lifetimeDepth !== null) {
    stats.push({ label: 'Lifetime Depth', value: count(input.lifetimeDepth) });
  }
  if (input.totalRuns !== null) {
    stats.push({ label: 'Runs', value: count(input.totalRuns) });
  }
  return {
    kicker: 'Chronicle',
    title: input.handle,
    subtitle: 'Where skill creates legacy',
    stats,
    provenance: 'verified',
    callToAction: 'Start your own chronicle',
  };
}
