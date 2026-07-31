import { LEGAL_CONTACT } from '@/shared/config/legal';

function reportMailto(subject: string, lines: readonly string[]): string {
  const query = new URLSearchParams({
    subject: `SupaSnake content report: ${subject}`,
    body: [
      ...lines,
      '',
      'Please describe what you saw and why it should be reviewed:',
      '',
    ].join('\n'),
  });
  return `mailto:${LEGAL_CONTACT.email}?${query.toString()}`;
}

/** A visible, pre-addressed launch-safe moderation path for a clan name. */
export function clanReportHref(clanId: string, clanName: string): string {
  return reportMailto(`clan ${clanName}`, [
    `Clan: ${clanName}`,
    `Clan ID: ${clanId}`,
  ]);
}

/** A visible, pre-addressed launch-safe moderation path for a player handle. */
export function clanMemberReportHref(
  clanId: string,
  userId: string,
  handle: string
): string {
  return reportMailto(`handle ${handle}`, [
    `Handle: ${handle}`,
    `User ID: ${userId}`,
    `Clan ID: ${clanId}`,
  ]);
}
