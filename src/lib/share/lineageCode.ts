/**
 * The lineage code — a snake, addressable as a URL (Rule 14, §8.2).
 *
 * WHY THE SNAKE TRAVELS IN THE LINK RATHER THAN IN A LOOKUP
 *
 * A shared snake card has to render for a stranger who is not logged in,
 * from a link that outlives the session that made it, without exposing a
 * player's collection to enumeration and without a new public table. So the
 * card's four facts — name, dynasty, generation, genes — ride in the path
 * segment, and the page is a pure function of the code.
 *
 * That means a code is forgeable, and the design accepts it: a lineage card
 * shows nothing rankable. There is no score on it, it is never written
 * anywhere, and it settles nothing (Rule 11 is untouched — no mutation goes
 * near this file). It is a portrait, and portraits are not evidence.
 *
 * FORMAT — deliberately readable, not base64
 *
 *     Vyper~CYBER~4~coil,fang,thrum
 *
 * Percent-encoded per field with `~` as the separator, so a code survives
 * being read aloud, is obvious in a log, and needs no binary codec that
 * would have to behave identically in Node, the browser and the Edge
 * runtime the OG images render in.
 */

import { GENES, geneDisplayName, isGeneId, type GeneId } from '@/shared/game/genes';

export interface LineageCardModel {
  snakeName: string;
  dynasty: 'CYBER' | 'PRIMAL' | 'COSMIC';
  generation: number;
  genes: GeneId[];
}

const DYNASTIES = ['CYBER', 'PRIMAL', 'COSMIC'] as const;
type Dynasty = (typeof DYNASTIES)[number];

/** Names longer than this are truncated: a card has finite width. */
export const MAX_SNAKE_NAME = 24;
/** A snake holds far fewer genes than this; the bound is anti-abuse only. */
export const MAX_LINEAGE_GENES = 8;
export const MAX_GENERATION = 9999;

function encodeField(value: string): string {
  // encodeURIComponent leaves `~` alone, and `~` is our separator.
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

function isDynasty(value: string): value is Dynasty {
  return (DYNASTIES as readonly string[]).includes(value);
}

export function encodeLineageCode(model: LineageCardModel): string {
  const name = model.snakeName.trim().slice(0, MAX_SNAKE_NAME) || 'Snake';
  const generation = Math.min(
    MAX_GENERATION,
    Math.max(1, Math.floor(model.generation) || 1)
  );
  const genes = model.genes.slice(0, MAX_LINEAGE_GENES).join(',');
  return [encodeField(name), model.dynasty, String(generation), encodeField(genes)].join('~');
}

/**
 * Decode a code from a URL segment. Returns null for anything malformed —
 * an unreadable code must 404, never render a card of guesses.
 */
export function decodeLineageCode(raw: unknown): LineageCardModel | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 400) return null;

  let decodedSegment: string;
  try {
    // Next hands route params already percent-decoded once; a code that
    // arrives raw (a hand-typed link, a test) decodes to the same thing.
    decodedSegment = raw.includes('~') ? raw : decodeURIComponent(raw);
  } catch {
    return null;
  }

  const parts = decodedSegment.split('~');
  if (parts.length !== 4) return null;

  let name: string;
  let geneField: string;
  try {
    name = decodeURIComponent(parts[0]).trim().slice(0, MAX_SNAKE_NAME);
    geneField = decodeURIComponent(parts[3]);
  } catch {
    return null;
  }
  if (name.length === 0) return null;

  const dynasty = parts[1];
  if (!isDynasty(dynasty)) return null;

  // Generation 0 is refused rather than promoted to 1: a code that does not
  // name a real generation is malformed, and silently repairing it would put
  // a number on the card that nobody wrote.
  if (!/^\d{1,4}$/.test(parts[2])) return null;
  const generation = Number(parts[2]);
  if (generation < 1 || generation > MAX_GENERATION) return null;

  const genes: GeneId[] = [];
  for (const id of geneField.split(',')) {
    if (isGeneId(id) && !genes.includes(id)) genes.push(id);
    if (genes.length >= MAX_LINEAGE_GENES) break;
  }

  return { snakeName: name, dynasty, generation, genes };
}

/** Display names for the card and the share text. */
export function lineageGeneNames(model: LineageCardModel): string[] {
  // A share card is a public artifact of a real snake. Naming its Powers
  // differently from every other surface would put the double-naming bug back
  // in the one place a stranger sees first.
  return model.genes.map((id) => geneDisplayName(id));
}
