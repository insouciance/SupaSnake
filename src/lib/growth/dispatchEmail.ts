/**
 * The Dispatch confirmation email (Constitution §11.6), via Resend.
 *
 * House rule from the Analyst digest and the Discord integration: raw fetch
 * against the thin REST surface, no SDK. Non-fatal by contract — a failed
 * send never fails the request; the address simply stays `pending` and the
 * visitor can ask again after the cooldown.
 *
 * Rule 7, stated as a property of this file: **this email sells nothing.**
 * It contains one sentence of what the list is, one confirmation link, one
 * "ignore this if it wasn't you", and the operator's postal identity. No
 * product, no price, no offer, no badge, no upsell — not now and not in any
 * later edit.
 */

import { LEGAL_ENTITY, LEGAL_CONTACT, formatAddress } from '@/shared/config/legal';
import { CANONICAL_ORIGIN, SITE_NAME } from '@/shared/config/site';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = `${SITE_NAME} <noreply@supasnake.com>`;

export function dispatchEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function confirmationUrl(token: string): string {
  return `${CANONICAL_ORIGIN}/dispatch/confirm?token=${encodeURIComponent(token)}`;
}

export function unsubscribeUrl(token: string): string {
  return `${CANONICAL_ORIGIN}/dispatch/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Arcade-styled, single-column, inline-CSS HTML (email clients strip
 * stylesheets) — the same construction as the Analyst digest.
 */
export function confirmationEmailHtml(params: {
  confirmUrl: string;
  unsubscribeUrl: string;
}): string {
  return [
    `<div style="background:#06090d;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">`,
    `<div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#121a24,#0a1017);border:1px solid #2b3b4d;border-radius:6px;padding:28px;">`,
    `<div style="color:#22d3ee;font-size:12px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(SITE_NAME)} Dispatch</div>`,
    `<h1 style="color:#e6edf3;font-size:24px;margin:12px 0;">Confirm your subscription</h1>`,
    `<p style="color:#94a3b8;font-size:15px;line-height:1.6;">The Dispatch is occasional news about ${escapeHtml(SITE_NAME)} and the results of the weekly hunt. Click below to confirm this address; nothing is sent until you do.</p>`,
    `<p style="margin-top:24px;"><a href="${escapeHtml(params.confirmUrl)}" style="display:inline-block;background:#22d3ee;color:#06090d;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:4px;letter-spacing:1px;">CONFIRM SUBSCRIPTION</a></p>`,
    `<p style="color:#94a3b8;font-size:13px;line-height:1.6;margin-top:20px;">The link works for 48 hours. If you did not ask for this, ignore this message — the address is never added without the click above, and we will not write again.</p>`,
    `<p style="color:#5b6478;font-size:11px;margin-top:24px;line-height:1.6;">`,
    `You can leave the list at any time: <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#94a3b8;">unsubscribe</a>.<br/>`,
    `${escapeHtml(LEGAL_ENTITY.name)} · ${escapeHtml(formatAddress())}<br/>`,
    `${escapeHtml(LEGAL_CONTACT.email)}`,
    `</p>`,
    `</div></div>`,
  ].join('');
}

export function confirmationEmailText(params: {
  confirmUrl: string;
  unsubscribeUrl: string;
}): string {
  return [
    `${SITE_NAME} Dispatch — confirm your subscription`,
    '',
    `The Dispatch is occasional news about ${SITE_NAME} and the results of the weekly hunt.`,
    'Confirm this address by opening the link below. Nothing is sent until you do.',
    '',
    params.confirmUrl,
    '',
    'The link works for 48 hours. If you did not ask for this, ignore this message.',
    '',
    `Unsubscribe: ${params.unsubscribeUrl}`,
    `${LEGAL_ENTITY.name} · ${formatAddress()} · ${LEGAL_CONTACT.email}`,
  ].join('\n');
}

/**
 * Send one confirmation email. Returns true on success; every failure path
 * logs and returns false (non-fatal by contract).
 */
export async function sendDispatchConfirmationEmail(params: {
  to: string;
  confirmationToken: string;
  unsubscribeToken: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const links = {
    confirmUrl: confirmationUrl(params.confirmationToken),
    unsubscribeUrl: unsubscribeUrl(params.unsubscribeToken),
  };

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
        subject: `Confirm your ${SITE_NAME} Dispatch subscription`,
        html: confirmationEmailHtml(links),
        text: confirmationEmailText(links),
        headers: {
          // RFC 8058: one-click unsubscribe, honoured by every major client.
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    if (!response.ok) {
      console.error(`Dispatch confirmation send failed (${response.status})`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      'Dispatch confirmation send error:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
