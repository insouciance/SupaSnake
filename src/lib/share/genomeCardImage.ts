import { GENES, isGeneId } from '@/shared/game/genes';
import { SPLICES, isSpliceId } from '@/shared/game/splices';
import { STRAINS, isStrainId, STRAIN_TIER_NAMES, type StrainId } from '@/shared/game/strains';
import { canonicalUrl } from '@/shared/config/site';

export interface GenomeCardGene {
  id: string;
  name: string;
  strains: readonly StrainId[];
}

export interface GenomeCardSplice {
  id: string;
  name: string;
}

export interface GenomeCardMilestone {
  strain: StrainId;
  tier: 'Expression' | 'Apex';
  name: string;
}

/**
 * The settled payout cascade, as it actually settles after WP-0.02:
 * raw fold -> genome -> outcome multiplier (BANK x1.25 / SALVAGE x0.60),
 * and then the immutable Energy Commitment harvest factor (§8.6). The account
 * multiplier stack (streak / collection set / clan duel) is deleted - the
 * card must never show a factor the settlement does not apply.
 */
export interface GenomeCardCascade {
  raw: number;
  genome: number;
  outcome: number;
  total: number;
}

export interface GenomeCardModel {
  snakeName: string;
  dynasty: string;
  generation: number;
  score: number;
  foods: number;
  extracted: boolean;
  genes: GenomeCardGene[];
  splices: GenomeCardSplice[];
  milestones: GenomeCardMilestone[];
  cascade: GenomeCardCascade;
  allIn: boolean;
}

export interface GenomeCardCascadeRow {
  label: string;
  value: number;
  factor: number | null;
}

export interface GenomeCardRunMeta {
  snakeName: string;
  dynasty: string;
  generation: number;
  score: number;
  foods: number;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function numericRecord(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = finiteNonNegative(value);
    if (normalized !== null) values[key] = normalized;
  }
  return values;
}

/**
 * Turn the untrusted session-end JSON into the card's display model.
 * A card is rendered only when the response contains a server-accepted
 * Genome record and all payout anchors needed for an honest cascade.
 */
export function buildGenomeCardModel(
  result: unknown,
  meta: GenomeCardRunMeta
): GenomeCardModel | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null;
  const response = result as Record<string, unknown>;
  if (typeof response.genome !== 'object' || response.genome === null || Array.isArray(response.genome)) {
    return null;
  }
  if (typeof response.validation !== 'object' || response.validation === null || Array.isArray(response.validation)) {
    return null;
  }
  const genome = response.genome as Record<string, unknown>;
  const validation = response.validation as Record<string, unknown>;
  const raw = finiteNonNegative(validation.genelessRawDna);
  const genomeRaw = finiteNonNegative(validation.rawDna);
  const outcome = finiteNonNegative(validation.baseDna);
  const earningTotal = finiteNonNegative(validation.adjustedDna);
  const hypothetical = finiteNonNegative(response.hypotheticalDna);
  if (raw === null || genomeRaw === null || outcome === null || earningTotal === null) return null;

  const genes: GenomeCardGene[] = [];
  if (Array.isArray(genome.picks)) {
    for (const item of genome.picks) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const id = (item as Record<string, unknown>).id;
      if (!isGeneId(id)) continue;
      genes.push({ id, name: GENES[id].name, strains: GENES[id].strains });
    }
  }
  const splices: GenomeCardSplice[] = [];
  if (Array.isArray(genome.splices)) {
    for (const item of genome.splices) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const id = (item as Record<string, unknown>).id;
      if (!isSpliceId(id) || splices.some((entry) => entry.id === id)) continue;
      splices.push({ id, name: SPLICES[id].name });
    }
  }
  const expressions = numericRecord(genome.expressions);
  const apexes = numericRecord(genome.apexes);
  const milestones: GenomeCardMilestone[] = [];
  for (const strain of Object.keys(expressions)) {
    if (isStrainId(strain)) {
      milestones.push({
        strain,
        tier: 'Expression',
        name: STRAIN_TIER_NAMES[strain].expression,
      });
    }
  }
  for (const strain of Object.keys(apexes)) {
    if (isStrainId(strain)) {
      milestones.push({
        strain,
        tier: 'Apex',
        name: STRAIN_TIER_NAMES[strain].apex,
      });
    }
  }

  const total = hypothetical ?? earningTotal;

  let thirdInfuseAt: number | null = null;
  if (Array.isArray(genome.infuses) && genome.infuses.length >= 3) {
    const item = genome.infuses[2];
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      thirdInfuseAt = finiteNonNegative((item as Record<string, unknown>).atFood);
    }
  }
  const extracted = validation.extracted === true;

  return {
    ...meta,
    score: Math.max(0, Math.floor(meta.score)),
    foods: Math.max(0, Math.floor(meta.foods)),
    extracted,
    genes,
    splices,
    milestones,
    cascade: {
      raw: Math.floor(raw),
      genome: Math.floor(genomeRaw),
      outcome: Math.floor(outcome),
      total: Math.floor(total),
    },
    allIn:
      extracted &&
      thirdInfuseAt !== null &&
      meta.foods >= thirdInfuseAt &&
      meta.foods - thirdInfuseAt <= 5,
  };
}

