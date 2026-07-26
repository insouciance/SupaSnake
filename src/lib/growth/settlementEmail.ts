/**
 * The weekly settlement email — DETERMINISTIC (Constitution §7.6, §11.6).
 *
 * §7.6 names this channel and names its construction: "the **deterministic**
 * weekly settlement email (opt-in, game-state only, built on the shipped
 * Resend path with LLM narration retired)".
 *
 * THERE IS NO MODEL IN THIS PATH, AND THERE MUST NEVER BE ONE
 *
 *   Every sentence below is written here, in this file, and chosen by a
 *   comparison between two numbers that came out of a settled Serpent week.
 *   Nothing is generated. This module imports no LLM client, calls no
 *   completion endpoint, spends no token budget and consults no `openai`
 *   dependency — the only network call it makes is the Resend POST that sends
 *   the finished message, and `settlementEmail.test.ts` asserts that from both
 *   directions (no import, and no fetch anywhere in composition).
 *
 *   The predecessor — `src/lib/analyst/email.ts`, an LLM-narrated weekly
 *   digest wired into the Analyst cron — is retired by this work package. The
 *   consent it collected (`player_settings.email_digest_opt_in`) is NOT
 *   retired: a player who opted into a weekly email still gets a weekly email,
 *   it is simply written from their week instead of about it.
 *
 * RULE 7, THE SHARPEST CONSTRAINT HERE
 *
 *   "No notification, email or badge is ever commercial." This email contains
 *   the week, the player's own numbers, one link to the week's public page,
 *   the unsubscribe link, and the operator's postal identity. No product, no
 *   price, no offer, no badge, no upsell — not now and not in any later edit,
 *   and `sendSettlementEmail` sweeps subject, HTML and text through
 *   `commercialLanguage` and REFUSES rather than sending a message that trips
 *   it. The guard runs in production, not only in CI.
 *
 * RULE 5 — THE MISSED WEEK IS THE HARD CASE, SO IT IS WRITTEN FIRST
 *
 *   A player who was away gets an honest week note: the week ran, its runs
 *   went with it, and nothing of theirs moved. No decay, no debt, no backlog,
 *   no streak, no "you're falling behind", no catch-up offer. The copy is
 *   WP-1.07's, because the Monday briefing already had to solve this and the
 *   two must not develop separate voices.
 *
 * OPT-IN ONLY
 *
 *   `isSettlementMailable` is the ONLY question a sender may ask, and it is
 *   the same shape of gate WP-0.08 built: a Dispatch address must be
 *   `confirmed` AND carry a confirmation timestamp (the double-opt-in state
 *   machine, unchanged); a player must have opted in AND hold a confirmed,
 *   non-anonymous email address. An address that never confirmed is never
 *   mailed, and neither is one that unsubscribed.
 */

import { LEGAL_ENTITY, LEGAL_CONTACT, formatAddress } from '@/shared/config/legal';
import { CANONICAL_ORIGIN, SITE_NAME } from '@/shared/config/site';
import { sweepMessage } from '@/lib/growth/commercialLanguage';
import { SETTLEMENT_DISPATCH_V1 } from '@/lib/growth/config';
import { isMailable, type WaitlistRow } from '@/lib/growth/dispatchWaitlist';
import { unsubscribeUrl } from '@/lib/growth/dispatchEmail';
import { composeSettlementPost } from '@/lib/growth/settlementPost';
import { formatWeekStart, readWeekBriefing, segments } from '@/lib/serpent/briefing';
import type { SerpentPanel } from '@/lib/server/serpent';
import { serpentWeekArtifactUrl } from '@/lib/share/artifactUrls';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = `${SITE_NAME} <noreply@supasnake.com>`;

/** Where a signed-in player turns this email off. */
export const EMAIL_PREFERENCES_URL = `${CANONICAL_ORIGIN}/settings`;

