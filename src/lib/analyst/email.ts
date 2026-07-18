/**
 * The Analyst — weekly digest email via Resend (Identity v1 §9.2).
 *
 * Raw fetch against the Resend REST API (no SDK — house rule from the
 * Discord integration: plain fetch for thin REST surfaces). Strictly
 * opt-in (player_settings.email_digest_opt_in), registered players
 * with a linked email only, and ALWAYS non-fatal: a failed send never
 * fails the cron.
 */

import { ArtifactContent, DigestFacts } from './facts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'SupaSnake <noreply@supasnake.com>';

export function digestEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Arcade-styled, single-column, inline-CSS HTML (email clients strip
 * stylesheets). Dark void palette + venom orange, mirroring the app.
 */
export function digestEmailHtml(params: {
  handle: string;
  weekStart: string;
  content: ArtifactContent;
  facts: DigestFacts | null;
}): string {
  const { content, facts } = params;
  const tipRows = content.tips
    .map(
      (tip) =>
        `<tr><td style="padding:6px 0;color:#c9c4b8;font-size:14px;">▸ ${escapeHtml(tip)}</td></tr>`
    )
    .join('');
  const statCells = facts
    ? [
        { label: 'RUNS', value: String(facts.runs) },
        { label: 'DNA BANKED', value: String(facts.totalDna) },
        { label: 'EXTRACTION', value: `${facts.extractionRatePct}%` },
        { label: 'BEST RUN', value: String(facts.bestDnaRun) },
      ]
        .map(
          (s) =>
            `<td align="center" style="padding:10px;border:1px solid #2b3a55;border-radius:4px;">` +
            `<div style="color:#8b93a7;font-size:10px;letter-spacing:2px;">${s.label}</div>` +
            `<div style="color:#f5f2e9;font-size:20px;font-weight:bold;">${escapeHtml(s.value)}</div></td>`
        )
        .join('<td style="width:8px;"></td>')
    : '';

  return [
    `<div style="background:#0b0b12;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">`,
    `<div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#131a2a,#0b0b12);border:1px solid #2b3a55;border-radius:6px;padding:28px;">`,
    `<div style="color:#fb923c;font-size:12px;letter-spacing:3px;text-transform:uppercase;">The Analyst — Week of ${escapeHtml(params.weekStart)}</div>`,
    `<h1 style="color:#f5f2e9;font-size:24px;margin:12px 0;text-transform:uppercase;">${escapeHtml(content.headline)}</h1>`,
    `<p style="color:#c9c4b8;font-size:15px;line-height:1.6;">${escapeHtml(content.body)}</p>`,
    statCells
      ? `<table role="presentation" width="100%" style="margin:18px 0;border-collapse:separate;"><tr>${statCells}</tr></table>`
      : '',
    tipRows
      ? `<table role="presentation" width="100%" style="margin:8px 0;">${tipRows}</table>`
      : '',
    `<p style="margin-top:24px;"><a href="https://supasnake.com/profile" style="display:inline-block;background:#fb923c;color:#0b0b12;text-decoration:none;font-weight:bold;padding:10px 22px;border-radius:4px;letter-spacing:1px;">OPEN YOUR CHRONICLE</a></p>`,
    `<p style="color:#5b6478;font-size:11px;margin-top:24px;">You get this because the weekly digest is switched on in your SupaSnake settings. Turn it off any time: Settings → Weekly Digest Email.</p>`,
    `</div></div>`,
  ].join('');
}

/**
 * Send one digest email. Returns true on success; every failure path
 * logs and returns false (non-fatal by contract).
 */
export async function sendDigestEmail(params: {
  to: string;
  handle: string;
  weekStart: string;
  content: ArtifactContent;
  facts: DigestFacts | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [params.to],
        subject: `Your SupaSnake week — ${params.content.headline}`,
        html: digestEmailHtml(params),
      }),
    });
    if (!response.ok) {
      console.error(
        `Digest email send failed (${response.status}) for week ${params.weekStart}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      'Digest email send error:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
