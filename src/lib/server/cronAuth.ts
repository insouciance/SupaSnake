import { timingSafeEqual } from 'node:crypto';

/**
 * Authenticate a Vercel cron request using the secret Vercel places in the
 * Authorization header. Platform-marker headers are not credentials and must
 * never authorize a request on their own.
 */
export function isAuthorizedCron(
  headers: Headers,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret) return false;

  const authorization = headers.get('authorization');
  if (!authorization) return false;

  const actual = Buffer.from(authorization, 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