export function settlementEmailEnabled(): boolean {
  return SETTLEMENT_DISPATCH_V1 && Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Who may be mailed
// ---------------------------------------------------------------------------

/**
 * A confirmed Dispatch address (§11.6's opt-in news and settlement list). The
 * list holds no player data by design — migration 040 deliberately has no
 * foreign key to `players` — so this recipient gets the week, not a personal
 * reading.
 */
export interface DispatchRecipient {
  kind: 'dispatch';
  email: string;
  row: WaitlistRow | null;
  /** The raw unsubscribe token; only its SHA-256 digest is ever stored. */
  unsubscribeToken: string;
}

/**
 * A registered player who asked for the weekly email. Two independent facts
 * are required, which is what makes this a double gate rather than a checkbox:
 * the address was CONFIRMED (by the auth provider, at sign-up) and consent was
 * SEPARATELY given (`player_settings.email_digest_opt_in`).
 */
export interface PlayerRecipient {
  kind: 'player';
  email: string | null;
  optIn: boolean;
  /** `auth.users.email_confirmed_at`. Null means the address never confirmed. */
  emailConfirmedAt: string | null;
  isAnonymous: boolean;
}

export type SettlementRecipient = DispatchRecipient | PlayerRecipient;

/**
 * The only question a sender may ask. Both branches require an affirmative
 * act by the address's owner; neither can be satisfied by a partially written
 * row, an unsubscribed row, or an anonymous session that happens to carry an
 * address.
 */
export function isSettlementMailable(recipient: SettlementRecipient): boolean {
  if (recipient.kind === 'dispatch') {
    if (!recipient.email || !recipient.unsubscribeToken) return false;
    return isMailable(recipient.row);
  }
  if (!recipient.email) return false;
  if (recipient.isAnonymous) return false;
  if (!recipient.emailConfirmedAt) return false;
  return recipient.optIn === true;
}

/** The unsubscribe link this recipient's message must carry. */
export function recipientUnsubscribeUrl(recipient: SettlementRecipient): string {
  return recipient.kind === 'dispatch'
    ? unsubscribeUrl(recipient.unsubscribeToken)
    : EMAIL_PREFERENCES_URL;
}

// ---------------------------------------------------------------------------
// What the email says
// ---------------------------------------------------------------------------

export interface SettlementEmailModel {
  /** `YYYY-MM-DD`, the Monday the week started. */
  weekKey: string;
  /** `"13 July 2026"` — the same rendering the briefing uses. */
  weekLabel: string;
  /** The week's named conditions, or `'No modifier'`. */
  conditions: string;
  /** The settlement, in the same sentences the auto-composed post publishes. */
  worldLines: string[];
  /**
   * The player's own week, in the Monday briefing's voice. `null` for a
   * Dispatch-list send, which carries no player data at all.
   */
  personalLines: string[] | null;
  /** The week's public page (Rule 14). The one link in the body. */
  weekUrl: string;
}

/**
 * The player's week, phrased exactly as WP-1.07 phrases it.
 *
 * Rule 5 lives in the `else` branch: a week the player was away for reports
 * that the week passed and that nothing of theirs moved. It does not say they
 * lost anything, because they did not; it does not urge them back, because
 * that is a duty and §7 refuses to build one.
 */
export function personalWeekLines(
  panel: SerpentPanel,
  weekKey: string,
  now: Date | number = Date.now()
): string[] | null {
  const briefing = readWeekBriefing(panel, weekKey, now);
  if (!briefing) return null;

  const lines: string[] = [];
  if (briefing.hunted) {
    lines.push(`You fed ${segments(briefing.yourDepth)}.`);
    if (briefing.deepestYet) {
      lines.push(
        briefing.priorBest > 0
          ? `Deeper than any week before it. It stands as your deepest week.`
          : 'Your first week on the hunt. It stands as your deepest week.'
      );
    } else {
      lines.push(
        `Your deepest week stands at ${segments(
          briefing.priorBest
        )}; this one read ${segments(
          briefing.yourDepth
        )}. Both weeks keep their place in your history.`
      );
    }
  } else {
    lines.push('You did not hunt this week.');
    lines.push(
      'The week passed and its runs went with it. Nothing of yours went with them: your Depth, your records, your snakes and your lineage all stand exactly where you left them, and there is no catching up waiting for you.'
    );
    if (briefing.priorBest > 0) {
      lines.push(`Your deepest week still stands at ${segments(briefing.priorBest)}.`);
    }
    lines.push(
      'The Serpent surfaces again every Monday, and the next week is a fresh one.'
    );
  }

  if (briefing.clanDepth !== null) {
    lines.push(
      `Your clan fed ${segments(
        briefing.clanDepth
      )} that week — every member's segments added together, and nothing else.`
    );
  } else if (briefing.hunted) {
    lines.push("You hunted without a clan, so this week's Depth is yours alone.");
  }

  return lines;
}

/**
 * Build the model for one settled week. Returns `null` when the key names no
 * Serpent week or a week that has not started — the same refusal the post
 * makes, for the same reason.
 *
 * `personal: false` produces a Dispatch-list message: the week and its public
 * facts, with no player data in it at all.
 */
export function buildSettlementEmailModel(
  panel: SerpentPanel,
  weekKey: string,
  options: { personal: boolean },
  now: Date | number = Date.now()
): SettlementEmailModel | null {
  const post = composeSettlementPost(panel, weekKey, now);
  if (!post) return null;

  return {
    weekKey,
    weekLabel: formatWeekStart(weekKey),
    conditions: post.conditions,
    worldLines: post.lines,
    personalLines: options.personal ? personalWeekLines(panel, weekKey, now) : null,
    weekUrl: serpentWeekArtifactUrl(weekKey, null),
  };
}

export function settlementEmailSubject(model: SettlementEmailModel): string {
  return `${SITE_NAME} — the Serpent week of ${model.weekLabel}`;
}

/**
 * Arcade-styled, single-column, inline-CSS HTML — the same construction as
 * `dispatchEmail.ts`, because email clients strip stylesheets and because two
 * emails from the same game should look like it.
 */
export function settlementEmailHtml(
  model: SettlementEmailModel,
  links: { unsubscribeUrl: string }
): string {
  const personal = model.personalLines
    ? [
        `<h2 style="color:#e6edf3;font-size:16px;margin:24px 0 8px;">Your week</h2>`,
        ...model.personalLines.map(
          (line) =>
            `<p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(
              line
            )}</p>`
        ),
      ]
    : [];

  return [
    `<div style="background:#06090d;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">`,
    `<div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#121a24,#0a1017);border:1px solid #2b3b4d;border-radius:6px;padding:28px;">`,
    `<div style="color:#22d3ee;font-size:12px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(
      SITE_NAME
    )} Dispatch</div>`,
    `<h1 style="color:#e6edf3;font-size:24px;margin:12px 0;">The Serpent week of ${escapeHtml(
      model.weekLabel
    )}</h1>`,
    ...model.worldLines.map(
      (line) =>
        `<p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(
          line
        )}</p>`
    ),
    ...personal,
    `<p style="margin-top:24px;"><a href="${escapeHtml(
      model.weekUrl
    )}" style="color:#22d3ee;">Read the week</a></p>`,
    `<p style="color:#5b6478;font-size:11px;margin-top:24px;line-height:1.6;">`,
    `You are reading this because you asked for it. Leave at any time: <a href="${escapeHtml(
      links.unsubscribeUrl
    )}" style="color:#94a3b8;">unsubscribe</a>.<br/>`,
    `${escapeHtml(LEGAL_ENTITY.name)} · ${escapeHtml(formatAddress())}<br/>`,
    `${escapeHtml(LEGAL_CONTACT.email)}`,
    `</p>`,
    `</div></div>`,
  ].join('');
}

export function settlementEmailText(
  model: SettlementEmailModel,
  links: { unsubscribeUrl: string }
): string {
  const lines = [
    `${SITE_NAME} — the Serpent week of ${model.weekLabel}`,
    '',
    ...model.worldLines,
  ];
  if (model.personalLines) {
    lines.push('', 'YOUR WEEK', ...model.personalLines);
  }
  lines.push(
    '',
    `Read the week: ${model.weekUrl}`,
    '',
    'You are reading this because you asked for it.',
    `Unsubscribe: ${links.unsubscribeUrl}`,
    `${LEGAL_ENTITY.name} · ${formatAddress()} · ${LEGAL_CONTACT.email}`
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SettlementSendResult =
  | 'sent'
  /** The flag is down, or no Resend key is configured. */
  | 'disabled'
  /** The recipient never confirmed, or unsubscribed. Never mailed. */
  | 'not-mailable'
  /** The composed message tripped the Rule 7 sweep. Refused, not sent. */
  | 'refused-commercial'
  /** Resend rejected it, or the network did. Non-fatal by contract. */
  | 'failed';

/**
 * Send one settlement email.
 *
 * The gate order is deliberate and the opt-in check comes before anything
 * that could reach the network: flag → mailable → compose → Rule 7 sweep →
 * send. A recipient who never confirmed produces no request at all, so there
 * is no path on which an unconfirmed address is even named to Resend.
 *
 * Non-fatal by contract, like every other send in this codebase: a failure
 * returns a result, never throws into a cron.
 */
export async function sendSettlementEmail(params: {
  recipient: SettlementRecipient;
  model: SettlementEmailModel;
  fetchImpl?: typeof fetch;
}): Promise<SettlementSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!settlementEmailEnabled() || !apiKey) return 'disabled';
  if (!isSettlementMailable(params.recipient)) return 'not-mailable';

  const to = params.recipient.email;
  if (!to) return 'not-mailable';

  const links = { unsubscribeUrl: recipientUnsubscribeUrl(params.recipient) };
  const subject = settlementEmailSubject(params.model);
  const html = settlementEmailHtml(params.model, links);
  const text = settlementEmailText(params.model, links);

  const hits = sweepMessage({ subject, html, text });
  if (hits.length > 0) {
    console.error(`Settlement email refused — Rule 7: ${hits.join('; ')}`);
    return 'refused-commercial';
  }

  // RFC 8058 one-click needs an endpoint that can act without a session. The
  // Dispatch unsubscribe token is exactly that; a player's preference lives
  // behind their account, so that message advertises the link (RFC 2369) but
  // does not claim one-click it cannot honour.
  const headers: Record<string, string> = {
    'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
  };
  if (params.recipient.kind === 'dispatch') {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const send = params.fetchImpl ?? fetch;
  try {
    const response = await send(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text, headers }),
    });
    if (!response.ok) {
      console.error(`Settlement email send failed (${response.status})`);
      return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.error(
      'Settlement email send error:',
      error instanceof Error ? error.message : String(error)
    );
    return 'failed';
  }
}