function safeFactor(before: number, after: number): number {
  return before > 0 ? Math.round((after / before) * 1000) / 1000 : 1;
}

export function genomeCardCascadeRows(model: GenomeCardModel): GenomeCardCascadeRow[] {
  const c = model.cascade;
  const rows: GenomeCardCascadeRow[] = [
    { label: 'RAW', value: c.raw, factor: null },
    { label: 'GENOME', value: c.genome, factor: safeFactor(c.raw, c.genome) },
    {
      label: model.extracted ? 'BANK + INFUSES' : 'SALVAGE',
      value: c.outcome,
      factor: safeFactor(c.genome, c.outcome),
    },
  ];
  // The outcome IS the settled payout unless the day's allotment ran out,
  // in which case the harvest factor (§8.6) is the one honest last step.
  if (c.total !== c.outcome) {
    rows.push({ label: 'HARVEST', value: c.total, factor: safeFactor(c.outcome, c.total) });
  }
  return rows;
}

export function genomeCardFilename(model: GenomeCardModel): string {
  const snake = model.snakeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'snake';
  return `supasnake-genome-${snake}-${model.score}.png`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/** Draw the 1200×630 share asset without DOM screenshots or WebGL reads. */
export function drawGenomeCard(
  ctx: CanvasRenderingContext2D,
  model: GenomeCardModel
): void {
  const width = 1200;
  const height = 630;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#080d12');
  gradient.addColorStop(0.55, '#101827');
  gradient.addColorStop(1, '#080a0e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#2d4055';
  ctx.lineWidth = 2;
  roundedRect(ctx, 32, 32, width - 64, height - 64, 24);
  ctx.stroke();

  ctx.fillStyle = '#f97316';
  ctx.font = '700 28px "Space Grotesk", sans-serif';
  ctx.fillText('SUPASNAKE // GENOME', 64, 82);
  ctx.fillStyle = '#f4f1e8';
  ctx.font = '700 52px "Space Grotesk", sans-serif';
  ctx.fillText(model.snakeName, 64, 142);
  ctx.fillStyle = '#aeb9c7';
  ctx.font = '500 21px Inter, sans-serif';
  ctx.fillText(`${model.dynasty} · GEN ${model.generation} · ${model.foods} FOODS · SCORE ${model.score}`, 66, 178);

  // Body strip: one stable band per gene, repeated across 30 segments.
  const bands = model.genes.length > 0 ? model.genes : [{ id: 'none', name: 'Unwritten', strains: ['FLUX'] as const }];
  for (let i = 0; i < 30; i++) {
    const gene = bands[Math.min(bands.length - 1, Math.floor((i / 30) * bands.length))];
    const strain = gene.strains[i % gene.strains.length] ?? 'FLUX';
    ctx.fillStyle = STRAINS[strain].color;
    roundedRect(ctx, 66 + i * 23, 215, 18, 22, 5);
    ctx.fill();
  }

  // Gene barcode.
  for (let i = 0; i < model.genes.length; i++) {
    const gene = model.genes[i];
    const strain = gene.strains[0] ?? 'FLUX';
    ctx.fillStyle = STRAINS[strain].color;
    ctx.fillRect(66 + i * 28, 253, 7 + (i % 3) * 3, 42);
  }

  ctx.fillStyle = '#d8dee8';
  ctx.font = '600 19px Inter, sans-serif';
  ctx.fillText(model.genes.map((gene) => gene.name).join('  ·  ').slice(0, 72) || 'No genes held', 66, 328);
  if (model.splices.length > 0) {
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText(`SPLICES  ${model.splices.map((splice) => splice.name).join(' · ')}`, 66, 360);
  }
  if (model.milestones.length > 0) {
    ctx.fillStyle = '#7df9ff';
    ctx.fillText(model.milestones.map((item) => `${item.tier.toUpperCase()} ${item.name}`).join('  ·  ').slice(0, 78), 66, 392);
  }

  const rows = genomeCardCascadeRows(model);
  const x = 760;
  ctx.font = '600 18px Inter, sans-serif';
  rows.forEach((row, index) => {
    const y = 112 + index * 62;
    ctx.fillStyle = index === rows.length - 1 ? '#f97316' : '#94a3b8';
    ctx.fillText(row.label, x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f4f1e8';
    ctx.font = index === rows.length - 1 ? '700 32px "Space Grotesk", sans-serif' : '700 24px "Space Grotesk", sans-serif';
    ctx.fillText(`${row.value.toLocaleString()} DNA`, 1110, y);
    if (row.factor !== null) {
      ctx.fillStyle = '#64748b';
      ctx.font = '500 15px Inter, sans-serif';
      ctx.fillText(`×${row.factor.toFixed(2)}`, 1110, y + 20);
    }
    ctx.textAlign = 'left';
    ctx.font = '600 18px Inter, sans-serif';
  });

  if (model.allIn) {
    ctx.save();
    ctx.translate(690, 512);
    ctx.rotate(-0.08);
    ctx.strokeStyle = '#f43f5e';
    ctx.fillStyle = '#f43f5e';
    ctx.lineWidth = 4;
    ctx.font = '900 34px "Space Grotesk", sans-serif';
    roundedRect(ctx, -110, -32, 220, 58, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText('ALL IN', 0, 10);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillText(model.extracted ? 'EXTRACTED // BUILD SECURED' : 'CRASHED // GENOME RECOVERED', 66, 560);
  ctx.textAlign = 'right';
  ctx.fillText('supasnake.com', 1132, 560);
  ctx.textAlign = 'left';
}

export async function createGenomeCardBlob(model: GenomeCardModel): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Genome Card export needs a browser');
  await Promise.allSettled([
    document.fonts?.load('700 52px "Space Grotesk"'),
    document.fonts?.load('500 18px Inter'),
  ].filter(Boolean) as Promise<unknown>[]);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  drawGenomeCard(ctx, model);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png');
  });
}

/**
 * Where a shared Genome Card points. Constitution Rule 14 — every artifact
 * "is linkable, and the link carries an image and a way in" — and §11.4:
 * every shared URL is a playable ad, because the root lands playing.
 *
 * Always the canonical origin, never the deployment origin: a card shared
 * from a preview build must not hand a stranger a preview link.
 */
export const GENOME_CARD_SHARE_URL = canonicalUrl('/');

/**
 * The share sheet's text. Ends with the URL on its own line so the link
 * survives the platforms that silently drop `url` when `files` is present
 * (the reason the shipped card reached players with no way back in).
 */
export function genomeCardShareText(model: GenomeCardModel): string {
  return [
    `${model.cascade.total.toLocaleString()} DNA · ${model.genes.length} genes`,
    GENOME_CARD_SHARE_URL,
  ].join('\n');
}

export async function shareGenomeCard(
  model: GenomeCardModel
): Promise<'shared' | 'downloaded'> {
  const blob = await createGenomeCardBlob(model);
  const filename = genomeCardFilename(model);
  const file = new File([blob], filename, { type: 'image/png' });
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: `${model.snakeName}'s SupaSnake Genome`,
      text: genomeCardShareText(model),
      url: GENOME_CARD_SHARE_URL,
    });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'downloaded';
}
